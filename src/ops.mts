/**
 * Curried operation declaration helpers for data() and behavior() declarations.
 *
 * These helpers replace inline [op]/[spec] symbol keys with a two-phase curried
 * API. The helper name encodes the operation kind (eliminating [op]) and the
 * first argument encodes the spec (eliminating [spec]). TypeScript infers the
 * input type from the spec in phase 1, then contextually types handler function
 * parameters in phase 2.
 *
 * Usage:
 *   // Old form — parameters are implicitly `any`
 *   Range: { [op]: 'unfold', [spec]: { in: Number, out: Family },
 *     Cons: (n) => n > 0 ? { head: n, tail: n - 1 } : null }
 *
 *   // New form — n is inferred as `number`
 *   Range: unfold({ in: Number, out: Family })({
 *     Cons: (n) => n > 0 ? { head: n, tail: n - 1 } : null
 *   })
 *
 * The same helpers work in both data() and behavior() declarations.
 *
 * @module ops
 */

import { op, spec, operations as operationsSymbol } from './operations.mjs';
import type { SpecValue, ObserverInputValue } from './types.mjs';

// ---- Type helpers -----------------------------------------------------------

/**
 * Maps a constructor (spec value) to the runtime instance type it produces.
 * Reuses SpecValue with Self=never since unfold/fold input types are never
 * recursive self-references.
 */
export type InstanceOf<C> = SpecValue<C, never>;

// ---- Return types -----------------------------------------------------------

/** The type returned by `unfold(spec)(handlers)`. */
export type UnfoldDef<S, H> =
    { readonly [op]: 'unfold'; readonly [spec]: S } & H;

/** The type returned by `fold(spec)(handlers)`. */
export type FoldDef<S, H> =
    { readonly [op]: 'fold'; readonly [spec]: S } & H;

/** The type returned by `map(spec)(handlers)`. */
export type MapDef<S, H> =
    { readonly [op]: 'map'; readonly [spec]: S } & H;

/** The type returned by `merge(opNames)`. */
export type MergeDef =
    { readonly [op]: 'merge'; readonly [operationsSymbol]: readonly string[] };

// ---- Handler constraint types -----------------------------------------------

/**
 * Converts a spec value (TypeSpec or `Record<string, TypeSpec>`) to its
 * runtime value type. Used for both unfold seed parameters and fold `in` types.
 *
 * Thin alias for `ObserverInputValue<T, never>` (exported from types.mts).
 * `Self = never` because unfold/fold input types are never self-referential.
 */
type SpecToValue<T> = ObserverInputValue<T, never>;

/**
 * The expected handler function type for an unfold operation.
 * When the spec has `in: In`, handlers receive `(n: SpecToValue<In>) => unknown`.
 * When there is no `in`, handlers receive no argument: `() => unknown`.
 *
 * Supports both simple TypeSpec inputs (`in: Number`) and structured inputs
 * (`in: { min: Number, max: Number }`).
 */
type UnfoldHandlerFn<S> = S extends { in: infer In }
    ? (n: SpecToValue<In>) => unknown
    : () => unknown;

/**
 * Within fold handlers, `this` is bound to the variant instance. The runtime
 * sets `this[parent]` as an accessor for the parent operation result, so we
 * type the symbol index as `any` to allow arithmetic and property access on it
 * without extra casts. We also allow string-keyed access so that handlers can
 * use `this.someField` or `this.someOperation` without extra casts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FoldHandlerThis = { [k: string | symbol]: any };

/**
 * The expected handler function type for a fold operation.
 * - With `{ in: In; out: Out }`: `(ctx: any, n: InstanceOf<In>) => InstanceOf<Out>`
 * - With `{ in: In }` only:     `(ctx: any, n: InstanceOf<In>) => unknown`
 * - With `{ out: Out }` only:   `(ctx: any) => InstanceOf<Out>`
 * - With `{}` (empty spec):     `(ctx: any) => unknown`
 *
 * The `this` parameter is typed as `{ [k: symbol]: any }` so that `this[parent]`
 * (used in override handlers) type-checks without extra casts.
 *
 * The `ctx` parameter (the destructured ADT fields or behavior observers)
 * cannot be inferred from the spec alone. Annotate explicitly when needed:
 *   `Cons: (ctx: { head: number; tail: number }) => ctx.head + ctx.tail`
 */
 
type FoldHandlerFn<S> = S extends { in: infer In; out: infer Out }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (this: FoldHandlerThis, ctx: any, n: InstanceOf<In>) => InstanceOf<Out>
    : S extends { in: infer In }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (this: FoldHandlerThis, ctx: any, n: InstanceOf<In>) => unknown
        : S extends { out: infer Out }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? (this: FoldHandlerThis, ctx: any) => InstanceOf<Out>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            : (this: FoldHandlerThis, ctx: any) => unknown;

// ---- unfold -----------------------------------------------------------------

/**
 * Curried helper for declaring unfold (anamorphism) operations.
 *
 * Phase 1: pass the spec — TypeScript infers `In` from `spec.in`.
 * Phase 2: pass the handlers — each handler receives `(n: InstanceOf<In>)`
 *   as its first (and only) argument, fully typed.
 *
 * For parameterless unfolds (no `in`), handlers receive no argument.
 *
 * Reusable across both `data()` and `behavior()` declarations since both
 * use the same handler shape `(seed) => something`.
 *
 * @example
 * ```typescript
 * // data() — Cons handler receives n: number
 * Range: unfold({ in: Number, out: Family })({
 *   Nil:  (n) => n <= 0 ? {} : null,
 *   Cons: (n) => n > 0  ? { head: n, tail: n - 1 } : null
 * })
 *
 * // behavior() — head/tail handlers receive n: number
 * From: unfold({ in: Number, out: Self })({
 *   head: (n) => n,
 *   tail: (n) => n + 1
 * })
 *
 * // Parameterless — handlers receive no argument
 * Empty: unfold({ out: Self })({
 *   isEmpty: () => true,
 *   member:  () => () => false
 * })
 *
 * // Partial application — reuse spec across multiple operations
 * const numUnfold = unfold({ in: Number, out: Family });
 * Range:   numUnfold({ Nil: (n) => ..., Cons: (n) => ... }),
 * Reverse: numUnfold({ Nil: (n) => ..., Cons: (n) => ... })
 * ```
 */
export function unfold<S extends Record<string | symbol, unknown>>(s: S) {
    return <H extends Record<string, UnfoldHandlerFn<S>>>(
        handlers: H
    ): UnfoldDef<S, H> =>
        Object.assign({ [op]: 'unfold' as const, [spec]: s }, handlers) as UnfoldDef<S, H>;
}

// ---- fold -------------------------------------------------------------------

/**
 * Curried helper for declaring fold (catamorphism) operations.
 *
 * Phase 1: pass the spec — TypeScript infers `In` (if present) and `Out`.
 * Phase 2: pass the handlers — each handler receives:
 *   - `ctx` (the destructured variant fields or behavior observers) — typed
 *     as `any` since the field types come from the enclosing declaration
 *   - `n: InstanceOf<In>` as the second argument (only for parametric folds)
 *
 * The return type of every handler is inferred as `InstanceOf<Out>`.
 *
 * Note: `ctx` cannot be fully typed without knowing the enclosing variant
 * specs. Add an explicit annotation when stricter checking is needed:
 *   `Cons: ({ head, tail }: { head: number; tail: number }) => head + tail`
 *
 * @example
 * ```typescript
 * // Parameterless fold — return type inferred as number
 * sum: fold({ out: Number })({
 *   Nil:  () => 0,
 *   Cons: ({ head, tail }) => head + tail
 * })
 *
 * // Parametric fold — n: number ✓, return type inferred as boolean
 * contains: fold({ in: Number, out: Boolean })({
 *   Nil:  (_ctx, n) => false,
 *   Cons: ({ head, tail }, n) => head === n || tail(n)
 * })
 *
 * // Wildcard handler — works the same way
 * name: fold({ out: String })({
 *   _: () => 'unknown'
 * })
 * ```
 */
export function fold<S extends Record<string | symbol, unknown>>(s: S) {
    return <H extends Record<string, FoldHandlerFn<S>>>(
        handlers: H
    ): FoldDef<S, H> =>
        Object.assign({ [op]: 'fold' as const, [spec]: s }, handlers) as FoldDef<S, H>;
}

// ---- map --------------------------------------------------------------------

/**
 * Curried helper for declaring map (homomorphism) operations.
 *
 * Phase 1: pass the spec — typically `{ out: Family }` or `{ out: Self }`.
 * Phase 2: pass the handlers — keyed by type parameter name (e.g., `T`).
 *
 * Note: the handler input type is the runtime instance type of the ADT's
 * type parameter `T`, which cannot be inferred from the spec alone. The
 * input param is typed as `any` to avoid spurious errors while still
 * providing the return type context from `spec.out`.
 *
 * @example
 * ```typescript
 * increment: map({ out: Family })({
 *   T: (x) => x + 1   // x: any — annotate as number if desired
 * })
 * ```
 */
export function map<S extends Record<string | symbol, unknown>>(s: S) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <H extends Record<string, (x: any) => unknown>>(
        handlers: H
    ): MapDef<S, H> =>
        Object.assign({ [op]: 'map' as const, [spec]: s }, handlers) as MapDef<S, H>;
}

// ---- merge ------------------------------------------------------------------

/**
 * Helper for declaring merge (pipeline composition) operations.
 *
 * Merges compose two or more named operations into a pipeline:
 * the result of the first operation is fed as input to the second, and so on.
 *
 * Unlike fold/unfold/map, merge has no handlers — only a list of operation names.
 *
 * @example
 * ```typescript
 * Factorial:    merge('Range', 'product'),
 * sumOfSquares: merge('square', 'sum')
 * ```
 */
export function merge(...opNames: readonly string[]): MergeDef {
    return {
        [op]: 'merge' as const,
        [operationsSymbol]: opNames
    };
}
