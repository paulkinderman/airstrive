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

/**
 * Every index on the board as one path spiralling out from the starting squares, so the
 * first squares on the path are the ones revealed at the start and consecutive squares
 * touch. Grids people make are laid out along it: their own squares first, then each
 * cluster of suggestions together.
 */
export function spiralOrder(size: GridSize): number[] {
  const { cols, rows } = SIZES[size];
  const first = startingSquares(size)[0];
  let r = Math.floor(first / cols);
  let c = first % cols;
  const out: number[] = [];
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  let d = 0;
  let len = 1;
  out.push(r * cols + c);
  while (out.length < cols * rows) {
    for (let twice = 0; twice < 2; twice++) {
      for (let step = 0; step < len; step++) {
        r += dirs[d][0];
        c += dirs[d][1];
        if (r >= 0 && r < rows && c >= 0 && c < cols) out.push(r * cols + c);
      }
      d = (d + 1) % 4;
    }
    len++;
  }
  return out;
}
