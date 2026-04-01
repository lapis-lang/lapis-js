/**
 * Str — string wrapper satisfying algebraic protocols.
 *
 * Satisfies: Eq, Ord, Monoid (concatenation)
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Eq, Ord, Monoid } from '../protocols/index.mjs';

const Str = data(() => ({
    [satisfies]: [Eq, Ord, Monoid],
    S: { value: String }
})).ops(({ fold, unfold, family }) => ({

    // ── Eq ───────────────────────────────────────────────────────────────
    equals: fold({
        in: family,
        out: Boolean
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        S({ value }: any, other: any) {
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
        S({ value }: any, other: any) {
            return value < other.value ? -1 : value > other.value ? 1 : 0;
        }
    }),

    // ── Monoid (concatenation) ───────────────────────────────────────────
    Identity: unfold({ out: family })({
        S: () => ({ value: '' })
    }),
    combine: fold({
        in: family,
        out: family
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        S({ value }: any, other: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new (this.constructor as any)({ value: value + other.value });
        }
    })

}));

export { Str };
