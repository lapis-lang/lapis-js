/**
 * List — a singly-linked list ADT.
 *
 *   List ::= Nil | Cons(head: Object, tail: List)
 *
 * Satisfies: Functor, Foldable, Traversable, Monoid (append)
 *
 * Traversable extends both Foldable and Functor, so registering [satisfies]: [Traversable]
 * automatically satisfies `instanceof Functor` and `instanceof Foldable` transitively.
 *
 * Operations:
 *   - FromArray  (unfold): Array → List(T)
 *   - toArray    (fold):   List(T) → Array
 *   - length     (fold):   List(T) → Number
 *   - isEmpty    (fold):   List(T) → Boolean
 *   - contains   (fold):   List(T) × value → Boolean
 *   - filter     (fold):   List(T) × predicate → List(T)
 *   - fmap       (map):    Functor
 *   - foldMap    (fold):   Foldable — called as list.foldMap({ monoid, f })
 *   - traverse   (fold):   Traversable — called as list.traverse({ applicative, f })
 *   - Identity   (unfold): Monoid identity (Nil)
 *   - combine    (fold):   Monoid append
 *   - equals     (fold):   Eq (conditional on T: Eq)
 *   - compare    (fold):   Ord (conditional on T: Ord)
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';

import { Traversable, Monoid } from '../protocols/index.mjs';

const List = data(family => ({
    [satisfies]: [
        Traversable,    // extends Foldable + Functor → instanceof Functor/Foldable works transitively
        Monoid
    ],
    Nil:  {},
    Cons: { head: Object, tail: family }
})).ops(({ fold, unfold, merge, map, family }) => ({

    // ── Original operations (from src/lib/list.mts) ───────────────────────
    FromArray: unfold({ in: Array, out: family })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Nil:  (arr: any) => arr.length === 0 ? {} : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons: (arr: any) => arr.length > 0
            ? { head: arr[0], tail: arr.slice(1) }
            : null
    }),
    toArray: fold({ out: Array })({
        Nil()  { return []; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }: any) {
            return [head, ...(tail as unknown[])];
        }
    }),
    length: fold({ out: Number })({
        Nil()  { return 0; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ tail }: any) { return 1 + tail; }
    }),
    isEmpty: fold({ out: Boolean })({
        Nil()  { return true; },
        Cons() { return false; }
    }),
    contains: fold({ in: Object, out: Boolean })({
        Nil()  { return false; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }: any, value: unknown) {
            return head === value || tail(value);
        }
    }),
    filter: fold({ in: Function, out: family })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Nil() { return (family as any).Nil; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }: any, predicate: any) {
            const rest = tail(predicate);
            return predicate(head)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ? (family as any).Cons({ head, tail: rest })
                : rest;
        }
    }),
    RoundTrip: merge('FromArray', 'toArray'),

    // ── Functor ──────────────────────────────────────────────────────────
    fmap: map({ out: family })({
        head: (x: unknown, f: (a: unknown) => unknown) => f(x)
    }),

    // ── Monoid (append) ───────────────────────────────────────────────────
    Identity: unfold({ out: family })({
        Nil:  () => ({}),
        Cons: () => null
    }),
    combine: fold({
        in: family,
        out: family
    })({
        // @ts-expect-error — binary fold handler

        Nil(_ctx: unknown, other: unknown) { return other; },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }: any, other: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (family as any).Cons({ head, tail: tail(other) });
        }
    }),

    // ── Foldable ─────────────────────────────────────────────────────────
    // Called as: list.foldMap({ monoid, f })
    foldMap: fold({ in: { monoid: Object, f: Function }, out: Object })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Nil(_ctx: unknown, opts: any)        { return opts.monoid.Identity; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }: any, opts: any) {
            return opts.monoid.combine.call(opts.f(head), tail(opts));
        }
    }),

    // ── Traversable ───────────────────────────────────────────────────
    // Called as: list.traverse({ applicative, f })
    // Returns applicative.Pure(Nil) for Nil;
    // For Cons, traverses head and tail and lifts combination.
    traverse: fold({ in: { applicative: Object, f: Function }, out: Object })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Nil(_ctx: unknown, opts: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return opts.applicative.Pure((family as any).Nil);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }: any, opts: any) {
            const fHead = opts.f(head);
            const fTail = tail(opts);
            // Lift (h, t) => Cons(h, t) into the applicative
            // fHead.fmap(h => t => Cons(h, t)).apply(fTail)
            return fHead
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .fmap((h: any) => (t: any) => (family as any).Cons({ head: h, tail: t }))
                .apply(fTail);
        }
    }),

    // ── Eq (conditional: T must satisfy Eq) ──────────────────────────────
    equals: fold({ in: family, out: Boolean })({
        // @ts-expect-error — binary fold handler
        Nil(_ctx: unknown, other: unknown) {
            return other !== null && other !== undefined &&
                   // eslint-disable-next-line @typescript-eslint/no-explicit-any
                   this.constructor === (other as any).constructor;
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
    // Lexicographic: element-by-element, then Nil < Cons
    compare: fold({ in: family, out: Number })({
        // @ts-expect-error — binary fold handler
        Nil(_ctx: unknown, other: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (other !== null && (other as any).constructor === this.constructor) ? 0 : -1;
        },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }: any, other: any) {
            if (other === null || other === undefined) return 1;
            if (this.constructor !== other.constructor) return 1; // Cons > Nil
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const c = (head as any).compare(other.head);
            if (c !== 0) return c;
            return tail(other.tail);
        }
    })

}));

export { List };
