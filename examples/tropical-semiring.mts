/**
 * Tropical Semiring — Horner's Rule / scaled-max example.
 *
 * The tropical semiring replaces (×, +) arithmetic with (max, +):
 *   add      = max         Zero = -Infinity
 *   multiply = integer +   One  = 0
 *
 * Horner's Rule states that when ⊗ distributes over ⊕, the two-fold pipeline
 *   fold(⊕) ∘ fold(⊗)
 * is a valid sequenced composition.  The inner fold restructures the list
 * (out: family) and the outer fold immediately consumes the result.
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

    // ── Scale each element by x, returning a new TropList (out: family) ─────
    // Each Cons node is rebuilt with head multiplied by x (tropical: head + x).
    // out: family — the result is an intermediate TropList, not a scalar, so
    // the outer fold (sum) can traverse it as a second step.
    // Properties: tropical multiply (integer +) distributes over tropical add (max).
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

    // ── Horner eval: merge detects 'distributive:sum' on scaleBy → Horner pair ──
    // Runtime: scaleBy(x) first (traverses list, returns scaled TropList),
    // then sum is applied to that result (second traversal).
    // Equivalent to: instance.scaleBy(x).sum
    hornerEval: merge('scaleBy', 'sum')

}));

// ─── Max element via tropical sum ───────────────────────────────────────────
// In the tropical semiring add = max, so folding a list with `sum` returns
// its maximum element (or -Infinity for an empty list).

function maxElement(numbers: number[]): number {
    const list = TropList.FromArray(wrap(numbers));
    // In the tropical semiring add = max, so sum folds to the maximum element.
    return (list.sum as any).value;
}

// ─── Scaled-sum via Horner composition ───────────────────────────────────────
// hornerEval(x) = sum(scaleBy(x, list))
// scaleBy rebuilds the list with each element multiplied by x (tropical: +x),
// then sum takes the maximum (tropical add = max) of the scaled elements.

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

console.log('\nMax-element examples (sum fold = max in tropical semiring):');
const nums1 = [3, -1, 4, 1, -5, 9, 2];
console.log(`  [${nums1}] → max element = ${maxElement(nums1)}`);

const nums2 = [-3, -1, -4];
console.log(`  [${nums2}] → max element = ${maxElement(nums2)}`);

console.log('\nHorner sequenced eval (scaleBy then sum):');
const list3 = TropList.FromArray(wrap([1, 2, 3]));
const x = TropicalNum.T({ value: 2 });
// hornerEval(x): scaleBy(x) → scaled TropList, then sum (max) of that list

const evalResult = (list3 as any).hornerEval(x);
console.log(`  hornerEval([1,2,3] at x=T(2)) = T(${evalResult.value})`);
