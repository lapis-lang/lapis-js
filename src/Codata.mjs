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
    isPascalCase,
    isObjectLiteral,
    isConstructable
} from './utils.mjs';

import {
    validateTypeSpec,
    validateSpecGuard,
    isSelfRef as isSelfRefOps
} from './operations.mjs';

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
 * WeakMap to store state for each codata instance.
 * Maps instance -> { seed, memo: Map }
 * - seed: The seed value used to generate this codata instance
 * - memo: Map for memoizing Self continuations (not simple observers)
 */
const codataInstanceState = new WeakMap();

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

        // Validate observer and operation names
        for (const [observerName, observerSpec] of Object.entries(observerDecl)) {
            // Check if this is an unfold operation
            const isUnfoldOp = isObjectLiteral(observerSpec) && observerSpec.op === 'unfold';
            
            if (isUnfoldOp) {
                // Unfold operations must be PascalCase
                if (!isPascalCase(observerName)) {
                    throw new TypeError(
                        `Unfold operation '${observerName}' must be PascalCase (start with uppercase letter)`
                    );
                }
            } else {
                // Observers must be camelCase
                if (!isCamelCase(observerName)) {
                    throw new TypeError(
                        `Observer '${observerName}' must be camelCase (start with lowercase letter, no underscore prefix)`
                    );
                }
            }
        }

        // Store observer definitions in registry
        const observerMap = new Map();

        for (const [observerName, observerSpec] of Object.entries(observerDecl)) {
            // Skip unfold operations - they are processed separately
            if (isObjectLiteral(observerSpec) && observerSpec.op === 'unfold') {
                continue;
            }
            
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

        // Return the class, observer map, and original observer decl for unfold processing
        return { class: result, observers: observerMap, observerDecl };
    }

    // For callback-style codata, return a callable class
    const { class: codata, observers: observerMap, observerDecl } = createCodata();

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

    // Process inline unfold operations (declarative syntax)
    const unfoldDeclarations = [];
    for (const [observerName, observerSpec] of Object.entries(observerDecl)) {
        if (isObjectLiteral(observerSpec) && observerSpec.op === 'unfold') {
            unfoldDeclarations.push({ name: observerName, spec: observerSpec });
        }
    }

    // Register inline unfold operations
    for (const { name, spec } of unfoldDeclarations) {
        const { spec: opSpec, op, ...handlers } = spec;
        addUnfoldOperation(callableCodata, observerMap, name, opSpec, handlers);
    }

    return callableCodata;
}

/**
 * Add an unfold operation to a codata type.
 * Unfold (anamorphism) generates codata instances from seed values.
 * 
 * This is called internally during codata creation when unfold operations
 * are declared inline in the observer specification.
 * 
 * @param {*} CodataType - The codata type to add the operation to
 * @param {Map} observerMap - Map of observer definitions
 * @param {string} name - PascalCase name for the static factory method
 * @param {Function|Object} spec - Spec callback (Codata) => ({ in?, out }) or object { in?, out }
 * @param {Object} handlers - Map of observer names to handler functions
 * @returns {*} The codata type (for chaining)
 * 
 * @example
 * // Unfold operations are declared inline:
 * const Stream = codata(({ Self, T }) => ({
 *   head: T,
 *   tail: Self(T),
 *   From: {
 *     op: 'unfold',
 *     spec: { in: Number, out: Self },
 *     head: (n) => n,
 *     tail: (n) => n + 1
 *   }
 * }));
 */
function addUnfoldOperation(CodataType, observerMap, name, spec, handlers) {
    // Validate name is PascalCase (unfold creates static factory methods)
    if (!isPascalCase(name)) {
        throw new TypeError(
            `Unfold operation '${name}' must be PascalCase (static factory method)`
        );
    }

    // Parse and validate spec
    let parsedSpec;
    if (typeof spec === 'function') {
        // Callback form: (Codata) => ({ in: Type, out: Codata })
        const specResult = spec(CodataType);
        if (!specResult || typeof specResult !== 'object') {
            throw new TypeError(
                `Unfold operation '${name}' spec callback must return an object with optional 'in' and 'out' properties`
            );
        }
        parsedSpec = specResult;
    } else if (isObjectLiteral(spec)) {
        // Object literal form: { in: Type, out: Codata }
        parsedSpec = spec;
    } else {
        throw new TypeError(
            `Unfold operation '${name}' spec must be a function or object literal`
        );
    }

    // Validate spec guards (prevent Function as guard)
    if ('in' in parsedSpec) {
        validateSpecGuard(parsedSpec.in, 'in', name);
    }
    if ('out' in parsedSpec) {
        validateSpecGuard(parsedSpec.out, 'out', name);
    }

    // Validate handlers is an object
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError(
            `Unfold operation '${name}' requires handlers object mapping observer names to functions`
        );
    }

    // Validate that all observers have handlers
    for (const observerName of observerMap.keys()) {
        if (!(observerName in handlers)) {
            throw new Error(
                `Unfold operation '${name}' missing handler for observer '${observerName}'`
            );
        }
    }

    // Validate that handlers are functions
    for (const [observerName, handler] of Object.entries(handlers)) {
        if (typeof handler !== 'function') {
            throw new TypeError(
                `Handler for observer '${observerName}' in unfold '${name}' must be a function, got ${typeof handler}`
            );
        }
    }

    // Validate that all handlers correspond to actual observers (catch typos)
    for (const handlerName of Object.keys(handlers)) {
        if (!observerMap.has(handlerName)) {
            throw new Error(
                `Unfold operation '${name}' has handler '${handlerName}' which does not correspond to any observer. ` +
                `Valid observers are: ${Array.from(observerMap.keys()).join(', ')}`
            );
        }
    }

    // Create the static factory method or property (UAP)
    const hasInput = 'in' in parsedSpec && parsedSpec.in !== undefined;
    
    if (hasInput) {
        // Parameterized unfold: create as method
        CodataType[name] = function (seed) {
            // Validate seed against spec.in
            validateTypeSpec(seed, parsedSpec.in, name, 'input of type');

            // Create and return Proxy-wrapped codata instance
            return createCodataInstance(CodataType, observerMap, seed, handlers);
        };
    } else {
        // Parameterless unfold: create as property (getter) per UAP
        Object.defineProperty(CodataType, name, {
            get() {
                // Create and return Proxy-wrapped codata instance with undefined seed
                return createCodataInstance(CodataType, observerMap, undefined, handlers);
            },
            enumerable: true,
            configurable: true
        });
    }

    // Return CodataType for chaining
    return CodataType;
}

/**
 * Create a codata instance with Proxy-based lazy evaluation.
 * 
 * The Proxy intercepts property access to observers and:
 * - For simple observers: Recompute on each access (no memoization)
 * - For parametric observers: Return a function that computes the result
 * - For Self continuations: Memoize the codata instance (return same on repeated access)
 * 
 * @param {*} CodataType - The codata class/type
 * @param {Map} observerMap - Map of observer definitions
 * @param {*} seed - Seed value used to generate observer values
 * @param {Object} unfoldHandlers - Map of observer names to unfold handler functions
 * @returns {Proxy} Proxy-wrapped codata instance with lazy evaluation
 */
function createCodataInstance(CodataType, observerMap, seed, unfoldHandlers) {
    // Create base instance (plain object to be wrapped by Proxy)
    const instance = Object.create(CodataType.prototype || Object.prototype);

    // Mark as codata instance
    instance[CodataSymbol] = true;
    instance[CodataTypeSymbol] = CodataType;
    instance[ObserverMapSymbol] = observerMap;
    instance[SeedSymbol] = seed;

    // Initialize instance state in WeakMap
    codataInstanceState.set(instance, {
        seed,
        memo: new Map()  // For memoizing Self continuations
    });

    // Create Proxy with lazy evaluation
    const proxy = new Proxy(instance, {
        get(target, prop, receiver) {
            // Handle symbol properties directly
            if (typeof prop === 'symbol') {
                return Reflect.get(target, prop, receiver);
            }

            // Handle standard object properties
            if (prop === 'constructor' || prop === 'toString' || prop === 'valueOf') {
                return Reflect.get(target, prop, receiver);
            }

            // Get observer definition
            const observer = observerMap.get(prop);
            if (!observer) {
                // Not an observer - return undefined or default behavior
                return Reflect.get(target, prop, receiver);
            }

            // Get instance state
            const state = codataInstanceState.get(target);
            if (!state) {
                throw new Error(`Codata instance state not found for property '${prop}'`);
            }

            // Get unfold handler for this observer
            const handler = unfoldHandlers?.[prop];
            if (!handler) {
                throw new Error(
                    `No unfold handler defined for observer '${prop}'. ` +
                    `Define an unfold operation (e.g., 'From: { op: \"unfold\", spec: {...}, ...handlers }') to construct codata instances.`
                );
            }

            // Handle different observer types
            if (observer.isContinuation) {
                // Self continuation - memoize the result
                if (state.memo.has(prop)) {
                    return state.memo.get(prop);
                }

                // Compute continuation: handler returns next seed value
                const nextSeed = handler(state.seed);

                // Create next codata instance with same type and handlers
                const nextInstance = createCodataInstance(
                    CodataType,
                    observerMap,
                    nextSeed,
                    unfoldHandlers
                );

                // Memoize and return
                state.memo.set(prop, nextInstance);
                return nextInstance;

            } else if (observer.isParametric) {
                // Parametric observer - return a function that takes input and computes output
                // Check if the output type is Self (continuation)
                const outputIsSelf = isSelfRef(observer.spec.out);

                // Memoize the function wrapper (but not the results of calling it)
                if (state.memo.has(prop)) {
                    return state.memo.get(prop);
                }

                const observerFn = function (...args) {
                    // Handler for parametric observer: (seed) => (param) => value
                    const fn = handler(state.seed);
                    if (typeof fn !== 'function') {
                        throw new Error(
                            `Parametric observer '${prop}' handler must return a function, got ${typeof fn}`
                        );
                    }
                    const result = fn(...args);

                    // If output type is Self, create a new codata instance from the result (next seed)
                    if (outputIsSelf) {
                        return createCodataInstance(
                            CodataType,
                            observerMap,
                            result,  // result is the next seed
                            unfoldHandlers
                        );
                    }

                    return result;
                };

                // Memoize the function wrapper (not the call results)
                state.memo.set(prop, observerFn);
                return observerFn;

            } else if (observer.isSimple) {
                // Simple observer - recompute on each access (no memoization)
                return handler(state.seed);
            } else {
                throw new Error(`Unknown observer type for '${prop}'`);
            }
        },

        // Support property existence checks (in operator, hasOwnProperty)
        has(target, prop) {
            // Check if it's an observer
            if (observerMap.has(prop)) {
                return true;
            }
            // Fall back to default behavior for other properties
            return Reflect.has(target, prop);
        },

        // Prevent setting properties on codata instances
        set(target, prop, value) {
            throw new Error(
                `Cannot set property '${String(prop)}' on codata instance. Codata instances are immutable.`
            );
        }
    });

    return proxy;
}