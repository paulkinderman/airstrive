'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { db, errorText, formatDate, type ReportRow } from '@/lib/supabase';
import { Board } from './Board';

export function Reports() {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await db()
      .from('reports')
      .select(
        'id, reason, note, created_at, grid_id, ' +
          'reporter:users!reports_reporter_id_fkey(username), ' +
          'grid:grids(id, title, color, theme, made_by, cols, rows, is_hidden)',
      )
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) setError(errorText(error));
    else setRows((data ?? []) as unknown as ReportRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const perGrid = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.grid_id, (m.get(r.grid_id) ?? 0) + 1);
    return m;
  }, [rows]);

  async function act(report: string, action: 'hide' | 'dismiss') {
    setBusy(report);
    setError(null);
    const { error } = await db().rpc('admin_resolve_report', { report, action });
    setBusy(null);
    if (error) setError(errorText(error));
    await load();
  }

  return (
    <section>
      <div className="row-between">
        <h2>Open reports {rows && <span className="count">{rows.length}</span>}</h2>
        <button className="btn ghost small" onClick={load}>
          Refresh
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="muted">Nothing to review.</p>}
      <ul className="list">
        {rows?.map((r) => {
          const g = r.grid;
          const n = perGrid.get(r.grid_id) ?? 1;
          const expanded = open === r.id;
          return (
            <li key={r.id} className="card">
              <div className="row-between">
                <button className="grid-head linklike" onClick={() => setOpen(expanded ? null : r.id)} aria-expanded={expanded}>
                  <span className="swatch" style={{ background: g?.color ?? '#ccc' }} />
                  <span>
                    <strong>{g?.title ?? r.grid_id}</strong>
                    <span className="muted small">
                      {' '}
                      · {g?.theme} · by {g?.made_by}
                      {g?.is_hidden && ' · already hidden'}
                    </span>
                  </span>
                  <span className="chev">{expanded ? '▾' : '▸'}</span>
                </button>
                {n > 1 && <span className="pill warn">{n} open reports</span>}
              </div>
              <p className="meta">
                <span className="pill">{r.reason}</span> reported by {r.reporter?.username ?? 'someone'} on{' '}
                {formatDate(r.created_at)}
              </p>
              {r.note && <blockquote className="note">{r.note}</blockquote>}
              {expanded && g && <Board gridId={g.id} cols={g.cols} />}
              <div className="actions">
                <button className="btn danger" disabled={busy === r.id} onClick={() => act(r.id, 'hide')}>
                  Hide grid
                </button>
                <button className="btn" disabled={busy === r.id} onClick={() => act(r.id, 'dismiss')}>
                  Dismiss
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
