'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { db, errorText, formatDate, likePattern, type GridRow } from '@/lib/supabase';

export const GRID_COLUMNS =
  'id, title, color, theme, made_by, is_public, is_hidden, hidden_at, shared_at, author_id, ' +
  'author:users!grids_author_id_fkey(username)';

export function Grids() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<GridRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const search = useCallback(async (term: string) => {
    setError(null);
    let query = db().from('grids').select(GRID_COLUMNS).not('shared_at', 'is', null);
    if (term.trim()) query = query.ilike('title', likePattern(term));
    const { data, error } = await query.order('shared_at', { ascending: false }).limit(100);
    if (error) setError(errorText(error));
    else setRows((data ?? []) as unknown as GridRow[]);
  }, []);

  useEffect(() => {
    search('');
  }, [search]);

  function submit(e: FormEvent) {
    e.preventDefault();
    search(q);
  }

  async function toggle(g: GridRow) {
    setBusy(g.id);
    setError(null);
    const { error } = await db().rpc('admin_set_grid_hidden', { grid: g.id, hidden: !g.is_hidden });
    setBusy(null);
    if (error) setError(errorText(error));
    await search(q);
  }

  return (
    <section>
      <form className="search" onSubmit={submit}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shared grids by title" />
        <button className="btn primary">Search</button>
      </form>
      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="muted">No shared grids match.</p>}
      {rows && rows.length === 100 && <p className="muted small">Showing the 100 most recently shared; narrow the search.</p>}
      <ul className="list">
        {rows?.map((g) => (
          <li key={g.id} className="card row-between">
            <GridLine g={g} showAuthor />
            <button className={g.is_hidden ? 'btn' : 'btn danger'} disabled={busy === g.id} onClick={() => toggle(g)}>
              {g.is_hidden ? 'Unhide' : 'Hide'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GridLine({ g, showAuthor }: { g: GridRow; showAuthor?: boolean }) {
  return (
    <div className="grid-head">
      <span className="swatch" style={{ background: g.color }} />
      <span>
        <strong>{g.title}</strong>{' '}
        {g.is_hidden && <span className="pill warn">hidden {formatDate(g.hidden_at)}</span>}
        {!g.is_public && <span className="pill">private</span>}
        <br />
        <span className="muted small">
          {g.theme}
          {showAuthor && <> · by {g.author?.username ?? g.made_by}</>} · {g.shared_at ? `shared ${formatDate(g.shared_at)}` : 'never shared'}
        </span>
      </span>
    </div>
  );
}
