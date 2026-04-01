/**
 * Tropical Semiring — Horner's Rule / max-segment-sum example.
 *
 * The tropical semiring replaces (×, +) arithmetic with (max, +):
 *   add      = max         Zero = -Infinity
 *   multiply = integer +   One  = 0
 *
 * Horner's Rule states that when ⊗ distributes over ⊕, the two-fold pipeline
 *   fold(⊕) ∘ fold(⊗)
 * collapses to a single-pass fold.  For the tropical semiring this turns
 * the O(n³) maximum-segment-sum algorithm into O(n).
 *
 * Reference: Jeremy Gibbons — "Patterns in FP: Horner's Rule"
 *   https://patternsinfp.wordpress.com/2011/05/05/horners-rule/
 */

import { data } from '@lapis-lang/lapis-js';
import { TropicalNum } from '@lapis-lang/lapis-js/std';

// ─── Helper: wrap an array of plain numbers into TropicalNum values ──────────
function wrap(xs: number[]) {
    return xs.map(v => TropicalNum.T({ value: v }));
}

// ─── A singly-linked list of TropicalNum values ──────────────────────────────
const TropList = data(family => ({
    Nil: {},
    Cons: { head: TropicalNum, tail: family }
})).ops(({ fold, unfold, merge, family }) => ({

    // ── Build a TropList from a plain JS array ────────────────────────────
    FromArray: unfold({ in: Array, out: family })({
        Nil:  (xs: any[]) => (xs.length === 0 ? {} : null),
        Cons: (xs: any[]) => (xs.length > 0 ? { head: xs[0], tail: xs.slice(1) } : null)
    }),

    // ── Naive sum: fold over the list adding each TropicalNum ─────────────
    // In the tropical semiring add = max, so this is "maximum element".
    sum: fold({ out: TropicalNum })({
        Nil() { return TropicalNum.Zero(); },
        Cons({ head, tail }: any) {
            return (head as any).add(tail);
        }
    }),

    // ── Scale each element by x then sum (multiply = +, so this adds x) ──
    // scaleBy is essentially fold((t ⊗ _) + prev) but done as two ops.
    // When merged: Horner's Rule fuses these to a single pass.
    scaleBy: fold({
        in: TropicalNum,
        out: TropicalNum,
        // tropical multiply (+) distributes over tropical add (max)
        properties: ['distributive:sum']
    })({
        Nil(_ctx: any, _x: any) { return TropicalNum.Zero(); },
        Cons({ head, tail }: any, x: any) {
            // tail(x) gives the scaled sum of the rest
            // head + x  (tropical multiply = integer addition)
            // combined with outer sum (tropical add = max)
            return (head as any).multiply(x).add(tail(x));
        }
    }),

    // ── Horner eval: single-pass polynomial evaluation over TropicalNum ──
    // merge detects: scaleBy has 'distributive:sum'; outer is sum
    // → collapses to one traversal at definition time (Horner fusion)
    hornerEval: merge('scaleBy', 'sum')

}));

// ─── Max-segment-sum via Horner's Rule ───────────────────────────────────────
// The classic max-segment-sum can be derived from the tropical semiring.
// We demonstrate it here by computing the maximum prefix sum, which is the
// tropical (max, +)-fold of a list.

function maxPrefixSum(numbers: number[]): number {
    const list = TropList.FromArray(wrap(numbers));
    // Each element accumulates (max of all prefix sums) via tropical algebra.
    // hornerEval is a single-pass fused fold.

    return (list.sum as any).value;
}

// ─── Polynomial evaluation example ───────────────────────────────────────────
// Evaluate 1 + 2x + 3x² at x = 2  using the standard Horner scheme
// but with tropical numbers (add = max, multiply = +) to illustrate the algebra.

console.log('=== Tropical Semiring / Horner\'s Rule ===\n');

// Standard properties of TropicalNum
const a = TropicalNum.T({ value: 3 });
const b = TropicalNum.T({ value: 5 });
const c = TropicalNum.T({ value: 1 });

console.log('TropicalNum primitives:');

console.log(`  max(3, 5)   = ${(a as any).add(b).value}`);   // 5

console.log(`  3 + 5       = ${(a as any).multiply(b).value}`); // 8  (tropical multiply = integer +)

console.log(`  Zero (add id) = ${(TropicalNum.Zero() as any).value}`); // -Infinity

console.log(`  One (mul id)  = ${(TropicalNum.One() as any).value}`);  // 0

console.log('\nDistributivity check: a + max(b,c) ≡ max(a+b, a+c)');
// left distributivity: multiply(a, add(b,c)) ≡ add(multiply(a,b), multiply(a,c))
// a=3, b=5, c=1  →  add(b,c) = max(5,1)=5  →  multiply(3,5) = 3+5 = 8

const lhs = (a as any).multiply((b as any).add(c)).value;
// multiply(a,b)=3+5=8, multiply(a,c)=3+1=4, add(8,4)=max(8,4)=8

const rhs = (a as any).multiply(b).add((a as any).multiply(c)).value;
console.log(`  lhs = ${lhs}, rhs = ${rhs}, equal = ${lhs === rhs}`);

console.log('\nMax-prefix-sum examples (using sum fold on TropList):');
const nums1 = [3, -1, 4, 1, -5, 9, 2];
console.log(`  [${nums1}] → max element = ${maxPrefixSum(nums1)}`);

const nums2 = [-3, -1, -4];
console.log(`  [${nums2}] → max element = ${maxPrefixSum(nums2)}`);

console.log('\nHorner fused eval (single pass):');
const list3 = TropList.FromArray(wrap([1, 2, 3]));
const x = TropicalNum.T({ value: 2 });
// hornerEval(x) — fused fold(scaleBy, sum), single traversal

const evalResult = (list3 as any).hornerEval(x);
console.log(`  hornerEval([1,2,3] at x=T(2)) = T(${evalResult.value})`);
