'use client';

import { useEffect, useState } from 'react';
import { db, errorText, type Square } from '@/lib/supabase';

/** A grid's squares laid out as its cols × rows board. */
export function Board({ gridId, cols }: { gridId: string; cols: number }) {
  const [squares, setSquares] = useState<Square[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    db()
      .from('grid_squares')
      .select('idx, prompt, cluster')
      .eq('grid_id', gridId)
      .order('idx', { ascending: true })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setError(errorText(error));
        else setSquares((data ?? []) as Square[]);
      });
    return () => {
      live = false;
    };
  }, [gridId]);

  if (error) return <p className="error">{error}</p>;
  if (!squares) return <p className="muted small">Loading squares…</p>;
  if (squares.length === 0) return <p className="muted small">No squares.</p>;

  return (
    <div className="board-wrap">
      <ol className="board" style={{ gridTemplateColumns: `repeat(${cols}, minmax(84px, 1fr))` }}>
        {squares.map((s) => (
          <li key={s.idx} className="square" title={s.cluster ? `#${s.idx} · ${s.cluster}` : `#${s.idx}`}>
            {s.prompt}
          </li>
        ))}
      </ol>
    </div>
  );
}
