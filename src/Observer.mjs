/**
 * Observer Abstraction for Codata Operations
 * 
 * This module provides the infrastructure for defining and composing coalgebraic operations
 * (unfold, fold, map, merge) on codata. This is the dual of Transformer.mjs for data operations.
 * 
 * Codata is defined by observers (destructors) rather than constructors, enabling:
 * - Lazy evaluation and potentially infinite structures
 * - Observation-based programming
 * - Coinductive reasoning and corecursion
 * - Dual recursion schemes (unfold/fold)
 * 
 * @module Observer
 */

import { composeFunctions, HandlerMapSymbol } from './utils.mjs';

/**
 * Re-export HandlerMapSymbol for backward compatibility.
 * The symbol is now defined in utils.mjs and shared with Transformer.mjs.
 */
export { HandlerMapSymbol };

/**
 * Observer abstraction that enables composition of codata operations.
 * All operations (unfold, fold, map, merge) are represented.
 * 
 * @typedef {Object} Observer
 * @property {string} name - Operation name
 * @property {'unfold' | 'fold' | 'map' | 'merge'} type - Operation type
 * @property {*} [outSpec] - Output type specification for validation
 * @property {*} [inSpec] - Input type specification for validation
 * @property {Object} [cases] - Case handlers for fold operations: { Done, Step }
 * @property {Function} [generator] - Generator function for unfold operations
 * @property {Function} [getObserverTransform] - Get observer transform for map operations
 * @property {Function} [getAtomTransform] - Get atom transform
 */

/**
 * Configuration object for creating observers.
 * Provides optional components that define observer behavior.
 * 
 * @typedef {Object} ObserverConfig
 * @property {string} name - Operation name
 * @property {'unfold' | 'fold' | 'map' | 'merge'} type - Operation type
 * @property {*} [outSpec] - Output type specification
 * @property {*} [inSpec] - Input type specification
 * @property {Object} [cases] - Fold cases: { Done: Function, Step: Function }
 * @property {Function} [generator] - Generator function for unfold
 * @property {Function} [getObserverTransform] - Observer transform getter
 * @property {Function} [getAtomTransform] - Atom transform getter
 */

/**
 * Registry that stores observers for a codata type.
 * Maps operation names to their observer implementations.
 * 
 * @typedef {Map<string, Observer>} ObserverRegistry
 */

/**
 * WeakMap that stores operation registries for each codata class.
 * This allows us to add observers to frozen codata classes.
 */
export const codataObservers = new WeakMap();

/**
 * Create an observer from a configuration object.
 * Validates the configuration and returns a complete observer.
 * 
 * @param {ObserverConfig} config - Observer configuration
 * @returns {Observer} A complete observer object
 * @throws {Error} If configuration is invalid
 */
export function createObserver(config) {
    if (!config.name) {
        throw new Error('Observer must have a name');
    }

    if (!config.type) {
        throw new Error(`Observer '${config.name}' must specify a type: 'unfold', 'fold', 'map', or 'merge'`);
    }

    const validTypes = ['unfold', 'fold', 'map', 'merge'];
    if (!validTypes.includes(config.type)) {
        throw new Error(
            `Observer '${config.name}' has invalid type '${config.type}'. Must be one of: ${validTypes.join(', ')}`
        );
    }

    // Validate that at least one transformation is provided
    if (!config.generator && !config.cases &&
        !config.getObserverTransform && !config.getAtomTransform) {
        throw new Error(
            `Observer '${config.name}' must provide at least one of: generator, cases, getObserverTransform, or getAtomTransform`
        );
    }

    // Validate fold-specific requirements
    if (config.type === 'fold') {
        if (!config.cases) {
            throw new Error(
                `Observer '${config.name}' is a fold operation but missing required 'cases' object with Done and Step handlers`
            );
        }
        if (!config.cases.Done || typeof config.cases.Done !== 'function') {
            throw new Error(
                `Observer '${config.name}' is a fold operation but missing required 'Done' case (termination predicate)`
            );
        }
        if (!config.cases.Step || typeof config.cases.Step !== 'function') {
            throw new Error(
                `Observer '${config.name}' is a fold operation but missing required 'Step' case (observation step)`
            );
        }
    }

    return {
        name: config.name,
        type: config.type,
        outSpec: config.outSpec,
        inSpec: config.inSpec,
        cases: config.cases,
        generator: config.generator,
        getObserverTransform: config.getObserverTransform,
        getAtomTransform: config.getAtomTransform
    };
}

/**
 * Compose two observers into a single observer.
 * Used by merge operation to fuse multiple operations.
 * 
 * Rules:
 * - Only one generator allowed (unfold)
 * - Only one fold allowed (cases)
 * - Observer transforms are composed (map)
 * - Atom transforms are composed
 * 
 * @param {Observer} o1 - First observer
 * @param {Observer} o2 - Second observer
 * @returns {Observer} Composed observer
 * @throws {Error} If composition rules are violated
 */
export function composeObservers(o1, o2) {
    // Validate composition rules
    if (o1.generator && o2.generator) {
        throw new Error(
            `Cannot compose observers '${o1.name}' and '${o2.name}': both have generators (only one unfold allowed)`
        );
    }

    if (o1.cases && o2.cases) {
        throw new Error(
            `Cannot compose observers '${o1.name}' and '${o2.name}': both have fold cases (only one fold allowed)`
        );
    }

    // Determine merged type based on composition artifacts
    // Precedence: fold > unfold > map > merge
    // - If composed has cases: type is 'fold' (consuming operation)
    // - Else if composed has generator: type is 'unfold' (generating operation)
    // - Else if either has observer transform: type is 'map' (transformation operation)
    // - Else: type is 'merge' (generic composition)
    const composedCases = o1.cases || o2.cases;
    const composedGenerator = o1.generator || o2.generator;
    const hasObserverTransform = o1.getObserverTransform || o2.getObserverTransform;

    let mergedType;
    if (composedCases) {
        mergedType = 'fold';
    } else if (composedGenerator) {
        mergedType = 'unfold';
    } else if (hasObserverTransform) {
        mergedType = 'map';
    } else {
        mergedType = 'merge';
    }

    // Infer specs from composition (same logic as composeMultipleObservers)
    // - Input spec: from observer with generator (unfold operation)
    // - Output spec: prefer o2's outSpec (later in pipeline), fallback to o1
    const inSpec = (o1.generator ? o1.inSpec : o2.inSpec) || o1.inSpec || o2.inSpec;
    const outSpec = o2.outSpec || o1.outSpec;

    return createObserver({
        name: `${o1.name}_${o2.name}`,
        type: mergedType,
        inSpec,
        outSpec,
        generator: o1.generator || o2.generator,
        cases: o1.cases || o2.cases,
        getObserverTransform: o1.getObserverTransform && o2.getObserverTransform
            ? (observer) => composeFunctions(o1.getObserverTransform(observer), o2.getObserverTransform(observer))
            : o1.getObserverTransform || o2.getObserverTransform,
        getAtomTransform: o1.getAtomTransform && o2.getAtomTransform
            ? (atom) => composeFunctions(o1.getAtomTransform(atom), o2.getAtomTransform(atom))
            : o1.getAtomTransform || o2.getAtomTransform
    });
}

/**
 * Compose multiple observers into a single fused observer.
 * Implements deforestation by eliminating intermediate codata structure construction.
 * 
 * Composition is left-to-right: [o1, o2, o3] => o1 → o2 → o3
 * This enables natural pipeline semantics (e.g., unfold → map → fold).
 * 
 * Validates composition rules:
 * - Maximum 1 generator (unfold operation)
 * - Maximum 1 fold (cases)
 * - Any number of observer transforms (map operations)
 * 
 * Infers merged specification:
 * - Input spec: from first observer with generator
 * - Output spec: from last observer with outSpec
 * 
 * @param {Observer[]} observers - Array of observers to compose (in execution order)
 * @param {string} mergeName - Name for the merged operation
 * @returns {Observer} A single fused observer
 * @throws {Error} If composition rules are violated
 */
export function composeMultipleObservers(observers, mergeName) {
    if (!observers || observers.length === 0) {
        throw new Error('Cannot compose empty observer array');
    }

    if (observers.length === 1) {
        // Single observer - just rename it
        const o = observers[0];
        return createObserver({
            name: mergeName,
            type: o.type,
            outSpec: o.outSpec,
            inSpec: o.inSpec,
            cases: o.cases,
            generator: o.generator,
            getObserverTransform: o.getObserverTransform,
            getAtomTransform: o.getAtomTransform
        });
    }

    // Validate composition rules
    const generatorCount = observers.filter(o => o.generator).length;
    const foldCount = observers.filter(o => o.cases).length;

    if (generatorCount > 1) {
        const names = observers.filter(o => o.generator).map(o => `'${o.name}'`).join(', ');
        throw new Error(
            `Cannot merge operations: multiple unfolds detected (${names}). Only one unfold operation is allowed per merge.`
        );
    }

    if (foldCount > 1) {
        const names = observers.filter(o => o.cases).map(o => `'${o.name}'`).join(', ');
        throw new Error(
            `Cannot merge operations: multiple folds detected (${names}). Only one fold operation is allowed per merge.`
        );
    }

    // Compose observers sequentially (left-to-right)
    let composed = observers[0];
    for (let i = 1; i < observers.length; i++) {
        composed = composeObservers(composed, observers[i]);
    }

    // Infer merged specification
    // - Input spec: from first observer with generator (unfold)
    // - Output spec: from last observer with outSpec
    const firstWithGenerator = observers.find(o => o.generator);
    const lastWithOutSpec = observers.slice().reverse().find(o => o.outSpec);

    const inSpec = firstWithGenerator?.inSpec;
    const outSpec = lastWithOutSpec?.outSpec;

    // Determine merged type based on composed artifacts (not individual types)
    // Precedence: fold > unfold > map > merge
    // - If composed has cases: type is 'fold' (consuming operation)
    // - Else if composed has generator: type is 'unfold' (generating operation)
    // - Else if composed has observer transform: type is 'map' (transformation operation)
    // - Else: type is 'merge' (generic composition)
    let mergedType;
    if (composed.cases) {
        mergedType = 'fold';
    } else if (composed.generator) {
        mergedType = 'unfold';
    } else if (composed.getObserverTransform) {
        mergedType = 'map';
    } else {
        mergedType = 'merge';
    }

    // Create final merged observer with inferred spec
    return createObserver({
        name: mergeName,
        type: mergedType,
        outSpec,
        inSpec,
        cases: composed.cases,
        generator: composed.generator,
        getObserverTransform: composed.getObserverTransform,
        getAtomTransform: composed.getAtomTransform
    });
}

/**
 * Create a fold observer for coalgebraic catamorphism.
 * Uses case-based pattern matching with Done/Step cases.
 * 
 * Unlike data fold (which processes structures bottom-up), codata fold
 * consumes potentially infinite structures using bounded iteration:
 * - Done case: Termination predicate (when to stop consuming)
 * - Step case: Observation step producing { emit, nextState, nextSelf }
 * 
 * The framework handles accumulation based on spec.out type.
 * 
 * @param {string} name - Name of the fold operation
 * @param {Object} cases - Case handlers: { Done: Function, Step: Function }
 * @param {*} [outSpec] - Output type specification for validation
 * @param {*} [inSpec] - Input type specification for validation
 * @returns {Observer} An observer that performs fold operations
 */
export function createFoldObserver(name, cases, outSpec, inSpec) {
    // Validate cases structure
    if (!cases || typeof cases !== 'object') {
        throw new Error(
            `Fold observer '${name}' requires cases object with Done and Step handlers`
        );
    }

    if (!cases.Done || typeof cases.Done !== 'function') {
        throw new Error(
            `Fold observer '${name}' requires 'Done' case (termination predicate)`
        );
    }

    if (!cases.Step || typeof cases.Step !== 'function') {
        throw new Error(
            `Fold observer '${name}' requires 'Step' case (observation step)`
        );
    }

    const observer = createObserver({
        name,
        type: 'fold',
        outSpec,
        inSpec,
        cases
    });

    // Store cases on observer for reference
    observer[HandlerMapSymbol] = cases;

    return observer;
}
