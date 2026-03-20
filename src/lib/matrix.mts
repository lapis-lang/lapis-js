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

import { data } from '../index.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Matrix: any = data((_) => ({
    Matrix: { cells: Array }
})).ops(({ fold, unfold, Family }) => ({
    FromArray: unfold({ in: Array, out: Family })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Matrix: (cells: any) => ({ cells })
    }),
    rows: fold({ out: Object })({
        Matrix({ cells }) {
            return Matrix.Matrix({ cells });
        }
    }),
    cols: fold({ out: Object })({
        Matrix({ cells }) {
            if (cells.length === 0) return Matrix.Matrix({ cells: [] });
            return Matrix.Matrix({
                cells: (cells as unknown[][]).map((_: unknown, i: number) => (cells as unknown[][]).map(r => r[i]))
            });
        }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    boxs: fold({ in: Number, out: Object, demands: (self: any, blockSize: number) => {
        const cells = self.toArray;
        const n = cells.length;
        if (n === 0) return true;
        if (!Number.isInteger(blockSize) || blockSize <= 0) return false;
        if (n % blockSize !== 0) return false;
        return cells.every((row: unknown[]) => row.length === n);
    }})({
        Matrix({ cells }, blockSize: number) {
            const cells2d = cells as unknown[][];
            const n = cells2d.length;
            if (n === 0) return Matrix.Matrix({ cells: [] });
            const blocks = n / blockSize;
            const result: unknown[][] = [];
            for (let bR = 0; bR < blocks; bR++) {
                for (let bC = 0; bC < blocks; bC++) {
                    const block: unknown[] = [];
                    for (let r = 0; r < blockSize; r++) {
                        for (let c = 0; c < blockSize; c++)
                            block.push(cells2d[bR * blockSize + r][bC * blockSize + c]);
                    }
                    result.push(block);
                }
            }
            return Matrix.Matrix({ cells: result });
        }
    }),
    toArray: fold({ out: Array })({
        Matrix({ cells }) { return cells; }
    }),
    mapRows: fold({ in: Function, out: Object })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Matrix({ cells }, f: any) {
            return Matrix.Matrix({ cells: (cells as unknown[]).map(f) });
        }
    })
}));

export { Matrix };
