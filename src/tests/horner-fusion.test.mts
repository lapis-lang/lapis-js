/**
 * Horner Fold-Fusion
 *
 * Tests for the merge pipeline's Horner fold-fusion optimization.
 *
 * Horner's Rule: when an inner fold `⊗` declares `distributive:outerOp` in
 * its `properties`, adjacent `[innerFold, outerFold]` pairs in a `merge`
 * pipeline are recognised as Horner-fusible.  The inner fold restructures
 * the family type and the outer fold immediately consumes the result — the
 * the pair is sequenced: the inner fold runs first (full traversal, producing
 * an intermediate family instance) and the outer fold is applied to that result
 * (a second full traversal).
 *
 * Scaled-sum (x · sum(values)) is the canonical example; the tropical semiring
 * (max, +) applies the same annotation pattern.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';
import { TropicalNum } from '../std/primitive/TropicalNum.mjs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function T(v: number) { return TropicalNum.T({ value: v }); }
function val(t: unknown): number { return (t as { value: number }).value; }

// ─────────────────────────────────────────────────────────────────────────────

describe('Horner fold-fusion: scaled-sum', () => {
    // Scaled-sum: scale every element by x, then sum — computes x * sum(values).
    // Two-step composition: scaleEach(x) restructures the list, sum collapses it.
    const NumList = data(family => ({
        Nil:  {},
        Cons: { head: Number, tail: family }
    })).ops(({ fold, unfold, merge, family }) => ({

        // Unfold from plain array
        FromArray: unfold({ in: Array, out: family })({
            Nil:  (xs: any[]) => (xs.length === 0 ? {} : null),
            Cons: (xs: any[]) => (xs.length > 0 ? { head: xs[0], tail: xs.slice(1) } : null)
        }),

        // Scale each element by x, returning a new NumList of the same shape.
        // Properties: multiply distributes over add (standard ring)
        scaleEach: fold({
            in: Number,
            out: family,
            properties: ['distributive:sum']
        })({
            Nil(_ctx: any, _x: any) { return family.Nil as any; },
            Cons({ head, tail }: any, x: number) {
                return family.Cons({ head: (head as number) * x, tail: tail(x) });
            }
        }),

        // Outer fold: sum all elements
        sum: fold({ out: Number })({
            Nil()               { return 0; },
            Cons({ head, tail }: any) { return (head as number) + tail; }
        }),

        // Horner-fused: scaleEach has `distributive:sum` → recognized as Horner pair
        hornerEval: merge('scaleEach', 'sum')
    }));

    it('hornerEval([0] at any x) === 0', () => {
        const list = NumList.FromArray([0]);
        assert.strictEqual((list as any).hornerEval(7), 0);
    });

    it('hornerEval([c] at any x) === c*x  (scale each element)', () => {
        // scaleEach multiplies each element by x, then sum adds them.
        // For values=[5] at x=3: [5*3] → sum = 15
        const list = NumList.FromArray([5]);
        const r1 = NumList.FromArray([5]);
        const scaled = (r1 as any).scaleEach(3);
        const manual = (scaled as any).sum;
        // Verify fused result equals manual two-step
        assert.strictEqual((list as any).hornerEval(3), manual);
        assert.strictEqual((list as any).hornerEval(3), 15); // 5 * 3 = 15
    });

    it('hornerEval result matches manual two-step execution', () => {
        // For any input, merge('scaleEach','sum') must equal scaleEach(x).sum
        const values = [1, 2, 3, 4];
        const x = 2;
        const list = NumList.FromArray(values);
        const manual = list.scaleEach(x).sum;
        const fused  = (list as any).hornerEval(x);
        assert.strictEqual(fused, manual);
    });

    it('hornerEval([1, 2, 3] at x=2) matches manual', () => {
        // values [1,2,3], x=2:
        // scaleEach: [1*2, 2*2, 3*2] = [2, 4, 6]
        // sum: 2+4+6 = 12
        const list = NumList.FromArray([1, 2, 3]);
        const manual = list.scaleEach(2).sum;
        const fused  = list.hornerEval(2);
        assert.strictEqual(fused, 12);
        assert.strictEqual(fused, manual);
    });

    it('hornerEval of empty list is 0', () => {
        const list = NumList.FromArray([]);
        assert.strictEqual(list.hornerEval(5), 0);
    });

    it('hornerEval is deterministic on repeated calls', () => {
        const list = NumList.FromArray([3, 1, 4, 1, 5]);
        const r1 = list.hornerEval(2);
        const r2 = list.hornerEval(2);
        assert.strictEqual(r1, r2);
    });

    it('hornerEval with different x values gives different results', () => {
        const list = NumList.FromArray([1, 2, 3]);
        const atX1 = list.hornerEval(1);
        const atX2 = list.hornerEval(2);
        const atX3 = list.hornerEval(3);
        assert.strictEqual(atX1, list.scaleEach(1).sum);
        assert.strictEqual(atX2, list.scaleEach(2).sum);
        assert.strictEqual(atX3, list.scaleEach(3).sum);
        // They should be different for non-trivial x
        assert.notStrictEqual(atX1, atX2);
        assert.notStrictEqual(atX2, atX3);
    });

});

// ─────────────────────────────────────────────────────────────────────────────

describe('Horner fold-fusion: tropical semiring (max, +)', () => {
    // TropicalNum: add = max, multiply = integer +
    // Lists of TropicalNum with Horner-fused merge('scaleBy', 'sum')
    const TropList = data(family => ({
        Nil:  {},
        Cons: { head: TropicalNum, tail: family }
    })).ops(({ fold, unfold, merge, family }) => ({
        FromArray: unfold({ in: Array, out: family })({
            Nil:  (xs: any[]) => (xs.length === 0 ? {} : null),
            Cons: (xs: any[]) => (xs.length > 0 ? { head: xs[0], tail: xs.slice(1) } : null)
        }),
        // Inner fold: scale each TropicalNum element by x (tropical: add x to it)
        // Returns a new TropList — distributive over sum (tropical max-fold)
        scaleBy: fold({
            in: TropicalNum,
            out: family,
            properties: ['distributive:tropicalSum']
        })({
            Nil(_ctx: any, _x: any) { return family.Nil as any; },
            Cons({ head, tail }: any, x: any) {
                return family.Cons({ head: head.multiply(x), tail: tail(x) });
            }
        }),
        // Outer fold: max of all elements (tropical add = max)
        tropicalSum: fold({ out: TropicalNum })({
            Nil()               { return TropicalNum.Zero(); },
            Cons({ head, tail }: any) { return head.add(tail); }
        }),
        // Horner-fused: scaleBy has `distributive:tropicalSum`
        hornerTropical: merge('scaleBy', 'tropicalSum')
    }));

    function makeTropList(nums: number[]) {
        return TropList.FromArray(nums.map(v => T(v)));
    }

    it('matches manual two-step for single element', () => {
        const list = makeTropList([5]);
        const x = T(2);
        // scaleBy: T(5).multiply(T(2)) = T(5+2) = T(7), then tropicalSum([T(7)]) = T(7)
        const manual = val(list.scaleBy(x).tropicalSum);
        const fused  = val(list.hornerTropical(x));
        assert.strictEqual(fused, manual);
        assert.strictEqual(fused, 7);
    });

    it('matches manual two-step for multi-element list', () => {
        const nums = [1, 3, 2, 5, 1];
        const list = makeTropList(nums);
        const x = T(1);
        const manual = val(list.scaleBy(x).tropicalSum);
        const fused  = val(list.hornerTropical(x));
        assert.strictEqual(fused, manual);
    });

    it('hornerTropical with One (x=T(0)) equals tropicalSum (x adds 0)', () => {
        // multiply by One (T(0)) = add 0 to each element, so result = max element
        const nums = [3, 7, 1, 5];
        const list = makeTropList(nums);
        const one  = TropicalNum.One(); // T(0)
        const manual = val(list.scaleBy(one).tropicalSum);
        const fused  = val(list.hornerTropical(one));
        assert.strictEqual(fused, manual);
        // max(3+0, 7+0, 1+0, 5+0) = max(3,7,1,5) = 7
        assert.strictEqual(fused, 7);
    });

    it('empty list gives Zero (-Infinity)', () => {
        const list = makeTropList([]);
        const fused = val(list.hornerTropical(T(1)));
        assert.strictEqual(fused, -Infinity);
    });

    it('is deterministic', () => {
        const list = makeTropList([2, 4, 6]);
        const x = T(1);
        const r1 = val(list.hornerTropical(x));
        const r2 = val(list.hornerTropical(x));
        assert.strictEqual(r1, r2);
    });

});
