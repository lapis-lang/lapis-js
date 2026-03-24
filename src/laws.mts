/**
 * Algebraic law generation and enforcement.
 *
 * At `.ops()` call time this module:
 *   1. Generates representative ADT instances from the declared variant constructors.
 *   2. For each registered operation that carries `properties`, checks every
 *      applicable law against the generated samples.
 *   3. Throws {@link LawError} on the first counterexample found.
 *
 * Laws that require inter-operation companion elements (`identity`, `absorbing`,
 * `distributive`) and the functor composition law (`composition`) are recorded
 * in `KNOWN_PROPERTIES` but **not checked here** — they are deferred to
 * issue #168.
 *
 * @module laws
 */

import { isFamilyRefSpec } from './operations.mjs';
import type { Transformer } from './DataOps.mjs';
import { structuralEquals } from './utils.mjs';

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

// ---- Law checking -----------------------------------------------------------

function warnNoSamples(prop: string, opName: string): void {
    console.warn(`[lapis] Law '${prop}' on '${opName}': no valid sample tuples found — skipping check`);
}

/**
 * Check all algebraic law constraints declared in `transformer.properties`
 * against the provided samples.
 *
 * Throws {@link LawError} on the first counterexample found.
 *
 * **Error-tolerant:** If an operation call throws any error for a particular
 * tuple (precondition failure, TDZ reference, handler crash, etc.), that tuple
 * is silently skipped — an execution error is not a law violation. If *all*
 * tuples are filtered this way, a warning is emitted to `console.warn`.
 *
 * **Not checked here** (deferred to issue #168):
 * - `identity`, `absorbing`, `distributive` — inter-operation / companion-element laws.
 * - `composition` — functor law requiring a concrete type parameter instantiation.
 *
 * @param opName      - Operation name (used in error messages).
 * @param transformer - Registered transformer; provides `properties` and type info.
 * @param samples     - Representative ADT instances to test against.
 * @param context     - Human-readable ADT description for error messages.
 */
export function checkOperationLaws(
    opName: string,
    transformer: Transformer,
    samples: unknown[],
    context: string
): void {
    const props = transformer.properties;
    if (!props || props.size === 0) return;
    if (samples.length === 0) return;

    const binaryFold = isBinaryFoldOp(transformer);
    const predicate  = isBinaryPredicateOp(transformer);
    const unary      = isUnaryFoldOp(transformer);

    for (const prop of props) {
        switch (prop) {

            // ── Binary fold laws ────────────────────────────────────────────

            case 'associative': {
                if (!binaryFold) break;
                let checked = 0;
                for (const a of samples) {
                    for (const b of samples) {
                        for (const c of samples) {
                            let ab: unknown, bc: unknown, abC: unknown, aBc: unknown;
                            try { ab  = callBinary(a,  opName, b); } catch { continue; }
                            try { bc  = callBinary(b,  opName, c); } catch { continue; }
                            try { abC = callBinary(ab, opName, c); } catch { continue; }
                            try { aBc = callBinary(a,  opName, bc); } catch { continue; }
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
                        let ab: unknown, ba: unknown;
                        try { ab = callBinary(a, opName, b); } catch { continue; }
                        try { ba = callBinary(b, opName, a); } catch { continue; }
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
                    let aa: unknown;
                    try { aa = callBinary(a, opName, a); } catch { continue; }
                    checked++;
                    if (!structuralEquals(aa, a))
                        throw new LawError(opName, 'idempotent', [a], context);
                }
                if (checked === 0) warnNoSamples(prop, opName);
                break;
            }

            // ── Unary fold laws ─────────────────────────────────────────────

            case 'involutory': {
                if (!unary) break;
                let checked = 0;
                for (const a of samples) {
                    let b: unknown, bb: unknown;
                    try { b = callUnary(a, opName); } catch { continue; }
                    // Skip if result is not an ADT instance that also supports this operation
                    if (typeof b !== 'object' || b === null) continue;
                    if (!(opName in (b as object))) continue;
                    try { bb = callUnary(b, opName); } catch { continue; }
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
                    let result: unknown;
                    try { result = callBinary(a, opName, a); } catch { continue; }
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
                        let ab: unknown, ba: unknown;
                        try { ab = callBinary(a, opName, b); } catch { continue; }
                        try { ba = callBinary(b, opName, a); } catch { continue; }
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
                        let ab: unknown, ba: unknown;
                        try { ab = callBinary(a, opName, b); } catch { continue; }
                        try { ba = callBinary(b, opName, a); } catch { continue; }
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
                            let ab: unknown, bc: unknown, ac: unknown;
                            try { ab = callBinary(a, opName, b); } catch { continue; }
                            try { bc = callBinary(b, opName, c); } catch { continue; }
                            if (!ab || !bc) { checked++; continue; } // premise false → law holds vacuously
                            try { ac = callBinary(a, opName, c); } catch { continue; }
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
                        let ab: unknown, ba: unknown;
                        try { ab = callBinary(a, opName, b); } catch { continue; }
                        try { ba = callBinary(b, opName, a); } catch { continue; }
                        checked++;
                        if (!ab && !ba)
                            throw new LawError(opName, 'total', [a, b], context);
                    }
                }
                if (checked === 0) warnNoSamples(prop, opName);
                break;
            }

            // ── Deferred properties ─────────────────────────────────────────

            case 'composition':
                // Deferred: requires knowing the concrete type-parameter T. See issue #168.
                break;

            case 'identity':
            case 'absorbing':
            case 'distributive':
                // Deferred to issue #168 (inter-operation laws, require companion elements).
                break;

            default:
                break;
        }
    }
}
