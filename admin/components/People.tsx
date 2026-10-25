'use client';

import { useState, type FormEvent } from 'react';
import { DAY, db, errorText, formatDate, likePattern, type GridRow, type PersonRow } from '@/lib/supabase';
import { GRID_COLUMNS, GridLine } from './Grids';

export function People() {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [grids, setGrids] = useState<GridRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function search(term: string) {
    if (!term.trim()) return;
    setError(null);
    const { data, error } = await db()
      .from('users')
      .select('id, username, created_at, sharing_suspended, is_admin')
      .ilike('username', likePattern(term))
      .order('username', { ascending: true })
      .limit(20);
    if (error) return setError(errorText(error));
    const found = (data ?? []) as PersonRow[];
    setPeople(found);
    if (found.length === 0) return setGrids([]);
    const res = await db()
      .from('grids')
      .select(GRID_COLUMNS)
      .in(
        'author_id',
        found.map((p) => p.id),
      )
      .order('created_at', { ascending: false });
    if (res.error) setError(errorText(res.error));
    else setGrids((res.data ?? []) as unknown as GridRow[]);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    search(q);
  }

  async function setSuspended(p: PersonRow, suspended: boolean) {
    setBusy(p.id);
    setError(null);
    const { error } = await db().rpc('admin_set_sharing_suspended', { target: p.id, suspended });
    setBusy(null);
    if (error) setError(errorText(error));
    await search(q);
  }

  const since = Date.now() - 30 * DAY;

  return (
    <section>
      <form className="search" onSubmit={submit}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Look up by username" />
        <button className="btn primary">Look up</button>
      </form>
      {error && <p className="error">{error}</p>}
      {people && people.length === 0 && <p className="muted">No one by that username.</p>}
      <ul className="list">
        {people?.map((p) => {
          const theirs = grids.filter((g) => g.author_id === p.id);
          const hides = theirs.filter((g) => g.is_hidden && g.hidden_at && Date.parse(g.hidden_at) > since).length;
          return (
            <li key={p.id} className="card">
              <div className="row-between">
                <div>
                  <h3>
                    {p.username ?? '(no username)'} {p.is_admin && <span className="pill">admin</span>}{' '}
                    {p.sharing_suspended && <span className="pill warn">sharing suspended</span>}
                  </h3>
                  <p className="muted small">
                    Joined {formatDate(p.created_at)} · {theirs.length} grid{theirs.length === 1 ? '' : 's'} ·{' '}
                    {hides} hide{hides === 1 ? '' : 's'} in the last 30 days
                  </p>
                </div>
                {p.sharing_suspended ? (
                  <button className="btn" disabled={busy === p.id} onClick={() => setSuspended(p, false)}>
                    Restore sharing
                  </button>
                ) : (
                  <button className="btn danger" disabled={busy === p.id} onClick={() => setSuspended(p, true)}>
                    Suspend sharing
                  </button>
                )}
              </div>
              {theirs.length > 0 && (
                <ul className="sublist">
                  {theirs.map((g) => (
                    <li key={g.id}>
                      <GridLine g={g} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
