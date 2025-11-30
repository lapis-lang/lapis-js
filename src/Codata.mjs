import {
    codataObservers
} from './Observer.mjs';

import {
    IsParameterizedInstance,
    ParentADTSymbol,
    TypeArgsSymbol,
    VariantDeclSymbol,
    TypeParamSymbol,
    callable,
    isCamelCase,
    isObjectLiteral,
    isConstructable
} from './utils.mjs';

/**
 * Codata Infrastructure
 * 
 * Codata is the categorical dual of data (initial algebras).
 * - Data is defined by constructors (how to build it)
 * - Codata is defined by observers/destructors (how to observe it)
 * 
 * Key differences from data:
 * - Data instances are frozen (immutable)
 * - Codata instances may have mutable state for lazy evaluation/memoization
 * - Data constructors are called once to create structure
 * - Codata observers may be called multiple times with different inputs
 */

// Symbol to mark codata instances
const CodataSymbol = Symbol('Codata');

// Symbol to store codata type reference
const CodataTypeSymbol = Symbol('CodataType');

// Symbol to store observer definitions on codata instances
const ObserverMapSymbol = Symbol('ObserverMap');

// Symbol to mark Self references for recursive codata
const SelfRefSymbol = Symbol('SelfRef');

// Symbol to store the seed value for codata instances
const SeedSymbol = Symbol('Seed');

// Symbol to store memoized values for lazy evaluation
const MemoSymbol = Symbol('Memo');

/**
 * Creates a Self reference for recursive codata.
 * Can be used directly as a field spec (Self) or called with type param (Self(T))
 */
function createSelf() {
    // Create the callable function first
    const fn = function (_typeParam) {
        // Calling Self(T) returns the same Self reference
        // In the future, this could track the type param for validation
        return fn;
    };

    // Add the SelfRef symbol marker
    (fn)[SelfRefSymbol] = true;

    return fn;
}

/**
 * Checks if a value is a SelfRef
 */
function isSelfRef(value) {
    return (typeof value === 'object' || typeof value === 'function') && value !== null && SelfRefSymbol in value;
}

/**
 * Checks if an observer spec is a simple observer (just a type, no in/out object)
 * Examples: head: T, value: Number
 */
function isSimpleObserver(spec) {
    // SelfRef is NOT a simple observer (it's a continuation)
    if (isSelfRef(spec)) {
        return false;
    }
    
    // Simple observer: just a type parameter or primitive constructor
    // NOT an object literal with 'in' and/or 'out' properties
    return !isObjectLiteral(spec) || (!('in' in spec) && !('out' in spec));
}

/**
 * Checks if an observer spec is a parametric observer (has in/out object)
 * Examples: { in: Number, out: String }, { out: Promise(String) }
 */
function isParametricObserver(spec) {
    return isObjectLiteral(spec) && ('in' in spec || 'out' in spec);
}

/**
 * Defines a new codata type with the given observers.
 * Codata is defined by how it can be observed (destructors), not how it's constructed.
 * 
 * Syntax: codata(({ Self, T }) => ({ observers }))
 * 
 * Observer types:
 * - Simple: head: T - Returns a value of type T
 * - Parametric: { in: Input, out: Output } - Takes input, returns output
 * - Continuation: tail: Self(T) - Returns next codata instance
 * 
 * @param {Function} declFn - Callback function that receives { Self, ...typeParams } and returns observer definitions
 * @returns {Function} Codata constructor function
 * 
 * @example
 * const Stream = codata(({ Self, T }) => ({
 *   head: T,
 *   tail: Self(T)
 * }));
 */
export function codata(declFn) {
    if (typeof declFn !== 'function') {
        throw new TypeError(
            'codata() requires a callback function: codata(({ Self, T }) => ({ observers }))'
        );
    }

    // Extract type parameter names from callback function
    let typeParamNames = [];
    const fnStr = declFn.toString();
    
    // Match destructured parameters: ({ Self, T, U }) =>
    const destructuredMatch = fnStr.match(/^\s*(?:function\s*[^(]*)?\(\s*\{\s*([^}]+)\s*\}/);

    if (destructuredMatch) {
        const params = destructuredMatch[1];
        // Parse parameter names: "Self, T, U" or "Self, ItemType, ValueType"
        typeParamNames = params
            .split(',')
            .map(p => p.trim())
            .filter(p => p && p !== 'Self'); // Exclude Self as it's not a type param
    }

    // Create the codata constructor function
    function createCodata(typeArgs, parentCodata = null) {
        // Create the base Codata class
        const BaseClass = parentCodata || class Codata {
            // Allow subclasses to instantiate
        };

        // For parameterized instances, create a subclass
        let CodataClass;
        if (typeArgs && parentCodata) {
            CodataClass = class extends BaseClass { };
            CodataClass[IsParameterizedInstance] = true;
            CodataClass[ParentADTSymbol] = parentCodata;
            CodataClass[TypeArgsSymbol] = typeArgs;
        } else {
            CodataClass = BaseClass;
        }

        const result = CodataClass;

        // Create Self reference
        const Self = createSelf();

        // Create type parameter objects dynamically
        const typeParamObjects = {};
        for (const paramName of typeParamNames) {
            typeParamObjects[paramName] = {
                [TypeParamSymbol]: paramName
            };
        }

        // Call the declaration function to get observer definitions
        const observerDecl = declFn({ Self, ...typeParamObjects });

        // Validate observer declarations
        if (!observerDecl || typeof observerDecl !== 'object') {
            throw new TypeError(
                'codata() callback must return an object with observer definitions'
            );
        }

        // Validate observer names (must be camelCase)
        for (const observerName of Object.keys(observerDecl)) {
            if (!isCamelCase(observerName)) {
                throw new TypeError(
                    `Observer '${observerName}' must be camelCase (start with lowercase letter, no underscore prefix)`
                );
            }
        }

        // Store observer definitions in registry
        const observerMap = new Map();
        
        for (const [observerName, observerSpec] of Object.entries(observerDecl)) {
            // Classify observer type
            const isSimple = isSimpleObserver(observerSpec);
            const isParametric = isParametricObserver(observerSpec);
            const isContinuation = isSelfRef(observerSpec);

            observerMap.set(observerName, {
                name: observerName,
                spec: observerSpec,
                isSimple,
                isParametric,
                isContinuation
            });
        }

        // Store observer declaration for later use
        result[VariantDeclSymbol] = observerDecl;

        // Mark as codata type
        result[CodataSymbol] = true;

        // Return both the class and the observer map for external registration
        return { class: result, observers: observerMap };
    }

    // For callback-style codata, return a callable class
    const { class: codata, observers: observerMap } = createCodata();

    // Add static _call method for parameterization
    codata._call = function (...typeArgs) {
        if (typeArgs.length === 0) {
            return callableCodata;
        }

        // Convert arguments to type args object
        let typeArgsObj;
        if (typeArgs.length === 1 && typeof typeArgs[0] === 'object' && typeArgs[0] !== null && !isConstructable(typeArgs[0])) {
            // Object style: Stream({ T: Number })
            typeArgsObj = typeArgs[0];
        } else {
            // Positional style: Stream(Number)
            typeArgsObj = {};
            typeParamNames.forEach((paramName, index) => {
                if (index < typeArgs.length) {
                    typeArgsObj[paramName] = typeArgs[index];
                }
            });
        }

        const { class: parameterizedCodata } = createCodata(typeArgsObj, callableCodata);
        return callable(parameterizedCodata);
    };

    const callableCodata = callable(codata);

    // Store observer map in registry keyed by the callable proxy
    // This allows codataObservers.get(Point) to work where Point is the returned value
    codataObservers.set(callableCodata, observerMap);

    return callableCodata;
}