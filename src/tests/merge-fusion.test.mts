/**
 * Constructor-Time Fusion (Phase 7)
 *
 * Tests for merge-pipeline optimizations applied at definition time:
 *
 * 1. Map-map fusion: consecutive map getters in a merge pipeline are
 *    composed into a single traversal (g ∘ f instead of two passes).
 *
 * 2. Map-fold fusion: a map getter immediately before a fold is fused
 *    so the fold pre-applies the map transform to type-parameter fields,
 *    eliminating the intermediate mapped structure entirely.
 *
 * 3. Combined: inverse elimination + map-map + map-fold all compose.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

// ---------------------------------------------------------------------------
// Shared fixture: parameterized list
// ---------------------------------------------------------------------------

function makeList() {
    return data(({ Family, T }) => ({
        Nil: {},
        Cons: { head: T, tail: Family(T) }
    })).ops(({ fold, unfold, map, merge, Family, T }) => ({
        double:    map({ out: Family })({ T: (x: number) => x * 2 }),
        triple:    map({ out: Family })({ T: (x: number) => x * 3 }),
        increment: map({ out: Family })({ T: (x: number) => x + 1 }),
        square:    map({ out: Family })({ T: (x: number) => x * x }),
        sum: fold({ out: Number })({
            Nil() { return 0; },
            Cons({ head, tail }) { return head + tail; }
        }),
        toArray: fold({ out: Array })({
            Nil() { return []; },
            Cons({ head, tail }) { return [head, ...tail]; }
        })
    }));
}

function buildList(List: ReturnType<typeof makeList>, values: number[]) {
    const NumList = List({ T: Number });
    let result = NumList.Nil;
    for (let i = values.length - 1; i >= 0; i--)
        result = NumList.Cons(values[i], result);
    return result;
}

// ---------------------------------------------------------------------------
// Map-map fusion
// ---------------------------------------------------------------------------

describe('Map-map fusion', () => {
    it('fuses two consecutive maps into a single traversal', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            double: map({ out: Family })({ T: (x: number) => x * 2 }),
            triple: map({ out: Family })({ T: (x: number) => x * 3 }),
            toArray: fold({ out: Array })({
                Nil() { return []; },
                Cons({ head, tail }) { return [head, ...tail]; }
            }),
            pipeline: merge('double', 'triple')
        }));

        const NumList = List({ T: Number });
        const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

        assert.deepStrictEqual(list.pipeline.toArray, [6, 12, 18]);
    });

    it('fuses three consecutive maps', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            double:    map({ out: Family })({ T: (x: number) => x * 2 }),
            triple:    map({ out: Family })({ T: (x: number) => x * 3 }),
            increment: map({ out: Family })({ T: (x: number) => x + 1 }),
            toArray: fold({ out: Array })({
                Nil() { return []; },
                Cons({ head, tail }) { return [head, ...tail]; }
            }),
            pipeline: merge('double', 'triple', 'increment')
        }));

        const NumList = List({ T: Number });
        const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

        // 6*1+1=7, 6*2+1=13, 6*3+1=19
        assert.deepStrictEqual(list.pipeline.toArray, [7, 13, 19]);
    });

    it('preserves non-map ops around fused maps', () => {
        const List = makeList();
        const list = buildList(List, [1, 2, 3]);

        // We can verify semantically: double then triple then sum
        // should give (1*2*3) + (2*2*3) + (3*2*3) = 6+12+18 = 36
        const ListWithPipeline = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            double: map({ out: Family })({ T: (x: number) => x * 2 }),
            triple: map({ out: Family })({ T: (x: number) => x * 3 }),
            sum: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }),
            pipeline: merge('double', 'triple', 'sum')
        }));

        const NumList = ListWithPipeline({ T: Number });
        const l = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

        assert.strictEqual(l.pipeline, 36);
    });

    it('map-map fusion works with unfold prefix (postpromorphism → maps)', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            Range: unfold({ in: Number, out: Family(T) })({
                Nil: (n: number) => (n <= 0 ? {} : null),
                Cons: (n: number) => (n > 0 ? { head: n, tail: n - 1 } : null)
            }),
            double:    map({ out: Family })({ T: (x: number) => x * 2 }),
            increment: map({ out: Family })({ T: (x: number) => x + 1 }),
            toArray: fold({ out: Array })({
                Nil() { return []; },
                Cons({ head, tail }) { return [head, ...tail]; }
            }),
            Pipeline: merge('Range', 'double', 'increment', 'toArray')
        }));

        const NumList = List({ T: Number });
        // Range(3) → [3,2,1], double → [6,4,2], increment → [7,5,3]
        assert.deepStrictEqual(NumList.Pipeline(3), [7, 5, 3]);
    });
});

// ---------------------------------------------------------------------------
// Map-fold fusion
// ---------------------------------------------------------------------------

describe('Map-fold fusion', () => {
    it('fuses map + fold into single traversal', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            double: map({ out: Family })({ T: (x: number) => x * 2 }),
            sum: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }),
            doubleSum: merge('double', 'sum')
        }));

        const NumList = List({ T: Number });
        const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

        // (1*2) + (2*2) + (3*2) = 2 + 4 + 6 = 12
        assert.strictEqual(list.doubleSum, 12);
    });

    it('gives same result as manual chaining', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            square: map({ out: Family })({ T: (x: number) => x * x }),
            sum: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }),
            toArray: fold({ out: Array })({
                Nil() { return []; },
                Cons({ head, tail }) { return [head, ...tail]; }
            }),
            squareSum: merge('square', 'sum')
        }));

        const NumList = List({ T: Number });
        const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3,
            NumList.Cons(4, NumList.Nil))));

        // Manual: square then sum
        const manualResult = list.square.sum;
        // Fused: squareSum
        const fusedResult = list.squareSum;

        assert.strictEqual(fusedResult, manualResult);
        // 1 + 4 + 9 + 16 = 30
        assert.strictEqual(fusedResult, 30);
    });

    it('works with unfold prefix (hylomorphism with map)', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            Range: unfold({ in: Number, out: Family(T) })({
                Nil: (n: number) => (n <= 0 ? {} : null),
                Cons: (n: number) => (n > 0 ? { head: n, tail: n - 1 } : null)
            }),
            double: map({ out: Family })({ T: (x: number) => x * 2 }),
            sum: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }),
            DoubleSumOf: merge('Range', 'double', 'sum')
        }));

        const NumList = List({ T: Number });
        // Range(4) → [4,3,2,1], double → [8,6,4,2], sum → 20
        assert.strictEqual(NumList.DoubleSumOf(4), 20);
    });

    it('map-fold fusion with toArray fold', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            increment: map({ out: Family })({ T: (x: number) => x + 1 }),
            toArray: fold({ out: Array })({
                Nil() { return []; },
                Cons({ head, tail }) { return [head, ...tail]; }
            }),
            incrementedArray: merge('increment', 'toArray')
        }));

        const NumList = List({ T: Number });
        const list = NumList.Cons(10, NumList.Cons(20, NumList.Cons(30, NumList.Nil)));

        assert.deepStrictEqual(list.incrementedArray, [11, 21, 31]);
        // Verify matches manual chaining
        assert.deepStrictEqual(list.incrementedArray, list.increment.toArray);
    });
});

// ---------------------------------------------------------------------------
// Combined fusion: map-map + map-fold
// ---------------------------------------------------------------------------

describe('Combined fusion', () => {
    it('map-map fusion followed by map-fold fusion', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            double:    map({ out: Family })({ T: (x: number) => x * 2 }),
            triple:    map({ out: Family })({ T: (x: number) => x * 3 }),
            sum: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }),
            pipeline: merge('double', 'triple', 'sum')
        }));

        const NumList = List({ T: Number });
        const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

        // (1*6) + (2*6) + (3*6) = 6 + 12 + 18 = 36
        assert.strictEqual(list.pipeline, 36);
        // Verify matches manual chaining
        assert.strictEqual(list.pipeline, list.double.triple.sum);
    });

    it('inverse elimination + map-map + map-fold all compose', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            double:    map({ out: Family })({ T: (x: number) => x * 2 }),
            halve:     map({ out: Family, inverse: 'double' })({ T: (x: number) => x / 2 }),
            triple:    map({ out: Family })({ T: (x: number) => x * 3 }),
            increment: map({ out: Family })({ T: (x: number) => x + 1 }),
            sum: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }),
            pipeline: merge('double', 'halve', 'triple', 'increment', 'sum')
        }));

        const NumList = List({ T: Number });
        const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

        // After inverse elim: triple → increment → sum
        // triple: [3, 6, 9], increment: [4, 7, 10], sum: 21
        assert.strictEqual(list.pipeline, 21);
        assert.strictEqual(list.pipeline, list.triple.increment.sum);
    });

    it('multiple map-fold sequences in one pipeline', () => {
        // This tests a pipeline where a map-fold pattern is NOT at the end
        // (there can be further ops after the fold — but fold produces a scalar,
        // so typically only works if subsequent ops are methods on the scalar)
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            double: map({ out: Family })({ T: (x: number) => x * 2 }),
            toArray: fold({ out: Array })({
                Nil() { return []; },
                Cons({ head, tail }) { return [head, ...tail]; }
            }),
            sum: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }),
            doubledSum: merge('double', 'sum'),
            doubledArray: merge('double', 'toArray')
        }));

        const NumList = List({ T: Number });
        const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

        assert.strictEqual(list.doubledSum, 12);
        assert.deepStrictEqual(list.doubledArray, [2, 4, 6]);
    });

    it('single map in pipeline (no fusion, just chaining)', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            double: map({ out: Family })({ T: (x: number) => x * 2 }),
            toArray: fold({ out: Array })({
                Nil() { return []; },
                Cons({ head, tail }) { return [head, ...tail]; }
            }),
            sum: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }),
            doubleThenSum: merge('double', 'sum')
        }));

        const NumList = List({ T: Number });
        const list = NumList.Cons(5, NumList.Cons(10, NumList.Nil));

        assert.strictEqual(list.doubleThenSum, 30); // (5*2) + (10*2) = 30
    });
});
