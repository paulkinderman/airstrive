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
  /** Squares revealed at the start, when not the usual ones (startingSquares). */
  starts?: number[];
}

/** How many squares are open when a grid is first started. A tiny grid opens its whole first cluster. */
const OPENING: Record<GridSize, number> = { tiny: 5, small: 4, medium: 4, full: 4 };

/** Indexes revealed when a grid is first started: the first squares of the spiral. */
export function startingSquares(size: GridSize): number[] {
  return spiralOrder(size).slice(0, OPENING[size]);
}

/** The most starting squares a creator can pick: a quarter of the board. */
export function maxStarts(size: GridSize): number {
  return Math.floor((SIZES[size].cols * SIZES[size].rows) / 4);
}

/**
 * A grid's own starting squares, read from the phone ('9,10,12'), the server (an array) or a
 * starter grid. Null when it has none or they don't fit the board, so the grid starts as usual.
 */
export function parseStarts(size: GridSize, v: unknown): number[] | null {
  const raw = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(',') : [];
  const total = SIZES[size].cols * SIZES[size].rows;
  const out = [...new Set(raw.map((x) => Number(x)))].filter((i) => Number.isInteger(i) && i >= 0 && i < total);
  if (out.length === 0 || out.length !== raw.length || out.length > maxStarts(size)) return null;
  return out.sort((a, b) => a - b);
}

/** Indexes revealed when this grid is started: the creator's pick, or the usual ones. */
export function startsFor(size: GridSize, starts?: unknown): number[] {
  return parseStarts(size, starts) ?? startingSquares(size);
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
 * Place clustered prompts on the board so that each cluster occupies a contiguous region.
 * Official grids go along the spiral like made grids, so the first cluster is where the
 * grid starts. The starter templates pass bandOrder, the layout their boards began with.
 */
export function placeClusters(grid: StarterGrid, order = spiralOrder(grid.size)): { idx: number; prompt: string; cluster: string }[] {
  const { cols, rows } = SIZES[grid.size];
  const total = cols * rows;
  const flat = grid.clusters.flatMap((c) => c.prompts.map((p) => ({ prompt: p, cluster: c.name })));
  if (flat.length !== total) {
    throw new Error(`${grid.title}: ${flat.length} prompts for a ${total}-square board`);
  }
  return flat.map((item, i) => ({ idx: order[i], ...item }));
}

/**
 * Every index in snake order: clusters as bands filling the board in reading order, a
 * band's tail wrapping onto the next row so each square touches a cluster-mate.
 */
export function bandOrder(size: GridSize): number[] {
  const { cols, rows } = SIZES[size];
  return Array.from({ length: cols * rows }, (_, i) => {
    const r = Math.floor(i / cols);
    return r * cols + (r % 2 === 0 ? i % cols : cols - 1 - (i % cols));
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
  // Just up and left of the centre; a tiny board is one row short of square, so one row lower.
  let r = Math.floor(rows / 2) - (size === 'tiny' ? 0 : 1);
  let c = Math.floor(cols / 2) - 1;
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
