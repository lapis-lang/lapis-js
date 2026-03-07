import { behaviorObservers } from './Observer.mjs';

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
    isConstructable,
    hasInputSpec
} from './utils.mjs';

import {
    validateTypeSpec,
    validateSpecGuard,
    isSelfRef,
    SelfRefSymbol,
    op,
    spec,
    operations,
    extend
} from './operations.mjs';

/**
 * Behavior Infrastructure
 * 
 * Behavior is the categorical dual of data (initial algebras).
 * - Data is defined by constructors (how to build it)
 * - Behavior is defined by observers/destructors (how to observe it)
 * 
 * Key differences from data:
 * - Data instances are frozen (immutable)
 * - Behavior instances may have mutable state for lazy evaluation/memoization
 * - Data constructors are called once to create structure
 * - Behavior observers may be called multiple times with different inputs
 */

// Symbol to mark behavior instances
const BehaviorSymbol = Symbol('Behavior');

// Symbol to store behavior type reference
const BehaviorTypeSymbol = Symbol('BehaviorType');

// Symbol to store registered fold operations on a behavior type
const FoldOpsSymbol = Symbol('FoldOps');

// Symbol to store registered map operations on a behavior type
const MapOpsSymbol = Symbol('MapOps');

// Symbol to store raw unfold handler sets on a behavior type (for inheritance)
const UnfoldOpsSymbol = Symbol('UnfoldOps');

/**
 * WeakMap to store state for each behavior instance.
 * Maps instance -> { seed, memo: Map }
 * - seed: The seed value used to generate this behavior instance
 * - memo: Map for memoizing Self continuations (not simple observers)
 */
const behaviorInstanceState = new WeakMap();

/**
 * Creates a Self reference for recursive behavior.
 * Can be used directly as a field spec (Self) or called with type param (Self(T))
 */
function createSelf() {
    // Create the callable function first
    const fn = function (typeParam) { // eslint-disable-line no-unused-vars
        // Calling Self(T) returns the same Self reference.
        // typeParam is accepted for API symmetry and future type-tracking validation.
        return fn;
    };

    // Add the SelfRef symbol marker
    (fn)[SelfRefSymbol] = true;

    return fn;
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
 * Returns true when two spec guards are considered equivalent.
 * SelfRef instances are per-behavior()-call, so any two SelfRef values
 * compare as equal regardless of object identity.
 */
function specsCompatible(a, b) {
    if (isSelfRef(a) && isSelfRef(b)) return true;
    return a === b;
}

/**
 * Ensures `target` owns a Map at `symbol` (never inherited via prototype chain).
 * Returns the map, creating it if necessary.
 */
function ensureOwnMap(target, symbol) {
    if (!Object.hasOwn(target, symbol)) target[symbol] = new Map();
    return target[symbol];
}

/**
 * Defines a new behavior type with the given observers.
 * Behavior is defined by how it can be observed (destructors), not how it's constructed.
 * 
 * Syntax: behavior(({ Self, T }) => ({ observers }))
 * 
 * Observer types:
 * - Simple: head: T - Returns a value of type T
 * - Parametric: { in: Input, out: Output } - Takes input, returns output
 * - Continuation: tail: Self(T) - Returns next behavior instance
 * 
 * @param {Function} declFn - Callback function that receives { Self, ...typeParams } and returns observer definitions
 * @returns {Function} Behavior constructor function
 * 
 * @example
 * const Stream = behavior(({ Self, T }) => ({
 *   head: T,
 *   tail: Self(T)
 * }));
 */
export function behavior(declFn) {
    if (typeof declFn !== 'function') {
        throw new TypeError(
            'behavior() requires a callback function: behavior(({ Self, T }) => ({ observers }))'
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

    // Create the behavior constructor function
    // paramParent: non-null when constructing a parameterized instance (e.g. Stream(Number))
    function createBehavior(typeArgs, paramParent = null) {
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
                'behavior() callback must return an object with observer definitions'
            );
        }

        // Resolve [extend] parent behavior (inheritance), distinct from parameterization parent
        const parentBehaviorType = observerDecl[extend] ?? null;
        if (parentBehaviorType !== null) {
            if (!behaviorObservers.has(parentBehaviorType)) {
                throw new TypeError(
                    `[extend] must reference a behavior type created with behavior(), got ${String(parentBehaviorType)}`
                );
            }
        }

        // Determine the base class for the prototype chain
        let BaseClass;
        if (typeArgs && paramParent) {
            // Parameterized instance: subclass of the callable proxy
            BaseClass = class extends paramParent { };
            BaseClass[IsParameterizedInstance] = true;
            BaseClass[ParentADTSymbol] = paramParent;
            BaseClass[TypeArgsSymbol] = typeArgs;
        } else if (parentBehaviorType) {
            // Behavior inheritance: subclass of parent behavior (enables instanceof)
            BaseClass = class extends parentBehaviorType { };
        } else {
            BaseClass = class Behavior { };
        }

        const result = BaseClass;

        // Single pass: validate names, build observerMap, and bucket operation declarations.
        // Parent observers seed the map first so child observers can overlay them.
        const observerMap = new Map();
        const declarations = { unfold: [], fold: [], map: [], merge: [] };

        if (parentBehaviorType) {
            for (const [name, obs] of behaviorObservers.get(parentBehaviorType)) {
                observerMap.set(name, obs);
            }
        }

        for (const [entryName, entrySpec] of Object.entries(observerDecl)) {
            const opKind = isObjectLiteral(entrySpec) ? entrySpec[op] : null;
            if (opKind === 'unfold') {
                if (!isPascalCase(entryName)) {
                    throw new TypeError(
                        `Unfold operation '${entryName}' must be PascalCase (start with uppercase letter)`
                    );
                }
                declarations.unfold.push({ name: entryName, spec: entrySpec });
            } else if (opKind === 'fold') {
                if (!isCamelCase(entryName)) {
                    throw new TypeError(`Fold operation '${entryName}' must be camelCase`);
                }
                declarations.fold.push({ name: entryName, spec: entrySpec });
            } else if (opKind === 'map') {
                if (!isCamelCase(entryName)) {
                    throw new TypeError(`Map operation '${entryName}' must be camelCase`);
                }
                declarations.map.push({ name: entryName, spec: entrySpec });
            } else if (opKind === 'merge') {
                // Merge naming validated later (depends on referenced operations)
                declarations.merge.push({ name: entryName, spec: entrySpec });
            } else {
                // Plain observer
                if (!isCamelCase(entryName)) {
                    throw new TypeError(
                        `Observer '${entryName}' must be camelCase (start with lowercase letter, no underscore prefix)`
                    );
                }
                observerMap.set(entryName, {
                    name: entryName,
                    spec: entrySpec,
                    isSimple: isSimpleObserver(entrySpec),
                    isParametric: isParametricObserver(entrySpec),
                    isContinuation: isSelfRef(entrySpec)
                });
            }
        }

        // Store observer declaration for later use
        result[VariantDeclSymbol] = observerDecl;

        // Mark as behavior type
        result[BehaviorSymbol] = true;

        // Return the class, observer map, observer decl, inheritance parent, and operation buckets
        return { class: result, observers: observerMap, observerDecl, parentBehaviorType, declarations };
    }

    // For callback-style behavior, return a callable class
    const { class: behaviorClass, observers: observerMap, parentBehaviorType, declarations } = createBehavior();

    // Add static _call method for parameterization
    behaviorClass._call = function (...typeArgs) {
        if (typeArgs.length === 0) {
            return callableBehavior;
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

        const { class: parameterizedBehavior } = createBehavior(typeArgsObj, callableBehavior);
        return callable(parameterizedBehavior);
    };

    const callableBehavior = callable(behaviorClass);

    // Store observer map in registry keyed by the callable proxy
    // This allows behaviorObservers.get(Point) to work where Point is the returned value
    behaviorObservers.set(callableBehavior, observerMap);

    // LSP Enforcement: validate spec invariance for overridden unfolds before installation
    if (parentBehaviorType) {
        const parentUnfoldOpsForCheck = parentBehaviorType[UnfoldOpsSymbol];
        if (parentUnfoldOpsForCheck) {
            for (const { name, spec: entrySpec } of declarations.unfold) {
                const parentEntry = parentUnfoldOpsForCheck.get(name);
                if (!parentEntry) continue; // new op, not an override
                const { [spec]: childOpSpec = {} } = entrySpec;
                const childParsedSpec = typeof childOpSpec === 'function'
                    ? childOpSpec(callableBehavior)
                    : (childOpSpec ?? {});
                const parentSpec = parentEntry.spec;
                const parentHasIn = 'in' in parentSpec;
                const parentHasOut = 'out' in parentSpec;
                const childHasIn = 'in' in childParsedSpec;
                const childHasOut = 'out' in childParsedSpec;

                if (!parentHasIn && childHasIn)
                    throw new Error(`Cannot change unfold '${name}' from parameterless to parameterized when overriding`);
                if (childHasIn && parentHasIn && !specsCompatible(childParsedSpec.in, parentSpec.in))
                    throw new Error(`Cannot change unfold '${name}' input specification when overriding`);
                if (childHasOut && parentHasOut && !specsCompatible(childParsedSpec.out, parentSpec.out))
                    throw new Error(`Cannot change unfold '${name}' output specification when overriding`);
            }
        }
    }

    // Register inline operations (declarations already bucketed by createBehavior)
    const parentUnfoldOpsForMerge = parentBehaviorType?.[UnfoldOpsSymbol];
    for (const { name, spec: entrySpec } of declarations.unfold) {
        const { [op]: _op, [spec]: opSpec, ...handlers } = entrySpec;
        // Inherit missing in/out from parent spec when overriding
        const parentEntry = parentUnfoldOpsForMerge?.get(name);
        const mergedSpec = parentEntry
            ? { ...parentEntry.spec, ...(opSpec ?? {}) }
            : opSpec;
        addUnfoldOperation(callableBehavior, observerMap, name, mergedSpec, handlers);
    }

    // Register inline fold operations
    for (const { name, spec: entrySpec } of declarations.fold) {
        const { [op]: _op, [spec]: opSpec = {}, _: handler } = entrySpec;
        addFoldOperation(callableBehavior, observerMap, name, opSpec, handler);
    }

    // Register inline map operations
    for (const { name, spec: entrySpec } of declarations.map) {
        const { [op]: _op, ...transforms } = entrySpec;
        addMapOperation(callableBehavior, observerMap, name, transforms);
    }

    // Register inline merge operations — after fold/map so refs resolve
    for (const { name, spec: entrySpec } of declarations.merge) {
        const { [op]: _op, [operations]: operationsList } = entrySpec;
        addMergeOperation(callableBehavior, observerMap, name, operationsList);
    }

    // Inherit parent operations
    if (parentBehaviorType) {
        // Inherit fold operations not declared by the child.
        // Fold ops are resolved in the instance Proxy's get trap via FoldOpsSymbol — no
        // extra install step needed beyond populating the Map on callableBehavior.
        const parentFoldOps = parentBehaviorType[FoldOpsSymbol];
        if (parentFoldOps) {
            const childFoldOps = ensureOwnMap(callableBehavior, FoldOpsSymbol);
            for (const [opName, op] of parentFoldOps) {
                if (!childFoldOps.has(opName)) childFoldOps.set(opName, op);
            }
        }

        // Inherit map operations not declared by the child.
        const parentMapOps = parentBehaviorType[MapOpsSymbol];
        if (parentMapOps) {
            const childMapOps = ensureOwnMap(callableBehavior, MapOpsSymbol);
            for (const [opName, op] of parentMapOps) {
                if (!childMapOps.has(opName)) childMapOps.set(opName, op);
            }
        }

        // Inherit unfold operations whose existing handlers cover all merged observers.
        // A parent unfold can only be reused on a child that adds no new observers
        // (since its handlers were created for the parent's observerMap).
        const parentUnfoldOps = parentBehaviorType[UnfoldOpsSymbol];
        if (parentUnfoldOps) {
            const childUnfoldNames = new Set(declarations.unfold.map(d => d.name));
            for (const [opName, { spec: opSpec, handlers }] of parentUnfoldOps) {
                if (childUnfoldNames.has(opName)) continue; // child overrides (spec validated above)
                const allCovered = [...observerMap.keys()].every(k => k in handlers);
                if (allCovered) {
                    addUnfoldOperation(callableBehavior, observerMap, opName, opSpec, handlers);
                }
            }
        }
    }

    return callableBehavior;
}

/**
 * Add an unfold operation to a behavior type.
 * Unfold (anamorphism) generates behavior instances from seed values.
 * 
 * This is called internally during behavior creation when unfold operations
 * are declared inline in the observer specification.
 * 
 * @param {*} BehaviorType - The behavior type to add the operation to
 * @param {Map} observerMap - Map of observer definitions
 * @param {string} name - PascalCase name for the static factory method
 * @param {Function|Object} spec - Spec callback (BehaviorType) => ({ in?, out }) or object { in?, out }
 * @param {Object} handlers - Map of observer names to handler functions
 * @returns {*} The behavior type (for chaining)
 * 
 * @example
 * // Unfold operations are declared inline:
 * const Stream = behavior(({ Self, T }) => ({
 *   head: T,
 *   tail: Self(T),
 *   From: {
 *     [op]: 'unfold',
 *     [spec]: { in: Number, out: Self },
 *     head: (n) => n,
 *     tail: (n) => n + 1
 *   }
 * }));
 */
function addUnfoldOperation(BehaviorType, observerMap, name, spec, handlers) {
    // Validate name is PascalCase (unfold creates static factory methods)
    if (!isPascalCase(name)) {
        throw new TypeError(
            `Unfold operation '${name}' must be PascalCase (static factory method)`
        );
    }

    // Parse and validate spec
    let parsedSpec;
    if (typeof spec === 'function') {
        // Callback form: (BehaviorType) => ({ in: Type, out: BehaviorType })
        const specResult = spec(BehaviorType);
        if (!specResult || typeof specResult !== 'object') {
            throw new TypeError(
                `Unfold operation '${name}' spec callback must return an object with optional 'in' and 'out' properties`
            );
        }
        parsedSpec = specResult;
    } else if (isObjectLiteral(spec)) {
        // Object literal form: { in: Type, out: BehaviorType }
        parsedSpec = spec;
    } else if (spec === undefined || spec === null) {
        // spec is optional — absence means no input and no declared output type
        parsedSpec = {};
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
    const hasInput = hasInputSpec(parsedSpec);
    const makeInstance = (seed) => createBehaviorInstance(BehaviorType, observerMap, seed, handlers);

    if (hasInput) {
        // Parameterized unfold: create as method
        BehaviorType[name] = function (seed) {
            // Validate seed against spec.in
            validateTypeSpec(seed, parsedSpec.in, name, 'input of type');

            // Create and return Proxy-wrapped behavior instance
            return makeInstance(seed);
        };
    } else {
        // Parameterless unfold: create as property (getter) per UAP
        Object.defineProperty(BehaviorType, name, {
            get() {
                // Create and return Proxy-wrapped behavior instance with undefined seed
                return makeInstance(undefined);
            },
            enumerable: true,
            configurable: true
        });
    }

    // Store raw spec + handlers for potential inheritance by child behaviors.
    // ensureOwnMap guarantees a fresh own Map so child types never mutate a parent's Map.
    ensureOwnMap(BehaviorType, UnfoldOpsSymbol).set(name, { spec: parsedSpec, handlers });

    // Return BehaviorType for chaining
    return BehaviorType;
}

/**
 * Execute a fold operation on a behavior instance (top-down catamorphism).
 *
 * Behavior fold is the dual of data fold:
 * - Data fold: bottom-up, pre-folds recursive fields, dispatches per variant (sum type)
 * - Behavior fold: top-down, exposes continuations as fold functions, single handler (product type)
 *
 * @param {Proxy} proxyInstance - The behavior instance (accessed through its Proxy)
 * @param {Map} observerMap - Observer definitions for the type
 * @param {Function} handler - The `_` fold handler `(observations, ...params) => result`
 * @param {Array} params - Parameters passed to this fold invocation
 * @returns The fold result
 */
function executeFold(proxyInstance, observerMap, handler, params) {
    const observations = {};
    for (const [name, obs] of observerMap) {
        if (obs.isContinuation) {
            // Continuation becomes a fold-function: (...nextParams) => foldResult
            // Accessing proxyInstance[name] lazily evaluates and memoizes the next instance.
            observations[name] = (...nextParams) => {
                const nextInstance = proxyInstance[name];
                return executeFold(nextInstance, observerMap, handler, nextParams);
            };
        } else {
            // Simple or parametric: access the observed value / function through the proxy
            observations[name] = proxyInstance[name];
        }
    }
    return handler(observations, ...params);
}

/**
 * Create a new set of unfold handlers that apply a map transform to matching observers.
 * Used by map operations to create lazily-transformed behavior instances.
 *
 * When the new handlers are passed to createBehaviorInstance, continuations will
 * automatically propagate the transform because createBehaviorInstance passes the
 * same handlers to all nested continuation instances.
 *
 * @param {Object} originalHandlers - The original unfold handler functions
 * @param {Map} observerMap - Observer definitions
 * @param {string} typeParam - Type parameter name being transformed (e.g. 'T')
 * @param {Function} transformFn - Transform applied to matching observer values
 * @returns {Object} New handler map with transform applied
 */
function createMappedHandlers(originalHandlers, observerMap, typeParam, transformFn) {
    const mappedHandlers = {};
    for (const [name, obs] of observerMap) {
        const origHandler = originalHandlers?.[name];
        if (!origHandler) continue;

        if (obs.isContinuation) {
            // Continuation: handler returns next seed unchanged.
            // The NEXT instance will also receive mappedHandlers (via createBehaviorInstance),
            // so the transform propagates indefinitely without explicit recursion here.
            mappedHandlers[name] = origHandler;

        } else if (obs.isSimple && obs.spec?.[TypeParamSymbol] === typeParam) {
            // Simple observer whose return type matches the mapped type param
            mappedHandlers[name] = (seed) => transformFn(origHandler(seed));

        } else if (obs.isParametric && obs.spec?.out?.[TypeParamSymbol] === typeParam && !isSelfRef(obs.spec?.out)) {
            // Parametric observer whose output type matches — wrap the returned function
            mappedHandlers[name] = (seed) => {
                const fn = origHandler(seed);
                return (...args) => transformFn(fn(...args));
            };

        } else {
            mappedHandlers[name] = origHandler;
        }
    }
    return mappedHandlers;
}

/**
 * Register a fold operation on a behavior type.
 * Fold operations are installed as instance methods (parameterized) or getters (parameterless).
 *
 * @param {*} BehaviorType - The behavior type (callable proxy)
 * @param {Map} observerMap - Observer definitions
 * @param {string} name - camelCase operation name
 * @param {Object} spec - { in?: Type, out?: Type }
 * @param {Function} handler - The single `_` handler: (observations, ...params) => result
 */
function addFoldOperation(BehaviorType, observerMap, name, spec, handler) {
    if (!isCamelCase(name)) {
        throw new TypeError(`Fold operation '${name}' must be camelCase`);
    }
    if (typeof handler !== 'function') {
        throw new TypeError(`Fold operation '${name}' requires a '_' handler function`);
    }

    const parsedSpec = spec || {};
    ensureOwnMap(BehaviorType, FoldOpsSymbol).set(name, {
        spec: parsedSpec,
        handler,
        // Use handler arity to determine getter vs method, consistent with Data fold.
        // spec.in is optional and used for documentation/type hints only.
        hasInput: handler.length > 1
    });
}

/**
 * Register a map operation on a behavior type.
 * Map operations lazily transform type-parameter-typed observers.
 *
 * @param {*} BehaviorType - The behavior type (callable proxy)
 * @param {Map} observerMap - Observer definitions
 * @param {string} name - camelCase operation name
 * @param {Object} transforms - { [typeParamName]: transformFn }
 */
function addMapOperation(BehaviorType, observerMap, name, transforms) {
    if (!isCamelCase(name)) {
        throw new TypeError(`Map operation '${name}' must be camelCase`);
    }

    // Extract the type param name and transform function (only one per map declaration)
    const typeParamNames = Object.keys(transforms);
    if (typeParamNames.length !== 1) {
        throw new TypeError(
            `Map operation '${name}' must specify exactly one type parameter transform (got: ${typeParamNames.join(', ')})`
        );
    }
    const typeParam = typeParamNames[0];
    const transformFn = transforms[typeParam];
    if (typeof transformFn !== 'function') {
        throw new TypeError(`Map operation '${name}' transform for '${typeParam}' must be a function`);
    }

    // Arity: transform(value) → getter; transform(value, ...extraArgs) → method
    const isGetter = transformFn.length <= 1;

    ensureOwnMap(BehaviorType, MapOpsSymbol).set(name, { typeParam, transformFn, isGetter });
}

/**
 * Register a merge operation on a behavior type.
 * Merge composes a sequence of unfold/map/fold operations (hylomorphism / deforestation).
 *
 * Naming convention:
 * - PascalCase when the merge includes an unfold (static factory)
 * - camelCase when it is fold/map only (instance method/getter)
 *
 * @param {*} BehaviorType - The behavior type
 * @param {Map} observerMap - Observer definitions
 * @param {string} name - Operation name
 * @param {string[]} operationNames - Ordered list of operation names to compose
 */
function addMergeOperation(BehaviorType, observerMap, name, operationNames) {
    if (!Array.isArray(operationNames) || operationNames.length === 0) {
        throw new TypeError(`Merge operation '${name}' requires a non-empty 'operations' array`);
    }

    // Classify each referenced operation
    const unfoldNames = operationNames.filter(op => {
        const desc = Object.getOwnPropertyDescriptor(BehaviorType, op);
        return desc !== undefined; // Static properties are unfolds
    });
    const foldNames = operationNames.filter(op => BehaviorType[FoldOpsSymbol]?.has(op));
    const mapNames = operationNames.filter(op => BehaviorType[MapOpsSymbol]?.has(op));

    // Validate every referenced operation name was actually found
    for (const op of operationNames) {
        const known = unfoldNames.includes(op) || foldNames.includes(op) || mapNames.includes(op);
        if (!known) {
            throw new TypeError(`Merge operation '${name}' references unknown operation '${op}'`);
        }
    }

    const hasUnfold = unfoldNames.length > 0;
    const foldName = foldNames[0];
    const foldOp = foldName ? BehaviorType[FoldOpsSymbol].get(foldName) : null;

    // Validate naming
    if (hasUnfold && !isPascalCase(name)) {
        throw new TypeError(`Merge operation '${name}' includes an unfold and must be PascalCase`);
    }
    if (!hasUnfold && !isCamelCase(name)) {
        throw new TypeError(`Merge operation '${name}' (no unfold) must be camelCase`);
    }

    if (hasUnfold) {
        // Static merge: BehaviorType.Name(seed, ...foldParams)
        const unfoldName = unfoldNames[0];
        const unfoldDescriptor = Object.getOwnPropertyDescriptor(BehaviorType, unfoldName);
        const unfoldIsGetter = unfoldDescriptor?.get !== undefined;

        if (!unfoldIsGetter) {
            BehaviorType[name] = function (seed, ...rest) {
                let instance = BehaviorType[unfoldName](seed);
                for (const mapName of mapNames) {
                    const mapOp = BehaviorType[MapOpsSymbol].get(mapName);
                    if (mapOp?.isGetter) instance = instance[mapName];
                }
                if (foldOp) {
                    if (foldOp.hasInput) return executeFold(instance, observerMap, foldOp.handler, rest);
                    return executeFold(instance, observerMap, foldOp.handler, []);
                }
                return instance;
            };
        } else {
            Object.defineProperty(BehaviorType, name, {
                get() {
                    let instance = BehaviorType[unfoldName]; // getter
                    for (const mapName of mapNames) {
                        instance = instance[mapName];
                    }
                    if (foldOp) {
                        return executeFold(instance, observerMap, foldOp.handler, []);
                    }
                    return instance;
                },
                enumerable: true,
                configurable: true
            });
        }
    } else {
        // Instance merge: stored as a fold op with pre-applied maps
        if (!foldOp) {
            throw new TypeError(`Merge operation '${name}' has no fold operation`);
        }
        ensureOwnMap(BehaviorType, FoldOpsSymbol).set(name, {
            spec: foldOp.spec,
            handler: foldOp.handler,
            hasInput: foldOp.hasInput,
            preMaps: mapNames  // applied before the fold in the Proxy handler
        });
    }
}

/**
 * Create a behavior instance with Proxy-based lazy evaluation.
 * 
 * The Proxy intercepts property access to observers and:
 * - For simple observers: Recompute on each access (no memoization)
 * - For parametric observers: Return a function that computes the result
 * - For Self continuations: Memoize the behavior instance (return same on repeated access)
 * 
 * @param {*} BehaviorType - The behavior class/type
 * @param {Map} observerMap - Map of observer definitions
 * @param {*} seed - Seed value used to generate observer values
 * @param {Object} unfoldHandlers - Map of observer names to unfold handler functions
 * @returns {Proxy} Proxy-wrapped behavior instance with lazy evaluation
 */
function createBehaviorInstance(BehaviorType, observerMap, seed, unfoldHandlers) {
    // Create base instance (plain object to be wrapped by Proxy)
    const instance = Object.create(BehaviorType.prototype || Object.prototype);

    // Mark as behavior instance
    instance[BehaviorSymbol] = true;
    instance[BehaviorTypeSymbol] = BehaviorType;

    // Initialize instance state in WeakMap
    behaviorInstanceState.set(instance, {
        seed,
        memo: new Map(),  // For memoizing Self continuations
        handlers: unfoldHandlers  // Stored so map operations can wrap them
    });

    // Convenience binding: avoids repeating BehaviorType + observerMap at every call site.
    const makeInstance = (seed, handlers) => createBehaviorInstance(BehaviorType, observerMap, seed, handlers);

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
                // Check fold operations (instance method/getter)
                const behaviorType = target[BehaviorTypeSymbol];
                const foldOp = behaviorType?.[FoldOpsSymbol]?.get(prop);
                if (foldOp) {
                    const { hasInput, handler } = foldOp;
                    if (foldOp.preMaps && foldOp.preMaps.length > 0) {
                        // Merged fold: apply maps first, then fold
                        if (hasInput) {
                            return function (...params) {
                                let inst = receiver;
                                for (const mapName of foldOp.preMaps) {
                                    inst = inst[mapName];
                                }
                                return executeFold(inst, observerMap, handler, params);
                            };
                        } else {
                            let inst = receiver;
                            for (const mapName of foldOp.preMaps) {
                                inst = inst[mapName];
                            }
                            return executeFold(inst, observerMap, handler, []);
                        }
                    } else if (hasInput) {
                        return function (...params) {
                            return executeFold(receiver, observerMap, handler, params);
                        };
                    } else {
                        return executeFold(receiver, observerMap, handler, []);
                    }
                }

                // Check map operations (instance method/getter)
                const mapOp = behaviorType?.[MapOpsSymbol]?.get(prop);
                if (mapOp) {
                    const state = behaviorInstanceState.get(target);
                    const { typeParam, transformFn, isGetter } = mapOp;
                    if (isGetter) {
                        const mappedHandlers = createMappedHandlers(
                            state.handlers, observerMap, typeParam, transformFn
                        );
                        return makeInstance(state.seed, mappedHandlers);
                    } else {
                        return function (...extraArgs) {
                            const mappedHandlers = createMappedHandlers(
                                state.handlers, observerMap, typeParam,
                                (value) => transformFn(value, ...extraArgs)
                            );
                            return makeInstance(state.seed, mappedHandlers);
                        };
                    }
                }

                // Not an observer or operation - return undefined or default behavior
                return Reflect.get(target, prop, receiver);
            }

            // Get instance state
            const state = behaviorInstanceState.get(target);
            if (!state) {
                throw new Error(`Behavior instance state not found for property '${prop}'`);
            }

            // Get unfold handler for this observer
            const handler = unfoldHandlers?.[prop];
            if (!handler) {
                throw new Error(
                    `No unfold handler defined for observer '${prop}'. ` +
                    `Define an unfold operation (e.g., 'From: { [op]: "unfold", [spec]: {...}, ...handlers }') to construct behavior instances.`
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

                // Create next behavior instance with same type and handlers
                const nextInstance = makeInstance(nextSeed, unfoldHandlers);

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

                    // If output type is Self, create a new behavior instance from the result (next seed)
                    if (outputIsSelf) {
                        return makeInstance(result, unfoldHandlers);
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
            // Check if it's a fold or map operation
            const behaviorType = target[BehaviorTypeSymbol];
            if (behaviorType?.[FoldOpsSymbol]?.has(prop)) return true;
            if (behaviorType?.[MapOpsSymbol]?.has(prop)) return true;
            // Fall back to default behavior for other properties
            return Reflect.has(target, prop);
        },

        // Prevent setting properties on behavior instances
        set(target, prop, value) {
            throw new Error(
                `Cannot set property '${String(prop)}' on behavior instance. Behavior instances are immutable.`
            );
        }
    });

    return proxy;
}