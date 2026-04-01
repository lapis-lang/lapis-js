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
import type { InstanceOf } from '../../index.mjs';
import { Functor, Foldable, type Monoid } from '../protocols/index.mjs';

type LazyMapSelf = { lookup: (k: unknown) => unknown; has: (k: unknown) => boolean; size: number };
type FoldMapOpts = { monoid: InstanceOf<typeof Monoid>; f: (v: unknown) => unknown; keys: unknown[] };

const LazyMap = behavior(_ => ({
    [satisfies]: [Functor, Foldable],
    // lookup is parametric: in K → out V|undefined
    lookup: { in: Object, out: Object },
    has: { in: Object, out: Boolean },
    size: Number
})).ops(({ unfold, fold, map, self }) => ({
    // ── Constructors ─────────────────────────────────────────────────────
    // FromEntries(entries): build from array of [key, value] pairs
    FromEntries: unfold({ in: Array, out: self })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lookup: (entries: any): ((key: object) => object) => (key: unknown): object => {
            const pair = (entries as [unknown, unknown][]).find(([k]) => k === key);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (pair ? pair[1] : undefined) as any;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        has: (entries: any): ((key: object) => boolean) => (key: unknown): boolean =>
            (entries as [unknown, unknown][]).some(([k]) => k === key),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        size: (entries: any) => (entries as unknown[]).length
    }),
    // FromObject(obj): build from a plain object
    FromObject: unfold({ in: Object, out: self })({
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
        lookup: (v: unknown, f: any) => f(v)
    }),
    // ── Foldable: foldMap ────────────────────────────────────────────────
    // Fold over all values with a monoid
    foldMap: fold({ in: { monoid: Object, f: Function, keys: Array }, out: Object })({
        // @ts-expect-error — fold handler with typed opts param
        _: ({ lookup, has, size: _size }: LazyMapSelf, opts: FoldMapOpts) =>
            opts.keys.reduce(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (acc: any, k: unknown) => has(k) ? opts.monoid.combine.call(acc, opts.f(lookup(k))) : acc,
                opts.monoid.Identity
            )
    })
}));

export { LazyMap };
