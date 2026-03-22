/**
 * Stream(T) — an infinite lazy sequence (final coalgebra / behavior).
 *
 * Satisfies: Functor
 *
 * Provides: Pure (constructor), Apply (static zip constructor)
 *
 * Use cases: infinite sequences, event streams, signal processing.
 *
 * @module
 */

import { behavior, satisfies } from '../../index.mjs';
import { Functor } from '../protocols/index.mjs';

const Stream = behavior(({ Self, T }) => ({
    [satisfies]: [Functor],
    head: T,
    tail: Self(T)
})).ops(({ unfold, fold, map, Self }) => ({

    // ── Constructors ─────────────────────────────────────────────────────
    // From({ value, next }): where next(v) produces the next value
    From: unfold({ in: Object, out: Self })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        head: (seed: any) => seed.value,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tail: (seed: any) => ({ value: seed.next(seed.value), next: seed.next })
    }),

    // Constant({ value }): infinite stream of value
    Constant: unfold({ in: Object, out: Self })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        head: (seed: any) => seed.value,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tail: (seed: any) => seed
    }),

    // Nats: natural numbers starting from n
    Nats: unfold({ in: Number, out: Self })({
        head: (n: unknown) => n,
        tail: (n: unknown) => (n as number) + 1
    }),

    // take(n): collect n elements into an Array
    take: fold({ in: Number, out: Array })({
        _: ({ head, tail }: { head: unknown; tail: (n: number) => unknown[] }, n: number) =>
            n > 0 ? [head, ...(tail(n - 1) as unknown[])] : []
    }),

    // ── Functor: fmap applied element-wise (lazy, as map with extra arg f) ─
    // map with 2-arg transform → installed as method: stream.fmap(f)
    fmap: map({})({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        T: (x: unknown, f: any) => f(x)
    }),

    // ── Applicative: Pure lifts a value into a constant stream ────────────
    // Pure({ value }): same as Constant
    Pure: unfold({ in: Object, out: Self })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        head: (seed: any) => seed.value,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tail: (seed: any) => seed
    }),

    // apply: Applicative ap — given a Stream<fn> and Stream<val>, zip element-wise
    // Called as: Stream.Apply({ fns: streamOfFns, vals: streamOfVals })
    Apply: unfold({ in: Object, out: Self })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        head: (seed: any) => seed.fns.head(seed.vals.head),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tail: (seed: any) => ({ fns: seed.fns.tail, vals: seed.vals.tail })
    })

}));

export { Stream };
