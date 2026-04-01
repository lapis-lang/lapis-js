/**
 * NonEmpty(T) — a non-empty list: at least one element guaranteed.
 *
 *   NonEmpty(T) ::= Singleton(value) | Cons(head: T, tail: NonEmpty(T))
 *
 * Satisfies: Functor, Foldable, Semigroup (append — no identity since never empty),
 * Eq({ T: Eq }), Ord({ T: Ord })
 *
 * NonEmpty is a Semigroup but NOT a Monoid — there is no empty element.
 * This distinction makes operations like `head` and `reduce` total without
 * requiring preconditions.
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Functor, Foldable, Semigroup } from '../protocols/index.mjs';

const NonEmpty = data(family => ({
    [satisfies]: [
        Functor,
        Foldable,
        Semigroup
    ],
    Singleton: { value: Object },
    Cons:      { head: Object, tail: family }
})).ops(({ fold, map, family }) => ({

    // ── Functor ──────────────────────────────────────────────────────────
    fmap: map({ out: family })({
        value: (x: unknown, f: (a: unknown) => unknown) => f(x),
        head:  (x: unknown, f: (a: unknown) => unknown) => f(x)
    }),

    // ── Foldable ─────────────────────────────────────────────────────────
    foldMap: fold({ in: { monoid: Object, f: Function }, out: Object })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Singleton({ value }: any, opts: any)  { return opts.f(value); },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }: any, opts: any)  {
            return opts.monoid.combine.call(opts.f(head), tail(opts));
        }
    }),

    // ── Semigroup (append) ─────────────────────────────────────────────
    combine: fold({
        in: family,
        out: family
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Singleton({ value }: any, other: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (family as any).Cons({ head: value, tail: other });
        },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }: any, other: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (family as any).Cons({ head, tail: tail(other) });
        }
    }),

    // ── Eq (conditional: T must satisfy Eq) ──────────────────────────────
    equals: fold({ in: family, out: Boolean })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Singleton({ value }: any, other: any) {
            return other !== null && other !== undefined &&
                   this.constructor === other.constructor &&
                   // eslint-disable-next-line @typescript-eslint/no-explicit-any
                   (value as any).equals(other.value);
        },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }: any, other: any) {
            return other !== null && other !== undefined &&
                   this.constructor === other.constructor &&
                   // eslint-disable-next-line @typescript-eslint/no-explicit-any
                   (head as any).equals(other.head) &&
                   tail(other.tail);
        }
    }),

    // ── Ord (conditional: T must satisfy Ord) ─────────────────────────────
    compare: fold({ in: family, out: Number })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Singleton({ value }: any, other: any) {
            if (other === null || other === undefined) return 1;
            if (this.constructor !== other.constructor)
                return -1;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (value as any).compare(other.value);
        },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }: any, other: any) {
            if (other === null || other === undefined) return 1;
            if (this.constructor !== other.constructor) return 1; // Cons > Singleton
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const c = (head as any).compare(other.head);
            if (c !== 0) return c;
            return tail(other.tail);
        }
    })

}));

export { NonEmpty };
