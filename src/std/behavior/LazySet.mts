/**
 * LazySet(T) — a lazy set membership test (final coalgebra / behavior).
 *
 * Satisfies: Foldable
 *
 * Observers: has(elem) → Boolean, size → Number
 *
 * @module
 */

import { behavior, satisfies } from '../../index.mjs';
import { Foldable } from '../protocols/index.mjs';

type MonoidLike = { Identity: unknown; combine: (a: unknown, b: unknown) => unknown };
type LazySetSelf = { has: (e: unknown) => boolean; size: number };
type FoldMapOpts = { monoid: MonoidLike; f: (v: unknown) => unknown; elements: unknown[] };

const LazySet = behavior(({ T }) => ({
    [satisfies]: [Foldable],
    has: { in: T, out: Boolean },
    size: Number
})).ops(({ unfold, fold, Self }) => ({
    // ── Constructors ─────────────────────────────────────────────────────
    // FromArray(elements): build from an array of elements
    FromArray: unfold({ in: Array, out: Self })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        has: (elems: any) => (elem: unknown) =>
            (elems as unknown[]).includes(elem),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        size: (elems: any) => new Set(elems as unknown[]).size
    }),
    // Empty: the empty set
    Empty: unfold({ in: Object, out: Self })({
        has: () => () => false,
        size: () => 0
    }),
    // Singleton({ value }): set containing exactly one element
    Singleton: unfold({ in: Object, out: Self })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        has: (seed: any) => (elem: unknown) => elem === seed.value,
        size: () => 1
    }),
    // ── Foldable: foldMap ────────────────────────────────────────────────
    // Fold over all elements with a monoid (requires elements to be passed)
    foldMap: fold({ in: Object, out: Object })({
        // @ts-expect-error — fold handler with typed opts param
        _: ({ has, size: _size }: LazySetSelf, opts: FoldMapOpts) =>
            opts.elements.reduce(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (acc: any, e: unknown) => has(e) ? opts.monoid.combine(acc, opts.f(e)) : acc,
                opts.monoid.Identity
            )
    })

}));

export { LazySet };
