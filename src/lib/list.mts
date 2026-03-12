/**
 * List — a reusable, parameterized linked-list ADT.
 *
 *   List(T) ::= Nil | Cons(head: T, tail: List(T))
 *
 * Provides common operations as fold/unfold:
 *   - FromArray  (unfold): Array → List(T)
 *   - toArray    (fold):   List(T) → Array
 *   - length     (fold):   List(T) → Number
 *   - isEmpty    (fold):   List(T) → Boolean
 *   - contains   (fold):   List(T) × value → Boolean
 *   - filter     (fold):   List(T) × predicate → List(T)
 *
 * Usage:
 *   const NumList = List({ T: Number });
 *   const ns = NumList.FromArray([1, 2, 3]);
 *   ns.toArray  // [1, 2, 3]
 *   ns.length   // 3
 *
 * @module
 */

import { data, fold, unfold, merge } from '../index.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const List: any = data(({ Family, T }: { Family: any; T: any }) => ({
    Nil:  {},
    Cons: { head: T, tail: Family(T) },

    /**
     * Unfold: Array → List(T) (anamorphism).
     * Converts a JavaScript array into a linked list.
     */

    FromArray: unfold({ in: Array, out: Family(T) })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Nil:  (arr: any) => arr.length === 0 ? {} : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons: (arr: any) => arr.length > 0
            ? { head: arr[0], tail: arr.slice(1) }
            : null
    }),

    /** Fold: List(T) → Array. */
    toArray: fold({ out: Array })({
        Nil()  { return []; },
        Cons({ head, tail }: { head: unknown; tail: unknown[] }) {
            return [head, ...tail];
        }
    }),

    /** Fold: List(T) → Number (element count). */
    length: fold({ out: Number })({
        Nil()  { return 0; },
        Cons({ tail }: { tail: number }) { return 1 + tail; }
    }),

    /** Fold: List(T) → Boolean (true if Nil). */
    isEmpty: fold({ out: Boolean })({
        Nil()  { return true; },
        Cons() { return false; }
    }),

    /** Fold: List(T) × value → Boolean (membership test). */
    contains: fold({ in: Object, out: Boolean })({
        Nil()  { return false; },
        Cons({ head, tail }: { head: unknown; tail: (v: unknown) => boolean }, value: unknown) {
            return head === value || tail(value);
        }
    }),

    /**
     * Fold: List(T) × predicate → List(T) (filter).
     * Returns a new List containing only elements satisfying the predicate.
     * Uses Family(T) to construct instances of the current specialization.
     */

    filter: fold({ in: Function, out: Object })({
        Nil() { return Family(T).Nil; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }: { head: unknown; tail: (p: any) => any }, predicate: any) {
            const rest = tail(predicate);
            return predicate(head)
                ? Family(T).Cons({ head, tail: rest })
                : rest;
        }
    }),

    /** Merge: FromArray ∘ toArray (round-trip identity). */
    RoundTrip: merge('FromArray', 'toArray')
}));

export { List };
