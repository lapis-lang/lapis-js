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
import { isOperationDef, isSelfRef, op, spec as specSym, LapisTypeSymbol } from './operations.mjs';
import type { BehaviorDeclParams } from './types.mjs';

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
export function observer<D extends Record<string, unknown>>(
    declFn: (params: BehaviorDeclParams) => D
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
    // Stored cospan metadata, populated during behavior() creation.
    let unfoldNames: string[] = [];
    let selfFieldName: string | null = null;

    // Wrap the user's declaration: validate cospan fold defs, hand everything to behavior().
    const ADT = behavior((params: BehaviorDeclParams) => {
        const rawSpec = declFn(params);

        // ---- Resolve cospan field references ----
        // Each cospan key is a symbol that maps to a string naming an observer field.
        // The framework auto-generates the corresponding fold projection.
        const COSPAN_KEYS = [
            { sym: output, name: 'output' },
            { sym: done,   name: 'done' },
            { sym: accept, name: 'accept' }
        ] as const;
        const resolvedCospan: Record<string, unknown> = {};

        for (const { sym, name } of COSPAN_KEYS) {
            const def = (rawSpec as Record<symbol, unknown>)[sym];

            if (typeof def !== 'string') {
                throw new Error(
                    `observer() requires [${name}] to be a string field reference, ` +
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

            // Derive the out type from the referenced field's type spec.
            // For a Self ref, out is the behavior itself (not meaningful for done/accept).
            // For a plain type spec (e.g. Array, Boolean), use it directly.
            const outType = isSelfRef(fieldSpec) ? Object : fieldSpec;

            // Build the fold def: { [op]: 'fold', [specSym]: { out }, _: handler }
            resolvedCospan[name] = {
                [op]: 'fold' as const,
                [specSym]: { out: outType },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                _: (obs: Record<string, any>) => obs[fieldName]
            };
        }

        // ---- Classify and pass through ----
        const RESERVED = new Set(['explore']);
        const transformed: Record<string | symbol, unknown> = {};

        unfoldNames = [];
        selfFieldName = null;

        for (const [key, value] of Object.entries(rawSpec)) {
            if (RESERVED.has(key)) {
                throw new Error(
                    `observer(): '${key}' is a reserved auto-generated operation and cannot be redefined`
                );
            }

            // Detect Self continuation
            if (isSelfRef(value)) {
                selfFieldName = key;
                transformed[key] = value;
                continue;
            }

            // Track unfold operations
            if (isOperationDef(key, value)) {
                transformed[key] = value;

                // Detect unfold ops (they have a generator-like structure)
                if (isUnfoldDef(value))
                    unfoldNames.push(key);

                continue;
            }

            // Standard observer field
            transformed[key] = value;
        }

        // Pass through symbol-keyed entries (e.g. [extend]),
        // but skip the cospan symbols — they've been resolved into fold defs.
        const COSPAN_SYMS = new Set<symbol>([output, done, accept]);
        for (const sym of Object.getOwnPropertySymbols(rawSpec)) {
            if (!COSPAN_SYMS.has(sym))
                transformed[sym] = (rawSpec as Record<symbol, unknown>)[sym];
        }

        // Install resolved cospan fold defs (keyed by string for behavior())
        for (const { name } of COSPAN_KEYS)
            transformed[name] = resolvedCospan[name];


        return transformed as Record<string, unknown>;
    });

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
    return ADT;
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
