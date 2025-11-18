/**
 * Transformer Abstraction for ADT Operations
 * 
 * This module provides the infrastructure for defining and composing algebraic operations
 * (fold, unfold, map, match, merge) on ADTs. Inspired by w3future adt.js but adapted for
 * open ADTs with subtyping support.
 * 
 * @module Transformer
 */

import type { Constructor } from './index.mjs';

/**
 * Symbol for storing handler map on match transformers.
 * Used internally to detect wildcard handlers.
 */
export const HandlerMapSymbol = Symbol('HandlerMap');

/**
 * Transformer abstraction that enables composition of operations.
 * All operations (fold, unfold, map, match, merge) are represented as transformers.
 * 
 * @template In - Input type for generators (unfold seed type)
 * @template Out - Output type for operations
 */
export interface Transformer<In = any, Out = any> {
    /** Name of the operation */
    name: string

    /**
     * Generator function for unfold operations.
     * Receives constructors and returns a function that transforms seed to output.
     * @param constructors - Stand-in constructors that handle recursion
     */
    generator?: (constructors: Record<string, (...args: any[]) => any>) => (seed: In) => Out

    /**
     * Transform function for constructors (used in fold/match).
     * Returns the handler function for a given constructor.
     * @param ctor - The variant constructor
     */
    getCtorTransform?: (ctor: Constructor) => ((...args: any[]) => any) | undefined

    /**
     * Transform function for type parameters (used in map).
     * Returns the transformation function for a type parameter.
     * @param paramName - Name of the type parameter (T, U, V, etc.)
     */
    getParamTransform?: (paramName: string) => ((value: any) => any) | undefined

    /**
     * Transform function for non-algebraic values (atoms).
     * Returns the transformation function for primitive values.
     * @param ctor - The constructor of the atomic value
     */
    getAtomTransform?: (ctor: Constructor) => ((value: any) => any) | undefined
}

/**
 * Configuration object for creating transformers.
 * Provides optional components that define transformer behavior.
 */
export interface TransformerConfig<In = any, Out = any> {
    name: string
    generator?: (constructors: Record<string, (...args: any[]) => any>) => (seed: In) => Out
    getCtorTransform?: (ctor: Constructor) => ((...args: any[]) => any) | undefined
    getParamTransform?: (paramName: string) => ((value: any) => any) | undefined
    getAtomTransform?: (ctor: Constructor) => ((value: any) => any) | undefined
}

/**
 * Registry that stores transformers for an ADT.
 * Maps operation names to their transformer implementations.
 */
export type OperationRegistry = Map<string, Transformer>

/**
 * WeakMap that stores operation registries for each ADT class.
 * This allows us to add transformers to frozen ADT classes.
 */
export const adtTransformers = new WeakMap<any, OperationRegistry>();

/**
 * Create a transformer from a configuration object.
 * Validates the configuration and returns a complete transformer.
 * 
 * @param config - Transformer configuration
 * @returns A complete transformer object
 */
export function createTransformer<In = any, Out = any>(
    config: TransformerConfig<In, Out>
): Transformer<In, Out> {
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
    f: ((...args: any[]) => any) | undefined,
    g: ((...args: any[]) => any) | undefined
): (...args: any[]) => any {
    if (f && g) {
        return (x: any) => g(f(x));
    }
    if (f) return f;
    if (g) return g;
    return (x: any) => x; // identity
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
    t1: Transformer,
    t2: Transformer
): Transformer {
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
            ? (ctor) => composeFunctions(t1.getCtorTransform!(ctor), t2.getCtorTransform!(ctor))
            : t1.getCtorTransform || t2.getCtorTransform,
        getParamTransform: t1.getParamTransform && t2.getParamTransform
            ? (param) => composeFunctions(t1.getParamTransform!(param), t2.getParamTransform!(param))
            : t1.getParamTransform || t2.getParamTransform,
        getAtomTransform: t1.getAtomTransform && t2.getAtomTransform
            ? (ctor) => composeFunctions(t1.getAtomTransform!(ctor), t2.getAtomTransform!(ctor))
            : t1.getAtomTransform || t2.getAtomTransform
    });
}

/**
 * Handler map for match operation.
 * Maps variant names to their handler functions.
 * Special key '_' is the wildcard handler for unknown variants.
 */
export type MatchHandlers = Record<string, ((...args: any[]) => any)> & {
    _?: (instance: any) => any
}

/**
 * Create a match transformer for non-recursive pattern matching.
 * Dispatches on variant constructors without structural recursion.
 * 
 * @param name - Name of the match operation
 * @param handlers - Map of variant names to handler functions, with optional wildcard '_'
 * @returns A transformer that performs constructor dispatch
 */
export function createMatchTransformer(
    name: string,
    handlers: MatchHandlers
): Transformer {
    const transformer = createTransformer({
        name,
        getCtorTransform: (ctor: Constructor) => {
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
                    `No handler for variant '${variantName}' in match operation '${name}'`
                );
            };
        }
    }) as Transformer & { [HandlerMapSymbol]: MatchHandlers };

    // Store handlers on transformer for wildcard detection
    transformer[HandlerMapSymbol] = handlers;

    return transformer;
}

/**
 * Fold handlers type - similar to match handlers but for recursive operations.
 */
export type FoldHandlers = Record<string, ((...args: any[]) => any)> & {
    _?: (instance: any) => any
}

/**
 * Create a fold transformer for structural recursion (catamorphism).
 * Similar to match but handles recursive fields automatically.
 * 
 * @param name - Name of the fold operation
 * @param handlers - Map of variant names to handler functions, with optional wildcard '_'
 * @returns A transformer that performs recursive consumption
 */
export function createFoldTransformer(
    name: string,
    handlers: FoldHandlers
): Transformer {
    const transformer = createTransformer({
        name,
        getCtorTransform: (ctor: Constructor) => {
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
    }) as Transformer & { [HandlerMapSymbol]: FoldHandlers };

    // Store handlers on transformer for wildcard detection and mark as fold
    transformer[HandlerMapSymbol] = handlers;

    return transformer;
}
