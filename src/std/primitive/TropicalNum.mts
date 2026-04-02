/**
 * TropicalNum — numeric wrapper for the tropical semiring.
 *
 * The tropical semiring replaces the usual (×, +) arithmetic with (max, +):
 *   add      = max,                Zero = -Infinity  (max(-∞, x) ≡ x)
 *   multiply = integer addition,   One  = 0          (0 + x ≡ x)
 *
 * Satisfies Eq, Ord, and Semiring with:
 *   left distributivity  — a + max(b,c) ≡ max(a+b, a+c)
 *   right distributivity — max(a,b) + c ≡ max(a+c, b+c)
 *   left annihilation    — (-∞) + a ≡ -∞
 *   right annihilation   — a + (-∞) ≡ -∞
 *
 * Classic applications include shortest-path problems, max-segment-sum (via
 * Horner's Rule), and Datalog provenance tracking.
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Eq, Ord, Semiring } from '../protocols/index.mjs';

const TropicalNum = data(() => ({
    [satisfies]: [Eq, Ord, Semiring],
    T: { value: Number }
})).ops(({ fold, unfold, family }) => ({

    // ── Eq ───────────────────────────────────────────────────────────────
    equals: fold({
        in: family,
        out: Boolean
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        T({ value }: any, other: any) {
            return value === other.value;
        }
    }),

    // ── Ord ──────────────────────────────────────────────────────────────
    compare: fold({
        in: family,
        out: Number
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        T({ value }: any, other: any) {
            return value < other.value ? -1 : value > other.value ? 1 : 0;
        }
    }),

    // ── Semiring — add = max ─────────────────────────────────────────────
    add: fold({
        in: family,
        out: family,
        properties: ['associative', 'commutative', 'identity', 'identity:Zero']
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        T({ value }: any, other: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: Math.max(value, other.value) });
        }
    }),

    Zero: unfold({ out: family })({
        T: () => ({ value: -Infinity })
    }),

    // ── Semiring — multiply = integer addition ───────────────────────────
    multiply: fold({
        in: family,
        out: family,
        properties: ['associative', 'identity', 'identity:One', 'absorbing:Zero', 'distributive:add']
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        T({ value }: any, other: any) {
            // -Infinity + anything = -Infinity (absorbing element)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({
                value: value + other.value
            });
        }
    }),

    One: unfold({ out: family })({
        T: () => ({ value: 0 })
    })

}));

export { TropicalNum };
