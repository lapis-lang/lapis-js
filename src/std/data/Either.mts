/**
 * Either(L, R) — a disjoint union: Left(value) or Right(value).
 *
 * By convention, Left represents failure/error and Right represents success.
 *
 * Satisfies: Functor (maps over Right), Applicative, Monad, Foldable,
 * Eq({ L: Eq, R: Eq })
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Functor, Applicative, Monad, Foldable, Eq } from '../protocols/index.mjs';

const Either = data(({ L, R }) => ({
    [satisfies]: [
        Functor, Applicative, Monad, Foldable,
        Eq({ L: Eq, R: Eq })
    ],
    Left:  { value: L },
    Right: { value: R }
})).ops(({ fold, unfold, map, Family, R }) => ({
    // ── Functor (maps over Right; Left propagates unchanged) ──────────────
    fmap: map({ out: Family })({
        R: (x: unknown, f: (a: unknown) => unknown) => f(x)
    }),

    // ── Applicative ──────────────────────────────────────────────────────
    // Pure(x) → Right(x)
    Pure: unfold({ in: Object, out: Family })({
        Left: () => null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Right: (value: any) => ({ value })
    }),
    // this.apply(ef): ef is Either(L, fn R→S)
    apply: fold({ in: Family, out: Family })({
        Left() { return this; },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Right({ value }: any, ef: any) {
            if (ef !== null && ef !== undefined && 'value' in ef && typeof ef.value === 'function')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (Family(R) as any).Right({ value: ef.value(value) });
            return ef; // propagate Left
        }
    }),

    // ── Monad ─────────────────────────────────────────────────────────────
    flatMap: fold({ in: Object, out: Family })({
        Left() { return this; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Right({ value }: any, f: any) { return f(value); }
    }),

    // ── Foldable (fold only Right values) ─────────────────────────────────
    foldMap: fold({ in: { monoid: Object, f: Function }, out: Object })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Left(_ctx: unknown, opts: any)  { return opts.monoid.Identity; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Right({ value }: any, opts: any) { return opts.f(value); }
    }),

    // ── Eq (conditional: L and R must satisfy Eq) ─────────────────────────
    equals: fold({ in: Family, out: Boolean })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Left({ value }: any, other: any) {
            return other !== null && other !== undefined &&
                   this.constructor === other.constructor &&
                   // eslint-disable-next-line @typescript-eslint/no-explicit-any
                   (value as any).equals(other.value);
        },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Right({ value }: any, other: any) {
            return other !== null && other !== undefined &&
                   this.constructor === other.constructor &&
                   // eslint-disable-next-line @typescript-eslint/no-explicit-any
                   (value as any).equals(other.value);
        }
    })

}));

export { Either };
