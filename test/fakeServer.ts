// An in-memory stand-in for Supabase that applies the same rules as the SQL triggers.
import type { Remote, GridTemplate, LocalFiles } from '../src/sync/engine';
import type { SyncedTable } from '../src/db/queue';
import { STARTERS } from '../src/data/starters';
import { SIZES, placeClusters } from '../src/data/types';

type Row = Record<string, unknown>;

export class FakeServer {
  tables: Record<SyncedTable, Map<string, Row>> = {
    user_grids: new Map(), square_states: new Map(), moments: new Map(), photos: new Map(),
  };
  storage = new Map<string, string>();
  /** Grids people made, with their squares, as save_grid stores them. */
  grids = new Map<string, { grid: Row; squares: Row[] }>();
  profile: { interests: string[]; onboarded_at: string | null } | null = null;
  suspended = false;
  clock = 0;
  failNext = 0;
  onUpsert?: (table: SyncedTable, rows: Row[]) => Promise<void>;

  private tick() { this.clock++; return new Date(Date.UTC(2026, 0, 1) + this.clock * 1000).toISOString().replace('Z', '+00:00'); }

  remote(device: FakeDevice): Remote {
    return {
      upsert: async (table, rows) => {
        if (this.failNext > 0) { this.failNext--; throw new Error('network down'); }
        await this.onUpsert?.(table, rows);
        for (const row of rows) {
          const old = this.tables[table].get(row.id as string);
          if (old) {
            if (old.deleted_at) continue;
            if (!row.deleted_at && Date.parse(row.updated_at as string) < Date.parse(old.updated_at as string)) continue;
          }
          // Postgres hands timestamps back in its own format.
          const stored: Row = { ...row, server_updated_at: this.tick() };
          for (const k of ['updated_at', 'created_at', 'deleted_at', 'started_at', 'completed_at', 'done_at']) {
            if (stored[k]) stored[k] = new Date(stored[k] as string).toISOString().replace('Z', '+00:00');
          }
          this.tables[table].set(row.id as string, stored);
        }
      },
      pull: async (table, after, limit) =>
        [...this.tables[table].values()]
          .filter((r) => !after || (r.server_updated_at as string) > after)
          .sort((a, b) => ((a.server_updated_at as string) < (b.server_updated_at as string) ? -1 : 1))
          .slice(0, limit),
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
