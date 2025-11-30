/**
 * Shared utility functions for Lapis JS
 * 
 * This module provides common helper functions used across the codebase.
 * 
 * @module utils
 */

/**
 * Symbol for storing handler maps on transformers and observers.
 * Used internally to detect wildcard handlers and case structure.
 * Shared between Transformer.mjs (match handlers) and Observer.mjs (fold cases).
 */
export const HandlerMapSymbol = Symbol('HandlerMap');

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
