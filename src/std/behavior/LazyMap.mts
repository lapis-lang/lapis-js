/**
 * LazyMap(K, V) — a lazy key-value mapping (final coalgebra / behavior).
 *
 * Satisfies: Functor (over V), Foldable
 *
 * Observers: lookup(key) → Maybe-like, has(key) → Boolean, size → Number
 *
 * @module
 */

import { behavior, satisfies } from '../../index.mjs';
import { Functor, Foldable } from '../protocols/index.mjs';

type MonoidLike = { Identity: unknown; combine: (a: unknown, b: unknown) => unknown };
type LazyMapSelf = { lookup: (k: unknown) => unknown; has: (k: unknown) => boolean; size: number };
type FoldMapOpts = { monoid: MonoidLike; f: (v: unknown) => unknown; keys: unknown[] };

const LazyMap = behavior(({ T, U }) => ({
    [satisfies]: [Functor, Foldable],
    // lookup is parametric: in K → out V|undefined
    lookup: { in: T, out: U },
    has: { in: T, out: Boolean },
    size: Number
})).ops(({ unfold, fold, map, Self }) => ({
    // ── Constructors ─────────────────────────────────────────────────────
    // FromEntries(entries): build from array of [key, value] pairs
    FromEntries: unfold({ in: Array, out: Self })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lookup: (entries: any) => (key: unknown) => {
            const pair = (entries as [unknown, unknown][]).find(([k]) => k === key);
            return pair ? pair[1] : undefined;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        has: (entries: any) => (key: unknown) =>
            (entries as [unknown, unknown][]).some(([k]) => k === key),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        size: (entries: any) => (entries as unknown[]).length
    }),
    // FromObject(obj): build from a plain object
    FromObject: unfold({ in: Object, out: Self })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lookup: (obj: any) => (key: unknown) =>
            Object.prototype.hasOwnProperty.call(obj, key as string) ? obj[key as string] : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        has: (obj: any) => (key: unknown) =>
            Object.prototype.hasOwnProperty.call(obj, key as string),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        size: (obj: any) => Object.keys(obj).length
    }),
    // ── Functor: fmap over values ────────────────────────────────────────
    // map with 2-arg transform → method: myMap.fmap(f)
    fmap: map({})({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        U: (v: unknown, f: any) => f(v)
    }),
    // ── Foldable: foldMap ────────────────────────────────────────────────
    // Fold over all values with a monoid
    foldMap: fold({ in: Object, out: Object })({
        // @ts-expect-error — fold handler with typed opts param
        _: ({ lookup, has, size: _size }: LazyMapSelf, opts: FoldMapOpts) =>
            opts.keys.reduce(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (acc: any, k: unknown) => has(k) ? opts.monoid.combine(acc, opts.f(lookup(k))) : acc,
                opts.monoid.Identity
            )
    })
}));

export { LazyMap };
