/**
 * Observer — Coalgebraic dual of Relation: cospan structure on behaviors.
 *
 * An observer P : A ⇝ B is a cospan:   A →input— P ←output— B
 *
 * `observer()` is derived from `behavior()`. It builds a final coalgebra (ν-type)
 * enriched with cospan structure: named field references for
 * output extraction, termination detection, and acceptance filtering,
 * plus coalgebraic operations that only make sense on types with that structure:
 *
 *   - explore()   — coinductive exploration νX. observe ∪ step(X)
 *   - (future)    — bisimulation, parallel composition
 *
 * This is the categorical dual of `relation()`:
 *
 *   relation (μ)                     observer (ν)
 *   ─────────────                    ─────────────
 *   span: A ←origin— R —dest→ B     cospan: A →input— P ←output— B
 *   origin/destination (fold ops)    output/done/accept (field refs)
 *   join invariant (auto-gen)        Self continuation (auto-detect)
 *   closure (least fixpoint ↑)       explore (greatest fixpoint ↓)
 *   Datalog (bottom-up, all)         Prolog (top-down, lazy)
 *
 * The `out` type in the `output` fold spec serves as the codomain type,
 * and the `in` type of the unfold serves as the domain type (replacing
 * the former separate `domain`/`codomain` keys).
 *
 * @module
 */

import { behavior } from './Behavior.mjs';
import { isOperationDef, isSelfRef, op, spec as specSym, LapisTypeSymbol, SelfRefSymbol } from './operations.mjs';
import type { BehaviorDeclParams, ObserverADT, SpecValue } from './types.mjs';
import type { fold, unfold, map, merge } from './ops.mjs';

// ---- Symbols ----------------------------------------------------------------

/** Symbol key for declaring the output cospan projection in an observer. */
export const output: unique symbol = Symbol('output');
export type output = typeof output;

/** Symbol key for declaring the done cospan projection in an observer. */
export const done: unique symbol = Symbol('done');
export type done = typeof done;

/** Symbol key for declaring the accept cospan projection in an observer. */
export const accept: unique symbol = Symbol('accept');
export type accept = typeof accept;

// ---- Types ------------------------------------------------------------------

// ---- Ops context and return structure -------------------------------------

/**
 * Context provided to the observer().ops() callback.
 * Includes all behavior ops plus the cospan projection symbols.
 */
type ObserverOpsContext = {
    fold: typeof fold;
    unfold: typeof unfold;
    map: typeof map;
    merge: typeof merge;
    Self: { readonly [SelfRefSymbol]: true; (typeParam?: unknown): unknown };
    output: typeof output;
    done: typeof done;
    accept: typeof accept;
};

/**
 * Maps a spec constructor to the corresponding instance type.
 * Used to compute the element type of `explore()` results.
 * Delegates to the centralized `SpecValue` mapping (Self = never since
 * explore output is never self-referential).
 */
type OutputType<S> = SpecValue<S, never>;

/**
 * The base observer shape: behavior with explore() attached.
 */
type ObserverShape<D> = ObserverADT<D> & {
    explore(seed: unknown, options?: ExploreOptions): unknown[];
};

interface ExploreOptions {
    /** Maximum number of steps before giving up.  Default: 10 000. */
    maxSteps?: number;
    /**
     * Maximum number of results to collect.  Default: Infinity (all).
     *
     * Setting `maxResults: 1` gives **cut** semantics — commit to the first
     * accepted result and stop exploring (Prolog `!`).
     */
    maxResults?: number;
    /**
     * Name of the unfold operation to use as the primary generator.
     * Default: the first unfold found in the spec.
     */
    unfold?: string;
}

// ---- observer() -------------------------------------------------------------

/**
 * Define an observer — a behavior type with cospan structure (input/output + explore).
 *
 * Required cospan projections in the declaration:
 *
 * - `[output]` — field name string referencing an observer field
 * - `[done]`   — field name string referencing a Boolean observer field
 * - `[accept]` — field name string referencing a Boolean observer field
 *
 * Each cospan key names an observer field; the framework auto-generates the
 * corresponding fold projection:
 *   `[output]: 'path'`  becomes  `output: fold({ out: Array })({ _: ({ path }) => path })`
 *
 * The `out` type in the `output` fold spec serves as the codomain type.
 * The `in` type of the unfold operation serves as the domain type.
 * This parallels how `relation()` derives domain/codomain from
 * `origin`/`destination` fold specs.
 *
 * All other keys are standard behavior observers and operations (same as `behavior()`).
 *
 * The `Self` continuation is automatically detected as the stepping mechanism.
 *
 * The returned behavior has all standard `behavior()` operations plus:
 * - `.explore(seed, options?)` — coinductive exploration (greatest fixpoint, top-down lazy)
 *
 * @example
 * ```typescript
 * const SolverStream = observer(({ Self }) => ({
 *     board: Array,
 *     isSolved: Boolean,
 *     isExhausted: Boolean,
 *     next: Self,
 *
 *     // Symbol keys: field name references
 *     [output]: 'board',
 *     [done]:   'isExhausted',
 *     [accept]: 'isSolved',
 *
 *     Search: unfold({ in: Object, out: Self })({
 *         board:       (s) => s.currentBoard,
 *         isSolved:    (s) => s.isSolved,
 *         isExhausted: (s) => s.exhausted,
 *         next:        (s) => advanceSearch(s)
 *     }),
 *
 *     first: fold({ out: Array })({
 *         _: ({ isSolved, board, next }) => {
 *             if (isSolved) return [board];
 *             return next();
 *         }
 *     })
 * }));
 *
 * const results = SolverStream.explore(seed);
 * const first   = SolverStream.explore(seed, { maxResults: 1 });
 * ```
 */
/**
 * Combined return type for `observer().ops()`.
 * Using a single type alias instead of a raw intersection `A & B` helps
 * TypeScript cache the structural resolution rather than re-expanding
 * the intersection at every call-site (explore, length, forEach, etc.).
 */
type ObserverWithExplore<D, O, Out> =
    ObserverADT<D & O> & {
        explore(seed: unknown, options?: ExploreOptions): Out;
    };

export function observer<D extends Record<string, unknown>>(
    declFn: (params: BehaviorDeclParams) => D
): ObserverShape<D> & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ops<const O extends Record<string | symbol, any>>(
        opsFn: (ctx: ObserverOpsContext) => O
    ): ObserverWithExplore<D, O,
        O extends { readonly [output]: infer K extends keyof D & string }
            ? OutputType<D[K]>[]
            : unknown[]
    >;
} {
    // Stored cospan metadata, populated when .ops() is called.
    let unfoldNames: string[] = [];
    let selfFieldName: string | null = null;
    let capturedRawSpec: Record<string, unknown> | null = null;

    // Wrap the user's declaration: only observer fields in Phase 1.
    // Cospan projections ([output]/[done]/[accept]) and operations move to .ops().
    const ADT = behavior((params: BehaviorDeclParams) => {
        const rawSpec = declFn(params);
        capturedRawSpec = rawSpec; // captured for .ops() interceptor
        selfFieldName = null;

        const RESERVED = new Set(['explore']);
        const transformed: Record<string | symbol, unknown> = {};

        for (const [key, value] of Object.entries(rawSpec)) {
            if (RESERVED.has(key)) {
                throw new Error(
                    `observer(): '${key}' is a reserved auto-generated operation and cannot be redefined`
                );
            }

            // Detect Self continuation (stays in Phase 1 — it's an observer field)
            if (isSelfRef(value)) {
                selfFieldName = key;
                transformed[key] = value;
                continue;
            }

            // Standard observer field (non-op)
            if (!isOperationDef(key, value))
                transformed[key] = value;

            // Operations are skipped here — they belong in .ops()
        }

        // Pass through symbol-keyed entries (e.g. [extend]),
        // but skip the cospan symbols — they move to .ops().
        const COSPAN_SYMS = new Set<symbol>([output, done, accept]);
        for (const sym of Object.getOwnPropertySymbols(rawSpec)) {
            if (!COSPAN_SYMS.has(sym))
                transformed[sym] = (rawSpec as Record<symbol, unknown>)[sym];
        }

        return transformed as Record<string, unknown>;
    });

    // ---- Intercept .ops() to inject output/done/accept context ----
    const baseOps = (ADT as Record<string, unknown>).ops as
        ((fn: (ctx: Record<string, unknown>) => Record<string | symbol, unknown>) => typeof ADT) | undefined;

    const COSPAN_KEYS = [
        { sym: output, name: 'output' },
        { sym: done,   name: 'done' },
        { sym: accept, name: 'accept' }
    ] as const;

    if (baseOps) {
        (ADT as Record<string, unknown>).ops = function observerOps(
            opsFn: (ctx: Record<string, unknown>) => Record<string | symbol, unknown>
        ) {
            return baseOps.call(ADT, (baseCtx: Record<string, unknown>) => {
                // Augment context with cospan symbols
                const augCtx = { ...baseCtx, output, done, accept };
                const userOps = opsFn(augCtx) as Record<string | symbol, unknown>;

                // Reject reserved operation names in .ops()
                const RESERVED = new Set(['explore']);
                for (const key of Object.keys(userOps)) {
                    if (RESERVED.has(key)) {
                        throw new Error(
                            `observer(): '${key}' is a reserved auto-generated operation and cannot be redefined`
                        );
                    }
                }

                // Build result: copy all string-keyed entries from user ops
                const result: Record<string, unknown> = {};
                unfoldNames = [];
                for (const [key, value] of Object.entries(userOps)) {
                    result[key] = value;
                    if (isUnfoldDef(value))
                        unfoldNames.push(key);
                }

                // Resolve cospan field references and auto-generate fold defs
                const rawSpec = capturedRawSpec ?? {};
                for (const { sym, name } of COSPAN_KEYS) {
                    const def = userOps[sym];
                    if (typeof def !== 'string') {
                        throw new Error(
                            `observer().ops() requires [${name}] to be a string field reference, ` +
                            `e.g. [${name}]: '${name === 'output' ? 'myField' : 'myBoolField'}'`
                        );
                    }
                    const fieldName = def;
                    const fieldSpec = rawSpec[fieldName];
                    if (fieldSpec === undefined) {
                        throw new Error(
                            `observer(): [${name}]: "${fieldName}" references unknown field '${fieldName}'`
                        );
                    }
                    const outType = isSelfRef(fieldSpec) ? Object : fieldSpec;
                    result[name] = {
                        [op]: 'fold' as const,
                        [specSym]: { out: outType },
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        _: (obs: Record<string, any>) => obs[fieldName]
                    };
                }

                return result;
            });
        };
    }

    // ---- Attach observer-specific methods ----

    Object.defineProperty(ADT, 'explore', {
        value: function explore(
            seed: unknown,
            options?: ExploreOptions
        ): unknown[] {
            return computeExplore(
                ADT, seed, unfoldNames, selfFieldName, options
            );
        },
        writable: false,
        enumerable: false,
        configurable: true
    });

    (ADT as unknown as Record<symbol, boolean>)[LapisTypeSymbol] = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ADT as any;
}

// ---- Unfold detection -------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUnfoldDef(value: any): boolean {
    // Unfold defs are created by ops.mts unfold() which sets [op]: 'unfold'.
    return value != null && typeof value === 'object' && value[op] === 'unfold';
}

// ---- Explore / Coinductive Exploration --------------------------------------

/**
 * Coinductive exploration — the dual of closure (relation's least fixpoint).
 *
 * Given a seed, unfolds it into an initial behavior instance, then lazily
 * steps through the Self continuation, collecting results where `accept`
 * holds, stopping when `done` holds or limits are reached.
 *
 * `output`, `done`, and `accept` are proper fold operations on the behavior
 * type, installed as parameterless getters. The explore loop simply reads
 * `current.output`, `current.done`, `current.accept` on each instance.
 *
 * The exploration strategy is the dual of semi-naive Datalog evaluation:
 *   - Datalog: bottom-up, compose facts until fixpoint (no new facts)
 *   - Explore: top-down, step through observations until done (no more states)
 *
 * Corresponds to Prolog's SLD resolution with depth limit:
 *   - Unfold = goal expansion (resolve the current goal)
 *   - Self   = continuation (next goal to resolve)
 *   - done   = cut / termination (or `maxResults: 1` for Prolog `!`)
 *   - accept = success / solution
 *   - output = answer extraction
 *
 * **Rescue as backtracking:**
 * When stepping to the next state throws (e.g. a demand failure on the unfold),
 * the behavior's rescue handler — if defined — provides an alternative
 * continuation (backtrack to next branch).  If no rescue is defined and stepping
 * throws, explore treats the branch as exhausted and stops.  This maps directly
 * to Prolog backtracking: demand failure → try next alternative (rescue/retry),
 * or fail the branch.
 *
 * **Tabling / cycle detection (always-on):**
 * Explore always tracks visited output values (via `JSON.stringify(current.output)`).
 * Re-visiting a state with the same output terminates the branch — analogous to
 * Datalog tabling that prevents re-derivation of known facts, and dual to
 * `closure()`'s always-on endpoint-pair deduplication.
 */
function computeExplore(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ADT: any,
    seed: unknown,
    unfoldNames: string[],
    selfFieldName: string | null,
    options?: ExploreOptions
): unknown[] {
    const maxSteps = options?.maxSteps ?? 10_000;
    const maxResults = options?.maxResults ?? Infinity;
    // ---- Determine the unfold to use ----
    const unfoldName = options?.unfold ?? unfoldNames[0];
    if (!unfoldName)
        throw new Error('observer().explore() requires at least one unfold operation in the spec');

    const unfoldOp = ADT[unfoldName];
    if (typeof unfoldOp !== 'function')
        throw new Error(`observer().explore(): unfold '${unfoldName}' is not available on the behavior`);

    // ---- Unfold seed into initial instance ----
    let current: Record<string, unknown>;
    try {
        current = unfoldOp(seed);
    } catch {
        // Initial unfold failed (e.g. demands rejection) — no results.
        return [];
    }

    const results: unknown[] = [];
    let steps = 0;

    // ---- Tabling: track visited output values (always-on, like closure dedup) ----
    // Use identity-based tracking for objects (WeakSet) and value-based for primitives (Set).
    // This avoids JSON.stringify failures on circular references, functions, or
    // non-serializable values.
    const seenObjects = new WeakSet<object>();
    const seenPrimitives = new Set<unknown>();

    /** Returns true if the output value has already been visited. */
    function alreadySeen(value: unknown): boolean {
        if (value !== null && typeof value === 'object') {
            if (seenObjects.has(value)) return true;
            seenObjects.add(value);
            return false;
        }
        if (seenPrimitives.has(value)) return true;
        seenPrimitives.add(value);
        return false;
    }

    // ---- Step through the observation space ----
    // output/done/accept are parameterless fold operations (getters) on each instance.
    while (steps < maxSteps && results.length < maxResults) {
        steps++;

        // Tabling: auto-derived from [output] projection (dual of closure endpoint-pair dedup)
        if (alreadySeen(current.output)) break; // Cycle detected — treat as exhausted

        // Check accept BEFORE done, so we can collect the final state
        if (current.accept)
            results.push(current.output);

        // Check termination
        if (current.done)
            break;

        // Step to next state via Self continuation
        if (!selfFieldName) break; // No continuation: single observation

        // Rescue-resilient stepping: if stepping throws (e.g. demand failure
        // on the next unfold step), treat the branch as exhausted.
        // The behavior's own rescue handler, if defined, will have already
        // attempted recovery before the error propagates here.
        let next: unknown;
        try {
            next = current[selfFieldName];
        } catch {
            // Stepping failed — branch exhausted (Prolog: backtrack / fail).
            break;
        }

        if (next == null) break; // Exhausted

        current = next as Record<string, unknown>;
    }

    return results;
}
