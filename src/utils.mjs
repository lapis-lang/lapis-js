/**
 * Shared utility functions for Lapis JS
 * 
 * This module provides common helper functions and symbols used across the codebase.
 * 
 * @module utils
 */

// Import IsSingleton from Data.mjs to avoid symbol mismatch
import { IsSingleton } from './Data.mjs';

// Symbols for parameterized ADT/Codata instances
export const IsParameterizedInstance = Symbol('IsParameterizedInstance');
export const ParentADTSymbol = Symbol('ParentADT');
export const TypeArgsSymbol = Symbol('TypeArgs');
export const VariantDeclSymbol = Symbol('VariantDecl');
export const TypeParamSymbol = Symbol('TypeParam');

/**
 * Symbol for storing handler maps on transformers and observers.
 * Used internally to detect wildcard handlers and case structure.
 * Shared between Transformer.mjs (match handlers) and Observer.mjs (fold cases).
 */
export const HandlerMapSymbol = Symbol('HandlerMap');

/**
 * Decorator to make a class callable.
 * When the class is called as a function, it invokes the constructor.
 * This enables syntax like: List(Number) instead of new List(Number)
 * 
 * @param Class - The class to make callable
 * @returns A proxy that can be called as a function or used with 'new'
 */
export function callable(Class) {
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

/**
 * Runtime validation helpers
 */
export function isPascalCase(str) {
    return str.length > 0 && str[0] === str[0].toUpperCase() && str[0] !== str[0].toLowerCase();
}

export function isCamelCase(str) {
    return str.length > 0 && str[0] === str[0].toLowerCase() && !str.startsWith('_');
}

/**
 * Checks if the value is an object literal.
 * @param value The value to check.
 * @returns Returns true if the value is an object literal, else false.
 */
export function isObjectLiteral(value) {
    return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Checks if a function is constructable
 */
export function isConstructable(fn) {
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
 * Omit a symbol property from an object, returning a new object without that symbol.
 * Used to filter out the invariant symbol when extracting field specifications.
 * 
 * @param {Object} obj - The object to filter
 * @param {Symbol} symbol - The symbol to omit
 * @returns {Object} New object without the symbol property
 */
export function omitSymbol(obj, symbol) {
    const result = {};
    for (const key of Reflect.ownKeys(obj)) {
        if (key !== symbol) {
            result[key] = obj[key];
        }
    }
    return result;
}

/**
 * Compose two transformation functions.
 * Returns a function that applies f then g: g(f(x))
 * 
 * @param {Function} [f] - First transformation (or undefined)
 * @param {Function} [g] - Second transformation (or undefined)
 * @returns {Function} Composed transformation, or the non-undefined one, or identity
 */
export function composeFunctions(f, g) {
    if (f && g) {
        return (x) => g(f(x));
    }
    if (f) return f;
    if (g) return g;
    return (x) => x; // identity
}

/**
 * Set of built-in type constructors used for field validation
 */
export const BUILT_IN_TYPES = new Set([Number, String, Boolean, Symbol, BigInt]);

/**
 * Check if a value is a built-in type constructor
 */
export function isBuiltInType(value) {
    return BUILT_IN_TYPES.has(value);
}
