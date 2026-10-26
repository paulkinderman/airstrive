'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { db, errorText, formatDate, type ReportRow, type ReportedMoment } from '@/lib/supabase';
import { Board } from './Board';

const HIDE_LABEL: Record<ReportRow['target_kind'], string> = { grid: 'Hide grid', moment: 'Hide moment', user: 'Suspend sharing' };

/** The thing a report is about, so reports on the same thing count together. */
const targetOf = (r: ReportRow) => `${r.target_kind}:${r.grid_id ?? r.moment_id ?? r.user_id}`;

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
        'id, reason, note, created_at, target_kind, grid_id, moment_id, user_id, ' +
          'reporter:users!reports_reporter_id_fkey(username), ' +
          'reported:users!reports_user_id_fkey(username, sharing_suspended), ' +
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

  const perTarget = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(targetOf(r), (m.get(targetOf(r)) ?? 0) + 1);
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
          const n = perTarget.get(targetOf(r)) ?? 1;
          const expanded = open === r.id;
          return (
            <li key={r.id} className="card">
              <div className="row-between">
                <button className="grid-head linklike" onClick={() => setOpen(expanded ? null : r.id)} aria-expanded={expanded}>
                  {r.target_kind === 'grid' ? (
                    <>
                      <span className="swatch" style={{ background: g?.color ?? '#ccc' }} />
                      <span>
                        <strong>{g?.title ?? r.grid_id}</strong>
                        <span className="muted small">
                          {' '}
                          · {g?.theme} · by {g?.made_by}
                          {g?.is_hidden && ' · already hidden'}
                        </span>
                      </span>
                    </>
                  ) : r.target_kind === 'moment' ? (
                    <span><strong>A moment</strong><span className="muted small"> · open to see it</span></span>
                  ) : (
                    <span>
                      <strong>{r.reported?.username ?? 'Someone'}</strong>
                      <span className="muted small"> · a person{r.reported?.sharing_suspended && ' · sharing already suspended'}</span>
                    </span>
                  )}
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
              {expanded && r.moment_id && <MomentPreview momentId={r.moment_id} />}
              <div className="actions">
                <button className="btn danger" disabled={busy === r.id} onClick={() => act(r.id, 'hide')}>
                  {HIDE_LABEL[r.target_kind]}
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

/** A reported moment with its words and photos, which only admins and the moment's audience can read. */
function MomentPreview({ momentId }: { momentId: string }) {
  const [m, setM] = useState<ReportedMoment | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await db().rpc('admin_moment', { moment: momentId });
      if (!live) return;
      if (error || !data) { setError(error ? errorText(error) : 'Moment not found'); return; }
      const moment = data as ReportedMoment;
      setM(moment);
      if (moment.photos.length) {
        const { data: signed } = await db().storage.from('photos').createSignedUrls(moment.photos, 600);
        if (live) setUrls((signed ?? []).map((s) => s.signedUrl).filter((u): u is string => !!u));
      }
    })();
    return () => { live = false; };
  }, [momentId]);

  if (error) return <p className="error">{error}</p>;
  if (!m) return <p className="muted">Loading…</p>;
  return (
    <div className="moment">
      <p>
        <strong>{m.title}</strong>
        <span className="muted small"> · {m.grid} · by {m.owner ?? 'someone'} · {formatDate(m.happened_on)}{m.hidden && ' · already hidden'}</span>
      </p>
      {m.body && <blockquote className="note">{m.body}</blockquote>}
      {urls.length > 0 && (
        <div className="photos">
          {urls.map((u) => <img key={u} src={u} alt="" width={120} height={120} style={{ objectFit: 'cover', borderRadius: 8 }} />)}
        </div>
      )}
    </div>
  );
}
