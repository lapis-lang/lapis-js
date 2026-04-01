/**
 * Maybe(T) — an optional value: either Nothing or Just(value).
 *
 * Satisfies: Functor, Applicative, Monad, Foldable, Monoid (first non-Nothing),
 * Eq({ T: Eq }), Ord({ T: Ord })
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Functor, Applicative, Monad, Foldable, Monoid } from '../protocols/index.mjs';

const Maybe = data(_ => ({
    [satisfies]: [
        Functor, Applicative, Monad, Foldable,
        Monoid
    ],
    Nothing: {},
    Just: { value: Object }
})).ops(({ fold, unfold, map, family }) => ({

    // ── Functor ──────────────────────────────────────────────────────────────
    // T handler has 2 params → hasExtraParams=true → fmap installed as method
    fmap: map({ out: family })({
        value: (x: unknown, f: (a: unknown) => unknown) => f(x)
    }),

    // ── Monoid (first non-Nothing) ────────────────────────────────────────
    Identity: unfold({ out: family })({
        Nothing: () => ({}),
        Just:    () => null
    }),
    combine: fold({
        in: family,
        out: family
    })({
        // @ts-expect-error — binary fold handler (extra arg from in: family)
        Nothing(_ctx: unknown, other: unknown) { return other; },
        Just()                                 { return this; }
    }),

    // ── Foldable ─────────────────────────────────────────────────────────
    // Called as: instance.foldMap({ monoid, f })
    foldMap: fold({ in: { monoid: Object, f: Function }, out: Object })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Nothing(_ctx: unknown, opts: any)      { return opts.monoid.Identity; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Just({ value }: any,   opts: any)      { return opts.f(value); }
    }),

    // ── Applicative ───────────────────────────────────────────────────────
    // Pure(x) → Just(x)
    Pure: unfold({ in: Object, out: family })({
        Nothing: () => null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Just: (value: any) => ({ value })
    }),
    // this.apply(mf): apply wrapped function mf to this wrapped value
    apply: fold({ in: family, out: family })({
        // @ts-expect-error — binary fold handler
        Nothing(_ctx: unknown, _mf: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (family as any).Nothing;
        },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Just({ value }: any, mf: any) {
            if (mf !== null && mf !== undefined && 'value' in mf && typeof mf.value === 'function')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (family as any).Just({ value: mf.value(value) });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (family as any).Nothing;
        }
    }),

    // ── Monad ────────────────────────────────────────────────────────────
    flatMap: fold({ in: Object, out: family })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Nothing(_ctx: unknown, _f: unknown) { return (family as any).Nothing; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Just({ value }: any, f: any)        { return f(value); }
    }),

    // ── Eq (conditional: T must satisfy Eq) ──────────────────────────────
    equals: fold({ in: family, out: Boolean })({
        // @ts-expect-error — binary fold handler
        Nothing(_ctx: unknown, other: unknown) {
            return other !== null && other !== undefined &&
                   // eslint-disable-next-line @typescript-eslint/no-explicit-any
                   this.constructor === (other as any).constructor;
        },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Just({ value }: any, other: any) {
            return other !== null && other !== undefined &&
                   this.constructor === other.constructor &&
                   // eslint-disable-next-line @typescript-eslint/no-explicit-any
                   (value as any).equals(other.value);
        }
    }),

    // ── Ord (conditional: T must satisfy Ord) ─────────────────────────────
    // Nothing < Just for any T; Just compares by value.
    compare: fold({ in: family, out: Number })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Nothing(_ctx: unknown, other: any) {
            return this.constructor === other.constructor ? 0 : -1;
        },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Just({ value }: any, other: any) {
            if (this.constructor !== other.constructor) return 1;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (value as any).compare(other.value);
        }
    })

}));

export { Maybe };
