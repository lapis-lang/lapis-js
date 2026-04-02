/**
 * Num — numeric wrapper satisfying algebraic protocols.
 *
 * Satisfies: Eq, Ord, CommutativeMonoid (additive), Semiring, Ring, Field
 *
 * Note: `add` and `combine` are aliases for the same operation; `Zero` and
 * `Identity` are likewise aliases. This satisfies both the Semiring naming
 * convention and the CommutativeMonoid naming convention simultaneously.
 *
 * @module
 */

import { data, satisfies, DemandsError } from '../../index.mjs';
import { Eq, Ord, CommutativeMonoid, Semiring, Ring, Field } from '../protocols/index.mjs';

const Num = data(() => ({
    [satisfies]: [Eq, Ord, CommutativeMonoid, Semiring, Ring, Field],
    N: { value: Number }
})).ops(({ fold, unfold, map, family }) => ({

    // ── Eq ───────────────────────────────────────────────────────────────
    equals: fold({
        in: family,
        out: Boolean
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        N({ value }: any, other: any) {
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
        N({ value }: any, other: any) {
            return value < other.value ? -1 : value > other.value ? 1 : 0;
        }
    }),

    // ── Semiring / CommutativeMonoid ─────────────────────────────────────
    // add ≡ combine (additive commutative monoid)
    add: fold({
        in: family,
        out: family,
        properties: ['associative', 'commutative', 'identity', 'identity:Zero']
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        N({ value }: any, other: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: value + other.value });
        }
    }).as('combine'),

    // Zero ≡ Identity (additive identity element)
    Zero: unfold({ out: family })({
        N: () => ({ value: 0 })
    }).as('Identity'),

    // ── Semiring ─────────────────────────────────────────────────────────
    multiply: fold({
        in: family,
        out: family,
        properties: ['associative', 'identity', 'identity:One', 'absorbing:Zero', 'distributive:add']
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        N({ value }: any, other: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: value * other.value });
        }
    }),
    One: unfold({ out: family })({
        N: () => ({ value: 1 })
    }),

    // ── Ring ─────────────────────────────────────────────────────────────
    negate: map({ out: family })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: (value: any) => -value
    }),

    // ── Field ─────────────────────────────────────────────────────────────
    reciprocal: map({ out: family })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value(value: any) {
            if (value === 0) throw new DemandsError('reciprocal', 'Num', () => 'value must not be zero');
            return 1 / value;
        }
    }),
    divide: fold({
        in: family,
        out: family
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        N({ value }: any, other: any) {
            if (other.value === 0) throw new DemandsError('divide', 'Num', () => 'divisor must not be zero');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: value / other.value });
        }
    })

}));

export { Num };
