/**
 * Shared operation utilities for Data and Codata
 * 
 * This module provides common functions for parsing and validating
 * declarative operation definitions used in both data() and codata().
 * 
 * @module operations
 */

import { isCamelCase, isPascalCase, isObjectLiteral, callable } from './utils.mjs';

// Symbol to mark Family references for recursive ADTs
export const FamilyRefSymbol = Symbol('FamilyRef');

// Symbol to mark Self references for recursive codata
export const SelfRefSymbol = Symbol('SelfRef');

// Symbol to mark type parameters
export const TypeParamSymbol = Symbol('TypeParam');

// Symbol to mark parent ADT for declarative extension
export const extend = Symbol('extend');

/**
 * Checks if a value is a FamilyRef
 */
export function isFamilyRef(value) {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
        return false;
    }

    // Parameterized instances (e.g., List(Number)) should NOT be treated as FamilyRef
    // Only the base generic ADT (e.g., List) should be a FamilyRef
    // Check for the symbol directly on the object, not in the prototype chain
    if (!Object.prototype.hasOwnProperty.call(value, FamilyRefSymbol)) {
        return false;
    }

    return true;
}

/**
 * Checks if a value is a SelfRef
 */
export function isSelfRef(value) {
    return (typeof value === 'object' || typeof value === 'function') && value !== null && SelfRefSymbol in value;
}

/**
 * Checks if a value is a TypeParam
 */
export function isTypeParam(value) {
    return typeof value === 'object' && value !== null && TypeParamSymbol in value;
}

/**
 * Checks if a declaration entry is an operation definition.
 * Operations are camelCase OR PascalCase (for unfold) properties with an 'op' field.
 * 
 * @param key - The property key
 * @param value - The property value
 * @returns true if this is an operation definition
 */
export function isOperationDef(key, value) {
    return (isCamelCase(key) || isPascalCase(key)) &&
        isObjectLiteral(value) &&
        'op' in value;
}

/**
 * Creates a Family reference for recursive ADTs
 * Can be used directly as a field spec (Family) or called with type param (Family(T))
 */
export function createFamily() {
    // Create a constructor function that will serve as the ADT base
    // This constructor will be built upon to become the actual ADT
    function Family() {
        // Allow subclasses to instantiate
    }

    // Add _call method so Family(T) returns itself (for use in field specs)
    Family._call = function (typeParam) {
        return callableFamily;
    };

    // Add the FamilyRef symbol marker so it can still be identified
    Family[FamilyRefSymbol] = true;

    // Wrap with callable() so Family(T) works during declaration parsing
    const callableFamily = callable(Family);

    return callableFamily;
}

/**
 * Creates a Self reference for recursive codata.
 * Can be used directly as a field spec (Self) or called with type param (Self(T))
 */
export function createSelf() {
    // Create the callable function first
    const fn = function (typeParam) {
        // Calling Self(T) returns the same Self reference
        // In the future, this could track the type param for validation
        return fn;
    };

    // Add the SelfRef symbol marker
    fn[SelfRefSymbol] = true;

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
export function validateTypeSpec(value, spec, opName, context) {
    // Handle primitive constructors first - check both pass and fail cases
    if (spec === Number) {
        if (typeof value !== 'number') {
            throw new TypeError(
                `Operation '${opName}' expected ${context} Number (primitive number), but got ${typeof value}`
            );
        }
        return; // Valid primitive number
    }

    if (spec === String) {
        if (typeof value !== 'string') {
            throw new TypeError(
                `Operation '${opName}' expected ${context} String (primitive string), but got ${typeof value}`
            );
        }
        return; // Valid primitive string
    }

    if (spec === Boolean) {
        if (typeof value !== 'boolean') {
            throw new TypeError(
                `Operation '${opName}' expected ${context} Boolean (primitive boolean), but got ${typeof value}`
            );
        }
        return; // Valid primitive boolean
    }

    // Handle custom class/constructor - use instanceof
    if (typeof spec === 'function' && !(value instanceof spec)) {
        // For "to return" context, say "to return instance of X"
        // For "input of type" context, say "input of type X"
        const typePhrase = context === 'to return'
            ? `${context} instance of ${spec.name || 'specified type'}`
            : `${context} ${spec.name || 'specified type'}`;

        throw new TypeError(
            `Operation '${opName}' expected ${typePhrase}, but got ${value?.constructor?.name || typeof value}`
        );
    }
}

/**
 * Validates that a return value matches the expected type specification.
 * 
 * @param value - The value to validate
 * @param spec - The expected type (constructor function)
 * @param opName - Operation name for error messages
 */
export function validateReturnType(value, spec, opName) {
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
export function validateSpecGuard(spec, specType, opName) {
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
            // Note: Function IS allowed as a field guard (predicate validation)
            // Only reject Function at top level to prevent currying patterns
            
            // Recursively validate nested object literals
            if (isObjectLiteral(fieldSpec)) {
                validateSpecGuard(fieldSpec, specType, opName);
            }
        }
    }
}
