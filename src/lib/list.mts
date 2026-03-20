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

import { data } from '../index.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const List: any = data(({ Family, T }) => ({
    Nil:  {},
    Cons: { head: T, tail: Family(T) }
})).ops(({ fold, unfold, merge, Family, T }) => ({
    FromArray: unfold({ in: Array, out: Family(T) })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Nil:  (arr: any) => arr.length === 0 ? {} : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons: (arr: any) => arr.length > 0
            ? { head: arr[0], tail: arr.slice(1) }
            : null
    }),
    toArray: fold({ out: Array })({
        Nil()  { return []; },
        Cons({ head, tail }) {
            return [head, ...(tail as unknown[])];
        }
    }),
    length: fold({ out: Number })({
        Nil()  { return 0; },
        Cons({ tail }) { return 1 + tail; }
    }),
    isEmpty: fold({ out: Boolean })({
        Nil()  { return true; },
        Cons() { return false; }
    }),
    contains: fold({ in: Object, out: Boolean })({
        Nil()  { return false; },
        Cons({ head, tail }, value) {
            return head === value || tail(value);
        }
    }),
    filter: fold({ in: Function, out: Object })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Nil() { return (Family(T) as any).Nil; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cons({ head, tail }, predicate: any) {
            const rest = tail(predicate);
            return predicate(head)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ? (Family(T) as any).Cons({ head, tail: rest })
                : rest;
        }
    }),
    RoundTrip: merge('FromArray', 'toArray')
}));

export { List };
