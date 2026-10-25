export type GridSize = 'tiny' | 'small' | 'medium' | 'full';

export const SIZES: Record<GridSize, { cols: number; rows: number; freebies: number; label: string }> = {
  tiny: { cols: 4, rows: 5, freebies: 1, label: 'Tiny' },
  small: { cols: 6, rows: 8, freebies: 2, label: 'Small' },
  medium: { cols: 8, rows: 10, freebies: 4, label: 'Medium' },
  full: { cols: 10, rows: 12, freebies: 6, label: 'Full' },
};

export interface StarterGrid {
  id: string;
  title: string;
  color: string;
  theme: string;
  size: GridSize;
  description: string;
  clusters: { name: string; prompts: string[] }[];
}

/** Indexes revealed when a grid is first started. */
export function startingSquares(size: GridSize): number[] {
  const { cols, rows } = SIZES[size];
  const r = Math.floor(rows / 2);
  const c = Math.floor(cols / 2);
  if (size === 'tiny') return [r * cols + c - 1, r * cols + c];
  return [
    (r - 1) * cols + (c - 1),
    (r - 1) * cols + c,
    r * cols + (c - 1),
    r * cols + c,
  ];
}

/** Four orthogonal neighbours of an index, or fewer at edges. */
export function neighbours(idx: number, cols: number, rows: number): number[] {
  const r = Math.floor(idx / cols);
  const c = idx % cols;
  const out: number[] = [];
  if (r > 0) out.push(idx - cols);
  if (r < rows - 1) out.push(idx + cols);
  if (c > 0) out.push(idx - 1);
  if (c < cols - 1) out.push(idx + 1);
  return out;
}

/**
 * Place clustered prompts on the board so that each cluster occupies a
 * contiguous region. Clusters are laid out as bands, filling the board in
 * reading order; a band's tail wraps onto the next row, which keeps every
 * square adjacent to at least one of its cluster-mates.
 */
export function placeClusters(grid: StarterGrid): { idx: number; prompt: string; cluster: string }[] {
  const { cols, rows } = SIZES[grid.size];
  const total = cols * rows;
  const flat = grid.clusters.flatMap((c) => c.prompts.map((p) => ({ prompt: p, cluster: c.name })));
  if (flat.length !== total) {
    throw new Error(`${grid.title}: ${flat.length} prompts for a ${total}-square board`);
  }
  // Snake order so cluster bands stay spatially compact across row breaks.
  return flat.map((item, i) => {
    const r = Math.floor(i / cols);
    const c = r % 2 === 0 ? i % cols : cols - 1 - (i % cols);
    return { idx: r * cols + c, ...item };
  });
}
