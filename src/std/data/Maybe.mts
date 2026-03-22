/**
 * Maybe(T) — an optional value: either Nothing or Just(value).
 *
 * Satisfies: Functor, Applicative, Monad, Foldable, Monoid (first non-Nothing),
 * Eq({ T: Eq }), Ord({ T: Ord })
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Functor, Applicative, Monad, Foldable, Monoid, Eq, Ord } from '../protocols/index.mjs';

const Maybe = data(({ Family: _Family, T }) => ({
    [satisfies]: [
        Functor, Applicative, Monad, Foldable,
        Monoid,
        Eq({ T: Eq }),
        Ord({ T: Ord })
    ],
    Nothing: {},
    Just: { value: T }
})).ops(({ fold, unfold, map, Family, T }) => ({

    // ── Functor ──────────────────────────────────────────────────────────────
    // T handler has 2 params → hasExtraParams=true → fmap installed as method
    fmap: map({ out: Family })({
        T: (x: unknown, f: (a: unknown) => unknown) => f(x)
    }),

    // ── Monoid (first non-Nothing) ────────────────────────────────────────
    Identity: unfold({ out: Family })({
        Nothing: () => ({}),
        Just:    () => null
    }),
    combine: fold({
        in: Family,
        out: Family
    })({
        // @ts-expect-error — binary fold handler (extra arg from in: Family)
        Nothing(_ctx: unknown, other: unknown) { return other; },
        Just()                                 { return this; }
    }),

    // ── Foldable ─────────────────────────────────────────────────────────
    // Called as: instance.foldMap({ monoid, f })
    foldMap: fold({ in: Object, out: Object })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Nothing(_ctx: unknown, opts: any)      { return opts.monoid.Identity; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Just({ value }: any,   opts: any)      { return opts.f(value); }
    }),

    // ── Applicative ───────────────────────────────────────────────────────
    // Pure(x) → Just(x)
    Pure: unfold({ in: Object, out: Family })({
        Nothing: () => null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Just: (value: any) => ({ value })
    }),
    // this.apply(mf): apply wrapped function mf to this wrapped value
    apply: fold({ in: Family, out: Family })({
        // @ts-expect-error — binary fold handler
        Nothing(_ctx: unknown, _mf: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (Family(T) as any).Nothing;
        },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Just({ value }: any, mf: any) {
            if (mf !== null && mf !== undefined && 'value' in mf && typeof mf.value === 'function')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (Family(T) as any).Just({ value: mf.value(value) });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (Family(T) as any).Nothing;
        }
    }),

    // ── Monad ────────────────────────────────────────────────────────────
    flatMap: fold({ in: Object, out: Family })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Nothing(_ctx: unknown, _f: unknown) { return (Family(T) as any).Nothing; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Just({ value }: any, f: any)        { return f(value); }
    }),

    // ── Eq (conditional: T must satisfy Eq) ──────────────────────────────
    equals: fold({ in: Family, out: Boolean })({
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
    compare: fold({ in: Family, out: Number })({
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
