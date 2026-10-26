// An in-memory stand-in for Supabase that applies the same rules as the SQL triggers and,
// for group grids, the row-level security in the group grids migration.
import type { Remote, GridTemplate, LocalFiles, Unshare } from '../src/sync/engine';
import type { SyncedTable } from '../src/db/queue';
import { STARTERS } from '../src/data/starters';
import { SIZES, placeClusters } from '../src/data/types';

type Row = Record<string, unknown>;

/** Who each table's group_id comes from. */
const PARENT: Partial<Record<SyncedTable, [SyncedTable, string]>> = {
  square_states: ['user_grids', 'user_grid_id'],
  moments: ['square_states', 'square_state_id'],
  moment_entries: ['moments', 'moment_id'],
  photos: ['moments', 'moment_id'],
};
/** Rows in a group that only their author changes, and that can be Private. */
const AUTHORED: SyncedTable[] = ['moment_entries', 'photos'];

export class FakeServer {
  tables: Record<SyncedTable, Map<string, Row>> = {
    user_grids: new Map(), square_states: new Map(), moments: new Map(), moment_entries: new Map(), photos: new Map(),
  };
  /** group id → member user ids */
  members = new Map<string, Set<string>>();
  usernames = new Map<string, string>();
  unshares: Unshare[] = [];
  storage = new Map<string, string>();
  /** Grids people made, with their squares, as save_grid stores them. */
  grids = new Map<string, { grid: Row; squares: Row[] }>();
  profile: { interests: string[]; onboarded_at: string | null } | null = null;
  suspended = false;
  clock = 0;
  failNext = 0;
  onUpsert?: (table: SyncedTable, rows: Row[]) => Promise<void>;

  private tick() { this.clock++; return new Date(Date.UTC(2026, 0, 1) + this.clock * 1000).toISOString().replace('Z', '+00:00'); }

  isMember(groupId: unknown, userId: string) {
    return typeof groupId === 'string' && !!this.members.get(groupId)?.has(userId);
  }

  /** What row-level security lets `userId` read. */
  visible(table: SyncedTable, r: Row, userId: string) {
    if (!r.group_id) return r.user_id === userId;
    if (!this.isMember(r.group_id, userId)) return false;
    return !AUTHORED.includes(table) || r.audience !== 'private' || r.user_id === userId;
  }

  private groupOf(table: SyncedTable, row: Row): string | null {
    const parent = PARENT[table];
    if (!parent) return null;
    return (this.tables[parent[0]].get(row[parent[1]] as string)?.group_id as string) ?? null;
  }

  private rows(table: SyncedTable, userId: string, after: string | null, limit: number, groupId?: string) {
    return [...this.tables[table].values()]
      .filter((r) => this.visible(table, r, userId) && (!groupId || r.group_id === groupId))
      .filter((r) => !after || (r.server_updated_at as string) > after)
      .sort((a, b) => ((a.server_updated_at as string) < (b.server_updated_at as string) ? -1 : 1))
      .slice(0, limit);
  }

  /** make_group(): one of `userId`'s grids becomes a group grid with them in it. */
  makeGroup(userGridId: string, userId: string, shareExisting = false) {
    const stamp = new Date().toISOString().replace('Z', '+00:00');
    const touch = (r: Row, extra: Row = {}) => Object.assign(r, { group_id: userGridId, server_updated_at: this.tick(), ...extra });
    const ug = this.tables.user_grids.get(userGridId)!;
    touch(ug, { audience: 'private', updated_at: stamp });
    const squares = [...this.tables.square_states.values()].filter((s) => s.user_grid_id === userGridId);
    for (const s of squares) touch(s);
    for (const m of [...this.tables.moments.values()].filter((m) => squares.some((s) => s.id === m.square_state_id))) {
      const audience = shareExisting ? 'group' : 'private';
      if (!m.deleted_at && String(m.body ?? '').trim()) {
        const id = `entry-${m.id}`;
        this.tables.moment_entries.set(id, {
          id, moment_id: m.id, user_id: m.user_id, group_id: userGridId, body: m.body, audience,
          created_at: m.created_at, updated_at: stamp, deleted_at: null, server_updated_at: this.tick(),
        });
      }
      for (const p of [...this.tables.photos.values()].filter((p) => p.moment_id === m.id)) touch(p, { audience, updated_at: stamp });
      touch(m, { audience: 'private', body: '', updated_at: stamp });
    }
    this.members.set(userGridId, new Set([userId]));
  }

  join(groupId: string, userId: string) { this.members.get(groupId)!.add(userId); }

  /** leave_group(): the last one out takes the grid with them. */
  leave(groupId: string, userId: string) {
    const left = this.members.get(groupId)!;
    left.delete(userId);
    if (left.size > 0) return 'left';
    for (const table of Object.keys(this.tables) as SyncedTable[]) {
      for (const [id, r] of this.tables[table]) if (r.group_id === groupId) this.tables[table].delete(id);
    }
    this.members.delete(groupId);
    return 'deleted';
  }

  remote(device: FakeDevice, userId = 'me'): Remote {
    return {
      upsert: async (table, rows) => {
        if (this.failNext > 0) { this.failNext--; throw new Error('network down'); }
        await this.onUpsert?.(table, rows);
        for (const row of rows) {
          for (const k of ['user_id', 'group_id']) {
            if (k in row) throw new Error(`${table}: the phone sent ${k}, which the server sets itself`);
          }
          const old = this.tables[table].get(row.id as string);
          const groupId = table === 'user_grids' ? ((old?.group_id as string) ?? null) : this.groupOf(table, row);
          // Row-level security, as in the group grids migration.
          if (old) {
            const allowed = old.group_id
              ? this.isMember(old.group_id, userId) && (!AUTHORED.includes(table) || old.user_id === userId)
              : old.user_id === userId;
            if (!allowed) throw new Error(`${table}: new row violates row-level security policy`);
            if ((old.group_id ?? null) !== groupId) throw new Error(`${table}: rows can't move between grids`);
          } else if (groupId ? !this.isMember(groupId, userId) : false) {
            throw new Error(`${table}: new row violates row-level security policy`);
          }
          if (old) {
            if (old.deleted_at) continue;
            if (!row.deleted_at && Date.parse(row.updated_at as string) < Date.parse(old.updated_at as string)) continue;
          }
          // Postgres hands timestamps back in its own format.
          const stored: Row = { ...row, user_id: old ? old.user_id : userId, group_id: groupId, server_updated_at: this.tick() };
          if (groupId && (table === 'user_grids' || table === 'moments')) stored.audience = 'private';
          if (groupId && table === 'moments') stored.body = '';
          if (groupId && table === 'user_grids') stored.deleted_at = old?.deleted_at ?? null;
          for (const k of ['updated_at', 'created_at', 'deleted_at', 'started_at', 'completed_at', 'done_at']) {
            if (stored[k]) stored[k] = new Date(stored[k] as string).toISOString().replace('Z', '+00:00');
          }
          if (old && groupId && AUTHORED.includes(table) && old.audience === 'group' && stored.audience === 'private') {
            this.unshares.push({ group_id: groupId, row_table: table as Unshare['row_table'], row_id: String(row.id), server_updated_at: this.tick() });
          }
          this.tables[table].set(row.id as string, stored);
        }
      },
      pull: async (table, after, limit) => this.rows(table, userId, after, limit),
      pullGroup: async (table, groupId, after, limit) => this.rows(table, userId, after, limit, groupId),
      pullUnshares: async (after, limit) =>
        this.unshares.filter((u) => this.isMember(u.group_id, userId) && (!after || u.server_updated_at > after)).slice(0, limit),
      myGroups: async () =>
        [...this.members].filter(([, m]) => m.has(userId)).map(([groupId, m]) => ({
          group_id: groupId,
          people: [...m].map((id) => ({ id, username: this.usernames.get(id) ?? id, status: 'member' as const })),
        })),
      fetchGrids: async (ids): Promise<GridTemplate[]> => [
        ...STARTERS.filter((g) => ids.includes(g.id)).map((g) => ({
          grid: { ...g, cols: SIZES[g.size].cols, rows: SIZES[g.size].rows, made_by: 'AirStrive', is_public: true, is_official: true, updated_at: '2026-01-01T00:00:00+00:00' },
          squares: placeClusters(g).map((s) => ({ grid_id: g.id, ...s })),
        })),
        ...ids.filter((id) => this.grids.has(id)).map((id) => this.grids.get(id)!),
      ],
      saveGrid: async (grid, squares) => {
        if (this.failNext > 0) { this.failNext--; throw new Error('network down'); }
        let result: 'saved' | 'stale' | 'sharing_suspended' = 'saved';
        const g = { ...grid };
        if (g.is_public && this.suspended) { g.is_public = false; result = 'sharing_suspended'; }
        const old = this.grids.get(g.id as string);
        if (old) {
          if (Date.parse(old.grid.updated_at as string) >= Date.parse(g.updated_at as string)) return 'stale';
          old.grid = { ...old.grid, ...g };
          return result;
        }
        const { cols, rows } = SIZES[g.size as keyof typeof SIZES];
        if (squares.length !== cols * rows) throw new Error('wrong square count');
        this.grids.set(g.id as string, {
          grid: { ...g, cols, rows, made_by: 'paulk', is_official: false, author_id: 'me' },
          squares: squares.map((s) => ({ grid_id: g.id, hint: '', ...s })),
        });
        return result;
      },
      saveProfile: async (profile) => {
        if (this.failNext > 0) { this.failNext--; throw new Error('network down'); }
        this.profile = profile;
      },
      uploadPhoto: async (storagePath, localPath) => {
        const content = device.files.get(localPath);
        if (content === undefined) throw new Error('no file');
        this.storage.set(storagePath, content);
      },
      downloadPhoto: async (storagePath, localPath) => {
        const content = this.storage.get(storagePath);
        if (content === undefined) throw new Error('404');
        device.files.set(localPath, content);
      },
      removePhotos: async (paths) => { for (const p of paths) this.storage.delete(p); },
    };
  }
}

export class FakeDevice {
  files = new Map<string, string>();
  local: LocalFiles = {
    exists: (p) => this.files.has(p),
    remove: (ps) => { for (const p of ps) this.files.delete(p); },
  };
}
