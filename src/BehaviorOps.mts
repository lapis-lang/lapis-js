/**
 * Observer Abstraction for Behavior Operations
 *
 * This module provides the infrastructure for defining and composing coalgebraic operations
 * (unfold, fold, map, merge) on behavior types (final coalgebras, νF).
 * "Behavior" is the API-level term; the underlying mathematical structure is a final coalgebra.
 * This module is the categorical dual of DataOps.mjs, which handles initial-algebra (data) operations.
 *
 * @module BehaviorOps
 */

import { composeOptionalTransform, validateMergeComposition, HandlerMapSymbol } from './utils.mjs';
import type { TypeSpec } from './operations.mjs';

export { HandlerMapSymbol };

// ---- Types ------------------------------------------------------------------

export type ObserverType = 'unfold' | 'fold' | 'map' | 'merge';

/** Generic handler function type for observer operations */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ObserverHandlerFn = (...args: any[]) => unknown;

/** Fold operation case handlers */
export interface FoldCases {
    Done: ObserverHandlerFn;
    Step: ObserverHandlerFn;
}

/**
 * Observer abstraction that enables composition of behavior operations.
 * All operations (unfold, fold, map, merge) are represented.
 */
export interface Observer {
    name: string;
    type: ObserverType;
    outSpec?: TypeSpec;
    inSpec?: TypeSpec;
    cases?: FoldCases;
    generator?: (seed: unknown) => unknown;
    getObserverTransform?: (observer: unknown) => ObserverHandlerFn | undefined;
    getAtomTransform?: (atom: unknown) => ObserverHandlerFn | undefined;
    /** True when the observer spec is a plain TypeSpec (no in/out wrapping). */
    isSimple?: boolean;
    /** True when the observer spec has an `in` and/or `out` property. */
    isParametric?: boolean;
    /** True when the observer spec is a `SelfRef` (recursive continuation). */
    isContinuation?: boolean;
    /** Algebraic property annotations from `[properties]` on the operation spec. */
    properties?: Set<string>;
    /** Stored handler map (set by createFoldObserver) */
    [HandlerMapSymbol]?: FoldCases;
}

/**
 * Configuration object for creating observers.
 */
export interface ObserverConfig {
    name: string;
    type: ObserverType;
    outSpec?: TypeSpec;
    inSpec?: TypeSpec;
    cases?: FoldCases;
    generator?: (seed: unknown) => unknown;
    getObserverTransform?: (observer: unknown) => ObserverHandlerFn | undefined;
    getAtomTransform?: (atom: unknown) => ObserverHandlerFn | undefined;
}

/** Registry that stores observers for a behavior type. */
export type ObserverRegistry = Map<string, Observer>;

// ---- Registry ----------------------------------------------------------------

/**
 * WeakMap that stores operation registries for each behavior class.
 * This allows us to add observers to frozen behavior classes.
 */
export const behaviorObservers = new WeakMap<object, ObserverRegistry>();

// ---- Factory -----------------------------------------------------------------

/**
 * Create an observer from a configuration object.
 */
export function createObserver(config: ObserverConfig): Observer {
    if (!config.name)
        throw new Error('Observer must have a name');


    if (!config.type)
        throw new Error(`Observer '${config.name}' must specify a type: 'unfold', 'fold', 'map', or 'merge'`);


    const validTypes: ObserverType[] = ['unfold', 'fold', 'map', 'merge'];
    if (!validTypes.includes(config.type)) {
        throw new Error(
            `Observer '${config.name}' has invalid type '${config.type}'. Must be one of: ${validTypes.join(', ')}`
        );
    }

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
 */
export function composeObservers(o1: Observer, o2: Observer): Observer {
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

    const composedCases = o1.cases || o2.cases,
        composedGenerator = o1.generator || o2.generator,
        hasObserverTransform = o1.getObserverTransform || o2.getObserverTransform;

    let mergedType: ObserverType;
    if (composedCases)
        mergedType = 'fold';
    else if (composedGenerator)
        mergedType = 'unfold';
    else if (hasObserverTransform)
        mergedType = 'map';
    else
        mergedType = 'merge';


    const inSpec = (o1.generator ? o1.inSpec : o2.inSpec) ?? o1.inSpec ?? o2.inSpec,
        outSpec = o2.outSpec ?? o1.outSpec;

    return createObserver({
        name: `${o1.name}_${o2.name}`,
        type: mergedType,
        inSpec,
        outSpec,
        generator: o1.generator || o2.generator,
        cases: o1.cases || o2.cases,
        getObserverTransform: composeOptionalTransform(o1.getObserverTransform, o2.getObserverTransform),
        getAtomTransform: composeOptionalTransform(o1.getAtomTransform, o2.getAtomTransform)
    });
}

/**
 * Compose multiple observers into a single fused observer.
 */
export function composeMultipleObservers(observers: Observer[], mergeName: string): Observer {
    if (!observers || observers.length === 0)
        throw new Error('Cannot compose empty observer array');


    if (observers.length === 1) {
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

    validateMergeComposition(observers, o => !!o.cases);

    let composed = observers[0];
    for (let i = 1; i < observers.length; i++)
        composed = composeObservers(composed, observers[i]);


    const firstWithGenerator = observers.find(o => o.generator),
        lastWithOutSpec = observers.slice().reverse().find(o => o.outSpec),

        inSpec = firstWithGenerator?.inSpec,
        outSpec = lastWithOutSpec?.outSpec;

    let mergedType: ObserverType;
    if (composed.cases)
        mergedType = 'fold';
    else if (composed.generator)
        mergedType = 'unfold';
    else if (composed.getObserverTransform)
        mergedType = 'map';
    else
        mergedType = 'merge';


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
 */
export function createFoldObserver(
    name: string,
    cases: FoldCases,
    outSpec?: TypeSpec,
    inSpec?: TypeSpec
): Observer {
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
