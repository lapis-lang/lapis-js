import {
    FamilyRefSymbol,
    TypeParamSymbol,
    isOperationDef,
    extend,
    validateTypeSpec,
    validateReturnType
} from './operations.mjs';

import {
    adtTransformers,
    createTransformer,
    createFoldTransformer,
    composeMultipleTransformers
} from './Transformer.mjs';

import {
    isPascalCase,
    isCamelCase,
    isObjectLiteral,
    HandlerMapSymbol,
    isBuiltInType
} from './utils.mjs';

// Re-export symbols
export { extend };
export const parent = Symbol('parent');
export const invariant = Symbol('invariant');
export const IsSingleton = Symbol('IsSingleton');

// Symbols for internal tracking
const ParentADTSymbol = Symbol('ParentADT');
const TypeArgsSymbol = Symbol('TypeArgs');
const VariantNameSymbol = Symbol('VariantName');
const HandlersSymbol = Symbol('Handlers');

// WeakMap to store parent ADT references (for Comb Inheritance parent chain)
const parentADTMap = new WeakMap();

/**
 * Main entry point: data(() => { variants and operations })
 */
export function data(declFn) {
    const decl = parseDeclaration(declFn);
    const ADT = createADT(decl);
    return ADT;
}

/**
 * Parse the declaration function
 */
function parseDeclaration(declFn) {
    const typeParams = {};
    const variants = {};
    const operations = {};
    let parentADT = null;
    let Family = null;

    // Create context with type parameters and Family
    const context = {
        get Family() {
            if (!Family) {
                Family = createFamilyMarker();
            }
            return Family;
        }
    };

    // Proxy for type parameter access
    const typeParamProxy = new Proxy({}, {
        get(target, prop) {
            if (prop === 'Family') return context.Family;
            if (typeof prop === 'string' && /^[A-Z]$/.test(prop)) {
                if (!typeParams[prop]) {
                    typeParams[prop] = createTypeParam(prop);
                }
                return typeParams[prop];
            }
            return undefined;
        }
    });

    // Execute declaration function
    const declObj = declFn(typeParamProxy);

    // Extract parent ADT if extending
    if (extend in declObj) {
        parentADT = declObj[extend];
    }

    // Separate variants and operations
    for (const [key, value] of Object.entries(declObj)) {
        if (isOperationDef(key, value)) {
            operations[key] = value;
        } else if (key !== extend && typeof key === 'string') {
            variants[key] = value;
        }
    }

    // Check for variant name collisions with parent
    if (parentADT) {
        for (const variantName of Object.keys(variants)) {
            if (variantName in parentADT) {
                throw new Error(`Variant name collision: '${variantName}' already exists in base ADT`);
            }
        }
    }

    return { typeParams, variants, operations, parentADT, Family };
}

/**
 * Factory to create a variant constructor with common setup.
 * Eliminates duplication between createChildVariant and createVariants.
 */
function createVariantConstructor({
    name,
    spec,
    invariantFn,
    ADT,
    constructorBody
}) {
    function Variant(...args) {
        if (!new.target) return new Variant(...args);
        constructorBody.call(this, ...args);
    }

    Object.defineProperty(Variant, 'name', { value: name, configurable: true });
    Variant.prototype = Object.create(ADT.prototype);
    Object.defineProperty(Variant.prototype, 'constructor', {
        value: Variant,
        writable: true,
        enumerable: false,
        configurable: true
    });
    Variant.variantName = name;
    Variant.spec = spec;
    Variant._invariant = invariantFn;
    Variant[IsSingleton] = false;

    return Variant;
}

/**
 * Factory to create a singleton variant with common setup.
 * Eliminates duplication between createChildVariant and createVariants.
 */
function createSingletonVariant(name, ADT) {
    function Variant() {
        if (!new.target) return new Variant();
        this[VariantNameSymbol] = name;
        Object.freeze(this);
    }

    Object.defineProperty(Variant, 'name', { value: name, configurable: true });
    Variant.prototype = Object.create(ADT.prototype);
    Object.defineProperty(Variant.prototype, 'constructor', {
        value: Variant,
        writable: true,
        enumerable: false,
        configurable: true
    });
    Variant.variantName = name;
    Variant.spec = {};
    Variant[IsSingleton] = true;

    return Object.freeze(new Variant());
}

/**
 * Factory to check invariant with consistent error handling.
 * Eliminates duplication of invariant checking logic.
 */
function checkInvariant(instance, invariantFn, variantName) {
    if (invariantFn) {
        const isValid = invariantFn(instance);
        if (!isValid) {
            const fnName = invariantFn.name ? `: ${invariantFn.name}` : '';
            throw new TypeError(
                `Invariant violation in variant '${variantName}'${fnName}`
            );
        }
    }
}

/**
 * Factory to create a delegation proxy.
 * Eliminates duplication between ADT and ParameterizedADT proxy patterns.
 * @param {boolean} isParentExtension - true if delegate is parent ADT (extension), false if Base (parameterization)
 */
function createDelegationProxy(target, ownVariants, delegate, isParentExtension = true) {
    return new Proxy(target, {
        has(target, prop) {
            if (prop in ownVariants) return true;
            if (prop in target) return true;
            if (delegate) return prop in delegate;
            return false;
        },

        get(target, prop, receiver) {
            // Forward transformer registry methods to underlying target
            if (prop === '_registerTransformer' || prop === '_getTransformer' || prop === '_getTransformerNames') {
                return target[prop];
            }

            // Check own variants first
            if (prop in ownVariants) {
                return ownVariants[prop];
            }

            // Check own properties
            if (prop in target) {
                return Reflect.get(target, prop, receiver);
            }

            // Delegate to parent/base (naturally recursive via delegate's Proxy)
            if (delegate && prop in delegate) {
                const delegatedValue = delegate[prop];

                // For ADT parent extension, wrap variants as child variants
                if (isParentExtension &&
                    (typeof delegatedValue === 'function' || (typeof delegatedValue === 'object' && delegatedValue !== null))) {
                    return createChildVariant(target, prop, delegatedValue);
                }

                // For ParameterizedADT base delegation, return directly
                return delegatedValue;
            }

            return undefined;
        }
    });
}

/**
 * Factory to create transformer registry methods for an ADT.
 * Uses closure over the specific ADT to avoid WeakMap key issues.
 */
function createTransformerMethods(ADT) {
    return {
        _registerTransformer: function (name, transformer, skipCollisionCheck = false, variants = null) {
            const key = ADT;
            let registry = adtTransformers.get(key);
            if (!registry) {
                // Comb Inheritance: don't copy parent registry, start fresh
                // _getTransformer will walk up the chain to find parent transformers
                registry = new Map();
                adtTransformers.set(key, registry);
            }

            if (!skipCollisionCheck) {
                // Check against provided variants or attached variants
                const variantsToCheck = variants || this;
                for (const key of Object.keys(variantsToCheck)) {
                    if (key === 'extend' || key.startsWith('_')) {
                        continue;
                    }

                    const variant = variantsToCheck[key];

                    if (typeof variant === 'function') {
                        if (!variant[IsSingleton] && variant.spec) {
                            const fieldNames = Object.keys(variant.spec);
                            if (fieldNames.includes(name)) {
                                throw new Error(
                                    `Operation name '${name}' conflicts with field '${name}' in variant '${key}'`
                                );
                            }
                        }
                    } else if (variant && typeof variant === 'object' && !Array.isArray(variant)) {
                        if (Object.prototype.hasOwnProperty.call(variant, name)) {
                            throw new Error(
                                `Operation name '${name}' conflicts with field '${name}' in variant '${key}'`
                            );
                        }
                    }
                }
            }

            registry.set(name, transformer);
        },

        _getTransformer: function (name) {
            const key = ADT;
            const registry = adtTransformers.get(key);
            if (registry?.has(name)) {
                return registry.get(name);
            }

            const parentKey = parentADTMap.get(key);
            if (parentKey && parentKey._getTransformer) {
                return parentKey._getTransformer(name);
            }

            return undefined;
        },

        _getTransformerNames: function () {
            const key = ADT;
            const registry = adtTransformers.get(key);
            return registry ? Array.from(registry.keys()) : [];
        }
    };
}

/**
 * Create a Family marker for recursive ADT references
 */
function createFamilyMarker() {
    const marker = function (typeParam) {
        // Will be bound to actual ADT later
        if (marker._adt) {
            return marker._adt(typeParam);
        }
        return marker;
    };
    marker[FamilyRefSymbol] = true;
    marker._adt = null;
    return marker;
}

/**
 * Create a type parameter marker
 */
function createTypeParam(name) {
    const marker = {};
    marker[TypeParamSymbol] = name;
    return marker;
}

/**
 * Create the ADT with Comb Inheritance structure
 */
function createADT(decl) {
    const hasTypeParams = Object.keys(decl.typeParams).length > 0;
    const parentADT = decl.parentADT;

    // Base constructor
    function ADT(...args) {
        // Handle parameterization: List(Number) or List({ T: Number })
        if (!new.target && hasTypeParams && args.length > 0) {
            const firstArg = args[0];

            if (isObjectLiteral(firstArg)) {
                // Object literal style: List({ T: Number })
                return createParameterized(ADT, firstArg, decl);
            }
            // Positional style: List(Number)
            const typeParamNames = Object.keys(decl.typeParams);
            if (args.length <= typeParamNames.length) {
                const typeArgs = {};
                for (let i = 0; i < args.length; i++) {
                    typeArgs[typeParamNames[i]] = args[i];
                }
                return createParameterized(ADT, typeArgs, decl);
            }
        }

        // Called from variant constructor
        if (new.target) {
            return;
        }

        throw new Error('Use ADT variants or parameterize with type arguments');
    }

    // Set up prototype chain for parent extension
    if (parentADT) {
        ADT.prototype = Object.create(parentADT.prototype);
        ADT.prototype.constructor = ADT;
        // Unwrap parent proxy to get raw ADT for proper registry lookup
        const rawParentADT = parentADT._rawADT || parentADT;
        parentADTMap.set(ADT, rawParentADT);
    }

    // Add transformer registry methods using factory
    Object.assign(ADT, createTransformerMethods(ADT));

    // Create variants
    const ownVariants = createVariants(ADT, decl.variants, decl.typeParams);

    // Create operations on prototype
    createOperations(ADT, ownVariants, decl.operations, decl.typeParams);

    // Wrap ADT in Proxy for parent variant delegation using factory
    const ProxiedADT = createDelegationProxy(ADT, ownVariants, parentADT, true);

    // Store reference to raw ADT on proxy for unwrapping
    ProxiedADT._rawADT = ADT;

    // Assign own variants to ADT
    for (const [name, variant] of Object.entries(ownVariants)) {
        Object.defineProperty(ADT, name, {
            value: variant,
            writable: false,
            enumerable: true,
            configurable: true
        });
    }

    // Bind Family marker
    if (decl.Family) {
        decl.Family._adt = ProxiedADT;
    }

    return ProxiedADT;
}

/**
 * Create a child variant that wraps a parent variant
 */
function createChildVariant(ChildADT, variantName, ParentVariant) {
    const parentSpec = ParentVariant.spec || {};
    const parentInvariant = ParentVariant._invariant || null;

    if (Object.keys(parentSpec).length === 0) {
        // Singleton - use factory
        return createSingletonVariant(variantName, ChildADT);
    } else {
        // Constructor - use factory with parent behavior
        return createVariantConstructor({
            name: variantName,
            spec: parentSpec,
            invariantFn: parentInvariant,
            ADT: ChildADT,
            constructorBody: function (...args) {
                const fields = normalizeFields(args[0], args.slice(1), parentSpec, variantName);
                validateAndAssignFields(this, fields, parentSpec, ChildADT);
                checkInvariant(this, parentInvariant, variantName);
                this[VariantNameSymbol] = variantName;
                Object.freeze(this);
            }
        });
    }
}

/**
 * Create variant constructors
 */
function createVariants(ADT, variantSpecs, typeParams) {
    const variants = {};

    for (const [name, spec] of Object.entries(variantSpecs)) {
        if (!isPascalCase(name)) {
            throw new Error(`Variant '${name}' must be PascalCase`);
        }

        // Extract invariant function if present
        let invariantFn = null;
        let fieldSpec = spec;

        if (spec && typeof spec === 'object') {
            if (invariant in spec) {
                invariantFn = spec[invariant];
                // Create field spec without the invariant symbol
                fieldSpec = {};
                for (const key of Object.keys(spec)) {
                    if (key !== invariant.toString()) {
                        fieldSpec[key] = spec[key];
                    }
                }
                // Also check for symbol keys
                for (const sym of Object.getOwnPropertySymbols(spec)) {
                    if (sym !== invariant) {
                        fieldSpec[sym] = spec[sym];
                    }
                }
            }

            // Validate field names are camelCase (excluding symbols)
            for (const fieldName of Object.keys(fieldSpec)) {
                if (!isCamelCase(fieldName)) {
                    throw new Error(`Field '${fieldName}' in variant '${name}' must be camelCase`);
                }
            }
        }

        const isEmpty = !fieldSpec || Object.keys(fieldSpec).length === 0;

        if (isEmpty) {
            // Singleton variant - use factory
            variants[name] = createSingletonVariant(name, ADT);
        } else {
            // Constructor variant - use factory
            variants[name] = createVariantConstructor({
                name,
                spec: fieldSpec,
                invariantFn,
                ADT,
                constructorBody: function (...args) {
                    const fields = normalizeFields(args[0], args.slice(1), fieldSpec, name);
                    validateAndAssignFields(this, fields, fieldSpec, ADT);
                    checkInvariant(this, invariantFn, name);
                    this[VariantNameSymbol] = name;
                    Object.freeze(this);
                }
            });
        }
    }

    return variants;
}

/**
 * Normalize constructor arguments
 */
function normalizeFields(firstArg, restArgs, spec, variantName) {
    if (isObjectLiteral(firstArg) && restArgs.length === 0) {
        return firstArg;
    }

    const fieldNames = Object.keys(spec);
    const allArgs = [firstArg, ...restArgs];

    if (allArgs.length !== fieldNames.length) {
        throw new Error(`Wrong number of arguments for ${variantName}: expected ${fieldNames.length}, got ${allArgs.length}`);
    }

    const fields = {};
    for (let i = 0; i < fieldNames.length; i++) {
        fields[fieldNames[i]] = allArgs[i];
    }
    return fields;
}

/**
 * Validate and assign fields
 */
function validateAndAssignFields(instance, fields, spec, ADT) {
    for (const [fieldName, fieldSpec] of Object.entries(spec)) {
        if (!(fieldName in fields)) {
            throw new TypeError(`Missing required field '${fieldName}'`);
        }

        const value = fields[fieldName];
        validateField(value, fieldSpec, fieldName, ADT);
        instance[fieldName] = value;
    }

    for (const fieldName of Object.keys(fields)) {
        if (!(fieldName in spec)) {
            throw new TypeError(`Unexpected field '${fieldName}'`);
        }
    }
}

/**
 * Validate a field value
 */
function validateField(value, spec, fieldName, ADT) {
    // Type parameter
    if (spec && typeof spec === 'object' && TypeParamSymbol in spec) {
        const paramName = spec[TypeParamSymbol];
        const typeArgs = ADT[TypeArgsSymbol];
        if (typeArgs && typeArgs[paramName]) {
            const instantiatedType = typeArgs[paramName];
            validateField(value, instantiatedType, fieldName, ADT);
            return;
        }
        return;
    }

    // Family reference - check against root Base
    if (spec && (typeof spec === 'object' || typeof spec === 'function') && FamilyRefSymbol in spec) {
        let rootBase = ADT;
        while (parentADTMap.has(rootBase)) {
            rootBase = parentADTMap.get(rootBase);
        }

        if (!(value instanceof rootBase)) {
            throw new TypeError(`Field '${fieldName}' must be an instance of the same ADT family`);
        }
        return;
    }

    // Built-in types
    switch (true) {
        case spec === Number && typeof value !== 'number':
            throw new TypeError(`Field '${fieldName}' must be a Number`);
        case spec === String && typeof value !== 'string':
            throw new TypeError(`Field '${fieldName}' must be a String`);
        case spec === Boolean && typeof value !== 'boolean':
            throw new TypeError(`Field '${fieldName}' must be a Boolean`);
        case spec === Symbol && typeof value !== 'symbol':
            throw new TypeError(`Field '${fieldName}' must be a Symbol`);
        case spec === BigInt && typeof value !== 'bigint':
            throw new TypeError(`Field '${fieldName}' must be a BigInt`);
    }

    // Predicate function validation
    if (typeof spec === 'function' && !isBuiltInType(spec)) {
        // First, try as a predicate function
        try {
            const result = spec(value);
            if (result === false) {
                throw new TypeError(`Field '${fieldName}' failed predicate validation`);
            }
            // If result is truthy or the function succeeded, consider it valid
            if (result) {
                return;
            }
        } catch (e) {
            // If it's already a validation error, rethrow
            if (e.message.includes('failed predicate validation')) {
                throw e;
            }
            // Otherwise, it might be an ADT constructor check, not a predicate
            // Try instanceof checks
            if (typeof value === 'object' && value !== null) {
                if (value.constructor === spec || value instanceof spec) {
                    return;
                }
            }
            // If instanceof didn't work, treat original error as predicate failure
            throw new TypeError(`Field '${fieldName}' failed predicate validation: ${e.message}`);
        }
        return;
    }
}

/**
 * Performs topological sort on operations based on dependencies.
 * Merge operations depend on their composed operations, so dependencies must be installed first.
 * @param {Object} operationSpecs - Object mapping operation names to their specs
 * @param {Object} parentADT - Optional parent ADT to check for inherited operations
 * @returns {Array} Sorted array of [name, spec] entries (dependencies first)
 */
function topologicalSortOperations(operationSpecs, parentADT = null) {
    const sorted = [];
    const visiting = new Set();
    const visited = new Set();

    // Build list of operation entries
    const opEntries = Object.entries(operationSpecs);
    const opMap = new Map(opEntries);

    // Iterative DFS using explicit stack for stack safety
    for (const [opName] of opEntries) {
        const stack = [{ name: opName, phase: 'pre' }];

        while (stack.length > 0) {
            const frame = stack[stack.length - 1];

            // Skip if already visited
            if (visited.has(frame.name)) {
                stack.pop();
                continue;
            }

            if (frame.phase === 'pre') {
                // Pre-visit phase: check for cycles and add dependencies

                if (visiting.has(frame.name)) {
                    throw new Error(
                        `Circular dependency detected in operations involving '${frame.name}'`
                    );
                }

                visiting.add(frame.name);

                const opDef = opMap.get(frame.name);
                if (!opDef) {
                    // Check if operation exists on parent ADT
                    const parentHasOp = parentADT && parentADT._getTransformer && parentADT._getTransformer(frame.name);
                    if (!parentHasOp) {
                        throw new Error(`Cannot merge: operation '${frame.name}' not found`);
                    }
                    // Operation exists on parent, mark as visited and continue
                    visiting.delete(frame.name);
                    visited.add(frame.name);
                    stack.pop();
                    continue;
                }

                // Change phase to post-visit for next iteration
                frame.phase = 'post';

                // Push dependencies onto stack in reverse order (for merge operations)
                if (opDef.op === 'merge' && opDef.operations) {
                    for (let i = opDef.operations.length - 1; i >= 0; i--) {
                        const depName = opDef.operations[i];
                        if (!visited.has(depName)) {
                            stack.push({ name: depName, phase: 'pre' });
                        }
                    }
                }
            } else {
                // Post-visit phase: all dependencies processed, add to sorted list
                stack.pop();
                visiting.delete(frame.name);
                visited.add(frame.name);

                const opDef = opMap.get(frame.name);
                if (opDef) {
                    sorted.push([frame.name, opDef]);
                }
            }
        }
    }

    return sorted;
}

/**
 * Create operations on the ADT prototype
 */
function createOperations(ADT, variants, operationSpecs, typeParams) {
    // Topologically sort operations to handle dependencies (merge depends on its operations)
    const sortedOps = topologicalSortOperations(operationSpecs, parentADTMap.get(ADT));

    for (const [opName, opDef] of sortedOps) {
        const op = opDef.op;

        if (op === 'fold') {
            createFoldOperation(ADT, variants, opName, opDef);
        } else if (op === 'unfold') {
            createUnfoldOperation(ADT, variants, opName, opDef);
        } else if (op === 'map') {
            createMapOperation(ADT, variants, opName, opDef);
        } else if (op === 'merge') {
            createMergeOperation(ADT, variants, opName, opDef);
        }
    }
}

/**
 * Create a fold operation
 */
function createFoldOperation(ADT, variants, opName, opDef) {
    const { spec = {}, op, ...handlers } = opDef;  // Exclude 'op' from handlers

    // LSP Enforcement: If extending and parent has this operation, inherit/validate specs
    const parentADT = parentADTMap.get(ADT);
    let hasInput = 'in' in spec;
    let hasOutput = 'out' in spec;
    let finalSpec = { ...spec };

    if (parentADT) {
        const parentRegistry = adtTransformers.get(parentADT);
        const parentTransformer = parentRegistry?.get(opName);

        if (parentTransformer && parentTransformer[HandlerMapSymbol]) {
            // Parent has this operation - enforce LSP
            const parentHasInput = parentTransformer.inSpec !== undefined;
            const parentHasOutput = parentTransformer.outSpec !== undefined;

            // spec: {} is same as no spec - inherit everything
            // spec: { out: X } is explicit - not mentioning 'in' means "no input"
            const specKeys = Object.keys(spec);
            const specIsEmpty = specKeys.length === 0;

            if (!specIsEmpty) {
                // Spec has properties, so it's explicit (not inheriting)
                const childDefinesIn = 'in' in spec;
                const childDefinesOut = 'out' in spec;

                // Check parameterization change
                if (parentHasInput && !childDefinesIn) {
                    throw new Error(
                        `Cannot change operation '${opName}' from parameterized (method) to parameterless (getter) when extending`
                    );
                }
                if (!parentHasInput && childDefinesIn) {
                    throw new Error(
                        `Cannot change operation '${opName}' from parameterless (getter) to parameterized (method) when extending`
                    );
                }

                // Check input spec value change
                if (childDefinesIn && parentHasInput && spec.in !== parentTransformer.inSpec) {
                    throw new Error(
                        `Cannot change operation '${opName}' input specification when extending`
                    );
                }

                // Check output spec value change
                if (childDefinesOut && parentHasOutput && spec.out !== parentTransformer.outSpec) {
                    throw new Error(
                        `Cannot change operation '${opName}' output specification when extending`
                    );
                }
            }

            // Inherit from parent if not explicitly defined
            if (!hasInput && parentHasInput) {
                finalSpec.in = parentTransformer.inSpec;
                hasInput = true;
            }
            if (!hasOutput && parentHasOutput) {
                finalSpec.out = parentTransformer.outSpec;
                hasOutput = true;
            }
        }
    }

    // Check for handlers with extra parameters (beyond fields)
    const hasExtraParams = !hasInput && Object.values(handlers).some(h =>
        typeof h === 'function' && h.length > 1
    );

    if (!isCamelCase(opName)) {
        throw new Error(`Fold operation '${opName}' must be camelCase`);
    }

    // Create and register transformer with only this ADT's handlers
    // Comb Inheritance: runtime will walk up chain to find parent handlers
    const transformer = createFoldTransformer(opName, handlers, finalSpec.out, finalSpec.in);
    ADT._registerTransformer(opName, transformer, false, variants);

    const foldImpl = function (...args) {
        const variantName = this[VariantNameSymbol];
        const variantCtor = this.constructor;

        // Comb Inheritance: Walk up ADT chain to find handler
        // Start searching from the most derived ADT and walk up to find handlers
        let handler = null;
        let parentHandler = null;
        let foundAtADT = null;

        // Get the root ADT by finding which ADT this variant belongs to
        // Walk up from ADT following parent chain
        let currentSearchADT = ADT;

        // Search each level in the inheritance chain
        while (currentSearchADT && !handler) {
            const registry = adtTransformers.get(currentSearchADT);
            const transformer = registry?.get(opName);

            if (transformer && transformer.getCtorTransform) {
                const handlerMap = transformer[HandlerMapSymbol];
                // Check if this transformer has a handler for this specific variant
                if (handlerMap && (handlerMap[variantName] || handlerMap._)) {
                    handler = transformer.getCtorTransform(variantCtor);
                    foundAtADT = currentSearchADT;
                    break;
                }
            }
            // Continue up the parent chain
            currentSearchADT = parentADTMap.get(currentSearchADT);
        }

        if (!handler) {
            throw new Error(`No handler for variant '${variantName}' in fold operation '${opName}'`);
        }

        // Look for parent handler (from parent ADT) for this[parent] access
        if (foundAtADT) {
            let parentADT = parentADTMap.get(foundAtADT);
            while (parentADT && !parentHandler) {
                const parentRegistry = adtTransformers.get(parentADT);
                const parentTransformer = parentRegistry?.get(opName);

                if (parentTransformer && parentTransformer.getCtorTransform) {
                    const parentHandlerMap = parentTransformer[HandlerMapSymbol];
                    if (parentHandlerMap && (parentHandlerMap[variantName] || parentHandlerMap._)) {
                        parentHandler = parentTransformer.getCtorTransform(variantCtor);
                        break;
                    }
                }
                parentADT = parentADTMap.get(parentADT);
            }
        }

        // Build folded fields
        const foldedFields = {};
        if (variantCtor.spec) {
            for (const [fieldName, fieldSpec] of Object.entries(variantCtor.spec)) {
                if (fieldSpec && (typeof fieldSpec === 'object' || typeof fieldSpec === 'function') && FamilyRefSymbol in fieldSpec) {
                    const fieldValue = this[fieldName];
                    if (hasInput || hasExtraParams) {
                        foldedFields[fieldName] = (...params) => fieldValue[opName](...params);
                    } else {
                        foldedFields[fieldName] = fieldValue[opName];
                    }
                } else {
                    foldedFields[fieldName] = this[fieldName];
                }
            }
        }

        // Create a context object for the handler with parent access (only if needed)
        let context = this;

        // Make this[parent] available following Uniform Access Principle
        // - Parameterless operations: this[parent] auto-invokes (getter)
        // - Operations with params: this[parent](args) is callable (returns function)
        if (parentHandler) {
            context = Object.create(this);

            if (hasInput || hasExtraParams) {
                // Operation has parameters: return callable function
                Object.defineProperty(context, parent, {
                    get: () => {
                        return (...parentArgs) => parentHandler.call(this, foldedFields, ...parentArgs);
                    },
                    enumerable: false,
                    configurable: true
                });
            } else {
                // Parameterless operation: auto-invoke (UAP)
                Object.defineProperty(context, parent, {
                    get: () => {
                        return parentHandler.call(this, foldedFields);
                    },
                    enumerable: false,
                    configurable: true
                });
            }
        }

        const result = handler.call(context, foldedFields, ...args);

        if (hasOutput) {
            validateReturnType(result, spec.out, opName);
        }

        return result;
    };

    // Install operation
    // Always use Object.defineProperty to handle overriding inherited properties
    if (hasInput || hasExtraParams) {
        // Function property (callable with arguments)
        ADT.prototype[opName] = foldImpl;
    } else {
        // Getter property (no arguments, auto-invoked)
        Object.defineProperty(ADT.prototype, opName, {
            get: foldImpl,
            enumerable: true,
            configurable: true
        });
    }
}

/**
 * Create an unfold operation
 */
function createUnfoldOperation(ADT, variants, opName, opDef) {
    const { spec = {}, op, cases: casesObj, ...rest } = opDef;
    const cases = casesObj || rest;

    if (!isPascalCase(opName)) {
        throw new Error(`Unfold operation '${opName}' must be PascalCase`);
    }

    // Validate spec guards - prevent Function as guard
    if (spec && 'in' in spec && spec.in === Function) {
        throw new TypeError(`cannot use Function as 'in' guard`);
    }

    // Create transformer with generator
    const generator = (seed) => seed; // Basic generator, cases handle the logic
    const transformer = createTransformer({
        name: opName,
        inSpec: spec.in,
        generator
    });

    // Store cases on transformer for potential composition
    transformer.unfoldCases = cases;
    transformer.unfoldSpec = spec;

    ADT._registerTransformer(opName, transformer, false, variants);

    ADT[opName] = function unfoldImpl(seed) {
        if ('in' in spec) {
            validateTypeSpec(seed, spec.in, opName, 'input of type');
        }

        for (const [variantName, caseFn] of Object.entries(cases)) {
            const result = caseFn(seed);
            if (result !== null && result !== undefined) {
                const variantValue = variants[variantName] || ADT[variantName];
                if (!variantValue) {
                    throw new Error(`Unknown variant '${variantName}' in unfold '${opName}'`);
                }

                if (typeof variantValue === 'object' && Object.isFrozen(variantValue)) {
                    return variantValue;
                }

                const Variant = variantValue;
                if (Variant.spec) {
                    const transformedResult = { ...result };
                    for (const [fieldName, fieldSpec] of Object.entries(Variant.spec)) {
                        if (fieldSpec && (typeof fieldSpec === 'object' || typeof fieldSpec === 'function') && FamilyRefSymbol in fieldSpec) {
                            if (fieldName in result) {
                                transformedResult[fieldName] = unfoldImpl(result[fieldName]);
                            }
                        }
                    }
                    return Variant(transformedResult);
                }

                return Variant(result);
            }
        }

        throw new Error(`No case matched in unfold '${opName}'`);
    };
}

/**
 * Create a map operation
 */
function createMapOperation(ADT, variants, opName, opDef) {
    const { spec = {}, op, ...transformers } = opDef;

    if (!isCamelCase(opName)) {
        throw new Error(`Map operation '${opName}' must be camelCase`);
    }

    // Check if any transform function accepts extra parameters (beyond the value)
    const hasExtraParams = Object.values(transformers).some(t =>
        typeof t === 'function' && t.length > 1
    );

    // Create transformer with parameter transforms
    const transformer = createTransformer({
        name: opName,
        getParamTransform: (paramName) => transformers[paramName],
        getAtomTransform: (fieldName) => transformers[fieldName]
    });

    ADT._registerTransformer(opName, transformer, false, variants);

    const mapImpl = function (...args) {
        const variantName = this[VariantNameSymbol];
        const variant = variants[variantName] || ADT[variantName];

        if (!variant || typeof variant !== 'function') {
            return this;
        }

        const variantSpec = variant.spec;
        if (!variantSpec) return this;

        const mappedFields = {};
        for (const [fieldName, fieldSpec] of Object.entries(variantSpec)) {
            const value = this[fieldName];

            // Check if field is recursive (Family reference)
            if (fieldSpec && (typeof fieldSpec === 'object' || typeof fieldSpec === 'function') && FamilyRefSymbol in fieldSpec) {
                // Pass arguments to recursive map calls
                if (hasExtraParams && args.length > 0) {
                    mappedFields[fieldName] = value[opName](...args);
                } else {
                    mappedFields[fieldName] = value[opName];
                }
            } else if (fieldSpec && typeof fieldSpec === 'object' && TypeParamSymbol in fieldSpec) {
                // Type parameter - apply transformer
                const paramName = fieldSpec[TypeParamSymbol];
                const transformFn = transformers[paramName] || transformers[fieldName];
                if (transformFn) {
                    // Pass extra arguments to transform function
                    mappedFields[fieldName] = transformFn(value, ...args);
                } else {
                    mappedFields[fieldName] = value;
                }
            } else {
                // Non-recursive, non-parametric field - keep as is
                mappedFields[fieldName] = value;
            }
        }

        return variant(mappedFields);
    };

    // Install as function if transforms accept extra params, otherwise as getter
    if (hasExtraParams) {
        ADT.prototype[opName] = mapImpl;
    } else {
        Object.defineProperty(ADT.prototype, opName, {
            get: mapImpl,
            enumerable: true,
            configurable: true
        });
    }
}

/**
 * Create a merge operation (hylomorphism)
 */
function createMergeOperation(ADT, variants, opName, opDef) {
    const { operations } = opDef;

    if (!Array.isArray(operations) || operations.length === 0) {
        throw new Error(`Merge requires a non-empty array of operation names`);
    }

    if (operations.length < 2) {
        throw new Error(`Merge requires at least 2 operations`);
    }

    // Retrieve transformers for each operation to check if we have unfold
    const transformers = operations.map(operationName => {
        const transformer = ADT._getTransformer(operationName);
        if (!transformer) {
            throw new Error(`Cannot merge: operation '${operationName}' not found`);
        }
        return transformer;
    });

    // Check if any transformer has a generator (unfold)
    const hasUnfold = transformers.some(t => t.generator);

    // Validate naming based on whether we have an unfold
    if (hasUnfold) {
        if (!isPascalCase(opName)) {
            throw new Error(`Merged operation '${opName}' with unfold must be PascalCase`);
        }
    } else {
        if (!isCamelCase(opName)) {
            throw new Error(`Merged operation '${opName}' without unfold must be camelCase`);
        }
    }

    // Check for collision with existing variant names (for static methods with unfold)
    if (hasUnfold && opName in variants) {
        throw new Error(`Merged operation name '${opName}' conflicts with existing variant`);
    }

    // Compose transformers using composeMultipleTransformers
    const composedTransformer = composeMultipleTransformers(transformers, opName);

    // Register the composed transformer (this will check for field collisions)
    ADT._registerTransformer(opName, composedTransformer, false, variants);

    // Install the merged operation
    // If it has a generator (unfold), it's a static method
    // If it has getCtorTransform without generator, it would be an instance method
    // For merge, we expect unfold + fold pattern (static method)
    if (composedTransformer.generator) {
        ADT[opName] = function (seed) {
            // Simple implementation: execute unfold then fold
            // (Full deforestation would integrate them, but that's complex)
            const unfoldName = operations[0];
            const unfoldOp = ADT[unfoldName];

            if (!unfoldOp) {
                throw new Error(`Unfold operation '${unfoldName}' not found`);
            }

            const intermediate = unfoldOp(seed);

            // Apply remaining operations sequentially
            let result = intermediate;
            for (let i = 1; i < operations.length; i++) {
                const nextOpName = operations[i];
                const descriptor = Object.getOwnPropertyDescriptor(ADT.prototype, nextOpName);

                if (descriptor && descriptor.get) {
                    result = result[nextOpName];
                } else if (typeof result[nextOpName] === 'function') {
                    result = result[nextOpName]();
                } else {
                    throw new Error(`Operation '${nextOpName}' not found on result`);
                }
            }

            return result;
        };
    } else {
        // Pure fold/map composition (instance method)
        const mergeImpl = function (...args) {
            let result = this;
            for (const opName of operations) {
                const descriptor = Object.getOwnPropertyDescriptor(ADT.prototype, opName);
                if (descriptor && descriptor.get) {
                    result = result[opName];
                } else if (typeof result[opName] === 'function') {
                    result = result[opName](...args);
                } else {
                    throw new Error(`Operation '${opName}' not found`);
                }
            }
            return result;
        };

        Object.defineProperty(ADT.prototype, opName, {
            get: mergeImpl,
            enumerable: true,
            configurable: true
        });
    }
}

/**
 * Create parameterized instance
 */
function createParameterized(Base, typeArgs, decl) {
    function ParameterizedADT(...args) {
        return Base.call(this, ...args);
    }

    ParameterizedADT.prototype = Object.create(Base.prototype);
    ParameterizedADT.prototype.constructor = ParameterizedADT;
    ParameterizedADT[TypeArgsSymbol] = typeArgs;
    parentADTMap.set(ParameterizedADT, Base);

    // Add transformer registry methods using factory (leveraging Comb Inheritance)
    Object.assign(ParameterizedADT, createTransformerMethods(ParameterizedADT));

    const paramVariants = createVariants(ParameterizedADT, decl.variants, decl.typeParams);

    // Use Proxy to inherit static methods from Base via Comb Inheritance using factory
    const ProxiedParameterized = createDelegationProxy(ParameterizedADT, paramVariants, Base, false);

    return Object.assign(ProxiedParameterized, paramVariants);
}
