/**
 * Transformer Abstraction for ADT Operations
 *
 * This module provides the infrastructure for defining and composing algebraic operations
 * (fold, unfold, map, match, merge) on ADTs. Inspired by w3future adt.js but adapted for
 * open ADTs with subtyping support.
 *
 * @module DataOps
 */

import { composeOptionalTransform, validateMergeComposition, HandlerMapSymbol } from './utils.mjs';
import type { TypeSpec } from './operations.mjs';
import type { ContractSpec } from './contracts.mjs';

export { HandlerMapSymbol };

// ---- Internal types ----------------------------------------------------------

/** Generic handler function used in fold/map/unfold case maps */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HandlerFn = (...args: any[]) => unknown;

/** A minimal view of a variant constructor, used by getCtorTransform */
export interface VariantConstructorLike {
    readonly name: string;
    readonly spec?: Record<string, TypeSpec>;
}

// ---- Transformer interface ---------------------------------------------------

/**
 * Transformer abstraction that enables composition of operations.
 * All operations (fold, unfold, map, match, merge) are represented.
 */
export interface Transformer {
    /** Operation name */
    name: string;
    /** Output type specification for validation */
    outSpec?: TypeSpec;
    /** Input type specification (for unfold and parameterized fold operations) */
    inSpec?: TypeSpec;
    /** Generator function for unfold operations */
    generator?: (seed: unknown) => unknown;
    /** Get constructor transform for fold operations */
    getCtorTransform?: (ctor: VariantConstructorLike) => HandlerFn;
    /** Get parameter transform for map operations */
    getParamTransform?: (paramName: string) => HandlerFn | undefined;
    /** Get atom transform */
    getAtomTransform?: (fieldName: string) => HandlerFn | undefined;
    /** Stored handler map (set by createFoldTransformer) */
    [HandlerMapSymbol]?: Record<string, HandlerFn>;
    /** Contract spec for design by contract (demands, ensures, rescue) */
    contracts?: ContractSpec;
    /** Unfold case map (set by unfold operations) */
    unfoldCases?: Record<string, (seed: unknown) => unknown | null>;
    /** Unfold spec (set by unfold operations) */
    unfoldSpec?: Record<string, unknown>;
}

/**
 * Configuration object for creating transformers.
 * Provides optional components that define transformer behavior.
 */
export interface TransformerConfig {
    name: string;
    outSpec?: TypeSpec;
    inSpec?: TypeSpec;
    generator?: (seed: unknown) => unknown;
    getCtorTransform?: (ctor: VariantConstructorLike) => HandlerFn;
    getParamTransform?: (paramName: string) => HandlerFn | undefined;
    getAtomTransform?: (fieldName: string) => HandlerFn | undefined;
}

/**
 * Registry that stores transformers for an ADT.
 * Maps operation names to their transformer implementations.
 */
export type TransformerRegistry = Map<string, Transformer>;

// ---- Registry ----------------------------------------------------------------

/**
 * WeakMap that stores operation registries for each ADT class.
 * This allows us to add transformers to frozen ADT classes.
 */
export const adtTransformers = new WeakMap<object, TransformerRegistry>();

// ---- Factory -----------------------------------------------------------------

/**
 * Create a transformer from a configuration object.
 * Validates the configuration and returns a complete transformer.
 */
export function createTransformer(config: TransformerConfig): Transformer {
    if (!config.name)
        throw new Error('Transformer must have a name');


    if (!config.generator && !config.getCtorTransform &&
        !config.getParamTransform && !config.getAtomTransform) {
        throw new Error(
            `Transformer '${config.name}' must provide at least one of: generator, getCtorTransform, getParamTransform, or getAtomTransform`
        );
    }

    return {
        name: config.name,
        outSpec: config.outSpec,
        inSpec: config.inSpec,
        generator: config.generator,
        getCtorTransform: config.getCtorTransform,
        getParamTransform: config.getParamTransform,
        getAtomTransform: config.getAtomTransform
    };
}

/**
 * Compose two transformers into a single transformer.
 * Used by merge operation to fuse multiple operations.
 */
export function composeTransformers(t1: Transformer, t2: Transformer): Transformer {
    if (t1.generator && t2.generator) {
        throw new Error(
            `Cannot compose transformers '${t1.name}' and '${t2.name}': both have generators (only one unfold allowed)`
        );
    }

    return createTransformer({
        name: `${t1.name}_${t2.name}`,
        generator: t1.generator || t2.generator,
        getCtorTransform: composeOptionalTransform(t1.getCtorTransform, t2.getCtorTransform),
        getParamTransform: composeOptionalTransform(t1.getParamTransform, t2.getParamTransform),
        getAtomTransform: composeOptionalTransform(t1.getAtomTransform, t2.getAtomTransform)
    });
}

/**
 * Compose multiple transformers into a single fused transformer.
 * Implements deforestation by eliminating intermediate data structure construction.
 */
export function composeMultipleTransformers(
    transformers: Transformer[],
    mergeName: string
): Transformer {
    if (!transformers || transformers.length === 0)
        throw new Error('Cannot compose empty transformer array');


    if (transformers.length === 1) {
        const t = transformers[0];
        return createTransformer({
            name: mergeName,
            outSpec: t.outSpec,
            generator: t.generator,
            getCtorTransform: t.getCtorTransform,
            getParamTransform: t.getParamTransform,
            getAtomTransform: t.getAtomTransform
        });
    }

    // Validate composition rules
    validateMergeComposition(transformers, t => t.getCtorTransform !== undefined);

    // Compose transformers sequentially (left-to-right)
    let composed = transformers[0];
    for (let i = 1; i < transformers.length; i++)
        composed = composeTransformers(composed, transformers[i]);


    // Infer merged specification
    const firstWithGenerator = transformers.find(t => t.generator),
        lastWithOutSpec = transformers.slice().reverse().find(t => t.outSpec),

        inSpec = firstWithGenerator?.generator ? extractInSpec(firstWithGenerator) : undefined,
        outSpec = lastWithOutSpec?.outSpec;

    return createTransformer({
        name: mergeName,
        outSpec,
        ...(inSpec && { inSpec }),
        generator: composed.generator,
        getCtorTransform: composed.getCtorTransform,
        getParamTransform: composed.getParamTransform,
        getAtomTransform: composed.getAtomTransform
    });
}

/**
 * Extract input spec from a transformer with a generator.
 * Helper for spec inference in merge operations.
 */
function extractInSpec(_transformer: Transformer): TypeSpec | undefined {
    // For unfold operations, the spec is stored at the ADT level
    return undefined;
}

/**
 * Create a fold transformer for structural recursion (catamorphism) and pattern matching.
 */
export function createFoldTransformer(
    name: string,
    handlers: Record<string, HandlerFn>,
    outSpec?: TypeSpec,
    inSpec?: TypeSpec
): Transformer {
    const transformer = createTransformer({
        name,
        outSpec,
        inSpec,
        getCtorTransform: (ctor) => {
            const variantName = ctor.name,
                handler = handlers[variantName];

            if (handler)
                return handler;


            // Try wildcard handler
            if (handlers['_'])
                return handlers['_'];


            // No handler found - will throw error when invoked
            return () => {
                throw new Error(
                    `No handler for variant '${variantName}' in fold operation '${name}'`
                );
            };
        }
    });

    // Store handlers on transformer for wildcard detection
    transformer[HandlerMapSymbol] = handlers;

    return transformer;
}
