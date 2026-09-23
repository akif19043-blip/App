/**
 * Uniform spatial hash over a bounded arena, rebuilt every tick with a
 * counting sort into flat typed arrays (no per-cell arrays, no allocation).
 *
 *   begin() -> add(id, x, y)* -> end() -> query(...)*
 *
 * Queries return candidate ids from every cell touched by the query box;
 * callers do the exact shape test.
 */
export class SpatialGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly inv: number;
  private readonly cellStart: Int32Array;
  private readonly cellCount: Int32Array;
  private readonly sorted: Int32Array;
  private readonly pendingId: Int32Array;
  private readonly pendingCell: Int32Array;
  private n = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
    readonly maxItems: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.inv = 1 / cellSize;
    const cells = this.cols * this.rows;
    this.cellStart = new Int32Array(cells + 1);
    this.cellCount = new Int32Array(cells);
    this.sorted = new Int32Array(maxItems);
    this.pendingId = new Int32Array(maxItems);
    this.pendingCell = new Int32Array(maxItems);
  }

  get size(): number {
    return this.n;
  }

  cellX(x: number): number {
    const c = Math.floor(x * this.inv);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  cellY(y: number): number {
    const c = Math.floor(y * this.inv);
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  begin(): void {
    this.n = 0;
    this.cellCount.fill(0);
  }

  add(id: number, x: number, y: number): void {
    if (this.n >= this.maxItems) return;
    const cell = this.cellY(y) * this.cols + this.cellX(x);
    this.pendingId[this.n] = id;
    this.pendingCell[this.n] = cell;
    this.cellCount[cell]++;
    this.n++;
  }

  end(): void {
    const cells = this.cellCount.length;
    const start = this.cellStart;
    start[0] = 0;
    for (let c = 0; c < cells; c++) start[c + 1] = start[c] + this.cellCount[c];
    // Reuse cellCount as a write cursor.
    for (let c = 0; c < cells; c++) this.cellCount[c] = start[c];
    for (let i = 0; i < this.n; i++) {
      this.sorted[this.cellCount[this.pendingCell[i]]++] = this.pendingId[i];
    }
  }

  /**
   * Writes candidate ids whose cell intersects the box around (x, y) with
   * half-extent r into `out`, returning how many were written.
   */
  query(x: number, y: number, r: number, out: Int32Array): number {
    const x0 = this.cellX(x - r);
    const x1 = this.cellX(x + r);
    const y0 = this.cellY(y - r);
    const y1 = this.cellY(y + r);
    const start = this.cellStart;
    const sorted = this.sorted;
    const cap = out.length;
    let k = 0;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * this.cols;
      for (let cx = x0; cx <= x1; cx++) {
        const c = row + cx;
        for (let i = start[c], e = start[c + 1]; i < e; i++) {
          if (k >= cap) return k;
          out[k++] = sorted[i];
        }
      }
    }
    return k;
  }
}
