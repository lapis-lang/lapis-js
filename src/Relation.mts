/**
 * Relation — Allegory operations on data types with relational structure.
 *
 * A relation R : A ↔ B is a span:   A ←origin— R —destination→ B
 *
 * `relation()` is derived from `data()`. It builds an initial algebra (ADT)
 * enriched with relational structure: two distinguished fold operations
 * (`origin` and `destination`) that project each instance to its endpoints,
 * plus allegory operations that only make sense on types with that structure:
 *
 *   - closure()   — transitive closure R⁺ = μX. R ∪ (R;X)
 *   - reachableFrom() — relational image  R(S) = {b | ∃a∈S. (a,b)∈R}
 *   - reachingTo()    — relational preimage R°(T) = {a | ∃b∈T. (a,b)∈R}
 *   - (future)    — converse R°, compose R;S, intersect R∩S
 *
 * The join invariant on recursive constructors — "hop.destination === rest.origin"
 * — is the *definition* of relational composition (;) in an allegory.
 * `relation()` generates it automatically from the endpoint projections.
 *
 * @module
 */

import { data, invariant } from './Data.mjs';
import { op, spec as specSym, isOperationDef, isFamilyRefSpec } from './operations.mjs';
import type { DataDeclParams } from './types.mjs';

// ---- Symbols ----------------------------------------------------------------

/** Symbol key for declaring the origin endpoint projection in a relation. */
export const origin: unique symbol = Symbol('origin');
export type origin = typeof origin;

/** Symbol key for declaring the destination endpoint projection in a relation. */
export const destination: unique symbol = Symbol('destination');
export type destination = typeof destination;

// ---- Types ------------------------------------------------------------------

interface RecursiveVariantInfo {
    name: string;
    familyFields: string[];
    nonFamilyFields: string[];
}

interface VariantClassification {
    leafVariants: string[];
    recursiveVariants: RecursiveVariantInfo[];
}

// ---- relation() -------------------------------------------------------------

/**
 * Define a relation — a data type with relational structure (endpoints + closure).
 *
 * Special keys in the declaration:
 *
 * - `[origin]`      — `fold({ out: DomainType })({ ... })` extracting the origin endpoint
 * - `[destination]` — `fold({ out: CodomainType })({ ... })` extracting the destination endpoint
 *
 * The `out` type in each fold spec serves as the domain/codomain type
 * (replacing the former separate `domain`/`codomain` keys).
 *
 * All other PascalCase keys are variants (same as `data()`).
 * All other camelCase keys with `fold`/`map`/`merge`/`unfold` are operations (same as `data()`).
 *
 * Recursive constructors (those with ≥ 2 Family fields) automatically receive a
 * join invariant: `firstFamilyField.destination === lastFamilyField.origin`.
 * This is the definition of relational composition in the allegory.
 *
 * The returned ADT has all standard `data()` operations plus:
 * - `.closure(baseFacts, options?)` — compute the transitive closure (least fixpoint)
 * - `.reachableFrom(facts, domainValues)`   — relational image: destinations reachable from domain values
 * - `.reachingTo(facts, codomainValues)` — relational preimage: origins that reach codomain values
 *
 * @example
 * ```typescript
 * const Ancestor = relation(({ Family }) => ({
 *     Direct: { from: String, to: String },
 *     Transitive: { hop: Family, rest: Family },
 *
 *     [origin]: fold({ out: String })({
 *         Direct: ({ from }) => from,
 *         Transitive: ({ hop }) => hop
 *     }),
 *     [destination]: fold({ out: String })({
 *         Direct: ({ to }) => to,
 *         Transitive: ({ rest }) => rest
 *     }),
 *
 *     depth: fold({ out: Number })({
 *         Direct: () => 1,
 *         Transitive: ({ hop, rest }) => hop + rest
 *     })
 * }));
 *
 * const closed = Ancestor.closure(baseFacts);
 * ```
 */
export function relation<D extends Record<string, unknown>>(
    declFn: (params: DataDeclParams) => D
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
    // Pre-computed variant classification, populated during data() creation.
    let classification: VariantClassification | null = null;

    // Wrap the user's declaration function: extract relation-specific keys,
    // generate the join invariant, then hand the rest to data().
    const ADT = data((params: DataDeclParams) => {
        const rawSpec = declFn(params);

        // ---- Extract and validate origin / destination fold defs ----
        const originDef = (rawSpec as Record<symbol, unknown>)[origin] as Record<string | symbol, unknown> | undefined;
        const destinationDef = (rawSpec as Record<symbol, unknown>)[destination] as Record<string | symbol, unknown> | undefined;

        if (!originDef || typeof originDef !== 'object' || originDef[op] !== 'fold')
            throw new Error("relation() requires [origin] to be a fold operation, e.g. [origin]: fold({ out: String })({ ... })");
        if (!destinationDef || typeof destinationDef !== 'object' || destinationDef[op] !== 'fold')
            throw new Error("relation() requires [destination] to be a fold operation, e.g. [destination]: fold({ out: String })({ ... })");

        // Extract domain/codomain from the fold specs
        const originSpec = originDef[specSym] as Record<string, unknown> | undefined;
        const destSpec = destinationDef[specSym] as Record<string, unknown> | undefined;
        if (!originSpec || !originSpec['out'])
            throw new Error("relation() origin fold must have an 'out' type, e.g. fold({ out: String })");
        if (!destSpec || !destSpec['out'])
            throw new Error("relation() destination fold must have an 'out' type, e.g. fold({ out: String })");

        // ---- Classify keys ----
        const RESERVED = new Set(['closure', 'reachableFrom', 'reachingTo', 'origin', 'destination']);
        const transformed: Record<string | symbol, unknown> = {};
        const leafVariants: string[] = [];
        const recursiveVariants: RecursiveVariantInfo[] = [];

        for (const [key, value] of Object.entries(rawSpec)) {
            if (RESERVED.has(key)) {
                throw new Error(
                    `relation(): '${key}' is a reserved auto-generated operation and cannot be redefined`
                );
            }

            // Pass through operations (fold, map, merge, unfold)
            if (isOperationDef(key, value)) {
                transformed[key] = value;
                continue;
            }

            // Pass through non-object entries (e.g. [extend], symbols)
            if (typeof value !== 'object' || value === null) {
                transformed[key] = value;
                continue;
            }

            // ---- It's a variant spec ----
            const fieldSpec = value as Record<string, unknown>;
            const fieldNames = Object.keys(fieldSpec).filter(
                f => f !== String(invariant) && f !== 'invariant'
            );
            const familyFields = fieldNames.filter(f => isFamilyRefSpec(fieldSpec[f]));
            const nonFamilyFields = fieldNames.filter(f => !isFamilyRefSpec(fieldSpec[f]));

            if (familyFields.length === 0) {
                // Leaf constructor — no Self references
                leafVariants.push(key);
                transformed[key] = value;
            } else if (familyFields.length >= 2) {
                // Recursive constructor with ≥ 2 Family fields →
                // auto-generate join invariant (relational composition)

                recursiveVariants.push({ name: key, familyFields, nonFamilyFields });

                // Build a new variant spec with the auto-generated invariant.
                // Preserve any existing non-invariant entries.
                const augmented: Record<string | symbol, unknown> = {};
                for (const fk of Reflect.ownKeys(fieldSpec))
                    augmented[fk] = fieldSpec[fk as string];

                // Enforce the join condition on every adjacent pair of Family fields:
                // fields[0].destination === fields[1].origin &&
                // fields[1].destination === fields[2].origin && ...
                const userInvariant = augmented[invariant] as ((inst: object) => boolean) | undefined;
                const joinInvariant = (inst: Record<string, Record<string, unknown>>) => {
                    for (let i = 0; i < familyFields.length - 1; i++) {
                        if (inst[familyFields[i]].destination !== inst[familyFields[i + 1]].origin)
                            return false;
                    }
                    return true;
                };
                augmented[invariant] = userInvariant
                    ? (inst: object) => userInvariant(inst) && joinInvariant(inst as Record<string, Record<string, unknown>>)
                    : joinInvariant;

                transformed[key] = augmented;
            } else {
                // Single Family field — still recursive but not composition.
                // No auto-invariant; pass through as-is.
                recursiveVariants.push({ name: key, familyFields, nonFamilyFields });
                transformed[key] = value;
            }
        }

        // ---- Pass through origin / destination fold defs as-is ----
        transformed['origin'] = originDef;
        transformed['destination'] = destinationDef;

        // Store classification for closure computation
        classification = { leafVariants, recursiveVariants };

        return transformed as Record<string, unknown>;
    });

    // ---- Attach relation-specific methods ----

    Object.defineProperty(ADT, 'closure', {
        value: function closure(
            baseFacts: readonly unknown[],
            options?: {
                key?: (instance: unknown) => string;
            }
        ): unknown[] {
            if (!Array.isArray(baseFacts))
                throw new TypeError('closure(): baseFacts must be an array');
            for (let i = 0; i < baseFacts.length; i++) {
                if (!(baseFacts[i] instanceof ADT)) {
                    throw new TypeError(
                        `closure(): baseFacts[${i}] is not an instance of this relation`
                    );
                }
            }
            return computeClosure(ADT, classification!, baseFacts, options);
        },
        writable: false,
        enumerable: false,
        configurable: true
    });

    /**
     * Relational image: R(S) = {b | ∃a ∈ S, ∃r ∈ facts. origin(r) = a ∧ destination(r) = b}
     *
     * Given a set of relation instances (facts) and a set of domain values,
     * returns the deduplicated set of codomain values reachable from those domain values.
     */
    Object.defineProperty(ADT, 'reachableFrom', {
        value: function reachableFrom(
            facts: readonly unknown[],
            domainValues: readonly unknown[]
        ): unknown[] {
            if (!Array.isArray(facts))
                throw new TypeError('reachableFrom(): facts must be an array');
            for (let i = 0; i < facts.length; i++) {
                if (!(facts[i] instanceof ADT)) {
                    throw new TypeError(
                        `reachableFrom(): facts[${i}] is not an instance of this relation`
                    );
                }
            }
            const domainSet = new Set(domainValues);
            const seen = new Set<unknown>();
            const result: unknown[] = [];
            for (const fact of facts) {
                const o = (fact as Record<string, unknown>).origin;
                if (domainSet.has(o)) {
                    const d = (fact as Record<string, unknown>).destination;
                    if (!seen.has(d)) {
                        seen.add(d);
                        result.push(d);
                    }
                }
            }
            return result;
        },
        writable: false,
        enumerable: false,
        configurable: true
    });

    /**
     * Relational preimage: R°(T) = {a | ∃b ∈ T, ∃r ∈ facts. destination(r) = b ∧ origin(r) = a}
     *
     * Given a set of relation instances (facts) and a set of codomain values,
     * returns the deduplicated set of domain values that reach those codomain values.
     */
    Object.defineProperty(ADT, 'reachingTo', {
        value: function reachingTo(
            facts: readonly unknown[],
            codomainValues: readonly unknown[]
        ): unknown[] {
            if (!Array.isArray(facts))
                throw new TypeError('reachingTo(): facts must be an array');
            for (let i = 0; i < facts.length; i++) {
                if (!(facts[i] instanceof ADT)) {
                    throw new TypeError(
                        `reachingTo(): facts[${i}] is not an instance of this relation`
                    );
                }
            }
            const codomainSet = new Set(codomainValues);
            const seen = new Set<unknown>();
            const result: unknown[] = [];
            for (const fact of facts) {
                const d = (fact as Record<string, unknown>).destination;
                if (codomainSet.has(d)) {
                    const o = (fact as Record<string, unknown>).origin;
                    if (!seen.has(o)) {
                        seen.add(o);
                        result.push(o);
                    }
                }
            }
            return result;
        },
        writable: false,
        enumerable: false,
        configurable: true
    });

    return ADT;
}

// ---- Closure / Fixpoint Iteration -------------------------------------------

/**
 * Compute the least-fixpoint closure of a relation given base facts.
 *
 * Corresponds to Datalog bottom-up evaluation:
 * - Base facts = leaf constructors (no Family fields)
 * - Derived facts = recursive constructors composed from existing facts
 * - Join conditions = auto-generated invariant on recursive constructors
 * - Fixpoint = no new facts derived in a Kleene iteration step
 *
 * Semi-naive optimisation: each iteration only attempts compositions
 * involving facts from the previous delta.
 *
 * **Why endpoint-pair dedup is the default (no `maxIterations`/`maxFacts`):**
 *
 * Datalog engines operate on flat tuples:  `ancestor(alice, dave)` is stored
 * once regardless of the derivation path.  Set membership is defined by value
 * equality on the tuple fields, so dedup is inherent in the data model and the
 * number of facts is bounded by |domain| × |codomain| — always finite.
 *
 * Lapis stores full proof trees — a `Path({ first, second })` retains the
 * nested chain of how the pair was composed.  Two paths with the same endpoints
 * but different intermediate hops are *structurally distinct* ADT instances.
 * Without endpoint-pair dedup, the number of distinct proof trees is
 * exponential in the graph diameter (e.g. a complete graph on n nodes has n!
 * Hamiltonian paths alone).
 *
 * Defaulting `key` to `e => \`${e.origin}\\0${e.destination}\`` collapses the
 * proof tree back to the flat tuple — exactly what Datalog does natively.
 * This makes `closure()` guaranteed to terminate with at most |D|×|C| facts,
 * eliminating the need for `maxIterations` or `maxFacts` safety limits.
 *
 * Users who want all distinct proof trees (path enumeration) should use
 * `observer()` instead — it explores lazily top-down without materialising
 * every derivation.
 */
function computeClosure(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ADT: any,
    classification: VariantClassification,
    baseFacts: readonly unknown[],
    options?: {
        key?: (instance: unknown) => string;
    }
): unknown[] {
    const keyFn = options?.key
        ?? ((e: unknown) => {
            const o = (e as Record<string, unknown>).origin;
            const d = (e as Record<string, unknown>).destination;
            if (o !== null && o !== undefined && typeof o === 'object' || typeof o === 'function' || typeof o === 'symbol')
                throw new TypeError('closure(): default key cannot safely deduplicate non-primitive origin values — provide options.key');
            if (d !== null && d !== undefined && typeof d === 'object' || typeof d === 'function' || typeof d === 'symbol')
                throw new TypeError('closure(): default key cannot safely deduplicate non-primitive destination values — provide options.key');
            return `${typeof o}:${String(o)}\0${typeof d}:${String(d)}`;
        });

    // Build constructor references from the public ADT API
    const recursiveCtors = classification.recursiveVariants.map(rv => ({
        ...rv,
        ctor: ADT[rv.name] as (...args: unknown[]) => unknown
    }));

    // ---- Deduplication ----
    const allFacts: unknown[] = [];
    const seen = new Set<string>();

    function isDuplicate(fact: unknown): boolean {
        const k = keyFn(fact);
        if (seen.has(k)) return true;
        seen.add(k);
        return false;
    }

    // Seed with base facts
    for (const fact of baseFacts) {
        if (!isDuplicate(fact))
            allFacts.push(fact);
    }

    // ---- Semi-naive Kleene iteration ----
    let delta = [...allFacts];

    while (delta.length > 0) {
        const newFacts: unknown[] = [];

        for (const rule of recursiveCtors) {
            const combos = enumerateCombinations(rule.familyFields, allFacts, delta);

            for (const familyBinding of combos) {
                const fields: Record<string, unknown> = {};
                for (const [fld, val] of familyBinding.entries())
                    fields[fld] = val;

                if (rule.nonFamilyFields.length === 0) {
                    // Pure recursive: only Family fields (common case)
                    tryConstruct(rule.ctor, fields, newFacts);
                } else {
                    // Has non-family fields — enumerate from allFacts
                    const nfCombos = enumerateNonFamilyCombinations(
                        rule.nonFamilyFields, allFacts
                    );
                    for (const nfBinding of nfCombos) {
                        const fullFields = { ...fields };
                        for (const [fld, val] of nfBinding.entries())
                            fullFields[fld] = val;
                        tryConstruct(rule.ctor, fullFields, newFacts);
                    }
                }
            }
        }

        // Deduplicate new facts and check for fixpoint
        delta = [];
        for (const fact of newFacts) {
            if (!isDuplicate(fact)) {
                allFacts.push(fact);
                delta.push(fact);
            }
        }
    }

    return allFacts;
}

// ---- Closure helpers --------------------------------------------------------

/**
 * Attempt to construct an instance; if the invariant rejects it, silently skip.
 */
function tryConstruct(
    ctor: (...args: unknown[]) => unknown,
    fields: Record<string, unknown>,
    results: unknown[]
): void {
    try {
        results.push(ctor(fields));
    } catch (e) {
        // Invariant violation or type error → skip this combination
        if (e instanceof TypeError) return;
        throw e;
    }
}

/**
 * Enumerate all ways to bind `familyFields` to facts from `allFacts`,
 * such that at least one binding uses a fact from `delta` (semi-naive).
 */
function enumerateCombinations(
    familyFields: string[],
    allFacts: readonly unknown[],
    delta: readonly unknown[]
): Array<Map<string, unknown>> {
    if (familyFields.length === 0) return [new Map()];

    const allCombos: Array<Map<string, unknown>> = [],
        deltaSet = new Set(delta);

    function helper(
        idx: number, current: Map<string, unknown>, usedDelta: boolean
    ): void {
        if (idx === familyFields.length) {
            if (usedDelta)
                allCombos.push(new Map(current));
            return;
        }
        const field = familyFields[idx];
        for (const fact of allFacts) {
            current.set(field, fact);
            helper(idx + 1, current, usedDelta || deltaSet.has(fact));
            current.delete(field);
        }
    }

    helper(0, new Map(), false);
    return allCombos;
}

/**
 * Enumerate bindings for non-family fields from allFacts.
 */
function enumerateNonFamilyCombinations(
    nonFamilyFields: string[],
    allFacts: readonly unknown[]
): Array<Map<string, unknown>> {
    const combos: Array<Map<string, unknown>> = [];

    function helper(idx: number, current: Map<string, unknown>): void {
        if (idx === nonFamilyFields.length) {
            combos.push(new Map(current));
            return;
        }
        const field = nonFamilyFields[idx];
        for (const fact of allFacts) {
            current.set(field, fact);
            helper(idx + 1, current);
            current.delete(field);
        }
    }

    if (allFacts.length > 0)
        helper(0, new Map());
    return combos;
}
