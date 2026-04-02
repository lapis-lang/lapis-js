/**
 * Tests for the TropicalNum primitive.
 *
 * Covers:
 * - Tropical semiring operations (add = max, multiply = integer +)
 * - Zero and One identity elements
 * - Semiring law conformance (distributivity, annihilation)
 * - Horner fold-fusion via merge('scaleBy', 'sum')
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';
import { TropicalNum } from '../std/primitive/TropicalNum.mjs';
import { Semiring } from '../std/protocols/Semiring.mjs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function T(v: number) { return TropicalNum.T({ value: v }); }
function val(t: unknown): number { return (t as { value: number }).value; }

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('TropicalNum', () => {

    // ── Construction ─────────────────────────────────────────────────────────

    it('constructs T variants', () => {
        const t = T(42);
        assert.ok(t instanceof TropicalNum);
        assert.strictEqual(val(t), 42);
    });

    it('Zero has value -Infinity', () => {
        assert.strictEqual(val(TropicalNum.Zero()), -Infinity);
    });

    it('One has value 0', () => {
        assert.strictEqual(val(TropicalNum.One()), 0);
    });

    // ── add = max ────────────────────────────────────────────────────────────

    it('add is max', () => {
        assert.strictEqual(val(T(3).add(T(5))), 5);
        assert.strictEqual(val(T(7).add(T(2))), 7);
        assert.strictEqual(val(T(-1).add(T(-4))), -1);
    });

    it('add(Zero, x) ≡ x  (left identity)', () => {
        const x = T(4);
        assert.strictEqual(val(TropicalNum.Zero().add(x)), val(x));
    });

    it('add(x, Zero) ≡ x  (right identity)', () => {
        const x = T(4);
        assert.strictEqual(val(x.add(TropicalNum.Zero())), val(x));
    });

    it('add is commutative', () => {
        const a = T(3), b = T(7);
        assert.strictEqual(val(a.add(b)), val(b.add(a)));
    });

    // ── multiply = integer + ─────────────────────────────────────────────────

    it('multiply is integer addition', () => {
        assert.strictEqual(val(T(3).multiply(T(5))), 8);
        assert.strictEqual(val(T(-2).multiply(T(6))), 4);
    });

    it('multiply(One, x) ≡ x  (left identity)', () => {
        const x = T(7);
        assert.strictEqual(val(TropicalNum.One().multiply(x)), val(x));
    });

    it('multiply(x, One) ≡ x  (right identity)', () => {
        const x = T(7);
        assert.strictEqual(val(x.multiply(TropicalNum.One())), val(x));
    });

    it('multiply(Zero, x) ≡ Zero  (left annihilation)', () => {
        const x = T(4);
        assert.strictEqual(val(TropicalNum.Zero().multiply(x)), -Infinity);
    });

    it('multiply(x, Zero) ≡ Zero  (right annihilation)', () => {
        const x = T(4);
        assert.strictEqual(val(x.multiply(TropicalNum.Zero())), -Infinity);
    });

    // ── Distributivity: a + max(b,c) ≡ max(a+b, a+c) ────────────────────────

    it('left distributivity: a×(b⊕c) ≡ (a×b)⊕(a×c)', () => {
        const a = T(3), b = T(5), c = T(1);
        const lhs = val(a.multiply(b.add(c)));
        const rhs = val(a.multiply(b).add(a.multiply(c)));
        assert.strictEqual(lhs, rhs);
    });

    it('right distributivity: (a⊕b)×c ≡ (a×c)⊕(b×c)', () => {
        const a = T(3), b = T(5), c = T(1);
        const lhs = val(a.add(b).multiply(c));
        const rhs = val(a.multiply(c).add(b.multiply(c)));
        assert.strictEqual(lhs, rhs);
    });

    // ── Semiring protocol conformance ────────────────────────────────────────

    it('TropicalNum instances implement Semiring', () => {
        assert.ok(T(42) instanceof Semiring);
    });

});

// ─── Horner fold-fusion tests ─────────────────────────────────────────────────

describe('TropicalNum Horner fold-fusion', () => {

    // A singly-linked list of TropicalNum values, used to test merge fusion
    const TropList = data(family => ({
        Nil:  {},
        Cons: { head: TropicalNum, tail: family }
    })).ops(({ fold, unfold, merge, family }) => ({
        FromArray: unfold({ in: Array, out: family })({
            Nil:  (xs: any[]) => (xs.length === 0 ? {} : null),
            Cons: (xs: any[]) => (xs.length > 0 ? { head: xs[0], tail: xs.slice(1) } : null)
        }),
        sum: fold({ out: TropicalNum })({
            Nil()               { return TropicalNum.Zero(); },
            Cons({ head, tail }: any) { return (head as any).add(tail); }
        }),
        // scaleBy multiplies each list element by x and returns a new TropList
        // (out: family) so the outer fold (sum) can traverse the scaled list.
        // This mirrors scaleEach in the polynomial example.
        // Properties: tropical multiply distributes over max (add)
        scaleBy: fold({
            in: TropicalNum,
            out: family,
            properties: ['distributive:sum']
        })({
            Nil(_ctx: any, _x: any) { return family.Nil as any; },
            Cons({ head, tail }: any, x: any) {
                return family.Cons({ head: (head as any).multiply(x), tail: tail(x) });
            }
        }),
        // Horner fusion: merge planner detects 'distributive:sum' on scaleBy
        hornerEval: merge('scaleBy', 'sum')
    }));

    function makeList(nums: number[]) {
        return TropList.FromArray(nums.map(v => T(v)));
    }

    it('sum of a list of TropicalNums is max element', () => {
        const list = makeList([3, -1, 4, 1, -5, 9, 2]);
        assert.strictEqual(val((list as any).sum), 9);
    });

    it('sum of empty list is Zero (-Infinity)', () => {
        const list = makeList([]);
        assert.strictEqual(val((list as any).sum), -Infinity);
    });

    it('hornerEval differs from sum when x ≠ One', () => {
        const list = makeList([7]);
        const x = T(2);
        const sumResult = val((list as any).sum);
        const hornerResult = val((list as any).hornerEval(x));
        // scaleBy(T(7), T(2)) = T(7+2) = T(9); then sum (max) of [T(9)] = T(9)
        assert.strictEqual(hornerResult, 9);
        // sum directly (no scaling): max([T(7)]) = 7
        assert.strictEqual(sumResult, 7);
        assert.notStrictEqual(hornerResult, sumResult);
    });

    it('hornerEval with One: result equals sum (One=0, multiplicative identity)', () => {
        // multiplying by One (= T(0)) just adds 0 to each element, so result == sum
        const nums = [1, 5, 3, 2];
        const list = makeList(nums);
        const one = TropicalNum.One();
        const sumResult = val((list as any).sum);
        const hornerResult = val((list as any).hornerEval(one));
        // scaleBy(x, One=T(0)) = x + 0 = x, so hornerEval(One) ≡ sum
        assert.strictEqual(hornerResult, sumResult);
    });

    it('hornerEval is deterministic (same result on multiple calls)', () => {
        const list = makeList([2, 4, 6]);
        const x = T(1);
        const r1 = val((list as any).hornerEval(x));
        const r2 = val((list as any).hornerEval(x));
        assert.strictEqual(r1, r2);
    });

});
