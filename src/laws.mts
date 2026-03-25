/**
 * Algebraic law generation and enforcement.
 *
 * At `.ops()` call time this module:
 *   1. Generates representative ADT instances from the declared variant constructors.
 *   2. For each registered operation that carries `properties`, checks every
 *      applicable law against the generated samples.
 *   3. Throws {@link LawError} on the first counterexample found.
 *
 * Intra-operation laws (associative, commutative, etc.) are checked via plain
 * string property names. Inter-operation laws are checked via namespaced strings
 * (`'identity:Identity'`, `'absorbing:Zero'`, etc.) or named predicate functions.
 *
 * @module laws
 */

import { isFamilyRefSpec } from './operations.mjs';
import type { Transformer } from './DataOps.mjs';
import type { PropertyEntry, PredicateFn } from './operations.mjs';
import { structuralEquals } from './utils.mjs';
import { DemandsError } from './contracts.mjs';

// ---- Error type -------------------------------------------------------------

/**
 * Thrown at `.ops()` call time when an automatically generated counterexample
 * falsifies a declared algebraic law.
 *
 * The error is thrown synchronously — before `.ops()` returns — so a violating
 * declaration never silently enters the module graph.
 */
export class LawError extends Error {
    override name = 'LawError';

    constructor(
        /** The operation whose law was violated. */
        public readonly opName: string,
        /** The property name that was falsified (e.g. `'associative'`). */
        public readonly propertyName: string,
        /** The tuple of sample values that witness the violation. */
        public readonly counterexample: unknown[],
        context: string
    ) {
        super(
            `Law '${propertyName}' violated for operation '${opName}' on ${context}.\n` +
            `  Counterexample: [${counterexample.map(safeFormat).join(', ')}]`
        );
    }
}

function safeFormat(v: unknown): string {
    try { const s = JSON.stringify(v); return s !== undefined ? s : String(v); } catch { return String(v); }
}

// ---- Operation type classification ------------------------------------------

/** True iff the transformer is a binary fold returning another Family instance. */
function isBinaryFoldOp(t: Transformer): boolean {
    return (
        !!t.getCtorTransform &&
        !!t.inSpec &&
        isFamilyRefSpec(t.inSpec) &&
        isFamilyRefSpec(t.outSpec)
    );
}

/** True iff the transformer is a binary fold returning Boolean (a relation/predicate). */
function isBinaryPredicateOp(t: Transformer): boolean {
    return (
        !!t.getCtorTransform &&
        !!t.inSpec &&
        isFamilyRefSpec(t.inSpec) &&
        t.outSpec === Boolean
    );
}

/** True iff the transformer is a zero-argument (getter) fold. */
function isUnaryFoldOp(t: Transformer): boolean {
    return !!t.getCtorTransform && !t.inSpec && !t.getParamTransform;
}

/**
 * True iff the transformer is a getter-map (no extra params, no fold ctor).
 * Mirrors `isMapTransformer && isGetterOp` from Data.mts, but derived from the
 * transformer and the prototype chain rather than closure-private helpers.
 */
function isGetterMapOp(t: Transformer, adt: unknown, opName: string): boolean {
    // Must be a map transformer (no fold ctor, no unfold generator)
    if (t.getCtorTransform || t.generator) return false;
    if (!t.getParamTransform && !t.getAtomTransform) return false;
    // Must be installed as a getter (no extra-params method form)
    let proto: object | null = (adt as { prototype?: object }).prototype ?? null;
    while (proto) {
        const desc = Object.getOwnPropertyDescriptor(proto, opName);
        if (desc) return 'get' in desc;
        proto = Object.getPrototypeOf(proto) as object | null;
    }
    return false;
}

// ---- Sample generation ------------------------------------------------------

/** Default value sets for primitive-boxing constructors, used for field generation. */
const PRIMITIVE_DEFAULTS = new Map<unknown, unknown[]>([
    [Number,  [0, 1, 2]],
    [String,  ['', 'a', 'b']],
    [Boolean, [true, false]],
    [BigInt,  [0n, 1n]]
]);

/** Minimal type for a record-variant constructor stored in the ADT variants map. */
type VariantCtor = { spec?: Record<string, unknown> } & ((...args: unknown[]) => unknown);

/**
 * Generate a small set of representative ADT instances from the variants map.
 *
 * **Phase 1 — leaf samples:**
 * - Singleton variants (frozen objects): added directly.
 * - Record variants whose every field is a primitive type: instantiated with
 *   up to two different value sets drawn from {@link PRIMITIVE_DEFAULTS}.
 * - Record variants with type-parameter fields or other unresolvable types
 *   are **skipped** — no automatic values can be produced.
 *
 * **Phase 2 — shallow recursive samples:**
 * - Record variants that have at least one `Family`-ref field: instantiated
 *   once, using the first leaf sample for Family fields and `PRIMITIVE_DEFAULTS[0]`
 *   for primitive fields.
 */
export function generateSamples(variants: Record<string, unknown>): unknown[] {
    const leafSamples: unknown[] = [];
    const nonFamilyCtors: Array<{ ctor: VariantCtor; spec: Record<string, unknown> }> = [];
    const familyCtors:    Array<{ ctor: VariantCtor; spec: Record<string, unknown> }> = [];

    for (const variant of Object.values(variants)) {
        if (variant !== null && typeof variant === 'object') {
            // Frozen singleton — the value IS the sole instance
            leafSamples.push(variant);
        } else if (typeof variant === 'function') {
            const ctor = variant as VariantCtor;
            const fieldSpec = ctor.spec;
            if (!fieldSpec || Object.keys(fieldSpec).length === 0) continue;

            const hasUnknownField = Object.values(fieldSpec).some(
                t => !isFamilyRefSpec(t) && !PRIMITIVE_DEFAULTS.has(t)
            );
            if (hasUnknownField) continue; // can't generate values for unknown types

            const hasFamilyField = Object.values(fieldSpec).some(t => isFamilyRefSpec(t));
            if (hasFamilyField)
                familyCtors.push({ ctor, spec: fieldSpec });
            else
                nonFamilyCtors.push({ ctor, spec: fieldSpec });

        }
    }

    // Generate up to 3 samples per primitive-only record variant
    for (const { ctor, spec } of nonFamilyCtors) {
        const fields = Object.keys(spec);
        const maxI = fields.length === 0 ? 0 : Math.max(...fields.map(f => (PRIMITIVE_DEFAULTS.get(spec[f]) ?? []).length));
        for (let i = 0; i < maxI; i++) {
            const fieldValues: Record<string, unknown> = {};
            let canGenerate = true;
            for (const field of fields) {
                const defaults = PRIMITIVE_DEFAULTS.get(spec[field]);
                if (!defaults || i >= defaults.length) { canGenerate = false; break; }
                fieldValues[field] = defaults[i];
            }
            if (!canGenerate) break;
            try { leafSamples.push(ctor(fieldValues)); } catch { /* invariant viol. — skip */ }
        }
    }

    // Generate one shallow recursive sample per Family-field record variant
    if (leafSamples.length > 0) {
        for (const { ctor, spec } of familyCtors) {
            const fields = Object.keys(spec);
            const fieldValues: Record<string, unknown> = {};
            let canGenerate = true;
            for (const field of fields) {
                const t = spec[field];
                if (isFamilyRefSpec(t))
                    fieldValues[field] = leafSamples[0];
                else {
                    const defaults = PRIMITIVE_DEFAULTS.get(t);
                    if (!defaults || defaults.length === 0) { canGenerate = false; break; }
                    fieldValues[field] = defaults[0];
                }
            }
            if (canGenerate)
                try { leafSamples.push(ctor(fieldValues)); } catch { /* invariant viol. — skip */ }

        }
    }

    return leafSamples;
}

// ---- Operation invocation helpers -------------------------------------------

/**
 * Call a binary operation preserving `this` binding: `a.opName(b)`.
 * The property is accessed and called in one expression so that the JS engine
 * sets `this = a` (same as `a.method(b)` — not equivalent to `const f = a.method; f(b)`).
 */
function callBinary(a: unknown, opName: string, b: unknown): unknown {
    return (a as Record<string, (arg: unknown) => unknown>)[opName](b);
}

/**
 * Access a unary getter operation: `a.opName`.
 * Getter properties invoke their `get` function with `this = a` on property access.
 */
function callUnary(a: unknown, opName: string): unknown {
    return (a as Record<string, unknown>)[opName];
}

/** Sentinel returned by {@link tryOp} when a {@link DemandsError} is thrown. */
const SKIPPED: unique symbol = Symbol('skipped');

/**
 * Invoke `fn()` and return its result.
 * - Returns {@link SKIPPED} when a {@link DemandsError} is thrown — the input
 *   tuple is outside the operation's precondition domain and should be skipped.
 * - Re-throws any other error so implementation bugs (TDZ `ReferenceError`,
 *   missing handlers, etc.) are never silently swallowed.
 */
function tryOp(fn: () => unknown): unknown {
    try { return fn(); } catch (e) {
        if (e instanceof DemandsError) return SKIPPED;
        throw e;
    }
}

// ---- Law checking -----------------------------------------------------------

function warnNoSamples(prop: string, opName: string): void {
    console.warn(`[lapis] Law '${prop}' on '${opName}': no valid sample tuples found — skipping check`);
}

// ---- Companion-element lookup -----------------------------------------------

/**
 * Resolve a companion element (identity, absorbing zero, etc.) from the ADT.
 *
 * - If `adt[name]` is a callable (zero-argument unfold constructor), it is
 *   invoked to obtain the element instance.
 * - If `adt[name]` is already a frozen object (singleton), it is used directly.
 * - If the name is not found, a `TypeError` is thrown — a missing companion is
 *   a declaration error (analogous to an unknown property name).
 *
 * Exported so that `optimizations.mts` can reuse the same lookup logic for
 * runtime guards without duplicating the resolution rules.
 */
export function getCompanionElement(adt: unknown, name: string): unknown {
    const value = (adt as Record<string, unknown>)[name];
    if (value === undefined) {
        throw new TypeError(
            `[lapis] Inter-op law: companion '${name}' not found on ADT`
        );
    }
    // Unfold constructors are callable; call with no args to produce the element.
    if (typeof value === 'function') {
        try { return (value as () => unknown)(); } catch (cause) {
            throw new TypeError(
                `[lapis] Inter-op law: calling companion '${name}()' threw`,
                { cause }
            );
        }
    }
    return value;
}

/**
 * Check all algebraic law constraints declared in `transformer.properties`
 * against the provided samples.
 *
 * Throws {@link LawError} on the first counterexample found.
 *
 * **Error-tolerant:** If a {@link DemandsError} (precondition not met) is thrown
 * for a particular operation call, that tuple is skipped — the input is outside
 * the operation's domain. All other errors are re-thrown so implementation bugs
 * (e.g. TDZ `ReferenceError`, missing handlers) are never silently swallowed.
 * If all tuples are skipped this way, a warning is emitted to `console.warn`.
 *
 * **Inter-operation laws** (namespaced strings and predicate functions) require
 * the `adt` parameter to resolve companion elements and execute predicates.
 *
 * @param opName      - Operation name (used in error messages).
 * @param transformer - Registered transformer; provides `properties` and type info.
 * @param samples     - Representative ADT instances to test against.
 * @param adt         - The ADT constructor; used for companion-element lookup.
 * @param context     - Human-readable ADT description for error messages.
 */
export function checkOperationLaws(
    opName: string,
    transformer: Transformer,
    samples: unknown[],
    adt: unknown,
    context: string
): void {
    const props = transformer.properties as ReadonlySet<PropertyEntry> | undefined;
    if (!props || props.size === 0) return;
    if (samples.length === 0) return;

    const binaryFold = isBinaryFoldOp(transformer);
    const predicate  = isBinaryPredicateOp(transformer);
    const unary      = isUnaryFoldOp(transformer);
    const getterMap  = isGetterMapOp(transformer, adt, opName);

    for (const prop of props) {

        // ── Predicate function law ────────────────────────────────────────────
        if (typeof prop === 'function') {
            const fn = prop as PredicateFn;
            let checked = 0;
            for (const sample of samples) {
                const result = tryOp(() => fn(sample, adt));
                if (result === SKIPPED) continue;
                checked++;
                if (result === false)
                    throw new LawError(opName, fn.name, [sample], context);
            }
            if (checked === 0) warnNoSamples(fn.name, opName);
            continue;
        }

        // ── Namespaced inter-op string ────────────────────────────────────────
        if (typeof prop === 'string' && prop.includes(':')) {
            const parts = prop.split(':');
            const prefix = parts[0];

            switch (prefix) {

                case 'identity': {
                    if (!binaryFold) break;
                    const e = getCompanionElement(adt, parts[1]);
                    let checked = 0;
                    for (const a of samples) {
                        const ae = tryOp(() => callBinary(a, opName, e));
                        if (ae === SKIPPED) continue;
                        const ea = tryOp(() => callBinary(e, opName, a));
                        if (ea === SKIPPED) continue;
                        checked++;
                        if (!structuralEquals(ae, a))
                            throw new LawError(opName, prop, [a, e], context);
                        if (!structuralEquals(ea, a))
                            throw new LawError(opName, prop, [e, a], context);
                    }
                    if (checked === 0) warnNoSamples(prop, opName);
                    break;
                }

                case 'absorbing': {
                    if (!binaryFold) break;
                    const z = getCompanionElement(adt, parts[1]);
                    let checked = 0;
                    for (const a of samples) {
                        const az = tryOp(() => callBinary(a, opName, z));
                        if (az === SKIPPED) continue;
                        const za = tryOp(() => callBinary(z, opName, a));
                        if (za === SKIPPED) continue;
                        checked++;
                        if (!structuralEquals(az, z))
                            throw new LawError(opName, prop, [a, z], context);
                        if (!structuralEquals(za, z))
                            throw new LawError(opName, prop, [z, a], context);
                    }
                    if (checked === 0) warnNoSamples(prop, opName);
                    break;
                }

                case 'distributive': {
                    // op distributes over `over`:
                    //   left:  op(a, over(b,c)) ≡ over(op(a,b), op(a,c))
                    //   right: op(over(a,b), c) ≡ over(op(a,c), op(b,c))
                    if (!binaryFold) break;
                    const over = parts[1];
                    if (samples.length > 0 &&
                        typeof (samples[0] as Record<string, unknown>)[over] !== 'function') {
                        throw new TypeError(
                            `[lapis] Inter-op law: companion operation '${over}' not found on ADT`
                        );
                    }
                    let checked = 0;
                    for (const a of samples) {
                        for (const b of samples) {
                            for (const c of samples) {
                                // Left distributivity
                                const bc  = tryOp(() => callBinary(b, over, c));
                                if (bc === SKIPPED) continue;
                                const lhs = tryOp(() => callBinary(a, opName, bc));
                                if (lhs === SKIPPED) continue;
                                const ab  = tryOp(() => callBinary(a, opName, b));
                                if (ab === SKIPPED) continue;
                                const ac  = tryOp(() => callBinary(a, opName, c));
                                if (ac === SKIPPED) continue;
                                const rhs = tryOp(() => callBinary(ab, over, ac));
                                if (rhs === SKIPPED) continue;
                                checked++;
                                if (!structuralEquals(lhs, rhs))
                                    throw new LawError(opName, prop, [a, b, c], context);
                                // Right distributivity
                                const ab2 = tryOp(() => callBinary(a, over, b));
                                if (ab2 === SKIPPED) continue;
                                const lhs2 = tryOp(() => callBinary(ab2, opName, c));
                                if (lhs2 === SKIPPED) continue;
                                const bc2  = tryOp(() => callBinary(b, opName, c));
                                if (bc2 === SKIPPED) continue;
                                const ac2  = tryOp(() => callBinary(a, opName, c));
                                if (ac2 === SKIPPED) continue;
                                const rhs2 = tryOp(() => callBinary(ac2, over, bc2));
                                if (rhs2 === SKIPPED) continue;
                                if (!structuralEquals(lhs2, rhs2))
                                    throw new LawError(opName, prop, [a, b, c], context);
                            }
                        }
                    }
                    if (checked === 0) warnNoSamples(prop, opName);
                    break;
                }

                case 'absorption': {
                    // Lattice: op(a, inner(a,b)) ≡ a  (and dual side checked on inner's spec)
                    if (!binaryFold) break;
                    const inner = parts[1];
                    if (samples.length > 0 &&
                        typeof (samples[0] as Record<string, unknown>)[inner] !== 'function') {
                        throw new TypeError(
                            `[lapis] Inter-op law: companion operation '${inner}' not found on ADT`
                        );
                    }
                    let checked = 0;
                    for (const a of samples) {
                        for (const b of samples) {
                            const ab  = tryOp(() => callBinary(a, inner, b));
                            if (ab === SKIPPED) continue;
                            const res = tryOp(() => callBinary(a, opName, ab));
                            if (res === SKIPPED) continue;
                            checked++;
                            if (!structuralEquals(res, a))
                                throw new LawError(opName, prop, [a, b], context);
                        }
                    }
                    if (checked === 0) warnNoSamples(prop, opName);
                    break;
                }

                case 'inverse': {
                    // via(a) . op . a ≡ element   (both sides)
                    if (!binaryFold) break;
                    const via = parts[1];
                    const e   = getCompanionElement(adt, parts[2]);
                    if (samples.length > 0 &&
                        (samples[0] as Record<string, unknown>)[via] === undefined) {
                        throw new TypeError(
                            `[lapis] Inter-op law: companion operation '${via}' not found on ADT`
                        );
                    }
                    let checked = 0;
                    for (const a of samples) {
                        const va = tryOp(() => callUnary(a, via));
                        if (va === SKIPPED) continue;
                        // via(a).op(a) ≡ e
                        const lhs = tryOp(() => callBinary(va, opName, a));
                        if (lhs === SKIPPED) continue;
                        // a.op(via(a)) ≡ e
                        const rhs = tryOp(() => callBinary(a, opName, va));
                        if (rhs === SKIPPED) continue;
                        checked++;
                        if (!structuralEquals(lhs, e))
                            throw new LawError(opName, prop, [a], context);
                        if (!structuralEquals(rhs, e))
                            throw new LawError(opName, prop, [a], context);
                    }
                    if (checked === 0) warnNoSamples(prop, opName);
                    break;
                }

                default:
                    break;
            }
            continue;
        }

        // ── Plain intra-op string ─────────────────────────────────────────────
        switch (prop) {

            // ── Binary fold laws ────────────────────────────────────────────

            case 'associative': {
                if (!binaryFold) break;
                let checked = 0;
                for (const a of samples) {
                    for (const b of samples) {
                        for (const c of samples) {
                            const ab = tryOp(() => callBinary(a, opName, b));
                            if (ab === SKIPPED) continue;
                            const bc = tryOp(() => callBinary(b, opName, c));
                            if (bc === SKIPPED) continue;
                            const abC = tryOp(() => callBinary(ab, opName, c));
                            if (abC === SKIPPED) continue;
                            const aBc = tryOp(() => callBinary(a, opName, bc));
                            if (aBc === SKIPPED) continue;
                            checked++;
                            if (!structuralEquals(abC, aBc))
                                throw new LawError(opName, 'associative', [a, b, c], context);
                        }
                    }
                }
                if (checked === 0) warnNoSamples(prop, opName);
                break;
            }

            case 'commutative': {
                if (!binaryFold) break;
                let checked = 0;
                for (const a of samples) {
                    for (const b of samples) {
                        const ab = tryOp(() => callBinary(a, opName, b));
                        if (ab === SKIPPED) continue;
                        const ba = tryOp(() => callBinary(b, opName, a));
                        if (ba === SKIPPED) continue;
                        checked++;
                        if (!structuralEquals(ab, ba))
                            throw new LawError(opName, 'commutative', [a, b], context);
                    }
                }
                if (checked === 0) warnNoSamples(prop, opName);
                break;
            }

            case 'idempotent': {
                if (!binaryFold) break;
                let checked = 0;
                for (const a of samples) {
                    const aa = tryOp(() => callBinary(a, opName, a));
                    if (aa === SKIPPED) continue;
                    checked++;
                    if (!structuralEquals(aa, a))
                        throw new LawError(opName, 'idempotent', [a], context);
                }
                if (checked === 0) warnNoSamples(prop, opName);
                break;
            }

            // ── Unary fold / getter-map laws ─────────────────────────────────

            case 'involutory': {
                if (!unary && !getterMap) break;
                let checked = 0;
                for (const a of samples) {
                    const b = tryOp(() => callUnary(a, opName));
                    if (b === SKIPPED) continue;
                    // Skip if result is not an ADT instance that also supports this operation
                    if (typeof b !== 'object' || b === null) continue;
                    if (!(opName in (b as object))) continue;
                    const bb = tryOp(() => callUnary(b, opName));
                    if (bb === SKIPPED) continue;
                    checked++;
                    if (!structuralEquals(bb, a))
                        throw new LawError(opName, 'involutory', [a], context);
                }
                if (checked === 0) warnNoSamples(prop, opName);
                break;
            }

            // ── Relation / predicate laws ───────────────────────────────────

            case 'reflexive': {
                if (!predicate) break;
                let checked = 0;
                for (const a of samples) {
                    const result = tryOp(() => callBinary(a, opName, a));
                    if (result === SKIPPED) continue;
                    checked++;
                    if (result !== true)
                        throw new LawError(opName, 'reflexive', [a], context);
                }
                if (checked === 0) warnNoSamples(prop, opName);
                break;
            }

            case 'symmetric': {
                if (!predicate) break;
                let checked = 0;
                for (const a of samples) {
                    for (const b of samples) {
                        const ab = tryOp(() => callBinary(a, opName, b));
                        if (ab === SKIPPED) continue;
                        const ba = tryOp(() => callBinary(b, opName, a));
                        if (ba === SKIPPED) continue;
                        checked++;
                        if (ab !== ba)
                            throw new LawError(opName, 'symmetric', [a, b], context);
                    }
                }
                if (checked === 0) warnNoSamples(prop, opName);
                break;
            }

            case 'antisymmetric': {
                if (!predicate) break;
                let checked = 0;
                for (const a of samples) {
                    for (const b of samples) {
                        const ab = tryOp(() => callBinary(a, opName, b));
                        if (ab === SKIPPED) continue;
                        const ba = tryOp(() => callBinary(b, opName, a));
                        if (ba === SKIPPED) continue;
                        checked++;
                        // antisymmetric: R(a,b) ∧ R(b,a) → a ≡ b
                        if (ab && ba && !structuralEquals(a, b))
                            throw new LawError(opName, 'antisymmetric', [a, b], context);
                    }
                }
                if (checked === 0) warnNoSamples(prop, opName);
                break;
            }

            case 'transitive': {
                if (!predicate) break;
                let checked = 0;
                for (const a of samples) {
                    for (const b of samples) {
                        for (const c of samples) {
                            const ab = tryOp(() => callBinary(a, opName, b));
                            if (ab === SKIPPED) continue;
                            const bc = tryOp(() => callBinary(b, opName, c));
                            if (bc === SKIPPED) continue;
                            if (!ab || !bc) { checked++; continue; } // premise false → law holds vacuously
                            const ac = tryOp(() => callBinary(a, opName, c));
                            if (ac === SKIPPED) continue;
                            checked++;
                            if (!ac)
                                throw new LawError(opName, 'transitive', [a, b, c], context);
                        }
                    }
                }
                if (checked === 0) warnNoSamples(prop, opName);
                break;
            }

            case 'total': {
                if (!predicate) break;
                let checked = 0;
                for (const a of samples) {
                    for (const b of samples) {
                        const ab = tryOp(() => callBinary(a, opName, b));
                        if (ab === SKIPPED) continue;
                        const ba = tryOp(() => callBinary(b, opName, a));
                        if (ba === SKIPPED) continue;
                        checked++;
                        if (!ab && !ba)
                            throw new LawError(opName, 'total', [a, b], context);
                    }
                }
                if (checked === 0) warnNoSamples(prop, opName);
                break;
            }

            // ── Bare inter-op names (metadata only — no enforcement) ────────
            // Enforcement is via namespaced forms ('identity:X', 'absorbing:X', etc.)

            case 'identity':
            case 'absorbing':
            case 'distributive':
            case 'absorption':
            case 'inverse':
                break;

                // ── Deferred ────────────────────────────────────────────────────

            case 'composition':
                // Deferred: requires knowing the concrete type-parameter T.
                break;

            default:
                break;
        }
    }
}
