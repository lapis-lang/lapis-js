/**
 * Shared operation utilities for Data and Behavior
 *
 * This module provides common functions for parsing and validating
 * declarative operation definitions used in both data() and behavior().
 *
 * @module operations
 */

import {
    isCamelCase,
    isPascalCase,
    isObjectLiteral,
    callable,
    TypeParamSymbol
} from './utils.mjs';
import type { CallableClass } from './utils.mjs';

// ---- Symbols -----------------------------------------------------------------

/** Marks Family references for recursive ADTs */
export const FamilyRefSymbol: unique symbol = Symbol('FamilyRef');
export type FamilyRefSymbol = typeof FamilyRefSymbol;

/** Marks Self references for recursive behavior */
export const SelfRefSymbol: unique symbol = Symbol('SelfRef');
export type SelfRefSymbol = typeof SelfRefSymbol;

/** Marks type parameters — re-exported from utils.mts (single canonical symbol) */
export { TypeParamSymbol };

/** Marks sort parameters for multi-sorted algebras */
export const SortRefSymbol: unique symbol = Symbol('SortRef');
export type SortRefSymbol = typeof SortRefSymbol;

/** Declares the sort annotation on a variant spec */
export const sort: unique symbol = Symbol('sort');
export type sort = typeof sort;

/** Marks parent ADT for declarative extension */
export const extend: unique symbol = Symbol('extend');
export type extend = typeof extend;

/** Marks the operation type ('fold' | 'unfold' | 'map' | 'merge') */
export const op: unique symbol = Symbol('op');
export type op = typeof op;

/** Carries the input/output type spec of an operation */
export const spec: unique symbol = Symbol('spec');
export type spec = typeof spec;

/** Carries the array of operation names in a merge */
export const operations: unique symbol = Symbol('operations');
export type operations = typeof operations;

/** Provides access to course-of-values history in histomorphism folds */
export const history: unique symbol = Symbol('history');
export type history = typeof history;

/**
 * Stamps values produced by data(), behavior(), relation(), and query().
 * Used by module() at instantiation time to validate that all exported values
 * are Lapis types rather than arbitrary JavaScript values.
 */
export const LapisTypeSymbol: unique symbol = Symbol('LapisType');
export type LapisTypeSymbol = typeof LapisTypeSymbol;

/** Parsed auxiliary-fold configuration from a fold spec's `aux` key. */
export interface ParsedAux {
    /** Normalised list of auxiliary fold names, or `null` when absent. */
    readonly names: string[] | null;
    /** `true` when the original spec used the array form (`aux: [...]`). */
    readonly isArray: boolean;
}

/**
 * Parse the `aux` key from a fold spec into a normalised form.
 * Accepts `string`, `string[]`, or `undefined`.
 */
export function parseAux(raw: unknown): ParsedAux {
    if (raw === undefined || raw === null)
        return { names: null, isArray: false };
    if (typeof raw === 'string')
        return { names: [raw], isArray: false };
    if (Array.isArray(raw)) {
        if (raw.length === 0) {
            throw new TypeError(
                `'aux' array must contain at least one fold name, got empty array`
            );
        }
        for (let i = 0; i < raw.length; i++) {
            if (typeof raw[i] !== 'string') {
                throw new TypeError(
                    `'aux' array elements must be strings, but element at index ${i} is ${typeof raw[i]}`
                );
            }
        }
        return { names: raw as string[], isArray: true };
    }
    throw new TypeError(
        `'aux' must be a string or string[], got ${typeof raw}`
    );
}

// ---- Interfaces --------------------------------------------------------------

/** A value with a FamilyRef marker */
export interface FamilyRef {
    readonly [FamilyRefSymbol]: true;
}

/** A callable FamilyRef returned by createFamily() */
export interface FamilyRefCallable extends FamilyRef {
    (typeParam?: unknown): FamilyRefCallable;
    _adt: ((typeParam?: unknown) => FamilyRefCallable) | null;
    // Dynamic variant constructor access requires explicit casting
    [key: string]: unknown;
}

/** A value with a SelfRef marker */
export interface SelfRef {
    readonly [SelfRefSymbol]: true;
}

/** A callable SelfRef returned by createSelf() */
export interface SelfRefCallable extends SelfRef {
    (typeParam?: unknown): SelfRefCallable;
}

/** A type parameter reference marker, branded with the parameter name. */
export interface TypeParamRef<Name extends string = string> {
    readonly [TypeParamSymbol]: Name;
}

/** A sort parameter reference marker, branded with the sort name (e.g. '$E'). */
export interface SortRef<Name extends string = string> {
    readonly [SortRefSymbol]: Name;
}

/**
 * Valid type specifications for field declarations and operation specs.
 * Covers primitive constructors, ADT constructors, Family/Self references,
 * type parameter markers, and predicate functions.
 */
export type TypeSpec =
    | NumberConstructor
    | StringConstructor
    | BooleanConstructor
    | SymbolConstructor
    | BigIntConstructor
    | FamilyRef
    | TypeParamRef
    | SortRef
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | (abstract new (...args: any[]) => unknown)
    | ((value: unknown) => unknown);

// ---- Type guards -------------------------------------------------------------

/**
 * Checks if a value is a FamilyRef
 */
export function isFamilyRef(value: unknown): value is FamilyRef {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
        return false;


    // Parameterized instances (e.g., List(Number)) should NOT be treated as FamilyRef
    // Only the base generic ADT (e.g., List) should be a FamilyRef
    // Check for the symbol directly on the object, not in the prototype chain
    if (!Object.prototype.hasOwnProperty.call(value, FamilyRefSymbol))
        return false;


    return true;
}

/**
 * Checks if a value is a SelfRef
 */
export function isSelfRef(value: unknown): value is SelfRef {
    return (typeof value === 'object' || typeof value === 'function') &&
        value !== null &&
        SelfRefSymbol in (value as object);
}

/**
 * Checks if a value is a TypeParam
 */
export function isTypeParam(value: unknown): value is TypeParamRef {
    return typeof value === 'object' && value !== null && TypeParamSymbol in value;
}

/**
 * Checks if a value is a SortRef
 */
export function isSortRef(value: unknown): value is SortRef {
    return typeof value === 'object' && value !== null && SortRefSymbol in value;
}

/**
 * Checks whether a field spec references a sort parameter.
 * Uses `in` (prototype-chain walk) to detect the SortRefSymbol brand.
 */
export function isSortRefSpec(fieldSpec: unknown): boolean {
    return !!fieldSpec &&
        (typeof fieldSpec === 'object' || typeof fieldSpec === 'function') &&
        SortRefSymbol in (fieldSpec as object);
}

// ---- Operation definition predicates ----------------------------------------

/**
 * Checks if a declaration entry is an operation definition.
 * Operations are camelCase OR PascalCase (for unfold) properties with an 'op' field.
 *
 * @param key - The property key
 * @param value - The property value
 * @returns true if this is an operation definition
 */
export function isOperationDef(key: string, value: unknown): boolean {
    return (isCamelCase(key) || isPascalCase(key)) &&
        isObjectLiteral(value) &&
        op in value;
}

// ---- Factory functions -------------------------------------------------------

/**
 * Creates a Family reference for recursive ADTs.
 * Can be used directly as a field spec (Family) or called with type param (Family(T)).
 */
export function createFamily(): FamilyRefCallable {
    // Create a constructor function that will serve as the ADT base
    function Family() {
        // Allow subclasses to instantiate
    }

    // Add _call method so Family(T) returns itself (for use in field specs)
    (Family as unknown as { _call: (typeParam: unknown) => FamilyRefCallable })._call =
        function (_typeParam: unknown): FamilyRefCallable {
            return callableFamily;
        };

    // Add the FamilyRef symbol marker so it can still be identified
    (Family as unknown as Record<typeof FamilyRefSymbol, boolean>)[FamilyRefSymbol] = true;
    (Family as unknown as { _adt: null })._adt = null;

    // Wrap with callable() so Family(T) works during declaration parsing
    const callableFamily = callable(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Family as unknown as abstract new (...args: any[]) => unknown
    ) as unknown as FamilyRefCallable;

    return callableFamily;
}

/**
 * Creates a Self reference for recursive behavior.
 * Can be used directly as a field spec (Self) or called with type param (Self(T)).
 */
export function createSelf(): SelfRefCallable {
    const fn = function (_typeParam?: unknown): SelfRefCallable {
        // Calling Self(T) returns the same Self reference.
        return fn as unknown as SelfRefCallable;
    };

    // Add the SelfRef symbol marker
    (fn as unknown as Record<typeof SelfRefSymbol, boolean>)[SelfRefSymbol] = true;

    return fn as unknown as SelfRefCallable;
}

// ---- Validation helpers ------------------------------------------------------

/**
 * Unified type validation for spec checking.
 * Used by both input and return type validation.
 *
 * Accepts either a single `TypeSpec` guard or a `Record<string, TypeSpec>` object-literal
 * guard (same form used in ADT variant field declarations). When an object-literal guard
 * is supplied, the runtime value must be a plain object and each declared field is
 * validated recursively.
 *
 * @param value - The value to validate
 * @param spec - The expected type specification or structured object-literal guard
 * @param opName - Operation name for error messages
 * @param context - Context for error message ("input of type" or "to return")
 */
export function validateTypeSpec(
    value: unknown,
    spec: TypeSpec | Record<string, TypeSpec>,
    opName: string,
    context: string
): void {
    // TypeParam markers (e.g. T, U) are erased at runtime — skip validation.
    if (isTypeParam(spec)) return;

    // Handle structured object-literal guards: { key1: Guard1, key2: Guard2, ... }
    // This is distinct from the ObjectConstructor guard (Object) which is a function.
    if (isObjectLiteral(spec)) {
        if (!isObjectLiteral(value)) {
            throw new TypeError(
                `Operation '${opName}' expected ${context} a plain object, but got ${Array.isArray(value) ? 'Array' : value === null ? 'null' : typeof value}`
            );
        }
        const structuredSpec = spec as Record<string, TypeSpec>;
        for (const [fieldName, fieldGuard] of Object.entries(structuredSpec)) {
            if (!Object.prototype.hasOwnProperty.call(value, fieldName)) {
                throw new TypeError(
                    `Operation '${opName}' expected ${context} to have field '${fieldName}'`
                );
            }
            validateTypeSpec(
                (value as Record<string, unknown>)[fieldName],
                fieldGuard,
                opName,
                `${context} (field '${fieldName}')`
            );
        }
        return;
    }

    // Handle primitive constructors first - check both pass and fail cases
    if (spec === Number) {
        if (typeof value !== 'number') {
            throw new TypeError(
                `Operation '${opName}' expected ${context} Number (primitive number), but got ${typeof value}`
            );
        }
        return;
    }

    if (spec === String) {
        if (typeof value !== 'string') {
            throw new TypeError(
                `Operation '${opName}' expected ${context} String (primitive string), but got ${typeof value}`
            );
        }
        return;
    }

    if (spec === Boolean) {
        if (typeof value !== 'boolean') {
            throw new TypeError(
                `Operation '${opName}' expected ${context} Boolean (primitive boolean), but got ${typeof value}`
            );
        }
        return;
    }

    // Handle FamilyRef specs — validate against the resolved ADT constructor.
    // Family markers carry a `_adt` reference to the ADT (or parameterized ADT)
    // that was assigned during creation.  Use that for the instanceof check
    // instead of the marker function itself (which has no prototype relation
    // to variant instances).
    if (isFamilyRefSpec(spec)) {
        const adt = (spec as { _adt?: unknown })._adt;
        if (adt && typeof adt === 'function' &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            !(value instanceof (adt as new (...args: any[]) => unknown))
        ) {
            const typePhrase = context === 'to return'
                ? `${context} instance of ADT family`
                : `${context} ADT family instance`;

            throw new TypeError(
                `Operation '${opName}' expected ${typePhrase}, but got ${(value as { constructor?: { name?: string } } | null)?.constructor?.name || typeof value}`
            );
        }
        return;
    }

    // Handle custom class/constructor - use instanceof
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof spec === 'function' && !(value instanceof (spec as new (...args: any[]) => unknown))) {
        const typePhrase = context === 'to return'
            ? `${context} instance of ${(spec as { name?: string }).name || 'specified type'}`
            : `${context} ${(spec as { name?: string }).name || 'specified type'}`;

        throw new TypeError(
            `Operation '${opName}' expected ${typePhrase}, but got ${(value as { constructor?: { name?: string } } | null)?.constructor?.name || typeof value}`
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
export function validateReturnType(value: unknown, spec: TypeSpec, opName: string): void {
    validateTypeSpec(value, spec, opName, 'to return');
}

/**
 * Validates that a spec doesn't use the Function constructor as a type guard.
 * Using `Function` as a guard enables hackish currying patterns that should use unfold instead.
 *
 * @param spec - The spec to validate (can be a guard or object literal)
 * @param specType - Either 'in' or 'out' for error messages
 * @param opName - Operation name for error messages
 */
export function validateSpecGuard(spec: unknown, specType: string, opName: string): void {
    // Specifically check for Function constructor, not all functions
    if (spec === Function) {
        throw new TypeError(
            `Operation '${opName}' cannot use Function as '${specType}' guard. ` +
            `Use unfold with object literal guards for binary/n-ary operations instead.`
        );
    }

    // Recursively check object literal guards
    if (isObjectLiteral(spec)) {
        for (const [, fieldSpec] of Object.entries(spec)) {
            if (isObjectLiteral(fieldSpec))
                validateSpecGuard(fieldSpec, specType, opName);

        }
    }
}

// ---- FamilyRef spec predicate -----------------------------------------------

/**
 * Checks whether a field spec references the enclosing ADT family.
 * Uses `in` (prototype-chain walk) — distinct from `isFamilyRef()
 * which uses `hasOwnProperty`.
 */
export function isFamilyRefSpec(fieldSpec: unknown): boolean {
    return !!fieldSpec &&
        (typeof fieldSpec === 'object' || typeof fieldSpec === 'function') &&
        FamilyRefSymbol in (fieldSpec as object);
}

// ---- Casing assertion helpers -----------------------------------------------

/**
 * Throw a TypeError if `name` is not camelCase.
 * @param name  - identifier to check
 * @param kind  - human-readable context for the error message
 */
export function assertCamelCase(name: string, kind: string): void {
    if (!isCamelCase(name))
        throw new TypeError(`${kind} '${name}' must be camelCase`);
}

/**
 * Throw a TypeError if `name` is not PascalCase.
 * @param name  - identifier to check
 * @param kind  - human-readable context for the error message
 */
export function assertPascalCase(name: string, kind: string): void {
    if (!isPascalCase(name))
        throw new TypeError(`${kind} '${name}' must be PascalCase`);
}

// ---- Op-def destructuring helper --------------------------------------------

// ---- Protocol symbols -------------------------------------------------------

/**
 * Marks types (data/behavior) as satisfying named protocols.
 * Used in phase 1: `[satisfies]: [Monoid, Ordered({ T: Ordered })]`
 *
 * Note: This symbol is declared here in `operations.mts` rather than in
 * `Protocol.mts` because it is consumed by both `data()` and `behavior()`
 * during phase-1 declaration parsing — before any protocol-specific logic
 * runs. Co-locating it with the other shared operation symbols avoids a
 * circular import between `Data.mts`/`Behavior.mts` and `Protocol.mts`.
 * It is re-exported from `index.mts` as part of the public protocol API.
 */
export const satisfies: unique symbol = Symbol('satisfies');
export type satisfies = typeof satisfies;

/** Brands protocol objects created by protocol() */
export const ProtocolSymbol: unique symbol = Symbol('Protocol');
export type ProtocolSymbol = typeof ProtocolSymbol;

// ---- Algebraic property annotations ----------------------------------------

/**
 * Annotates a protocol operation spec with algebraic law declarations.
 *
 * Usage:
 * ```ts
 * const Semigroup = protocol(({ Family, fold }) => ({
 *     combine: fold({ in: Family, out: Family, properties: ['associative'] })
 * }));
 * ```
 */

/**
 * The closed set of recognised algebraic property names.
 *
 * Names are organised by the category of operation they describe:
 *
 * **Binary operation properties** (fold with `in: Family, out: Family`):
 * `associative`, `commutative`, `idempotent`, `identity`, `absorbing`, `distributive`
 *
 * **Unary operation properties** (map or unary fold):
 * `involutory`
 *
 * **Relation / comparison properties** (binary predicates):
 * `reflexive`, `symmetric`, `antisymmetric`, `transitive`, `total`
 *
 * **Functor / natural transformation properties** (map specs):
 * `composition`
 */
export const KNOWN_PROPERTIES: ReadonlySet<string> = new Set([
    // Binary operation
    'associative',
    'commutative',
    'idempotent',
    'identity',
    'absorbing',
    'distributive',
    // Unary
    'involutory',
    // Relation
    'reflexive',
    'symmetric',
    'antisymmetric',
    'transitive',
    'total',
    // Functor
    'composition',
    // Inter-operation (bare names — metadata only; companion info required for enforcement)
    'absorption',
    'inverse'
]);

// ---- Inter-operation property types -----------------------------------------

/**
 * The set of prefix strings that introduce a namespaced inter-operation property.
 * Format: `'<prefix>:<arg1>[:<arg2>]'`
 *
 * | Prefix | Arity | Meaning |
 * |---|---|---|
 * | `identity` | 1 | companion identity element |
 * | `absorbing` | 1 | companion zero/absorbing element |
 * | `distributive` | 1 | distributes over second operation |
 * | `absorption` | 1 | Lattice absorption (inner operation) |
 * | `inverse` | 2 | via-operation + identity element |
 */
export const INTER_OP_PREFIXES: ReadonlySet<string> = new Set([
    'identity', 'absorbing', 'distributive', 'absorption', 'inverse'
]);

/**
 * A plain intra-operation algebraic property name from {@link KNOWN_PROPERTIES}.
 * Alias used to distinguish it from {@link NamespacedProperty} and {@link PredicateFn}.
 */
export type OperationProperty = string;

/**
 * Namespaced inter-operation property strings recognised by the law engine.
 * Using TypeScript template literals provides autocomplete and type-level documentation.
 */
export type NamespacedProperty =
    | `identity:${string}`
    | `absorbing:${string}`
    | `distributive:${string}`
    | `absorption:${string}`
    | `inverse:${string}:${string}`;

/**
 * A named predicate function used as an executable law entry in `properties`.
 *
 * - `instance` — the ADT instance being tested.
 * - `adt`      — the ADT constructor (provides access to companion unfolds, etc.).
 * - Returns `true` if the law holds for this instance, `false` if it is violated.
 *
 * **Must be a named function** (i.e. `fn.name !== ''`). The function name is used
 * as the `propertyName` in any thrown {@link LawError}, so anonymous/arrow
 * functions assigned inline are rejected at parse time.
 */
export type PredicateFn = (instance: unknown, adt: unknown) => boolean;

/**
 * Every permitted entry in a `properties` array on an operation spec.
 *
 * - Plain `string`: an intra-operation property name from {@link KNOWN_PROPERTIES}.
 * - Namespaced `string`: an inter-operation law in `'<prefix>:<arg…>'` format.
 * - `PredicateFn`: an executable predicate for laws that cannot be expressed as
 *   a string (e.g. Applicative homomorphism). Must be a named function.
 */
export type PropertyEntry = string | NamespacedProperty | PredicateFn;

/**
 * Parse and validate a `properties` value from an operation spec.
 *
 * Accepts an `Array<PropertyEntry>` where each entry is one of:
 * - A plain string from {@link KNOWN_PROPERTIES} (intra-operation property).
 * - A namespaced string of the form `'<prefix>:<arg>[:<arg2>]'` from
 *   {@link INTER_OP_PREFIXES} (inter-operation structured law).
 * - A named function `(instance, adt) => boolean` (executable predicate law).
 *
 * Throws a `TypeError` on unknown/malformed entries.
 *
 * @param raw     - The raw value stored under `properties` in the spec.
 * @param opName  - Operation name, used in error messages.
 * @returns A `ReadonlySet<PropertyEntry>` of validated entries.
 */
export function parseProperties(raw: unknown, opName: string): ReadonlySet<PropertyEntry> {
    if (raw === undefined || raw === null) return new Set<PropertyEntry>();
    if (!Array.isArray(raw)) {
        throw new TypeError(
            `[properties] on operation '${opName}' must be an array, got ${typeof raw}`
        );
    }
    const result = new Set<PropertyEntry>();
    for (const item of raw) {
        if (typeof item === 'function') {
            if (!item.name) {
                throw new TypeError(
                    `[properties] on operation '${opName}' contains an anonymous function. ` +
                    `Predicate law functions must be named (the name is used in LawError messages).`
                );
            }
            result.add(item as PredicateFn);
        } else if (typeof item === 'string') {
            if (item.includes(':')) {
                // Namespaced inter-op property: '<prefix>:<arg1>[:<arg2>]'
                const parts = item.split(':');
                const prefix = parts[0];
                if (!INTER_OP_PREFIXES.has(prefix)) {
                    throw new TypeError(
                        `[properties] on operation '${opName}' contains unknown inter-op prefix '${prefix}'. ` +
                        `Known prefixes: ${[...INTER_OP_PREFIXES].join(', ')}`
                    );
                }
                const expectedArity: Record<string, number> = {
                    identity: 2, absorbing: 2, distributive: 2, absorption: 2, inverse: 3
                };
                if (parts.length !== expectedArity[prefix]) {
                    throw new TypeError(
                        `[properties] on operation '${opName}': '${prefix}' requires ` +
                        `${expectedArity[prefix] - 1} argument(s) after the colon, ` +
                        `got ${parts.length - 1} in '${item}'`
                    );
                }
                result.add(item as NamespacedProperty);
            } else {
                if (!KNOWN_PROPERTIES.has(item)) {
                    throw new TypeError(
                        `[properties] on operation '${opName}' contains unknown property '${item}'. ` +
                        `Known properties: ${[...KNOWN_PROPERTIES].join(', ')}`
                    );
                }
                result.add(item);
            }
        } else {
            throw new TypeError(
                `[properties] on operation '${opName}' entries must be strings or named functions, ` +
                `got ${typeof item}`
            );
        }
    }
    return result;
}

// ---- Invariant symbol (used by both Data and Protocol) ----------------------

/**
 * Declares an invariant predicate on a variant spec or protocol declaration.
 * For data variants: checked on every construction.
 * For protocols: checked at conformance validation time.
 *
 * Note: This symbol is declared here in `operations.mts` rather than in
 * `Data.mts` because it is also consumed by `Protocol.mts` for protocol-level
 * invariants. It is re-exported from `Data.mts` for backward compatibility
 * (internal code such as `Relation.mts` imports it from there), and from
 * `index.mts` as part of the public API.
 */
export const invariant: unique symbol = Symbol('invariant');
export type invariant = typeof invariant;

// Re-export CallableClass for downstream consumers
export type { CallableClass };
