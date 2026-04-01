/**
 * Either — a disjoint union: Left(error) or Right(value).
 *
 * By convention, Left represents failure/error and Right represents success.
 *
 * Satisfies: Functor (maps over Right), Applicative, Monad, Foldable.
 * Note: Eq is NOT declared here. Subtypes that know their concrete field
 * types should declare [satisfies]: [Eq] explicitly.
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Functor, Applicative, Monad, Foldable } from '../protocols/index.mjs';

const Either = data(() => ({
    [satisfies]: [Functor, Applicative, Monad, Foldable],
    Left:  { error: Object },
    Right: { value: Object }
})).ops(({ fold, unfold, map, family }) => ({
    // ── Functor (maps over Right; Left propagates unchanged) ──────────────
    fmap: map({ out: family })({
        // Field-based map transform: only Right has `value`, so Left is unchanged.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: (value: any, f: any) => f(value)
    }),

    // ── Applicative ──────────────────────────────────────────────────────
    // Pure(x) → Right(x)
    Pure: unfold({ in: Object, out: family })({
        Left: () => null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Right: (value: any) => ({ value })
    }),
    // this.apply(ef): ef is Either(fn → S)
    apply: fold({ in: family, out: family })({
        Left() { return this; },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Right({ value }: any, ef: any) {
            if (ef !== null && ef !== undefined && 'value' in ef && typeof ef.value === 'function')
                return family.Right({ value: ef.value(value) });
            return ef; // propagate Left
        }
    }),

    // ── Monad ─────────────────────────────────────────────────────────────
    flatMap: fold({ in: Object, out: family })({
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
    })

}));

export { Either };
