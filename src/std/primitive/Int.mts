/**
 * Int — integer wrapper satisfying algebraic protocols.
 *
 * Represents JS numbers restricted to integer values. The variant invariant
 * rejects non-integer inputs at construction time.
 *
 * Satisfies: Eq, Ord, EuclideanDomain (⊃ Ring ⊃ Semiring)
 *
 * div  — truncated integer quotient (towards zero)
 * mod  — remainder consistent with JS `%` operator
 * gcd  — greatest common divisor (always non-negative)
 *
 * @module
 */

import { data, satisfies, invariant } from '../../index.mjs';
import { Eq, Ord, EuclideanDomain } from '../protocols/index.mjs';

const Int = data(() => ({
    [satisfies]: [Eq, Ord, EuclideanDomain],
    Z: {
        [invariant]: ({ value }: { value: number }) => Number.isInteger(value),
        value: Number
    }
})).ops(({ fold, unfold, map, family }) => ({

    // ── Eq ───────────────────────────────────────────────────────────────
    equals: fold({
        in: family,
        out: Boolean
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Z({ value }: any, other: any) {
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
        Z({ value }: any, other: any) {
            return value < other.value ? -1 : value > other.value ? 1 : 0;
        }
    }),

    // ── Ring (via EuclideanDomain) ─────────────────────────────────────
    add: fold({
        in: family,
        out: family,
        properties: ['associative', 'commutative', 'identity', 'identity:Zero']
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Z({ value }: any, other: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: value + other.value });
        }
    }),
    Zero: unfold({ out: family })({
        Z: () => ({ value: 0 })
    }),
    multiply: fold({
        in: family,
        out: family,
        properties: ['associative', 'identity', 'identity:One', 'absorbing:Zero', 'distributive:add']
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Z({ value }: any, other: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: value * other.value });
        }
    }),
    One: unfold({ out: family })({
        Z: () => ({ value: 1 })
    }),
    negate: map({ out: family })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: (value: any) => -value
    }),

    // ── EuclideanDomain ───────────────────────────────────────────────────
    // div — truncated quotient (towards zero, consistent with JS Math.trunc)
    div: fold({
        in: family,
        out: family
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Z({ value }: any, other: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: Math.trunc(value / other.value) });
        }
    }),
    // mod — remainder (consistent with JS `%`; sign matches dividend)
    mod: fold({
        in: family,
        out: family
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Z({ value }: any, other: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: value % other.value });
        }
    }),
    // gcd — greatest common divisor via Euclidean algorithm (non-negative)
    gcd: fold({
        in: family,
        out: family
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Z({ value }: any, other: any) {
            let a = Math.abs(value), b = Math.abs(other.value);
            while (b !== 0) [a, b] = [b, a % b];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: a });
        }
    })

}));

export { Int };
