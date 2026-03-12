/**
 * Matrix — a 2D-array ADT with involution operations.
 *
 *   Matrix ::= Matrix(cells)
 *
 * Involutions (f ∘ f = id):
 *   - rows     : identity (row grouping)
 *   - cols     : transpose (column grouping)
 *   - boxs(n)  : block grouping (for n×n blocks)
 *
 * Operations:
 *   - FromArray : T[][] → Matrix            (unfold)
 *   - toArray   : Matrix → T[][]            (fold)
 *   - mapRows   : Matrix × (T[] → U[]) → Matrix  (fold)
 *
 * Usage:
 *   const m = Matrix.FromArray([[1, 2], [3, 4]]);
 *   m.cols.toArray     // [[1, 3], [2, 4]]
 *   m.mapRows(r => r.reverse()).toArray  // [[2, 1], [4, 3]]
 *
 * @module
 */

import { data, fold, unfold } from '../index.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Matrix: any = data(({ Family }: { Family: any }) => ({
    Matrix: { cells: Array },

    /** T[][] → Matrix. */
    FromArray: unfold({ in: Array, out: Family })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Matrix: (cells: any) => ({ cells })
    }),

    /** Identity involution — row grouping. */
    rows: fold({ out: Object })({
        Matrix({ cells }: { cells: unknown[][] }) {
            return Matrix.Matrix({ cells });
        }
    }),

    /** Transpose involution — column grouping. */
    cols: fold({ out: Object })({
        Matrix({ cells }: { cells: unknown[][] }) {
            if (cells.length === 0) return Matrix.Matrix({ cells: [] });
            return Matrix.Matrix({
                cells: cells[0].map((_: unknown, i: number) => cells.map(r => r[i]))
            });
        }
    }),

    /** Block involution — groups elements by n×n blocks. */
    boxs: fold({ in: Number, out: Object })({
        Matrix({ cells }: { cells: unknown[][] }, blockSize: number) {
            const n = cells.length;
            const blocks = n / blockSize;
            const result: unknown[][] = [];
            for (let bR = 0; bR < blocks; bR++) {
                for (let bC = 0; bC < blocks; bC++) {
                    const block: unknown[] = [];
                    for (let r = 0; r < blockSize; r++) {
                        for (let c = 0; c < blockSize; c++)
                            block.push(cells[bR * blockSize + r][bC * blockSize + c]);
                    }
                    result.push(block);
                }
            }
            return Matrix.Matrix({ cells: result });
        }
    }),

    /** Matrix → T[][]. */
    toArray: fold({ out: Array })({
        Matrix({ cells }: { cells: unknown[][] }) { return cells; }
    }),

    /** Apply a function to each row, returning a new Matrix. */
    mapRows: fold({ in: Function, out: Object })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Matrix({ cells }: { cells: unknown[][] }, f: any) {
            return Matrix.Matrix({ cells: cells.map(f) });
        }
    })
}));

export { Matrix };
