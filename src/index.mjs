import {
    adtTransformers,
    createFoldTransformer,
    createTransformer,
    composeMultipleTransformers,
    HandlerMapSymbol
} from './Transformer.mjs';

export { createTransformer, composeTransformers, composeMultipleTransformers } from './Transformer.mjs';

// Symbol for parent callback in extendMatch handlers
export const parent = Symbol('parent');

// Symbol to mark singleton variants (vs structured variants with fields)
const IsSingleton = Symbol('IsSingleton');

// Symbol to store reference to the ADT that owns a variant
const DataTypeSymbol = Symbol('DataType');

// WeakMap to track constructor copies for overridden variants
const shadowedVariants = new WeakMap();

// Symbol to mark Family references for recursive ADTs
const FamilyRefSymbol = Symbol('FamilyRef');
const TypeParamSymbol = Symbol('TypeParam');

// Symbol to mark parameterized ADT instances and track their parent
const IsParameterizedInstance = Symbol('IsParameterizedInstance');
const ParentADTSymbol = Symbol('ParentADT');
const TypeArgsSymbol = Symbol('TypeArgs');
const VariantDeclSymbol = Symbol('VariantDecl');

/**
 * Decorator to make a class callable.
 * When the class is called as a function, it invokes the constructor.
 * This enables syntax like: List(Number) instead of new List(Number)
 * 
 * @param Class - The class to make callable
 * @returns A proxy that can be called as a function or used with 'new'
 */
function callable(Class) {
    return new Proxy(Class, {
        apply(target, thisArg, argumentsList) {
            // Check if this is a variant constructor (has _fieldNames or is a singleton)
            // Variants should use their constructor, not _call
            const isVariant = '_fieldNames' in target || target[IsSingleton] === true;

            // When called as a function, check if it has a _call method (for ADT parameterization)
            // But only use _call if this is not a variant
            if (!isVariant && target._call) {
                return target._call(...argumentsList);
            }
            // Otherwise, invoke the constructor (for variant constructors or base ADT)
            return Reflect.construct(target, argumentsList);
        },
        construct(target, argumentsList) {
            // When called with 'new', invoke the constructor normally
            return Reflect.construct(target, argumentsList);
        }
    });
}

// Runtime validation helpers
function isPascalCase(str) {
    return str.length > 0 && str[0] === str[0].toUpperCase() && str[0] !== str[0].toLowerCase();
}

function isCamelCase(str) {
    return str.length > 0 && str[0] === str[0].toLowerCase() && !str.startsWith('_');
}

// Type definitions removed - using runtime validation instead

// Definition of the DataDef type with type argument substitution
// Type definitions removed - using runtime validation instead

/**
 * Checks if the value is an object literal.
 * @param value The value to check.
 * @returns Returns true if the value is an object literal, else false.
 */
function isObjectLiteral(value) {
    return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Checks if a function is constructable
 */
function isConstructable(fn) {
    if (typeof fn !== 'function') return false;
    // Check if function has a prototype (not an arrow function)
    // and can be called with 'new'
    try {
        // Try creating an instance
        const test = Object.create(fn.prototype);
        return test instanceof fn || fn.prototype !== undefined;
    } catch {
        return false;
    }
}

/**
 * Checks if a value is a FamilyRef
 */
function isFamilyRef(value) {
    return (typeof value === 'object' || typeof value === 'function') && value !== null && FamilyRefSymbol in value;
}

/**
 * Checks if a value is a TypeParam
 */
function isTypeParam(value) {
    return typeof value === 'object' && value !== null && TypeParamSymbol in value;
}

/**
 * Helper to create a singleton variant (ES6 class-based)
 */
function createSingletonVariant(
    BaseConstructor,
    variantName,
    dataType
) {
    class VariantConstructor {
        static [IsSingleton] = true;
        static [DataTypeSymbol] = dataType;
    }

    // Manually set up prototype chain to prevent inheriting static methods
    Object.setPrototypeOf(VariantConstructor.prototype, BaseConstructor.prototype);

    // Set the constructor name for reflection
    Object.defineProperty(VariantConstructor, 'name', {
        value: variantName,
        writable: false,
        configurable: false
    });

    // Create the singleton instance
    const instance = new VariantConstructor();
    Object.freeze(instance);

    return instance;
}

/**
 * Helper to create a structured variant using ES6 class (callable)
 */
function createStructuredVariant(
    BaseConstructor,
    variantName,
    fieldSpecObj,
    dataType
) {
    const fieldNames = Object.keys(fieldSpecObj);

    // Create ES6 class WITHOUT extending - we'll set up prototype chain manually
    // This prevents variant from inheriting ADT's static methods
    class VariantConstructor {
        static _fieldNames = fieldNames;
        static _fieldSpecs = fieldSpecObj;
        static [IsSingleton] = false;
        static [DataTypeSymbol] = dataType;

        constructor(...args) {
            const namedArgs = normalizeConstructorArgs(fieldNames, args, variantName);
            const actualADT = this.constructor[DataTypeSymbol];

            for (const fieldName of fieldNames) {
                validateField(namedArgs[fieldName], fieldSpecObj[fieldName], fieldName, actualADT);
            }

            Object.assign(this, namedArgs);
            Object.freeze(this);
        }
    }

    // Manually set up prototype chain instead of using 'extends' to prevent inheriting static methods
    Object.setPrototypeOf(VariantConstructor.prototype, BaseConstructor.prototype);

    // Set the constructor name for reflection
    Object.defineProperty(VariantConstructor, 'name', {
        value: variantName,
        writable: false,
        configurable: false
    });

    return callable(VariantConstructor);
}

/**
 * Converts constructor arguments to named object form.
 * Supports both named style (single object) and positional style (multiple args).
 * Returns a named args object (never creates instances).
 */
function normalizeConstructorArgs(
    fieldNames,
    args,
    variantName,
    prefix = ''
) {
    // Detect argument style: named (object literal) vs positional
    const firstArg = args[0];

    // Check for named argument form: single object literal with ALL expected field names
    if (args.length === 1 &&
        isObjectLiteral(firstArg) &&
        fieldNames.every(name => name in firstArg)) {
        // Named argument form: Point2D({ x: 3, y: 2 })
        return firstArg;
    }

    // Positional argument form: Point2D(3, 2)
    // Validate arity
    if (args.length !== fieldNames.length) {
        throw new TypeError(
            `Wrong number of arguments. Expected: ${prefix}${variantName}(${fieldNames.join(', ')}), got: ${prefix}${variantName}(${args.map((_, i) => `arg${i}`).join(', ')})`
        );
    }

    // Convert positional args to named object
    const namedArgs = {};
    fieldNames.forEach((fieldName, index) => {
        namedArgs[fieldName] = args[index];
    });

    return namedArgs;
}

/**
 * Creates a Family reference for recursive ADTs
 * Can be used directly as a field spec (Family) or called with type param (Family(T))
 */
function createFamily() {
    // Create the callable function first
    const fn = function (_typeParam) {
        // Calling Family(T) returns the same Family reference
        // In the future, this could track the type param for validation
        return fn;
    };

    // Add the FamilyRef symbol marker
    (fn)[FamilyRefSymbol] = true;

    return fn;
}

/**
 * Unified type validation for spec checking.
 * Used by both input and return type validation.
 * 
 * @param {*} value - The value to validate
 * @param {*} spec - The expected type specification
 * @param {string} opName - Operation name for error messages
 * @param {string} context - Context for error message ("input of type" or "to return")
 */
function validateTypeSpec(value, spec, opName, context) {
    // Handle primitive constructors
    if (spec === Number) {
        if (typeof value !== 'number') {
            throw new TypeError(
                `Operation '${opName}' expected ${context} Number (primitive number), but got ${typeof value}`
            );
        }
    } else if (spec === String) {
        if (typeof value !== 'string') {
            throw new TypeError(
                `Operation '${opName}' expected ${context} String (primitive string), but got ${typeof value}`
            );
        }
    } else if (spec === Boolean) {
        if (typeof value !== 'boolean') {
            throw new TypeError(
                `Operation '${opName}' expected ${context} Boolean (primitive boolean), but got ${typeof value}`
            );
        }
    } else if (typeof spec === 'function') {
        // Custom class/constructor - use instanceof
        // For "to return" context, say "to return instance of X"
        // For "input of type" context, say "input of type X"
        const typePhrase = context === 'to return'
            ? `${context} instance of ${spec.name || 'specified type'}`
            : `${context} ${spec.name || 'specified type'}`;

        if (!(value instanceof spec)) {
            throw new TypeError(
                `Operation '${opName}' expected ${typePhrase}, but got ${value?.constructor?.name || typeof value}`
            );
        }
    }
}

/**
 * Validates that a return value matches the expected type specification.
 * 
 * @param value - The value to validate
 * @param spec - The expected type (constructor function)
 * @param opName - Operation name for error messages
 */
function validateReturnType(value, spec, opName) {
    validateTypeSpec(value, spec, opName, 'to return');
}

/**
 * Validates that a spec doesn't use the Function constructor as a type guard.
 * Using `Function` as a guard enables hackish currying patterns that should use unfold instead.
 * 
 * Note: This checks for the Function constructor specifically (e.g., `{ in: Function }`),
 * NOT custom predicates that happen to be functions (e.g., `{ in: MyClass }` where MyClass
 * is used for instanceof checks). Custom class constructors are allowed.
 * 
 * @param {*} spec - The spec to validate (can be a guard or object literal)
 * @param {string} specType - Either 'in' or 'out' for error messages
 * @param {string} opName - Operation name for error messages
 */
function validateSpecGuard(spec, specType, opName) {
    // Specifically check for Function constructor, not all functions
    if (spec === Function) {
        throw new TypeError(
            `Operation '${opName}' cannot use Function as '${specType}' guard. ` +
            `Use unfold with object literal guards for binary/n-ary operations instead.`
        );
    }

    // Recursively check object literal guards
    if (isObjectLiteral(spec)) {
        for (const [fieldName, fieldSpec] of Object.entries(spec)) {
            if (fieldSpec === Function) {
                throw new TypeError(
                    `Operation '${opName}' cannot use Function as guard for field '${fieldName}' in '${specType}' spec. ` +
                    `Use unfold with object literal guards for binary/n-ary operations instead.`
                );
            }
            // Recursively validate nested object literals
            if (isObjectLiteral(fieldSpec)) {
                validateSpecGuard(fieldSpec, specType, opName);
            }
        }
    }
}

/**
 * Installs an operation on the ADT's prototype.
 * Creates a method that extracts fields and calls the transformer's handler.
 * For fold operations, uses stack-safe iterative traversal instead of recursion.
 * 
 * @param adtClass - The ADT class to install the operation on
 * @param opName - Name of the operation to install
 * @param transformer - The transformer containing the operation logic
 * @param skipIfExists - If true, skip installation if method already exists (default: true)
 */
function installOperationOnADT(adtClass, opName, transformer, skipIfExists = true) {
    // Skip if no prototype or if method already exists and we should skip
    if (!adtClass?.prototype) {
        return;
    }

    if (skipIfExists && adtClass.prototype[opName]) {
        return;
    }

    adtClass.prototype[opName] = function (...args) {
        // Stack-safe fold implementation using explicit stack
        // This avoids deep recursion by using an iterative post-order traversal

        // Enforce at most one argument
        if (args.length > 1) {
            throw new TypeError(
                `Fold operation '${opName}' accepts at most one argument, but ${args.length} were provided`
            );
        }

        const inputArg = args[0];

        // Validate input if spec.in is provided (optional validation)
        if (transformer.inSpec !== undefined && args.length > 0) {
            validateInputType(inputArg, transformer.inSpec, opName);
        }

        // Check if this fold accepts input parameters (has argument)
        const hasInputParam = args.length > 0;

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const root = this;
        // Note: A new WeakMap is created for every fold operation invocation.
        // Memoization is only effective within a single operation call, not across multiple calls.
        // This is intentional to ensure fresh results and avoid memory leaks.
        const memoCache = new WeakMap();

        // Work stack for iterative traversal: [instance, isProcessed]
        const stack = [];
        stack.push({ instance: root, processed: false });

        while (stack.length > 0) {
            const frame = stack[stack.length - 1];

            // If already memoized, skip
            if (memoCache.has(frame.instance)) {
                stack.pop();
                continue;
            }

            // If already processed children, apply handler and memoize
            if (frame.processed) {
                stack.pop();

                const ctorTransform = transformer.getCtorTransform?.(frame.instance.constructor);
                if (!ctorTransform) {
                    throw new Error(
                        `No handler for variant '${frame.instance.constructor.name}' in operation '${opName}'`
                    );
                }

                // Check if this will use a wildcard handler by checking if it's the wildcard function
                const handlers = (transformer)[HandlerMapSymbol];
                const wildcardHandler = handlers && handlers._;
                const isWildcard = wildcardHandler && ctorTransform === wildcardHandler;

                if (isWildcard) {
                    // Wildcard handler receives the full instance
                    const result = ctorTransform.call(frame.instance, frame.instance);
                    memoCache.set(frame.instance, result);
                    continue;
                }

                // Check if this is a singleton or structured variant
                const isSingleton = frame.instance.constructor[IsSingleton];
                const fieldNames = frame.instance.constructor._fieldNames;
                const fieldSpecs = frame.instance.constructor._fieldSpecs;

                if (!isSingleton && fieldNames && fieldNames.length > 0) {
                    // Structured variant - extract fields with memoized values for Family fields
                    const fields = {};

                    for (let i = 0; i < fieldNames.length; i++) {
                        const fieldName = fieldNames[i];
                        const fieldValue = frame.instance[fieldName];

                        // Check if this field is a Family reference (recursive field)
                        if (fieldSpecs && isFamilyRef(fieldSpecs[fieldName])) {
                            // Recursive field - use memoized value
                            if (fieldValue && memoCache.has(fieldValue)) {
                                const memoizedValue = memoCache.get(fieldValue);
                                // For parameterized folds, Family fields become partially applied functions
                                if (hasInputParam) {
                                    // Create a function that accepts the input parameter
                                    fields[fieldName] = (inputArg) => {
                                        // Recursively call the operation with the input parameter
                                        return fieldValue[opName](inputArg);
                                    };
                                } else {
                                    fields[fieldName] = memoizedValue;
                                }
                            } else {
                                // Field doesn't have the operation or wasn't memoized - pass as-is
                                fields[fieldName] = fieldValue;
                            }
                        } else {
                            // Non-recursive field - apply map transform if present
                            // This is needed for merged operations like map+fold (paramorphism)
                            const fieldSpec = fieldSpecs ? fieldSpecs[fieldName] : null;

                            // Check if this field is a type parameter and transformer has map transforms
                            if (transformer.getParamTransform && fieldSpec && isTypeParam(fieldSpec)) {
                                const paramName = (fieldSpec)[TypeParamSymbol];
                                const paramTransform = transformer.getParamTransform(paramName);

                                if (paramTransform && typeof paramTransform === 'function') {
                                    // Apply the map transformation
                                    fields[fieldName] = paramTransform(fieldValue);
                                } else {
                                    // No transform for this parameter - pass as-is
                                    fields[fieldName] = fieldValue;
                                }
                            } else {
                                // Not a type parameter or no map transform - pass as-is
                                fields[fieldName] = fieldValue;
                            }
                        }
                    }

                    const result = hasInputParam ? ctorTransform.call(frame.instance, fields, inputArg) : ctorTransform.call(frame.instance, fields);
                    memoCache.set(frame.instance, result);
                } else {
                    // Singleton variant - no fields to pass
                    const result = hasInputParam ? ctorTransform.call(frame.instance, inputArg) : ctorTransform.call(frame.instance);
                    memoCache.set(frame.instance, result);
                }
                continue;
            }

            // Mark as processed and push children onto stack
            frame.processed = true;

            // Push Family field children onto stack (reverse order for correct processing)
            const isSingleton = frame.instance.constructor[IsSingleton];
            const fieldNames = frame.instance.constructor._fieldNames;
            const fieldSpecs = frame.instance.constructor._fieldSpecs;

            if (!isSingleton && fieldNames && fieldNames.length > 0) {
                // Push children in reverse order so they're processed in correct order
                for (let i = fieldNames.length - 1; i >= 0; i--) {
                    const fieldValue = frame.instance[fieldNames[i]];

                    // Check if this field is a Family reference and has the operation
                    // Intentionally skips Family fields that do not have the operation defined.
                    // This allows for extended ADTs where not all variants/fields implement all operations.
                    if (fieldSpecs && isFamilyRef(fieldSpecs[fieldNames[i]])) {
                        if (fieldValue && typeof fieldValue[opName] !== 'undefined' && !memoCache.has(fieldValue)) {
                            stack.push({ instance: fieldValue, processed: false });
                        }
                    }
                }
            }
        }

        // Return the memoized result for the root
        const result = memoCache.get(root);

        // Runtime validation of spec.out if provided
        if (transformer.outSpec) {
            validateReturnType(result, transformer.outSpec, opName);
        }

        return result;
    };
}

/**
 * Installs a map operation on the ADT's prototype.
 * Creates a method that transforms type parameter fields while preserving structure.
 * Recursively handles Family fields.
 * 
 * @param adtClass - The ADT class to install the operation on
 * @param opName - Name of the operation to install
 * @param transforms - Map of type parameter names to transform functions { T: fn, U: fn }
 * @param outSpec - Optional output type spec for runtime validation
 */
function installMapOperationOnADT(adtClass, opName, transforms, outSpec) {
    // Skip if no prototype
    if (!adtClass?.prototype) {
        return;
    }

    adtClass.prototype[opName] = function (...args) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const instance = this;

        // For singletons, return the same singleton (no transformation needed)
        if (instance.constructor[IsSingleton]) {
            return instance;
        }

        // For structured variants, transform type parameter fields
        const fieldNames = instance.constructor._fieldNames || [];
        const fieldSpecs = instance.constructor._fieldSpecs || {};

        if (fieldNames.length === 0) {
            return instance; // No fields to transform
        }

        // Build transformed fields object
        const transformedFields = {};

        for (const fieldName of fieldNames) {
            const fieldSpec = fieldSpecs[fieldName];
            const fieldValue = instance[fieldName];

            // Check if this field is a type parameter
            if (isTypeParam(fieldSpec)) {
                const paramName = (fieldSpec)[TypeParamSymbol];
                const transform = transforms[paramName];

                if (transform && typeof transform === 'function') {
                    // Apply transformation with arguments
                    transformedFields[fieldName] = transform(fieldValue, ...args);
                } else {
                    // No transform for this parameter, keep as-is
                    transformedFields[fieldName] = fieldValue;
                }
            }
            // Check if this field is a Family reference (recursive)
            else if (isFamilyRef(fieldSpec)) {
                // Recursively transform Family fields, passing arguments
                if (fieldValue && typeof fieldValue[opName] === 'function') {
                    transformedFields[fieldName] = fieldValue[opName](...args);
                } else {
                    transformedFields[fieldName] = fieldValue;
                }
            }
            // Other fields (primitives, ADTs, predicates) pass through unchanged
            else {
                transformedFields[fieldName] = fieldValue;
            }
        }

        // Create a fresh instance with transformed fields
        const ConstructorFn = instance.constructor;
        const result = Reflect.construct(ConstructorFn, [transformedFields]);

        if (outSpec) {
            validateReturnType(result, outSpec, opName);
        }

        return result;
    };
}

/**
 * Collects variant types (singleton vs structured) from all variants in an ADT.
 * 
 * @param adt - The ADT class to collect variant types from
 * @returns Map of variant names to their type ('singleton' | 'structured')
 */
function collectVariantTypes(adt) {
    const allVariants = collectVariantsFromChain(adt);
    const variantTypes = new Map();

    for (const [variantName, variant] of allVariants) {
        // Skip if variant is undefined/null (shouldn't happen but be safe)
        if (!variant) continue;

        const checkTarget = typeof variant === 'function' ? variant : variant.constructor;
        // Skip if no constructor (shouldn't happen with proper variants)
        if (!checkTarget) continue;

        const isSingleton = (checkTarget)[IsSingleton] === true;
        variantTypes.set(variantName, isSingleton ? 'singleton' : 'structured');
    }

    return variantTypes;
}

/**
 * Collects all variants from an ADT and its prototype chain.
 * Returns a map of variant names to variant values (constructors or singletons).
 * Child variants override parent variants with the same name.
 * 
 * @param adt - The ADT class to collect variants from
 * @param accumulated - Accumulated variants from child classes (for recursion)
 * @returns Map of variant names to their values
 */
function collectVariantsFromChain(adt, accumulated = new Map()) {
    // Base case: reached top of prototype chain
    if (!adt || adt === Function.prototype || adt === Object.prototype) {
        return accumulated;
    }

    // Collect variants from current level
    for (const key of Object.keys(adt)) {
        if (key === 'extend' || key === 'match' || key.startsWith('_')) {
            continue;
        }
        // Only add if not already present (child overrides parent)
        if (!accumulated.has(key)) {
            accumulated.set(key, adt[key]);
        }
    }

    // Recursive case: walk up the prototype chain
    return collectVariantsFromChain(Object.getPrototypeOf(adt), accumulated);
}

/**
 * Creates a ParentFamily proxy that allows calling parent handlers.
 * Used in fold callback: (Family, ParentFamily) => ({ ... })
 * Handlers can call ParentFamily.VariantName(fields) to invoke parent handler.
 * 
 * @param parentHandlers - Handler map from parent transformer
 * @param parentADT - The parent ADT class (for context binding)
 * @returns Proxy object with variant handler methods
 */
function createParentFamilyProxy(
    parentHandlers,
    _parentADT
) {
    const proxy = {};

    // Add all specific variant handlers
    for (const [variantName, handler] of Object.entries(parentHandlers)) {
        if (variantName !== '_') {
            // Regular variant handler
            proxy[variantName] = function (...args) {
                // Call parent handler with proper context
                return handler.call(this, ...args);
            };
        }
    }

    // Always provide wildcard method that looks up specific handler or uses parent wildcard
    proxy._ = (instance) => {
        const specificHandler = parentHandlers[instance.constructor.name];
        if (specificHandler) {
            // Use specific parent handler if it exists
            const isSingleton = instance.constructor[IsSingleton];
            if (isSingleton) {
                return specificHandler.call(instance);
            } else {
                // Extract fields for structured variant
                const fieldNames = instance.constructor._fieldNames || [];
                const fields = {};
                for (const fieldName of fieldNames) {
                    fields[fieldName] = instance[fieldName];
                }
                return specificHandler.call(instance, fields);
            }
        } else if (parentHandlers._) {
            // Fall back to parent's wildcard handler if it exists
            return parentHandlers._.call(instance, instance);
        } else {
            // No handler found
            throw new Error(
                `No handler for variant '${instance.constructor.name}' in parent operation`
            );
        }
    };

    return proxy;
}

/**
 * Creates shadow variants for overridden inherited variants.
 * Shadow variants prevent parent ADT instances from being affected by child overrides.
 * 
 * @param actualADT - The child ADT class
 * @param parentHandlers - Handler map from parent transformer
 * @param handlersInput - New handlers from child
 * @param variantTypes - Map of variant names to their types
 * @param shadowAll - If true, shadow ALL inherited variants (for polymorphic recursion in fold)
 * @returns Map of variant names to their shadow variants
 */
function createShadowVariants(
    actualADT,
    parentHandlers,
    handlersInput,
    variantTypes,
    shadowAll = false
) {
    let shadowMap = shadowedVariants.get(actualADT);
    if (!shadowMap) {
        shadowMap = new Map();
        shadowedVariants.set(actualADT, shadowMap);
    }

    for (const variantName of Object.keys(handlersInput)) {
        if (variantName === '_') continue; // Skip wildcard

        // Check if this is an override (parent handler exists)
        const parentHandler = parentHandlers[variantName];
        if (!parentHandler) continue; // Not an override

        // Check if this is an inherited variant (not defined directly on this ADT)
        const isInherited = !Object.prototype.hasOwnProperty.call(actualADT, variantName);
        if (!isInherited) continue; // Variant is defined on this ADT, no need to copy

        // Get the inherited variant
        const inheritedVariant = actualADT[variantName];
        const variantType = variantTypes.get(variantName);

        if (variantType === 'singleton') {
            // For singleton variants, just use the inherited singleton instance directly
            // No need to create a copy since singletons are immutable
            shadowMap.set(variantName, inheritedVariant);
        } else {
            // For structured variants, just use the inherited variant constructor directly
            // Since we're not extending variant constructors anymore, we can reuse them
            shadowMap.set(variantName, inheritedVariant);
        }
    }

    // If shadowAll is true, also shadow ALL other inherited variants (even those without overrides)
    // This is needed for polymorphic recursion in fold operations
    if (shadowAll) {
        const allVariants = collectVariantsFromChain(actualADT);
        for (const [variantName, variant] of allVariants) {
            // Skip if already shadowed
            if (shadowMap.has(variantName)) continue;

            // Skip wildcard
            if (variantName === '_') continue;

            // Check if this is an inherited variant
            const isInherited = !Object.prototype.hasOwnProperty.call(actualADT, variantName);
            if (!isInherited) continue; // Not inherited, no need to shadow

            const variantType = variantTypes.get(variantName);

            if (variantType === 'singleton') {
                // For singleton variants, just use the inherited singleton instance directly
                shadowMap.set(variantName, variant);
            } else {
                // For structured variants, just use the inherited variant constructor directly
                shadowMap.set(variantName, variant);
            }
        }
    }

    return shadowMap;
}

/**
 * Validates that all handler keys correspond to actual variants
 */
function validateHandlerKeys(handlers, variantNames, operationName) {
    const validKeys = new Set([...variantNames, '_']);

    for (const key of Object.keys(handlers)) {
        if (!validKeys.has(key)) {
            throw new Error(
                `Handler '${key}' in fold operation '${operationName}' does not match any variant. Valid variants are: ${Array.from(variantNames).join(', ')}`
            );
        }
    }
}

/**
 * Checks if a value is a valid field specification
 */
function isFieldSpec(value) {
    return typeof value === 'function' || isFamilyRef(value) || isTypeParam(value);
}

/**
 * Checks if a variant value is structured (non-empty object literal with FieldSpec values)
 */
function isStructuredVariant(value) {
    // Must be a plain object literal
    if (!isObjectLiteral(value)) return false;

    const keys = Object.keys(value);

    // Empty object {} = singleton
    if (keys.length === 0) return false;

    // All values must be valid field specs
    return keys.every(key => isFieldSpec(value[key]));
}

/**
 * Validates a value against a field specification
 */
function validateField(value, spec, fieldName, adtClass) {
    // Handle type parameters - look up instantiated type from ADT class
    if (isTypeParam(spec)) {
        const paramName = spec[TypeParamSymbol];

        // Look up the type args from the ADT class
        if (adtClass && adtClass[TypeArgsSymbol]) {
            const typeArgs = adtClass[TypeArgsSymbol];
            const instantiatedType = typeArgs[paramName];

            if (instantiatedType) {
                // Recursively validate against the instantiated type
                validateField(value, instantiatedType, fieldName, adtClass);
                return;
            }
        }

        // If no instantiated type found, skip validation (generic case)
        return;
    }

    // Handle Family reference
    if (isFamilyRef(spec)) {
        if (!adtClass) {
            throw new Error('FamilyRef used without ADT class context');
        }

        // Check if value is instance of the ADT or any parent ADT in the chain
        let currentADT = adtClass;
        let isValidFamily = false;

        while (currentADT && !isValidFamily) {
            if (value instanceof currentADT) {
                isValidFamily = true;
                break;
            }
            // Walk up the prototype chain to check parent ADTs
            currentADT = Object.getPrototypeOf(currentADT);
            // Stop if we've reached Function.prototype or Object.prototype
            if (currentADT === Function.prototype || currentADT === Object.prototype) {
                break;
            }
        }

        if (!isValidFamily) {
            throw new TypeError(`Field '${fieldName}' must be an instance of the same ADT family`);
        }
        return;
    }

    // Validate built-in constructors with typeof checks
    if (spec === Number && typeof value !== 'number') {
        throw new TypeError(`Field '${fieldName}' must be an instance of Number`);
    }
    if (spec === String && typeof value !== 'string') {
        throw new TypeError(`Field '${fieldName}' must be an instance of String`);
    }
    if (spec === Boolean && typeof value !== 'boolean') {
        throw new TypeError(`Field '${fieldName}' must be an instance of Boolean`);
    }
    if (spec === BigInt && typeof value !== 'bigint') {
        throw new TypeError(`Field '${fieldName}' must be an instance of BigInt`);
    }
    if (spec === Symbol && typeof value !== 'symbol') {
        throw new TypeError(`Field '${fieldName}' must be an instance of Symbol`);
    }

    // For Array, Date, RegExp, Object - use instanceof
    if (spec === Array && !Array.isArray(value)) {
        throw new TypeError(`Field '${fieldName}' must be an instance of Array`);
    }
    if (spec === Date && !(value instanceof Date)) {
        throw new TypeError(`Field '${fieldName}' must be an instance of Date`);
    }
    if (spec === RegExp && !(value instanceof RegExp)) {
        throw new TypeError(`Field '${fieldName}' must be an instance of RegExp`);
    }
    if (spec === Object && (typeof value !== 'object' || value === null)) {
        throw new TypeError(`Field '${fieldName}' must be an instance of Object`);
    }

    // Early return if it's a built-in constructor (already validated above)
    if (spec === Number || spec === String || spec === Boolean ||
        spec === BigInt || spec === Symbol || spec === Array ||
        spec === Date || spec === RegExp || spec === Object) {
        return;
    }

    if (isConstructable(spec)) {
        // Special case: if spec is a parameterized ADT instance (e.g., Maybe(Number)),
        // we need to check if value is an instance of that specific instantiation
        if (spec[IsParameterizedInstance]) {
            // For parameterized ADTs, check if the value is an instance of this or any
            // parameterized instance of the same parent ADT
            const parentADT = spec[ParentADTSymbol];

            // Check if value's constructor exists in spec's variants
            // This handles cases like: MaybeNum.Just({ value: 1 }) validates against MaybeNum
            const variantName = value.constructor?.name;
            if (variantName && spec[variantName]) {
                // Valid if the value was constructed by a variant of this parameterized ADT
                return;
            }

            // Also check if value's constructor exists in the parent ADT
            // This allows instances from different parameterizations to work together
            if (parentADT && variantName && parentADT[variantName]) {
                // Valid if the value was constructed by a variant of the parent ADT
                return;
            }

            throw new TypeError(
                `Field '${fieldName}' must be an instance of parameterized type ${spec.name || 'specified type'}`
            );
        }

        // ADT class - check instanceof
        if (!(value instanceof spec)) {
            throw new TypeError(`Field '${fieldName}' must be an instance of ${spec.name || 'ADT'}`);
        }
    } else if (typeof spec === 'function') {
        // Predicate function (not a constructor)
        const predicateFn = spec;
        if (!predicateFn(value)) {
            throw new TypeError(`Field '${fieldName}' failed predicate validation`);
        }
    }
}

/**
 * Defines a new algebraic data type (ADT) with the given variants.
 * Validation is performed at runtime.
 */
export function data(declOrFn) {
    const isCallbackStyle = typeof declOrFn === 'function';

    // Extract type parameter names from callback function if callback style
    let typeParamNames = [];
    if (isCallbackStyle) {
        const fnStr = declOrFn.toString();
        // Match destructured parameters: ({ Family, T, ItemType }) =>
        // Or regular function: function({ Family, T })
        const destructuredMatch = fnStr.match(/^\s*(?:function\s*[^(]*)?\(\s*\{\s*([^}]+)\s*\}/);

        if (destructuredMatch) {
            const params = destructuredMatch[1];
            // Parse parameter names: "Family, T, U" or "Family, ItemType, ValueType"
            typeParamNames = params
                .split(',')
                .map(p => p.trim())
                .filter(p => p && p !== 'Family'); // Exclude Family as it's not a type param
        }
    }

    // typeArgs parameter stores instantiated types (e.g., List(Number) passes Number)
    // These are validated at runtime when constructing variants
    // parentADT is the uninstantiated generic ADT (e.g., List when creating List(Number))
    function createADT(typeArgs, parentADT = null) {
        // Create the base ADT class
        const BaseClass = parentADT || class ADT {
            // Allow subclasses to instantiate
        };

        // For parameterized instances, create a subclass
        let ADT;
        if (typeArgs && parentADT) {
            ADT = class extends BaseClass { };
            ADT[IsParameterizedInstance] = true;
            ADT[ParentADTSymbol] = parentADT;
            ADT[TypeArgsSymbol] = typeArgs;
        } else {
            ADT = BaseClass;
        }

        /**
         * Register a transformer for an operation.
         * @internal
         */
        ADT._registerTransformer = function (name, transformer, skipCollisionCheck = false) {
            // Get or create the registry for this ADT function
            let registry = adtTransformers.get(this);
            if (!registry) {
                // If parent has a registry, copy it
                const parentRegistry = adtTransformers.get(Object.getPrototypeOf(this));
                registry = parentRegistry ? new Map(parentRegistry) : new Map();
                adtTransformers.set(this, registry);
            }

            // Check if operation already exists on this ADT (not parent)
            if (registry.has(name) && !skipCollisionCheck) {
                throw new Error(
                    `Operation '${name}' is already defined on this ADT. Use '.extendMatch()' in a subtype to extend it with new handlers.`
                );
            }

            // Check for name collision with variant fields (unless skipped)
            if (!skipCollisionCheck) {
                // Iterate through variant constructors/instances
                for (const key of Object.keys(this)) {
                    if (key === 'extend' || key.startsWith('_')) {
                        continue;
                    }

                    const variant = this[key];

                    // Check if this is a function (constructor)
                    if (typeof variant === 'function') {
                        // Check if it's a structured variant with fields
                        if (!variant[IsSingleton] && variant._fieldNames?.includes(name)) {
                            throw new Error(
                                `Operation name '${name}' conflicts with field '${name}' in variant '${key}'`
                            );
                        }
                    }
                    // For singleton variants, check their properties directly
                    else if (variant && typeof variant === 'object' && !Array.isArray(variant)) {
                        if (name in variant) {
                            throw new Error(
                                `Operation name '${name}' conflicts with field '${name}' in variant '${key}'`
                            );
                        }
                    }
                }
            }

            registry.set(name, transformer);
        };

        /**
         * Get a registered transformer by name.
         * Looks up the prototype chain to find inherited transformers.
         * @internal
         */
        ADT._getTransformer = function (name) {
            const registry = adtTransformers.get(this);
            if (registry?.has(name)) {
                return registry.get(name);
            }

            // Check parent
            const parent = Object.getPrototypeOf(this);
            if (parent && parent._getTransformer) {
                return parent._getTransformer(name);
            }

            return undefined;
        };

        /**
         * Get all registered transformer names.
         * @internal
         */
        ADT._getTransformerNames = function () {
            const registry = adtTransformers.get(this);
            return registry ? Array.from(registry.keys()) : [];
        };

        /**
         * Define a fold operation.
         * For recursive ADTs: performs catamorphism (structural recursion), replacing constructors with functions.
         * For non-recursive ADTs: performs pattern matching, dispatching on variant constructors.
         * 
         * When called on an extended ADT with an operation name that exists on the parent:
         * - Automatically extends the parent operation (inherits parent handlers)
         * - New variants require handlers, inherited variants can be overridden
         * - Supports parent access via the `parent` symbol
         * 
         * @param name - Name of the operation (becomes instance method name)
         * @param spec - Type specification { out: ReturnType }
         * @param handlersOrFn - Handler map or callback returning handlers
         * @returns The ADT with the fold operation installed
         */
        ADT.fold = function (
            name,
            spec,
            handlersOrFn
        ) {
            // Normalize handlersOrFn to always be a function
            // If it's an object, wrap it in a function that ignores parameters
            const handlersFn = typeof handlersOrFn === 'function'
                ? handlersOrFn
                : (_adt, _parentFamily) => handlersOrFn;
            // Store spec for runtime validation
            const outSpec = spec?.out;

            // Validate that spec doesn't use Function guards
            if (spec?.in) {
                validateSpecGuard(spec.in, 'in', name);
            }
            if (spec?.out) {
                validateSpecGuard(spec.out, 'out', name);
            }

            // 'this' is the ADT function
            const actualADT = this;
            const parentADT = Object.getPrototypeOf(actualADT);

            // If no spec provided, check that handlers don't return functions (to prevent currying pattern)
            const shouldCheckForFunctions = !spec || (!spec.in && !spec.out);

            // Check if parent has this operation (indicates extend behavior)
            const parentTransformer = parentADT && parentADT._getTransformer && parentADT._getTransformer(name);

            if (parentTransformer) {
                // EXTEND MODE: Parent has operation, extend it
                const immediateParentHandlers = (parentTransformer)[HandlerMapSymbol];
                if (!immediateParentHandlers) {
                    throw new Error(
                        `Cannot extend fold operation '${name}': parent transformer has no handler map`
                    );
                }

                // Check for duplicate extension
                const currentRegistry = adtTransformers.get(actualADT);
                const currentTransformer = currentRegistry?.get(name);
                if (currentTransformer && currentTransformer !== parentTransformer) {
                    throw new Error(
                        `Operation '${name}' has already been extended on this ADT. Only one fold per operation per ADT level is allowed.`
                    );
                }

                // Collect ALL handlers from the entire inheritance chain
                // This ensures deep extensions (A → B → C) work correctly
                const parentHandlers = immediateParentHandlers;

                // Create ParentFamily object that provides access to parent handlers
                const ParentFamily = createParentFamilyProxy(parentHandlers, parentADT);

                // Resolve handlers with ParentFamily parameter
                const handlersInput = handlersFn(this, ParentFamily);
                const variantTypes = collectVariantTypes(actualADT);

                // Validate handler keys
                const allVariantsForValidation = collectVariantsFromChain(actualADT);
                const variantNames = new Set(Array.from(allVariantsForValidation.keys()));
                validateHandlerKeys(handlersInput, variantNames, name);

                // Create transformer with proper handler lookup:
                // Think of it like class method lookup:
                // - Specific handlers are methods on variant classes
                // - Wildcard handlers are methods on the ADT class
                // - Child ADT class methods override parent ADT class methods
                // So: child specific → child wildcard → parent specific → parent wildcard
                const transformer = createTransformer({
                    name,
                    outSpec,
                    getCtorTransform: (ctor) => {
                        const variantName = ctor.name;

                        // Check child's specific handler (method on variant class in child ADT)
                        if (handlersInput[variantName]) {
                            const handler = handlersInput[variantName];
                            // If no spec, wrap to prevent Function returns (currying pattern)
                            return shouldCheckForFunctions ? (arg) => {
                                const result = handler(arg);
                                if (typeof result === 'function') {
                                    throw new TypeError(
                                        `Operation '${name}' handler for '${variantName}' returned a function. ` +
                                        `Functions cannot be returned without an explicit spec. ` +
                                        `Use unfold with object literal guards for binary/n-ary operations instead.`
                                    );
                                }
                                return result;
                            } : handler;
                        }

                        // Check child's wildcard (method on child ADT class)
                        if (handlersInput._) {
                            return handlersInput._;
                        }

                        // Check parent's specific handler (method on variant class in parent ADT)
                        if (parentHandlers[variantName]) {
                            return parentHandlers[variantName];
                        }

                        // Check parent's wildcard (method on parent ADT class)
                        if (parentHandlers._) {
                            return parentHandlers._;
                        }

                        // No handler found
                        return () => {
                            throw new Error(
                                `No handler for variant '${variantName}' in operation '${name}'`
                            );
                        };
                    }
                });

                // Store handlers on transformer for wildcard detection
                transformer[HandlerMapSymbol] = { ...parentHandlers, ...handlersInput };
                actualADT._registerTransformer(name, transformer, true);

                // Create shadow variants for overridden inherited variants
                const shadowMap = createShadowVariants(actualADT, parentHandlers, handlersInput, variantTypes, true);

                // Install operation on ADT prototype
                installOperationOnADT(actualADT, name, transformer, false);

                // Copy shadow variants to actualADT to replace inherited variants
                // Use Object.defineProperty to replace writable but non-configurable properties
                for (const [variantName, shadowVariant] of shadowMap) {
                    Object.defineProperty(actualADT, variantName, {
                        value: shadowVariant,
                        writable: true,
                        enumerable: true,
                        configurable: false
                    });
                }

                return this;
            } else {
                // NEW OPERATION MODE: Create new operation
                const handlers = handlersFn(this, undefined);

                // Validate handler keys
                const allVariantsForValidation = collectVariantsFromChain(actualADT);
                const variantNames = new Set(Array.from(allVariantsForValidation.keys()));
                validateHandlerKeys(handlers, variantNames, name);

                const transformer = createFoldTransformer(name, handlers, outSpec, spec?.in);

                actualADT._registerTransformer(name, transformer);

                // Install operation method on ADT prototype
                installOperationOnADT(actualADT, name, transformer, false);

                return this;
            }
        }

        /**
         * Validates that an input value matches the expected type specification.
         * 
         * @param value - The value to validate
         * @param spec - The expected type (constructor function)
         * @param opName - Operation name for error messages
         */
        function validateInputType(value, spec, opName) {
            validateTypeSpec(value, spec, opName, 'input of type');
        }

        /**
         * Define an unfold operation (anamorphism).
         * Creates a static constructor method that generates ADT instances from seed values.
         * Cases are evaluated in order; the first case returning non-null wins.
         * 
         * @param name - Name of the constructor (must be PascalCase, becomes static method)
         * @param spec - Type specification { in: SeedType, out: ADT }
         * @param cases - Object mapping variant names to case functions
         * @returns The ADT with the unfold constructor installed
         */
        ADT.unfold = function (name, spec, cases) {
            // Validate that name is PascalCase
            if (!isPascalCase(name)) {
                throw new Error(
                    `Unfold operation name '${name}' must be PascalCase (start with uppercase letter)`
                );
            }

            const actualADT = this;

            // Resolve spec first if it's a callback
            let resolvedSpec;
            if (typeof spec === 'function') {
                resolvedSpec = spec(actualADT);
            } else {
                resolvedSpec = spec;
            }

            // Validate that spec doesn't use Function guards
            if (resolvedSpec?.in) {
                validateSpecGuard(resolvedSpec.in, 'in', name);
            }
            if (resolvedSpec?.out) {
                validateSpecGuard(resolvedSpec.out, 'out', name);
            }

            // Check for name collision with existing variants
            if (name in actualADT) {
                throw new Error(
                    `Unfold operation name '${name}' conflicts with existing variant or method`
                );
            }

            // Get all variants from spec.out if provided, otherwise from this ADT
            // This allows unfold to construct instances of a different ADT type
            const targetADT = resolvedSpec?.out || actualADT;
            const allVariants = collectVariantsFromChain(targetADT);

            // Create the unfold function that evaluates cases in order
            const unfoldFn = (seed) => {
                // Runtime validation of spec.in if provided
                if (resolvedSpec?.in) {
                    validateInputType(seed, resolvedSpec.in, name);
                }

                // Evaluate cases in declaration order (object property order)
                for (const [variantName, caseFn] of Object.entries(cases)) {
                    const result = caseFn(seed);

                    // null means case doesn't apply, continue to next case
                    if (result === null || result === undefined) {
                        continue;
                    }

                    // Non-null result means this case matches
                    // Find the variant constructor
                    const variant = allVariants.get(variantName);
                    if (!variant) {
                        throw new Error(
                            `Unknown variant '${variantName}' in unfold operation '${name}'`
                        );
                    }

                    const isSingleton = typeof variant === 'object' && variant.constructor[IsSingleton];

                    // Handle singleton vs structured variant
                    if (isSingleton || !result || Object.keys(result).length === 0) {
                        return variant;
                    }

                    // For structured variants, recursively unfold Family fields
                    const fieldSpecs = variant._fieldSpecs || {};
                    const processedFields = {};

                    for (const [fieldName, fieldSpec] of Object.entries(fieldSpecs)) {
                        const fieldValue = result[fieldName];

                        // If this field is a Family reference, recursively call unfold
                        if (isFamilyRef(fieldSpec)) {
                            processedFields[fieldName] = unfoldFn(fieldValue);
                        } else {
                            processedFields[fieldName] = fieldValue;
                        }
                    }

                    // Call the actual variant constructor with processed fields
                    return variant(processedFields);
                }

                // No case matched
                return undefined;
            };

            // Create and register a transformer for this unfold operation
            // This allows merge to compose unfold with other operations
            // Store the cases for deforestation optimization in merge
            const transformer = createTransformer({
                name,
                outSpec: resolvedSpec?.out,
                generator: (Family) => unfoldFn
            });

            // Store unfold cases and spec for access during merge deforestation
            transformer.unfoldCases = cases;
            transformer.unfoldSpec = resolvedSpec;

            actualADT._registerTransformer(name, transformer, true); // Skip collision check since we already checked

            // Simply add the unfold method to the ADT (ES5 approach - mutate the ADT)
            actualADT[name] = unfoldFn;

            return actualADT;
        };

        /**
         * Define a map operation for transforming type parameters.
         * Map preserves the ADT structure while transforming type parameter values.
         * 
         * @param name - Name of the map operation (must be camelCase)
         * @param spec - Type specification { out: (T) => ADT } or callback (Family) => ({ out: Family })
         * @param transformsOrFn - Either an object { T: fn, U: fn } or a callback (Family) => transforms
         * @returns The ADT with the map operation installed
         */
        ADT.map = function (
            name,
            spec,
            transformsOrFn
        ) {
            // Validate that name is camelCase
            if (!isCamelCase(name)) {
                throw new Error(
                    `Map operation '${name}' must be camelCase (start with lowercase letter)`
                );
            }

            // 'this' is the ADT function
            const actualADT = this;

            // Resolve spec - support both callback and direct object
            let resolvedSpec;
            if (typeof spec === 'function') {
                // Callback form: (Family) => ({ out: Family })
                resolvedSpec = spec(actualADT);
            } else {
                // Direct object form
                resolvedSpec = spec;
            }

            // Extract outSpec from resolved spec (optional)
            const outSpec = resolvedSpec?.out;

            // Validate that spec doesn't use Function guards
            if (resolvedSpec?.in) {
                validateSpecGuard(resolvedSpec.in, 'in', name);
            }
            if (resolvedSpec?.out) {
                validateSpecGuard(resolvedSpec.out, 'out', name);
            }

            // Collect all variants to detect name collisions
            const allVariants = collectVariantsFromChain(actualADT);

            // Check for name collisions with variant fields
            for (const [variantName, variant] of allVariants) {
                const fieldNames = variant._fieldNames || [];
                if (fieldNames.includes(name)) {
                    throw new Error(
                        `Operation name '${name}' conflicts with field '${name}' in variant '${variantName}'`
                    );
                }
            }

            // Resolve transforms - support both callback and direct object
            let transforms;
            if (typeof transformsOrFn === 'function') {
                // Callback form: (Family) => transforms
                // Create a dummy Family for the callback
                const dummyFamily = createFamily();
                transforms = transformsOrFn(dummyFamily);
            } else {
                // Direct object form
                transforms = transformsOrFn;
            }

            // Validate transforms is an object
            if (!transforms || typeof transforms !== 'object') {
                throw new Error(
                    `Map operation '${name}' requires transforms object { T: fn, U: fn, ... }`
                );
            }

            // Create transformer for this map operation
            const transformer = createTransformer({
                name,
                outSpec, // Use spec.out for runtime validation
                getParamTransform: (paramName) => {
                    return transforms[paramName];
                }
                // Note: No getCtorTransform for pure map operations
            });

            // Store transformer
            actualADT._registerTransformer(name, transformer);

            // Install map operation on ADT prototype
            installMapOperationOnADT(actualADT, name, transforms, outSpec);

            return actualADT;
        };

        /**
         * Merge multiple operations into a single fused operation (deforestation).
         * Eliminates intermediate data structure construction by composing transformers.
         * 
         * Supports multiple morphisms:
         * - Hylomorphism: unfold + fold (generate then consume, e.g., factorial)
         * - Paramorphism: map + fold (transform then consume)
         * - Apomorphism: unfold + map (generate then transform)
         * - Complex pipelines: unfold + map + fold
         * 
         * Composition is left-to-right: operations are applied in array order.
         * 
         * Rules:
         * - Maximum 1 unfold operation
         * - Maximum 1 fold operation
         * - Any number of map operations
         * - All operations must exist on this ADT
         * 
         * Installation:
         * - If merged operation includes unfold: installed as static method (ADT.operationName(seed))
         * - Otherwise: installed as instance method (instance.operationName())
         * 
         * @param name - Name for the merged operation (camelCase for instance methods, PascalCase for static)
         * @param operationNames - Array of operation names to merge (in execution order)
         * @returns The ADT with the merged operation installed
         * 
         * @example
         * const List = data(({ Family }) => ({
         *   Nil: {},
         *   Cons: { head: Number, tail: Family }
         * }))
         * .unfold('counter', { in: Number, out: List }, (n) => ...)
         * .fold('product', { out: Number }, { ... })
         * .merge('factorial', ['counter', 'product']);
         * 
         * List.factorial(5); // 120 - no intermediate list created!
         */
        ADT.merge = function (name, operationNames) {
            if (!name || typeof name !== 'string') {
                throw new Error('Merge operation requires a name (string)');
            }

            if (!Array.isArray(operationNames) || operationNames.length === 0) {
                throw new Error(
                    `Merge operation '${name}' requires a non-empty array of operation names to merge`
                );
            }

            const actualADT = this;

            // Validate minimum 2 operations for meaningful composition
            if (operationNames.length < 2) {
                throw new Error(
                    `Merge requires at least 2 operations, but got ${operationNames.length}. Use the original operation instead of merging a single operation.`
                );
            }

            // Lookup all transformers by name
            const transformers = [];
            for (const opName of operationNames) {
                const transformer = actualADT._getTransformer(opName);
                if (!transformer) {
                    throw new Error(
                        `Cannot merge: operation '${opName}' not found on ADT. Available operations: ${actualADT._getTransformerNames().join(', ') || 'none'}`
                    );
                }
                transformers.push(transformer);
            }

            // Compose transformers using multi-way composition
            const mergedTransformer = composeMultipleTransformers(transformers, name);

            // Register the merged transformer (skipCollisionCheck=false to detect name collisions)
            actualADT._registerTransformer(name, mergedTransformer, false);

            // Determine installation strategy based on presence of generator (unfold)
            const hasUnfold = mergedTransformer.generator !== undefined;

            if (hasUnfold) {
                // Install as static method (unfold-style)
                // Validate that name is PascalCase for static methods
                if (!isPascalCase(name)) {
                    throw new Error(
                        `Merged operation '${name}' with unfold must be PascalCase (start with uppercase letter)`
                    );
                }

                // Check for name collision with existing variants
                if (name in actualADT) {
                    throw new Error(
                        `Merged operation name '${name}' conflicts with existing variant or method`
                    );
                }

                // Get all variants from this ADT
                const allVariants = collectVariantsFromChain(actualADT);

                // Find the original unfold operation to get its spec
                const unfoldOp = transformers.find(t => t.generator);
                const unfoldOpName = operationNames[transformers.indexOf(unfoldOp)];

                // Extract spec from the original unfold operation's function
                // Note: Unfold operations don't store spec in transformer, so we infer from last transformer
                const spec = {
                    in: mergedTransformer.inSpec,
                    out: mergedTransformer.outSpec
                };

                // Create the merged unfold function that uses deforestation
                // For unfold+fold composition (hylomorphism), we avoid creating intermediate structures
                // by applying fold handlers directly during the unfold process
                const mergedUnfoldFn = (seed) => {
                    // Runtime validation of spec.in if provided
                    if (spec?.in) {
                        validateInputType(seed, spec.in, name);
                    }

                    // Check if we have a fold in the composition for deforestation
                    const hasFold = mergedTransformer.getCtorTransform !== undefined;
                    const hasMap = mergedTransformer.getParamTransform !== undefined;

                    if (hasFold) {
                        // DEFORESTATION PATH: unfold+fold or unfold+map+fold composition
                        // Instead of creating ADT instances, directly compute fold results
                        // If there's a map, apply transformations to type parameters during folding

                        // Get the unfold cases from the original unfold transformer
                        const unfoldCases = unfoldOp.unfoldCases;
                        if (!unfoldCases) {
                            throw new Error(
                                `Cannot perform deforestation: unfold operation '${unfoldOpName}' missing case information`
                            );
                        }

                        const deforestedUnfold = (currentSeed) => {
                            // Evaluate unfold cases in order
                            for (const [variantName, caseFn] of Object.entries(unfoldCases)) {
                                const result = caseFn(currentSeed);

                                // null means case doesn't apply
                                if (result === null || result === undefined) {
                                    continue;
                                }

                                // Get the variant
                                const variant = allVariants.get(variantName);
                                if (!variant) {
                                    throw new Error(
                                        `Unknown variant '${variantName}' in unfold operation '${unfoldOpName}'`
                                    );
                                }

                                // Determine the constructor to pass to getCtorTransform
                                // For structured variants: variant is a constructor function
                                // For singletons: variant is an instance (object), use its constructor
                                const isSingleton = typeof variant === 'object';
                                const variantCtor = isSingleton ? variant.constructor : variant;

                                // Debug: ensure we have a valid constructor with a name
                                if (!variantCtor || typeof variantCtor !== 'function' || !variantCtor.name) {
                                    throw new Error(
                                        `Invalid variant constructor for '${variantName}': ${variantCtor}. ` +
                                        `Variant type: ${typeof variant}, variantCtor type: ${typeof variantCtor}, ` +
                                        `constructor.name: ${variantCtor?.name}`
                                    );
                                }

                                // Get the fold handler for this variant
                                const foldHandler = mergedTransformer.getCtorTransform(variantCtor);

                                // Handle singleton vs structured variant
                                if (isSingleton || !result || Object.keys(result).length === 0) {
                                    // For singletons, call fold handler with no arguments
                                    return foldHandler();
                                }

                                // For structured variants, recursively process fields
                                const fieldSpecs = variant._fieldSpecs || {};
                                const processedFields = {};

                                for (const [fieldName, fieldSpec] of Object.entries(fieldSpecs)) {
                                    const fieldValue = result[fieldName];

                                    // If this field is a Family reference, recursively apply deforestation
                                    if (isFamilyRef(fieldSpec)) {
                                        processedFields[fieldName] = deforestedUnfold(fieldValue);
                                    } else if (hasMap && isTypeParam(fieldSpec)) {
                                        // If there's a map and this is a type parameter, apply the map transformation
                                        const paramName = fieldSpec[TypeParamSymbol];
                                        const mapTransform = mergedTransformer.getParamTransform(paramName);
                                        processedFields[fieldName] = mapTransform ? mapTransform(fieldValue) : fieldValue;
                                    } else {
                                        processedFields[fieldName] = fieldValue;
                                    }
                                }

                                // Call fold handler with recursively computed and potentially mapped field values
                                return foldHandler(processedFields);
                            }

                            return undefined;
                        };

                        const result = deforestedUnfold(seed);

                        // Runtime validation of spec.out if provided
                        if (spec?.out && result !== undefined) {
                            validateReturnType(result, spec.out, name);
                        }

                        return result;
                    } else {
                        // NO DEFORESTATION: unfold or unfold+map (no fold)
                        // Use standard unfold path which creates ADT instances
                        const unfoldFn = mergedTransformer.generator(actualADT);
                        let result = unfoldFn(seed);

                        // If there's a map in the composition, apply it
                        if (hasMap) {
                            const mapIndex = transformers.findIndex(t => t.getParamTransform && !t.getCtorTransform);
                            if (mapIndex !== -1) {
                                const mapOpName = operationNames[mapIndex];
                                if (result && typeof result[mapOpName] === 'function') {
                                    result = result[mapOpName]();
                                }
                            }
                        }

                        return result;
                    }
                };

                // Install as static method on the ADT
                actualADT[name] = mergedUnfoldFn;
            } else {
                // Install as instance method (fold or map style)
                // Validate that name is camelCase for instance methods
                if (!isCamelCase(name)) {
                    throw new Error(
                        `Merged operation '${name}' without unfold must be camelCase (start with lowercase letter)`
                    );
                }

                // Check for name collisions with variant fields
                const allVariants = collectVariantsFromChain(actualADT);
                for (const [variantName, variant] of allVariants) {
                    const fieldNames = variant._fieldNames || [];
                    if (fieldNames.includes(name)) {
                        throw new Error(
                            `Merged operation name '${name}' conflicts with field '${name}' in variant '${variantName}'`
                        );
                    }
                }

                // Install on ADT prototype
                installOperationOnADT(actualADT, name, mergedTransformer, false);
            }

            return actualADT;
        };

        // extend method - inherited by all ADTs and extended ADTs
        ADT.extend = function (extensionDeclOrFn) {
            const ParentADT = this; // 'this' is the parent ADT class
            const isExtensionCallback = typeof extensionDeclOrFn === 'function';

            // Create extended ADT class that extends parent ADT
            // Static methods are automatically inherited through ES6 class extends
            class ExtendedADT extends ParentADT { }

            const extendedResult = ExtendedADT;                // Resolve the extension declaration
            const extensionFamily = createFamily();
            const extensionDecl = isExtensionCallback
                ? extensionDeclOrFn({ Family: extensionFamily, ...typeParamObjects })
                : extensionDeclOrFn;

            // Check for variant name collisions
            for (const variantName of Object.keys(extensionDecl)) {
                if (variantName in ParentADT) {
                    throw new Error(
                        `Variant name collision: '${variantName}' already exists in base ADT`
                    );
                }
            }

            // Create new variants for the extension
            for (const [variantName, value] of Object.entries(extensionDecl)) {
                let variantValue;

                if (isStructuredVariant(value)) {
                    // Structured variant with field definitions (object literal)
                    variantValue = createStructuredVariant(
                        ExtendedADT,
                        variantName,
                        value,
                        extendedResult
                    );
                } else {
                    // Simple enumerated variant (empty object {})
                    variantValue = createSingletonVariant(ExtendedADT, variantName, extendedResult);
                }

                Object.defineProperty(extendedResult, variantName, {
                    value: variantValue,
                    writable: false,
                    enumerable: true,
                    configurable: true
                });
            }

            // Install parent operations on ExtendedADT prototype
            // New variants automatically inherit through prototype chain (Variant.prototype → ExtendedADT.prototype)
            const parentTransformerNames = ParentADT._getTransformerNames?.() || [];
            for (const opName of parentTransformerNames) {
                const transformer = ParentADT._getTransformer?.(opName);
                if (!transformer) continue;

                // Install operation once on ExtendedADT prototype
                installOperationOnADT(extendedResult, opName, transformer);
            }

            // Create new singletons and wrapped constructors for inherited variants
            // This is necessary so that:
            // 1. Fold operations on ExtendedADT.Red use ExtendedADT's transformer
            // 2. Instances created via ExtendedADT.Point2D are instanceof ExtendedADT
            for (const key of Object.keys(ParentADT)) {
                if (key.startsWith('_') || key === 'extend' || extendedResult.hasOwnProperty(key)) {
                    continue; // Skip private methods, extend, and already-defined variants
                }

                const parentVariant = ParentADT[key];

                // Check if this is a singleton variant (frozen instance, not a constructor)
                if (parentVariant && typeof parentVariant === 'object' && Object.isFrozen(parentVariant)) {
                    // Create a new singleton instance that inherits from ExtendedADT
                    const variantName = parentVariant.constructor.name;
                    const newSingleton = createSingletonVariant(ExtendedADT, variantName, extendedResult);

                    Object.defineProperty(extendedResult, key, {
                        value: newSingleton,
                        writable: false,
                        enumerable: true,
                        configurable: true
                    });
                }
                // Check if this is a structured variant constructor
                else if (typeof parentVariant === 'function' && parentVariant._fieldNames) {
                    // Create a wrapped constructor that creates instances with ExtendedADT prototype
                    const variantName = parentVariant.name;
                    const fieldSpecs = parentVariant._fieldSpecs;

                    // Create new variant constructor for extended ADT
                    const newConstructor = createStructuredVariant(ExtendedADT, variantName, fieldSpecs, extendedResult);

                    Object.defineProperty(extendedResult, key, {
                        value: newConstructor,
                        writable: false,
                        enumerable: true,
                        configurable: true
                    });
                }
            }

            // Note: ADT is not sealed to allow fold extensions to redefine properties
            // Properties are non-writable for immutability in strict mode

            return extendedResult;
        };

        const result = ADT;

        // Resolve the declaration - handle both object and callback styles
        const Family = createFamily();

        // Create type parameter objects dynamically based on extracted parameter names
        const typeParamObjects = {};
        for (const paramName of typeParamNames) {
            typeParamObjects[paramName] = {
                [TypeParamSymbol]: paramName
            };
        }

        // Only create variant declaration for base ADT, not parameterized instances
        let decl;
        if (typeArgs && parentADT) {
            // Parameterized instance - reuse parent's declaration
            decl = parentADT[VariantDeclSymbol];
        } else {
            // Base ADT - create new declaration
            decl = isCallbackStyle
                ? declOrFn({ Family, ...typeParamObjects })
                : declOrFn;

            ADT[VariantDeclSymbol] = decl;
        }

        for (const variantName of Object.keys(decl)) {
            if (!isPascalCase(variantName)) {
                throw new TypeError(
                    `Variant '${variantName}' must be PascalCase (start with uppercase letter)`
                );
            }
        }

        for (const [variantName, value] of Object.entries(decl)) {
            if (isStructuredVariant(value)) {
                for (const name of Object.keys(value)) {
                    if (!isCamelCase(name)) {
                        throw new TypeError(
                            `Field '${name}' in variant '${variantName}' must be camelCase (start with lowercase, no underscore prefix)`
                        );
                    }
                }

                const variantClass = createStructuredVariant(
                    ADT,
                    variantName,
                    value,
                    result
                );

                Object.defineProperty(result, variantName, {
                    value: variantClass,
                    writable: false,
                    enumerable: true,
                    configurable: true
                });
            } else {
                // Simple enumerated variant (empty object {})
                const variantValue = createSingletonVariant(ADT, variantName, result);
                Object.defineProperty(result, variantName, {
                    value: variantValue,
                    writable: false,
                    enumerable: true,
                    configurable: true
                });
            }
        }

        // If this is a parameterized instance, create new variant classes for it
        if (typeArgs && parentADT) {
            const parentDecl = parentADT[VariantDeclSymbol];

            // Create new variant classes that extend this parameterized ADT
            for (const [variantName, value] of Object.entries(parentDecl)) {
                if (isStructuredVariant(value)) {
                    // Create a new variant class that extends the parameterized ADT
                    const parameterizedVariant = createStructuredVariant(
                        result,  // Use the parameterized ADT as the base
                        variantName,
                        value,
                        result
                    );

                    // Override the inherited variant with the parameterized one
                    Object.defineProperty(result, variantName, {
                        value: parameterizedVariant,
                        writable: false,
                        enumerable: true,
                        configurable: true
                    });
                } else {
                    // Singleton variants don't need to be recreated
                    // They can be shared across parameterized instances
                }
            }
        }

        // Parameterized instances automatically inherit operations through prototype chain:
        // List(Number).prototype → List.prototype
        // Cons(Number).prototype → List(Number).prototype → List.prototype
        // No need to reinstall operations

        // Note: ADT is not sealed to allow fold extensions to redefine properties
        // Properties are non-writable for immutability in strict mode

        return result;
    }

    // For callback-style ADTs, return a callable class
    // For object-style ADTs, just return the ADT directly
    if (isCallbackStyle) {
        // Create the base ADT class
        const adt = createADT();

        // Add static _call method for parameterization
        adt._call = function (...typeArgs) {
            if (typeArgs.length === 0) {
                return callableADT;
            }

            // Convert arguments to type args object
            let typeArgsObj;
            if (typeArgs.length === 1 && typeof typeArgs[0] === 'object' && typeArgs[0] !== null && !isConstructable(typeArgs[0])) {
                // Object style: List({ T: Number, U: String })
                typeArgsObj = typeArgs[0];
            } else {
                // Positional style: List(Number) or List(Number, String)
                // Map to parameter names in order
                typeArgsObj = {};
                typeParamNames.forEach((paramName, index) => {
                    if (index < typeArgs.length) {
                        typeArgsObj[paramName] = typeArgs[index];
                    }
                });
            }

            const parameterizedADT = createADT(typeArgsObj, callableADT);
            return callable(parameterizedADT);
        };

        const callableADT = callable(adt);

        return callableADT;
    } else {
        return createADT();
    }
}