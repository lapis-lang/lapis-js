/**
 * Transformer Abstraction for ADT Operations
 * 
 * This module provides the infrastructure for defining and composing algebraic operations
 * (fold, unfold, map, match, merge) on ADTs. Inspired by w3future adt.js but adapted for
 * open ADTs with subtyping support.
 * 
 * @module Transformer
 */

/**
 * Symbol for storing handler map on match transformers.
 * Used internally to detect wildcard handlers.
 */
export const HandlerMapSymbol = Symbol('HandlerMap');

/**
 * Transformer abstraction that enables composition of operations.
 * All operations (fold, unfold, map, match, merge) are represented.
 * 
 * @template In - Input type for generators (unfold seed type)
 * @template Out - Output type for operations
 */

/**
 * Configuration object for creating transformers.
 * Provides optional components that define transformer behavior.
 */

/**
 * Registry that stores transformers for an ADT.
 * Maps operation names to their transformer implementations.
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
 * @param config - Transformer configuration
 * @returns A complete transformer object
 */
export function createTransformer(
    config
){
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
 * Compose two transformation functions.
 * Returns a function that applies f then g: g(f(x))
 * 
 * @param f - First transformation (or undefined)
 * @param g - Second transformation (or undefined)
 * @returns Composed transformation, or the non-undefined one, or identity
 */
function composeFunctions(
    f,
    g
){
    if (f && g) {
        return (x) => g(f(x));
    }
    if (f) return f;
    if (g) return g;
    return (x) => x; // identity
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
 * @param t1 - First transformer
 * @param t2 - Second transformer
 * @returns Composed transformer
 */
export function composeTransformers(
    t1,
    t2
){
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
 * Create a fold transformer for structural recursion (catamorphism) and pattern matching.
 * For recursive ADTs: performs structural recursion, replacing constructors with functions.
 * For non-recursive ADTs: performs pattern matching, dispatching on variant constructors.
 * 
 * The actual recursive behavior is implemented in the operation installation logic (in index.mts),
 * not in the transformer itself.
 * 
 * @param name - Name of the fold operation
 * @param handlers - Map of variant names to handler functions, with optional wildcard '_'
 * @returns A transformer that performs fold operations
 */
export function createFoldTransformer(
    name,
    handlers,
    outSpec
){
    const transformer = createTransformer({
        name,
        outSpec,
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
