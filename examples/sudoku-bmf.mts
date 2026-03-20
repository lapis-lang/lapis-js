#!/usr/bin/env node

import { data, behavior } from '@lapis-lang/lapis-js';
import { List } from '../src/lib/list.mjs';
import { Matrix } from '../src/lib/matrix.mjs';

// Cell ::= Given(digit) | Blank | Filled(digit)

const Cell = data(() => ({
    Given:  { digit: Number },
    Blank:  {},
    Filled: { digit: Number }
})).ops(({ fold }) => ({
    toDigit: fold({ out: Number })({
        Given({ digit })  { return digit; },
        Blank()           { return 0;     },
        Filled({ digit }) { return digit; }
    }),
    isDetermined: fold({ out: Boolean })({
        Given()  { return true; },
        Blank()  { return false; },
        Filled() { return true; }
    }),
    show: fold({ out: String })({
        Given({ digit })  { return String(digit); },
        Blank()           { return '.'; },
        Filled({ digit }) { return String(digit); }
    })
}));

type CellInstance = { toDigit: number; isDetermined: boolean; show: string };

// Region ::= Row(cells) | Col(cells) | Box(cells)

const Region = data(() => ({
    Row: { cells: List },
    Col: { cells: List },
    Box: { cells: List }
})).ops(({ fold }) => ({
    digits: fold({ out: Set })({
        _({ cells }: { cells: { toArray: CellInstance[] } }) {
            const s = new Set<number>();
            for (const cell of cells.toArray) {
                const d = cell.toDigit;
                if (d !== 0) s.add(d);
            }
            return s;
        }
    })
}));

// Board ::= Board(cells, size)

const Board: any = data(({ Family }) => ({
    Board: { cells: Array, size: Number }
})).ops(({ fold, unfold, Family }) => ({
    FromGrid: unfold({ in: Array, out: Family })({
        Board: (grid: unknown[]) => ({
            cells: (grid as number[][]).map(row =>
                row.map(d => d === 0 ? Cell.Blank : Cell.Given(d))
            ),
            size: 9
        })
    }),
    toGrid: fold({ out: Array })({
        Board({ cells }) {
            const grid = cells as unknown as CellInstance[][];
            return grid.map(row =>
                row.map(cell => cell.toDigit)
            );
        }
    }),
    isValid: fold({ out: Boolean })({
        Board({ cells }) {
            const grid = cells as unknown as CellInstance[][];
            const m = Matrix.FromArray(grid);
            const allGroups = [...m.rows.toArray, ...m.cols.toArray, ...m.boxs(3).toArray];
            return allGroups.every(g =>
                (Region.Row(List.FromArray(g)).digits as Set<number>).size === 9
            );
        }
    }),
    show: fold({ out: String })({
        Board({ cells }) {
            const grid = cells as unknown as CellInstance[][];
            return grid.map((row, r) => {
                const line = row.map((cell, c) => {
                    const s = cell.show;
                    return (c % 3 === 2 && c !== 8) ? s + ' |' : s;
                }).join(' ');
                const sep = (r % 3 === 0 && r !== 0) ? '  ------+-------+------\n' : '';
                return sep + '  ' + line;
            }).join('\n');
        }
    })
}));

// ChoiceBoard ::= ChoiceBoard(cells)
//
// Each cell carries its set of possible digits.
// `prune` propagates constraints whole-board via matrix involutions
// (rows∘rows = cols∘cols = boxs∘boxs = id):
//   pruneBy f = f ∘ map reduce ∘ f
//   prune     = pruneBy boxs ∘ pruneBy cols ∘ pruneBy rows

const ChoiceBoard: any = data(() => ({
    ChoiceBoard: { cells: Array }
})).ops(({ fold, unfold, Family }) => {
    /** Remove determined digits from non-singleton cells in a group. */
    const reduce = (group: number[][]) => {
        const singles = group.filter(xs => xs.length === 1).map(xs => xs[0]);
        return group.map(xs =>
            xs.length === 1 ? xs : xs.filter(x => !singles.includes(x))
        );
    };

    /** pruneBy inv = inv ∘ mapRows reduce ∘ inv */
    const pruneBy = (inv: (m: any) => any) =>
        (m: any) => inv(inv(m).mapRows(reduce));

    const byRows = (m: any) => m.rows;
    const byCols = (m: any) => m.cols;
    const byBoxs = (m: any) => m.boxs(3);

    /** True if a group has duplicate singletons (inconsistent). */
    const hasDupSingles = (group: number[][]) => {
        const singles = group.filter(xs => xs.length === 1).map(xs => xs[0]);
        return singles.length !== new Set(singles).size;
    };

    return {
        /** Digit grid → ChoiceBoard. 0 → [1..9], nonzero → [d]. */
        FromGrid: unfold({ in: Array, out: Family })({
            ChoiceBoard: (grid: unknown[]) => ({
                cells: (grid as number[][]).map(row =>
                    row.map(d =>
                        d === 0 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [d]
                    )
                )
            })
        }),

        /** Whole-board constraint propagation: pruneBy boxs ∘ pruneBy cols ∘ pruneBy rows. */
        prune: fold({ out: Object })({
            ChoiceBoard({ cells }) {
                const grid = cells as unknown as number[][][];
                const pruned = [byRows, byCols, byBoxs].reduce(
                    (m: any, inv: any) => pruneBy(inv)(m),
                    Matrix.FromArray(grid)
                );
                return ChoiceBoard.ChoiceBoard({ cells: pruned.toArray });
            }
        }),

        /** All cells determined? */
        isComplete: fold({ out: Boolean })({
            ChoiceBoard({ cells }) {
                const grid = cells as unknown as number[][][];
                return grid.every(row =>
                    row.every(xs => xs.length === 1)
                );
            }
        }),

        /** Void (empty cell) or unsafe (duplicate singletons)? */
        isBlocked: fold({ out: Boolean })({
            ChoiceBoard({ cells }) {
                const grid = cells as unknown as number[][][];
                // Void: some cell has no choices
                if (grid.some(row => row.some(xs => xs.length === 0)))
                    return true;
                const m = Matrix.FromArray(grid);
                const allGroups = [...m.rows.toArray, ...m.cols.toArray, ...m.boxs(3).toArray];
                return allGroups.some(hasDupSingles);
            }
        }),

        /** Split on cell with fewest choices > 1 (MRV). Returns ChoiceBoard[]. */
        expand: fold({ out: Array })({
            ChoiceBoard({ cells }) {
                const grid = cells as unknown as number[][][];
                let minLen = 10, minR = -1, minC = -1;
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 9; c++) {
                        if (grid[r][c].length > 1 && grid[r][c].length < minLen) {
                            minLen = grid[r][c].length;
                            minR = r; minC = c;
                        }
                    }
                }
                if (minR === -1) return [];
                return grid[minR][minC].map(d =>
                    ChoiceBoard.ChoiceBoard({
                        cells: grid.map((row, ri) =>
                            row.map((xs, ci) =>
                                ri === minR && ci === minC ? [d] : xs
                            )
                        )
                    })
                );
            }
        }),

        /** Convert solved ChoiceBoard → Board. */
        toBoard: fold({ out: Object })({
            ChoiceBoard({ cells }) {
                const grid = cells as unknown as number[][][];
                return Board.Board(
                    grid.map(row =>
                        row.map(xs =>
                            xs.length === 1 ? Cell.Filled(xs[0]) : Cell.Blank
                        )
                    ),
                    9
                );
            }
        })
    };
});

// SearchState ::= Start(worklist) | Found(board, worklist) | Exhausted

const SearchState: any = data(() => ({
    Start:     { worklist: Array },
    Found:     { board: Object, worklist: Array },
    Exhausted: {}
})).ops(({ fold }) => ({
    currentBoard: fold({ out: Object })({
        Start()         { return {}; },
        Found({ board }) { return board; },
        Exhausted()      { return {}; }
    }),
    isSolved: fold({ out: Boolean })({
        Start()     { return false; },
        Found()     { return true; },
        Exhausted() { return false; }
    }),
    isExhausted: fold({ out: Boolean })({
        Start()     { return false; },
        Found()     { return false; },
        Exhausted() { return true; }
    }),
    remaining: fold({ out: Array })({
        Start({ worklist })  { return worklist; },
        Found({ worklist })  { return worklist; },
        Exhausted()          { return []; }
    })
}));

// SolverStream — behavior (final coalgebra) for DFS search.
// solve = fold first ∘ unfold Search  (hylomorphism)

type SearchStateInstance = {
    currentBoard: object;
    isSolved: boolean;
    isExhausted: boolean;
    remaining: any[];
    [k: string]: unknown;
};

const SolverStream: any = behavior(({ Self }) => ({
    board: Object,
    isSolved: Boolean,
    isExhausted: Boolean,
    next: Self
})).ops(({ fold, unfold, Self }) => ({
    Search: unfold({ in: SearchState, out: Self })({
        board:       (s) => (s as SearchStateInstance).currentBoard,
        isSolved:    (s) => (s as SearchStateInstance).isSolved,
        isExhausted: (s) => (s as SearchStateInstance).isExhausted,
        next:        (s) => {
            // ── resolve: advance worklist to next Found or Exhausted ──
            const state = s as SearchStateInstance;
            let wl: any[] = state.remaining;
            while (wl.length > 0) {
                const cb = wl[0], rest = wl.slice(1);
                if (cb.isBlocked) { wl = rest; continue; }
                if (cb.isComplete)
                    return SearchState.Found({ board: cb.toBoard, worklist: rest });
                // expand + prune, DFS order (prepend children)
                const children = cb.expand.map((c: any) => c.prune);
                wl = [...children, ...rest];
            }
            return SearchState.Exhausted;
        }
    }),
    first: fold({ out: Array })({
        _: ({ isSolved, isExhausted, board, next }: {
            isSolved: boolean; isExhausted: boolean;
            board: unknown; next: () => unknown[];
        }): unknown[] => {
            if (isExhausted) return [];
            if (isSolved) return [board];
            return next();
        }
    }),
    take: fold({ in: Number, out: Array })({
        _: ({ isSolved, isExhausted, board, next }: {
            isSolved: boolean; isExhausted: boolean;
            board: unknown; next: (n: number) => unknown[];
        }, n: number): unknown[] => {
            if (n <= 0 || isExhausted) return [];
            if (isSolved) return [board, ...next(n - 1)];
            return next(n);
        }
    })
}));

// =============================================================================

const puzzle: number[][] = [
    [5, 3, 0,  0, 7, 0,  0, 0, 0],
    [6, 0, 0,  1, 9, 5,  0, 0, 0],
    [0, 9, 8,  0, 0, 0,  0, 6, 0],

    [8, 0, 0,  0, 6, 0,  0, 0, 3],
    [4, 0, 0,  8, 0, 3,  0, 0, 1],
    [7, 0, 0,  0, 2, 0,  0, 0, 6],

    [0, 6, 0,  0, 0, 0,  2, 8, 0],
    [0, 0, 0,  4, 1, 9,  0, 0, 5],
    [0, 0, 0,  0, 8, 0,  0, 7, 9]
];

// =============================================================================

console.log('╔════════════════════════════════════════════════╗');
console.log('║  Sudoku — Hylomorphism: unfold → fold          ║');
console.log('╚════════════════════════════════════════════════╝\n');

const board = Board.FromGrid(puzzle);
console.log('Input:\n' + board.show + '\n');

// ChoiceBoard.FromGrid → prune → wrap in worklist
const cb = ChoiceBoard.FromGrid(puzzle).prune;
const seed = SearchState.Start({ worklist: [cb] });

// solve = first ∘ Search  (hylomorphism)

const t0 = performance.now();
const stream = SolverStream.Search(seed);
const [solution] = stream.first;
const elapsed = (performance.now() - t0).toFixed(1);

if (solution) {
    console.log(`Solved in ${elapsed} ms:\n`);
    console.log(solution.show);
    console.log('\n' + (solution.isValid ? '✓ Valid' : '✗ INVALID'));
} else
    console.log('No solution found.');

console.log('\n━━━ Structure ━━━');
console.log('  data()     Cell, Region, Board                — μ (display/validate)');
console.log('             Matrix       rows|cols|boxs|mapRows — μ (involutions)');
console.log('             ChoiceBoard  prune|expand|…        — μ (wholemeal search)');
console.log('             SearchState  Start|Found|Exhausted — μ (worklist carrier)');
console.log('  behavior() SolverStream                       — ν (final coalgebra)');
console.log('  unfold Search : State → Stream                — coalgebra map (DFS)');
console.log('  fold   first  : Stream → [Board]              — catamorphism');
console.log('  solve = first ∘ Search                        — hylomorphism');
