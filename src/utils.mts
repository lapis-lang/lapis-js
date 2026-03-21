/**
 * Shared utility functions for Lapis JS
 *
 * This module provides common helper functions and symbols used across the codebase.
 *
 * @module utils
 */

// Import IsSingleton from Data.mjs to avoid symbol mismatch
import { IsSingleton } from './Data.mjs';

// ---- Symbol-access helpers --------------------------------------------------
// Consolidate the double-cast pattern `(obj as unknown as Record<symbol, T>)[sym]`
// into type-safe helpers that contain the unsafe cast in one place.

/** Read a symbol-keyed property from an object. */
export function getSymbolProp<T = unknown>(obj: unknown, sym: symbol): T {
    if (obj == null || (typeof obj !== 'object' && typeof obj !== 'function'))
        throw new TypeError(`Cannot read symbol property from ${obj}`);

    return (obj as Record<symbol, unknown>)[sym] as T;
}

/** Write a symbol-keyed property on an object. */
export function setSymbolProp(obj: unknown, sym: symbol, value: unknown): void {
    if (obj == null || (typeof obj !== 'object' && typeof obj !== 'function'))
        throw new TypeError(`Cannot write symbol property to ${obj}`);

    (obj as Record<symbol, unknown>)[sym] = value;
}

/** Check if an object has a specific symbol-keyed property. */
export function hasSymbolProp(obj: unknown, sym: symbol): boolean {
    return obj != null && (typeof obj === 'object' || typeof obj === 'function') && sym in obj;
}

// Symbols for parameterized ADT/Behavior instances
export const IsParameterizedInstance: unique symbol = Symbol('IsParameterizedInstance');
export type IsParameterizedInstance = typeof IsParameterizedInstance;

export const ParentADTSymbol: unique symbol = Symbol('ParentADT');
export type ParentADTSymbol = typeof ParentADTSymbol;

export const TypeArgsSymbol: unique symbol = Symbol('TypeArgs');
export type TypeArgsSymbol = typeof TypeArgsSymbol;

export const VariantDeclSymbol: unique symbol = Symbol('VariantDecl');
export type VariantDeclSymbol = typeof VariantDeclSymbol;

export const TypeParamSymbol: unique symbol = Symbol('TypeParam');
export type TypeParamSymbol = typeof TypeParamSymbol;

export const SortNameSymbol: unique symbol = Symbol('SortName');
export type SortNameSymbol = typeof SortNameSymbol;

/**
 * Symbol for storing handler maps on transformers and observers.
 * Used internally to detect wildcard handlers and case structure.
 * Shared between DataOps.mts (match handlers) and BehaviorOps.mts (fold cases).
 */
export const HandlerMapSymbol: unique symbol = Symbol('HandlerMap');
export type HandlerMapSymbol = typeof HandlerMapSymbol;

// ---- callable ---------------------------------------------------------------

/** A constructable type together with a callable (non-new) call signature. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CallableClass<T extends abstract new (...args: any[]) => any> =
    T & ((...args: ConstructorParameters<T>) => InstanceType<T>);

/**
 * Decorator to make a class callable.
 * When the class is called as a function, it invokes the constructor.
 * This enables syntax like: List(Number) instead of new List(Number)
 *
 * @param Class - The class to make callable
 * @returns A proxy that can be called as a function or used with 'new'
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function callable<T extends abstract new (...args: any[]) => any>(
    Class: T
): CallableClass<T> {
    return new Proxy(Class, {
        apply(target, _thisArg, argumentsList) {
            // Check if this is a variant constructor (has _fieldNames or is a singleton)
            // Variants should use their constructor, not _call
            const isVariant = '_fieldNames' in target ||
                (target as unknown as Record<symbol, unknown>)[IsSingleton] === true;

            // When called as a function, check if it has a _call method (for ADT parameterization)
            // But only use _call if this is not a variant
            if (!isVariant && (target as unknown as { _call?: (...a: unknown[]) => unknown })._call) {
                return (target as unknown as { _call: (...a: unknown[]) => unknown })._call(
                    ...argumentsList
                );
            }
            // Otherwise, invoke the constructor (for variant constructors or base ADT)
            return Reflect.construct(target, argumentsList);
        },
        construct(target, argumentsList) {
            // When called with 'new', invoke the constructor normally
            return Reflect.construct(target, argumentsList);
        }
    }) as CallableClass<T>;
}

// ---- String predicates -------------------------------------------------------

/** Returns true if `str` starts with an uppercase letter. */
export function isPascalCase(str: string): boolean {
    return str.length > 0 && str[0] === str[0].toUpperCase() && str[0] !== str[0].toLowerCase();
}

/** Returns true if `str` starts with a lowercase letter and has no leading underscore. */
export function isCamelCase(str: string): boolean {
    return str.length > 0 && str[0] === str[0].toLowerCase() && !str.startsWith('_');
}

// ---- Object predicates -------------------------------------------------------

/**
 * Checks if the value is an object literal.
 * @param value The value to check.
 * @returns Returns true if the value is an object literal, else false.
 */
export function isObjectLiteral(value: unknown): value is Record<string, unknown> {
    return value !== null &&
        typeof value === 'object' &&
        Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Checks if a function is constructable
 */
export function isConstructable(fn: unknown): fn is new (...args: unknown[]) => unknown {
    if (typeof fn !== 'function') return false;
    try {
        const test = Object.create((fn as { prototype: object }).prototype);
        return (test as object) instanceof (fn as new () => unknown) ||
            (fn as { prototype: unknown }).prototype !== undefined;
    } catch {
        return false;
    }
}

// ---- Object helpers ----------------------------------------------------------

/**
 * Omit a symbol property from an object, returning a new object without that symbol.
 * Used to filter out the invariant symbol when extracting field specifications.
 *
 * @param obj - The object to filter
 * @param symbol - The symbol to omit
 * @returns New object without the symbol property
 */
export function omitSymbol<T extends object>(obj: T, symbol: symbol): Omit<T, symbol> {
    const result: Record<string | symbol, unknown> = {};
    for (const key of Reflect.ownKeys(obj)) {
        if (key !== symbol)
            result[key] = (obj as Record<string | symbol, unknown>)[key];

    }
    return result as Omit<T, symbol>;
}

// ---- Map helpers ------------------------------------------------------------

/** Ensure a symbol-keyed slot on `target` holds a Map, creating it if absent. */
export function ensureOwnMap<K, V>(target: Record<symbol, unknown>, symbol: symbol): Map<K, V> {
    const existing = target[symbol];
    if (existing !== undefined) {
        if (!(existing instanceof Map)) {
            throw new TypeError(
                `Expected symbol slot to contain a Map, but found ${typeof existing}`
            );
        }
        return existing as Map<K, V>;
    }
    const newMap = new Map<K, V>();
    target[symbol] = newMap;
    return newMap;
}

// ---- Operation installation helpers -----------------------------------------

/** Install a getter property on `target` with the standard enumerable, configurable descriptor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function installGetter(target: object, name: string | symbol, fn: (...args: any[]) => unknown): void {
    Object.defineProperty(target, name, { get: fn, enumerable: true, configurable: true });
}

/** Install an operation on `target`: as a getter (no-arg) when `isGetter` is true, else as a method. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function installOperation(target: object, name: string | symbol, fn: (...args: any[]) => unknown, isGetter: boolean): void {
    if (isGetter)
        installGetter(target, name, fn);
    else
        (target as Record<string | symbol, unknown>)[name] = fn;
}

// ---- Function helpers --------------------------------------------------------

/**
 * Compose two transformation functions.
 * Returns a function that applies f then g: g(f(x))
 *
 * Overload 1 — heterogeneous pipeline: `f: A→B`, `g: B→C` → `A→C`.
 * Overload 2 — homogeneous / optional: `f: T→T | undefined`, `g: T→T | undefined` → `T→T`.
 *
 * @param f - First transformation (or undefined)
 * @param g - Second transformation (or undefined)
 * @returns Composed transformation, or the non-undefined one, or identity
 */
export function composeFunctions<A, B, C>(
    f: (x: A) => B,
    g: (x: B) => C
): (x: A) => C;
export function composeFunctions<T>(
    f: ((x: T) => T) | undefined,
    g: ((x: T) => T) | undefined
): (x: T) => T;
export function composeFunctions(
    f: ((x: unknown) => unknown) | undefined,
    g: ((x: unknown) => unknown) | undefined
): (x: unknown) => unknown {
    if (f && g) return (x) => g(f(x));
    if (f) return f;
    if (g) return g;
    return (x) => x;
}

/**
 * Compose two optional transform factories.
 * If both are defined, returns a factory that composes their results via `composeFunctions`.
 * If only one is defined, returns it as-is.  If neither, returns `undefined`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function composeOptionalTransform<T extends (arg: any) => any>(
    fn1: T | undefined,
    fn2: T | undefined
): T | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (fn1 && fn2) return ((arg: any) => composeFunctions(fn1(arg), fn2(arg))) as T;
    return fn1 || fn2;
}

/**
 * Validate that a set of composable items (transformers or observers) does not
 * contain multiple unfolds or multiple folds.  Used by both
 * `composeMultipleTransformers` and `composeMultipleObservers`.
 */
export function validateMergeComposition<T extends { name: string; generator?: unknown }>(
    items: T[],
    isFold: (item: T) => boolean
): void {
    const generatorCount = items.filter(i => i.generator).length;
    if (generatorCount > 1) {
        const names = items.filter(i => i.generator).map(i => `'${i.name}'`).join(', ');
        throw new Error(
            `Cannot merge operations: multiple unfolds detected (${names}). Only one unfold operation is allowed per merge.`
        );
    }
    const foldCount = items.filter(isFold).length;
    if (foldCount > 1) {
        const names = items.filter(isFold).map(i => `'${i.name}'`).join(', ');
        throw new Error(
            `Cannot merge operations: multiple folds detected (${names}). Only one fold operation is allowed per merge.`
        );
    }
}

// ---- Spec helpers ------------------------------------------------------------

/**
 * Check if a spec object declares an input parameter.
 * Distinguishes between a missing `in` key and an explicitly `undefined` one.
 */
export function hasInputSpec(spec: Record<string, unknown>): boolean {
    return 'in' in spec && spec['in'] !== undefined;
}

// ---- Built-in type helpers ---------------------------------------------------

/**
 * Map from primitive-boxing constructor to expected typeof string.
 * Used for O(1) field validation in Data.mts and derived set for membership checks.
 */
export const builtInTypeChecks = new Map<unknown, string>([
    [Number, 'number'],
    [String, 'string'],
    [Boolean, 'boolean'],
    [Symbol, 'symbol'],
    [BigInt, 'bigint']
]);

/** Set of built-in primitive-boxing type constructors used for field validation */
export const BUILT_IN_TYPES: Set<unknown> = new Set(builtInTypeChecks.keys());

/** Check if a value is a built-in type constructor */
export function isBuiltInType(value: unknown): boolean {
    return builtInTypeChecks.has(value);
}

// ---- Structural equality ----------------------------------------------------

/**
 * Deep structural equality for frozen ADT instances.
 *
 * Two instances are structurally equal when they have the same constructor
 * (variant identity) and every own-property value is either `===`-equal or
 * recursively structurally equal.  Symbol-keyed properties are included
 * so that variant brands are compared correctly.
 *
 * A `seen` pair set prevents infinite loops on cyclic references.
 */
export function structuralEquals(a: unknown, b: unknown, seen = new Set<string>()): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;

    // Cycle detection: if we've already started comparing this pair, assume equal
    const idA = seenId(a), idB = seenId(b);
    const cycleKey = `${idA}:${idB}`;
    if (seen.has(cycleKey)) return true;
    seen.add(cycleKey);

    // Must be same variant constructor
    if ((a as object).constructor !== (b as object).constructor) return false;

    const keysA = Reflect.ownKeys(a as object),
        keysB = Reflect.ownKeys(b as object);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
        const va = (a as Record<string | symbol, unknown>)[key],
            vb = (b as Record<string | symbol, unknown>)[key];
        if (!structuralEquals(va, vb, seen)) return false;
    }

    return true;
}

/** Monotonic counter for assigning stable identity to objects in cycle detection. */
let _seenIdCounter = 0;
const _seenIdMap = new WeakMap<object, number>();

/** Return a stable numeric id for an object, assigned on first access. */
function seenId(obj: unknown): number {
    let id = _seenIdMap.get(obj as object);
    if (id === undefined) {
        id = _seenIdCounter++;
        _seenIdMap.set(obj as object, id);
    }
    return id;
}

// ---- Function introspection -------------------------------------------------

/**
 * Extract destructured parameter names from the first argument of a function.
 * Works by parsing the function's source text at runtime.
 *
 * Handles arrow functions and named/anonymous function expressions with a
 * single destructured object parameter: `({ A, B, fold }) => ...`.
 *
 * @param fn     - The function whose parameter names to extract.
 * @param filter - Optional predicate to select a subset of names.
 */
export function extractParamNames(
    fn: (...args: unknown[]) => unknown,
    filter?: (name: string) => boolean
): string[] {
    const src = fn.toString();
    // Match the first destructured parameter: ({ A, B, fold, ... })
    const match = src.match(/^\s*(?:function\s*\w*\s*)?\(\s*\{\s*([^}]*)\}/);
    if (!match) return [];
    const names = match[1]
        .split(',')
        .map(s => s.trim().replace(/\s*:.*/, '').replace(/\s*=.*/, ''))
        .filter(s => s.length > 0);
    return filter ? names.filter(filter) : names;
}
