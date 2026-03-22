/**
 * Num — numeric wrapper satisfying algebraic protocols.
 *
 * Satisfies: Eq, Ord, CommutativeMonoid (additive), Semiring, Ring
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Eq, Ord, CommutativeMonoid, Semiring, Ring } from '../protocols/index.mjs';

const Num = data(() => ({
    [satisfies]: [Eq, Ord, CommutativeMonoid, Semiring, Ring],
    N: { value: Number }
})).ops(({ fold, unfold, map: _map, Family }) => ({

    // ── Eq ───────────────────────────────────────────────────────────────
    equals: fold({
        in: Family,
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
        in: Family,
        out: Number
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        N({ value }: any, other: any) {
            return value < other.value ? -1 : value > other.value ? 1 : 0;
        }
    }),

    // ── CommutativeMonoid (additive) ─────────────────────────────────────
    Identity: unfold({ out: Family })({
        N: () => ({ value: 0 })
    }),
    combine: fold({
        in: Family,
        out: Family
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        N({ value }: any, other: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: value + other.value });
        }
    }),

    // ── Semiring ─────────────────────────────────────────────────────────
    // add = combine (additive monoid)
    add: fold({
        in: Family,
        out: Family
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        N({ value }: any, other: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: value + other.value });
        }
    }),
    Zero: unfold({ out: Family })({
        N: () => ({ value: 0 })
    }),
    multiply: fold({
        in: Family,
        out: Family
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        N({ value }: any, other: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: value * other.value });
        }
    }),
    One: unfold({ out: Family })({
        N: () => ({ value: 1 })
    }),

    // ── Ring ─────────────────────────────────────────────────────────────
    negate: fold({ out: Family })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        N({ value }: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: -value });
        }
    })

}));

export { Num };
