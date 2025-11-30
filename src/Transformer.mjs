/**
 * Transformer Abstraction for ADT Operations
 * 
 * This module provides the infrastructure for defining and composing algebraic operations
 * (fold, unfold, map, match, merge) on ADTs. Inspired by w3future adt.js but adapted for
 * open ADTs with subtyping support.
 * 
 * @module Transformer
 */

import { composeFunctions, HandlerMapSymbol } from './utils.mjs';

/**
 * Re-export HandlerMapSymbol for backward compatibility.
 * The symbol is now defined in utils.mjs and shared with Observer.mjs.
 */
export { HandlerMapSymbol };

/**
 * Transformer abstraction that enables composition of operations.
 * All operations (fold, unfold, map, match, merge) are represented.
 * 
 * @typedef {Object} Transformer
 * @property {string} name - Operation name
 * @property {*} [outSpec] - Output type specification for validation
 * @property {*} [inSpec] - Input type specification (for unfold and parameterized fold operations)
 * @property {Function} [generator] - Generator function for unfold operations
 * @property {Function} [getCtorTransform] - Get constructor transform for fold operations
 * @property {Function} [getParamTransform] - Get parameter transform for map operations
 * @property {Function} [getAtomTransform] - Get atom transform
 */

/**
 * Configuration object for creating transformers.
 * Provides optional components that define transformer behavior.
 * 
 * @typedef {Object} TransformerConfig
 * @property {string} name - Operation name
 * @property {*} [outSpec] - Output type specification
 * @property {*} [inSpec] - Input type specification
 * @property {Function} [generator] - Generator function for unfold
 * @property {Function} [getCtorTransform] - Constructor transform getter
 * @property {Function} [getParamTransform] - Parameter transform getter
 * @property {Function} [getAtomTransform] - Atom transform getter
 */

/**
 * Registry that stores transformers for an ADT.
 * Maps operation names to their transformer implementations.
 * 
 * @typedef {Map<string, Transformer>} TransformerRegistry
 */

/**
 * WeakMap that stores operation registries for each ADT class.
 * This allows us to add transformers to frozen ADT classes.
 */
export const adtTransformers = new WeakMap();

/**
 * Create a transformer from a configuration object.
 * Validates the configuration and returns a complete transformer.
 * 
 * @param {TransformerConfig} config - Transformer configuration
 * @returns {Transformer} A complete transformer object
 */
export function createTransformer(
    config
) {
    if (!config.name) {
        throw new Error('Transformer must have a name');
    }

    // Validate that at least one transformation is provided
    if (!config.generator && !config.getCtorTransform &&
        !config.getParamTransform && !config.getAtomTransform) {
        throw new Error(
            `Transformer '${config.name}' must provide at least one of: generator, getCtorTransform, getParamTransform, or getAtomTransform`
        );
    }

    return {
        name: config.name,
        outSpec: config.outSpec,
        generator: config.generator,
        getCtorTransform: config.getCtorTransform,
        getParamTransform: config.getParamTransform,
        getAtomTransform: config.getAtomTransform
    };
}

/**
 * Compose two transformers into a single transformer.
 * Used by merge operation to fuse multiple operations.
 * 
 * Rules:
 * - Only one generator allowed (unfold)
 * - Constructor transforms are composed (fold)
 * - Parameter transforms are composed (map)
 * - Atom transforms are composed
 * 
 * @param {Transformer} t1 - First transformer
 * @param {Transformer} t2 - Second transformer
 * @returns {Transformer} Composed transformer
 */
export function composeTransformers(
    t1,
    t2
) {
    // Validate composition rules
    if (t1.generator && t2.generator) {
        throw new Error(
            `Cannot compose transformers '${t1.name}' and '${t2.name}': both have generators (only one unfold allowed)`
        );
    }

    return createTransformer({
        name: `${t1.name}_${t2.name}`,
        generator: t1.generator || t2.generator,
        getCtorTransform: t1.getCtorTransform && t2.getCtorTransform
            ? (ctor) => composeFunctions(t1.getCtorTransform(ctor), t2.getCtorTransform(ctor))
            : t1.getCtorTransform || t2.getCtorTransform,
        getParamTransform: t1.getParamTransform && t2.getParamTransform
            ? (param) => composeFunctions(t1.getParamTransform(param), t2.getParamTransform(param))
            : t1.getParamTransform || t2.getParamTransform,
        getAtomTransform: t1.getAtomTransform && t2.getAtomTransform
            ? (ctor) => composeFunctions(t1.getAtomTransform(ctor), t2.getAtomTransform(ctor))
            : t1.getAtomTransform || t2.getAtomTransform
    });
}

/**
 * Compose multiple transformers into a single fused transformer.
 * Implements deforestation by eliminating intermediate data structure construction.
 * 
 * Composition is left-to-right: [t1, t2, t3] => t1 → t2 → t3
 * This enables natural pipeline semantics (e.g., unfold → map → fold).
 * 
 * Validates composition rules:
 * - Maximum 1 generator (unfold operation)
 * - Maximum 1 constructor transform (fold operation)
 * - Any number of parameter transforms (map operations)
 * 
 * Infers merged specification:
 * - Input spec: from first transformer with generator
 * - Output spec: from last transformer with outSpec
 * 
 * Supported morphisms:
 * - Hylomorphism: unfold + fold (generate then consume)
 * - Paramorphism: map + fold (transform then consume)
 * - Apomorphism: unfold + map (generate then transform)
 * - Complex pipelines: unfold + map + fold
 * 
 * @param {Transformer[]} transformers - Array of transformers to compose (in execution order)
 * @param {string} mergeName - Name for the merged operation
 * @returns {Transformer} A single fused transformer
 * @throws {Error} If composition rules are violated
 */
export function composeMultipleTransformers(
    transformers,
    mergeName
) {
    if (!transformers || transformers.length === 0) {
        throw new Error('Cannot compose empty transformer array');
    }

    if (transformers.length === 1) {
        // Single transformer - just rename it
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
    const generatorCount = transformers.filter(t => t.generator).length;
    // Count folds - transformers that have getCtorTransform defined
    // Note: Maps don't have getCtorTransform at all, only folds do
    const foldCount = transformers.filter(t => {
        return t.getCtorTransform !== undefined;
    }).length;

    if (generatorCount > 1) {
        const names = transformers.filter(t => t.generator).map(t => `'${t.name}'`).join(', ');
        throw new Error(
            `Cannot merge operations: multiple unfolds detected (${names}). Only one unfold operation is allowed per merge.`
        );
    }

    if (foldCount > 1) {
        const names = transformers.filter(t => t.getCtorTransform).map(t => `'${t.name}'`).join(', ');
        throw new Error(
            `Cannot merge operations: multiple folds detected (${names}). Only one fold operation is allowed per merge.`
        );
    }

    // Compose transformers sequentially (left-to-right)
    let composed = transformers[0];
    for (let i = 1; i < transformers.length; i++) {
        composed = composeTransformers(composed, transformers[i]);
    }

    // Infer merged specification
    // - Input spec: from first transformer with generator (unfold)
    // - Output spec: from last transformer with outSpec
    const firstWithGenerator = transformers.find(t => t.generator);
    const lastWithOutSpec = transformers.slice().reverse().find(t => t.outSpec);

    const inSpec = firstWithGenerator?.generator ? extractInSpec(firstWithGenerator) : undefined;
    const outSpec = lastWithOutSpec?.outSpec;

    // Create final merged transformer with inferred spec
    return createTransformer({
        name: mergeName,
        outSpec,
        // Store inSpec for validation if needed (not part of standard transformer interface)
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
 * 
 * @param {Transformer} transformer - Transformer to extract spec from
 * @returns {*} Input spec or undefined
 */
function extractInSpec(transformer) {
    // For unfold operations, the spec is typically stored elsewhere
    // This is a placeholder - actual implementation depends on how unfold stores its spec
    // For now, return undefined as unfold validation happens at the ADT level
    return undefined;
}

/**
 * Create a fold transformer for structural recursion (catamorphism) and pattern matching.
 * For recursive ADTs: performs structural recursion, replacing constructors with functions.
 * For non-recursive ADTs: performs pattern matching, dispatching on variant constructors.
 * 
 * The actual recursive behavior is implemented in the operation installation logic (in index.mjs),
 * not in the transformer itself.
 * 
 * @param {string} name - Name of the fold operation
 * @param {Object.<string, Function>} handlers - Map of variant names to handler functions, with optional wildcard '_'
 * @param {*} [outSpec] - Output type specification for validation
 * @returns {Transformer} A transformer that performs fold operations
 */
export function createFoldTransformer(
    name,
    handlers,
    outSpec,
    inSpec
) {
    const transformer = createTransformer({
        name,
        outSpec,
        inSpec,
        getCtorTransform: (ctor) => {
            const variantName = ctor.name;
            const handler = handlers[variantName];

            if (handler) {
                return handler;
            }

            // Try wildcard handler
            if (handlers._) {
                return handlers._;
            }

            // No handler found - will throw error when invoked
            return () => {
                throw new Error(
                    `No handler for variant '${variantName}' in fold operation '${name}'`
                );
            };
        }
    });

    // Store handlers on transformer for wildcard detection and mark
    transformer[HandlerMapSymbol] = handlers;

    return transformer;
}
