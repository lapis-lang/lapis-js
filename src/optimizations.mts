/**
 * Optimization Exploitation
 *
 * Automatically applies algebraic transformations to fold operations based on
 * the `[properties]` metadata declared at `.ops()` time.  The optimizations
 * are default-on: whenever a property is declared and verified (Phase 2), the
 * corresponding runtime guard is installed.
 *
 * Supported optimizations (activated by property annotation):
 *
 *   identity:X  — identity elimination: op(x, identity) ≡ x  and  op(identity, x) ≡ x
 *   absorbing:X — absorbing short-circuit: op(x, zero) ≡ zero  and  op(zero, x) ≡ zero
 *   idempotent  — idempotent guard: op(x, x) ≡ x
 *
 * Only applies to binary fold operations (fold with `in: Family, out: Family`).
 * All guards short-circuit before the recursive fold traversal, so no
 * intermediate structure is constructed for the eliminated call.
 *
 * `ensures` contracts do NOT fire for short-circuited results — the
 * optimization preserves the logical result, so the contract on the logic
 * holds vacuously.
 *
 * Companion elements (`identity:X`, `absorbing:X`) are resolved lazily on the
 * first call rather than at definition time.  This avoids ordering issues during
 * `.ops()` registration (an unfold may be declared after the fold that
 * references it as a companion).
 *
 * @module optimizations
 */

import { isFamilyRefSpec } from './operations.mjs';
import type { Transformer } from './DataOps.mjs';
import { getCompanionElement } from './laws.mjs';
import { structuralEquals } from './utils.mjs';

// ---- Type helpers -----------------------------------------------------------

/** True iff the transformer is a binary fold returning another Family instance. */
export function isBinaryFamilyFold(t: Transformer): boolean {
    return (
        !!t.getCtorTransform &&
        !!t.inSpec &&
        isFamilyRefSpec(t.inSpec) &&
        isFamilyRefSpec(t.outSpec)
    );
}

// ---- Internal helpers -------------------------------------------------------

/**
 * Returns a thunk that resolves a companion element lazily on first call,
 * then caches the result for all subsequent calls.
 */
function makeLazyCompanion(adt: unknown, name: string): () => unknown {
    let resolved = false;
    let value: unknown;
    return () => {
        if (!resolved) { value = getCompanionElement(adt, name); resolved = true; }
        return value;
    };
}

// ---- Guard installation -----------------------------------------------------

/**
 * Wrap a fold implementation with algebraic property-based short-circuit guards.
 *
 * Returns the original `foldImpl` unchanged when:
 * - No properties are declared on the transformer.
 * - The transformer is not a binary Family→Family fold.
 * - None of the declared properties match a supported optimization.
 *
 * Otherwise returns a wrapper function that:
 * 1. Checks identity/absorbing/idempotent guards before calling `foldImpl`.
 * 2. Falls through to `foldImpl` when no guard fires.
 *
 * The wrapper preserves `this` binding via `foldImpl.apply(this, args)` for
 * all non-short-circuited calls.
 *
 * @param foldImpl  - The original fold function created by `createFoldOperation`.
 * @param adt       - The raw ADT constructor; used for lazy companion lookup.
 * @param transformer - The registered transformer holding `properties`.
 */
export function applyFoldOptimizations(
    foldImpl: (...args: unknown[]) => unknown,
    adt: unknown,
    transformer: Transformer
): (...args: unknown[]) => unknown {
    const props = transformer.properties;
    if (!props || props.size === 0) return foldImpl;
    if (!isBinaryFamilyFold(transformer)) return foldImpl;

    // Scan properties for applicable optimizations
    let identityName: string | null = null;
    let absorbingName: string | null = null;
    let hasIdempotent = false;

    for (const prop of props) {
        if (typeof prop !== 'string') continue;
        if (prop === 'idempotent')
            hasIdempotent = true;
        else if (prop.startsWith('identity:'))
            identityName = prop.slice('identity:'.length);
        else if (prop.startsWith('absorbing:'))
            absorbingName = prop.slice('absorbing:'.length);
    }

    if (!identityName && !absorbingName && !hasIdempotent) return foldImpl;

    // Lazy companion thunks — resolved on first invocation to avoid ordering
    // issues during .ops() registration.
    const getIdentity  = identityName  !== null ? makeLazyCompanion(adt, identityName)  : null;
    const getAbsorbing = absorbingName !== null ? makeLazyCompanion(adt, absorbingName) : null;

    return function optimizedFoldImpl(this: unknown, ...args: unknown[]): unknown {
        const other = args[0];

        // Identity elimination: op(identity, x) ≡ x  AND  op(x, identity) ≡ x
        if (getIdentity !== null) {
            const identityValue = getIdentity();
            if (structuralEquals(this, identityValue)) return other;
            if (structuralEquals(other, identityValue)) return this;
        }

        // Absorbing short-circuit: op(zero, x) ≡ zero  AND  op(x, zero) ≡ zero
        if (getAbsorbing !== null) {
            const absorbingValue = getAbsorbing();
            if (structuralEquals(this, absorbingValue)) return absorbingValue;
            if (structuralEquals(other, absorbingValue)) return absorbingValue;
        }

        // Idempotent guard: op(x, x) ≡ x
        if (hasIdempotent && structuralEquals(this, other)) return this;

        return foldImpl.apply(this, args);
    };
}
