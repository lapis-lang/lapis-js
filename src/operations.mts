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
    callable
} from './utils.mjs';
import type { CallableClass } from './utils.mjs';
import type { SpecValue, ObserverInputValue } from './types.mjs';

// ---- Symbols -----------------------------------------------------------------

/** Marks Family references for recursive ADTs */
export const FamilyRefSymbol: unique symbol = Symbol('FamilyRef');
export type FamilyRefSymbol = typeof FamilyRefSymbol;

/** Marks Self references for recursive behavior */
export const SelfRefSymbol: unique symbol = Symbol('SelfRef');
export type SelfRefSymbol = typeof SelfRefSymbol;

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
 * Declares a scan operation: analogous to `scanr` on lists, generalised
 * to any recursive ADT.  `scan(targetFoldOp)` creates a new operation that
 * traverses the data structure and returns an Array of fold results — one for
 * each subterm — computed by `targetFoldOp`, in a single traversal.
 *
 * This is the datatype-generic Scan Lemma:
 *   L(fold_F(φ)) ∘ subterms  =  scan_F(φ)
 *
 * Usage:
 *   ```ts
 *   scanSum: scan('sum')   // returns [sum(self), sum(tail), ..., sum(Nil)]
 *   ```
 */
export const scanTarget: unique symbol = Symbol('scan');
export type scanTarget = typeof scanTarget;

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

/**
 * Valid type specifications for field declarations and operation specs.
 * Covers primitive constructors, ADT constructors, Family/Self references,
 * and predicate functions.
 */
export type TypeSpec =
    | NumberConstructor
    | StringConstructor
    | BooleanConstructor
    | SymbolConstructor
    | BigIntConstructor
    | FamilyRef
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | (abstract new (...args: any[]) => unknown)
    | ((value: unknown) => unknown);

// ---- Type guards -------------------------------------------------------------

// Registry-based identity — replaces symbol-brand stamping on objects.
// Parameterized instances (e.g., List(Number)) are never registered, so
// isFamilyRef/isFamilyRefSpec correctly returns false for them.
const familyRefRegistry = new WeakSet<object>();
const selfRefRegistry = new WeakSet<object>();

/** Register a newly-created family sentinel in the identity registry. */
export function registerFamilyRef(marker: object): void {
    familyRefRegistry.add(marker);
}

/** Register a newly-created self sentinel in the identity registry. */
export function registerSelfRef(marker: object): void {
    selfRefRegistry.add(marker);
}

/**
 * Checks if a value is a FamilyRef
 */
export function isFamilyRef(value: unknown): value is FamilyRef {
    return (typeof value === 'object' || typeof value === 'function') &&
        value !== null &&
        familyRefRegistry.has(value as object);
}

/**
 * Checks if a value is a SelfRef
 */
export function isSelfRef(value: unknown): value is SelfRef {
    return (typeof value === 'object' || typeof value === 'function') &&
        value !== null &&
        selfRefRegistry.has(value as object);
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

    (Family as unknown as { _adt: null })._adt = null;

    // Wrap with callable() so Family(T) works during declaration parsing
    const callableFamily = callable(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Family as unknown as abstract new (...args: any[]) => unknown
    ) as unknown as FamilyRefCallable;

    // Register via identity (replaces symbol-brand stamping)
    familyRefRegistry.add(callableFamily as unknown as object);

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

    // Register via identity (replaces symbol-brand stamping)
    selfRefRegistry.add(fn);

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

    if (typeof spec === 'function') {
        // Object (global Object constructor) means "accept any value" — skip validation.
        if (spec === Object) return;
        // Family/Self sentinels are callable marker functions, not class constructors.
        // They are handled by dedicated branches (Family) or as direct recursive refs.
        if (isFamilyRef(spec) || isSelfRef(spec)) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(value instanceof (spec as new (...args: any[]) => unknown))) {
            const typePhrase = context === 'to return'
                ? `${context} instance of ${(spec as { name?: string }).name || 'specified type'}`
                : `${context} ${(spec as { name?: string }).name || 'specified type'}`;

            throw new TypeError(
                `Operation '${opName}' expected ${typePhrase}, but got ${(value as { constructor?: { name?: string } } | null)?.constructor?.name || typeof value}`
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
        familyRefRegistry.has(fieldSpec as object);
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
                // Reject empty argument segments (e.g. 'identity:' or 'inverse:via:')
                for (let i = 1; i < parts.length; i++) {
                    if (!parts[i]) {
                        throw new TypeError(
                            `[properties] on operation '${opName}': inter-op string '${item}' ` +
                            `has an empty argument at position ${i}. All argument segments must be non-empty identifiers.`
                        );
                    }
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

/**
 * Returns the operation name that the given property set declares as a
 * distributive target via a `'distributive:opName'` entry, or `null` if none.
 *
 * Used by both `optimizations.mts` (Data Horner fold-fusion) and
 * `Behavior.mts` (co-Horner merge) to detect composable fold pipelines.
 */
export function getDistributiveTargetFromProperties(
    properties: ReadonlySet<PropertyEntry> | undefined
): string | null {
    if (!properties) return null;
    for (const prop of properties) {
        if (typeof prop === 'string' && prop.startsWith('distributive:'))
            return prop.slice('distributive:'.length);
    }
    return null;
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

// =============================================================================
// Curried operation declaration helpers (formerly ops.mts)
// =============================================================================
// These helpers replace inline [op]/[spec] symbol keys with a two-phase curried
// API. The helper name encodes the operation kind (eliminating [op]) and the
// first argument encodes the spec (eliminating [spec]). TypeScript infers the
// input type from the spec in phase 1, then contextually types handler function
// parameters in phase 2.
//
// Usage:
//   // Old form — parameters are implicitly `any`
//   Range: { [op]: 'unfold', [spec]: { in: Number, out: Family },
//     Cons: (n) => n > 0 ? { head: n, tail: n - 1 } : null }
//
//   // New form — n is inferred as `number`
//   Range: unfold({ in: Number, out: Family })({
//     Cons: (n) => n > 0 ? { head: n, tail: n - 1 } : null
//   })
//
// The same helpers work in both data() and behavior() declarations.

// ---- Alias symbol -----------------------------------------------------------

/**
 * Symbol used by `.as()` to store alias names on fold/unfold/map def objects.
 * Consumed at install time by createFoldOperation, createUnfoldOperation,
 * createMapOperation (Data.mts) and attachBehaviorOpsMethod (Behavior.mts).
 */
export const aliasesSymbol: unique symbol = Symbol('lapis.aliases');
export type AliasesSymbol = typeof aliasesSymbol;

/**
 * Interface wrapper for alias names added by `.as()`. Declared as an interface
 * (not a type alias) so TypeScript's declaration emitter references it by name
 * rather than expanding the `[aliasesSymbol]` key inline — same workaround as
 * `DataADTDeclBrand` in types.mts for
 * {@link https://github.com/microsoft/TypeScript/issues/37888}.
 */
export interface HasAliases<A extends string> {
    readonly [aliasesSymbol]: readonly A[];
}

/** Returns the alias names stored by `.as()` on a fold/unfold/map def, or `undefined` if none. */
export function getAliases(opDef: unknown): readonly string[] | undefined {
    return (opDef as Record<symbol, unknown>)[aliasesSymbol] as readonly string[] | undefined;
}

// ---- Type helpers -----------------------------------------------------------

/**
 * Maps a constructor (spec value) to the runtime instance type it produces.
 * Reuses SpecValue with Self=never since unfold/fold input types are never
 * recursive self-references.
 */
export type InstanceOf<C> = SpecValue<C, never>;

// ---- Return types -----------------------------------------------------------

/**
 * Interface base for unfold operation defs. Declared as an **interface** so
 * TypeScript's declaration emitter always references it by name — never
 * inlining `[op]`/`[spec]` unique-symbol keys into `.d.ts` files (TS4023
 * workaround, same technique as `DataADTDeclBrand` in types.mts).
 */
export interface UnfoldDefBase<S> {
    readonly [op]: 'unfold';
    readonly [spec]: S;
    as<A extends string>(...aliases: A[]): UnfoldDefBase<S> & HasAliases<A>;
}

/** The type returned by `unfold(spec)(handlers)`. */
export type UnfoldDef<S, H> = UnfoldDefBase<S> & H;

/**
 * Interface base for fold operation defs. Declared as an **interface** so
 * TypeScript's declaration emitter always references it by name — never
 * inlining `[op]`/`[spec]` unique-symbol keys into `.d.ts` files (TS4023
 * workaround, same technique as `DataADTDeclBrand` in types.mts).
 */
export interface FoldDefBase<S> {
    readonly [op]: 'fold';
    readonly [spec]: S;
    as<A extends string>(...aliases: A[]): FoldDefBase<S> & HasAliases<A>;
}

/** The type returned by `fold(spec)(handlers)`. */
export type FoldDef<S, H> = FoldDefBase<S> & H;

/**
 * Interface base for map operation defs. Declared as an **interface** so
 * TypeScript's declaration emitter always references it by name — never
 * inlining `[op]`/`[spec]` unique-symbol keys into `.d.ts` files (TS4023
 * workaround, same technique as `DataADTDeclBrand` in types.mts).
 */
export interface MapDefBase<S> {
    readonly [op]: 'map';
    readonly [spec]: S;
    as<A extends string>(...aliases: A[]): MapDefBase<S> & HasAliases<A>;
}

/** The type returned by `map(spec)(handlers)`. */
export type MapDef<S, H> = MapDefBase<S> & H;

// ---- Alias expansion type ---------------------------------------------------

/**
 * Expands aliases declared via `.as()` in an ops object into additional keys
 * typed identically to their canonical operation.
 *
 * Values in the expanded entries resolve to `FoldDefBase<S>`, `UnfoldDefBase<S>`,
 * or `MapDefBase<S>` — interfaces that TypeScript always emits by name rather
 * than inlining `[op]`/`[spec]` unique symbols. This avoids TS4023.
 */
export type ExpandAliases<O> = O & {
    // Iterate over every key K in the ops object O.
    // The `as` clause re-maps each key: if the value O[K] carries HasAliases<A>
    // (i.e. .as() was called on it), emit the alias string(s) A as new keys;
    // otherwise drop the key with `never` so only aliased ops contribute entries.
    readonly [K in keyof O as (O[K] extends HasAliases<infer A> ? A : never)]:
    // For each alias key, resolve the value type back to the base operation
    // (FoldDefBase<S> | UnfoldDefBase<S> | MapDefBase<S>) by stripping the
    // HasAliases<string> intersection that .as() appended. This keeps the
    // emitted declaration free of the [aliasesSymbol] unique-symbol key,
    // avoiding TS4023 errors when declaration files are generated.
    O[K] extends (infer Base) & HasAliases<string> ? Base : O[K]
};

/** The type returned by `merge(opNames)`. */
export type MergeDef<N extends readonly string[] = readonly string[]> =
    { readonly [op]: 'merge'; readonly [operations]: N };

// ---- Handler constraint types -----------------------------------------------

/**
 * Converts a spec value (TypeSpec or `Record<string, TypeSpec>`) to its
 * runtime value type. Used for both unfold seed parameters and fold `in` types.
 *
 * Thin alias for `ObserverInputValue<T, never>` (exported from types.mts).
 * `Self = never` because unfold/fold input types are never self-referential.
 */
type SpecToValue<T> = ObserverInputValue<T, never>;

/**
 * The expected handler function type for an unfold operation.
 * When the spec has `in: In`, handlers receive `(n: SpecToValue<In>) => unknown`.
 * When there is no `in`, handlers receive no argument: `() => unknown`.
 *
 * Supports both simple TypeSpec inputs (`in: Number`) and structured inputs
 * (`in: { min: Number, max: Number }`).
 */
type UnfoldHandlerFn<S> = S extends { in: infer In }
    ? (n: SpecToValue<In>) => unknown
    : () => unknown;

/**
 * Within fold handlers, `this` is bound to the variant instance. The runtime
 * sets `this[parent]` as an accessor for the parent operation result, so we
 * type the symbol index as `any` to allow arithmetic and property access on it
 * without extra casts. We also allow string-keyed access so that handlers can
 * use `this.someField` or `this.someOperation` without extra casts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FoldHandlerThis = { [k: string | symbol]: any };

/**
 * The expected handler function type for a fold operation.
 * - With `{ in: In; out: Out }`: `(ctx: any, n: InstanceOf<In>) => InstanceOf<Out>`
 * - With `{ in: In }` only:     `(ctx: any, n: InstanceOf<In>) => unknown`
 * - With `{ out: Out }` only:   `(ctx: any) => InstanceOf<Out>`
 * - With `{}` (empty spec):     `(ctx: any) => unknown`
 *
 * The `this` parameter is typed as `{ [k: symbol]: any }` so that `this[parent]`
 * (used in override handlers) type-checks without extra casts.
 *
 * The `ctx` parameter (the destructured ADT fields or behavior observers)
 * cannot be inferred from the spec alone. Annotate explicitly when needed:
 *   `Cons: (ctx: { head: number; tail: number }) => ctx.head + ctx.tail`
 */

type FoldHandlerFn<S> = S extends { in: infer In; out: infer Out }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (this: FoldHandlerThis, ctx: any, n: InstanceOf<In>) => InstanceOf<Out>
    : S extends { in: infer In }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (this: FoldHandlerThis, ctx: any, n: InstanceOf<In>) => unknown
        : S extends { out: infer Out }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? (this: FoldHandlerThis, ctx: any) => InstanceOf<Out>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            : (this: FoldHandlerThis, ctx: any) => unknown;

// ---- Contract callback constraint types ------------------------------------

/**
 * Contextual typing for contract callbacks in specs.
 *
 * TypeScript cannot evaluate conditional type mappings (e.g. NumberConstructor → number)
 * during inference of the first curried call, so `demands` params are typed as `any`
 * rather than the precise mapped type. This prevents noImplicitAny errors while
 * keeping the code flexible. The handlers in the second call still get precise typing.
 */
export interface ContractCallbacks {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    demands?: (self: any, ...args: any[]) => boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ensures?: (self: any, old: any, result: any, ...args: any[]) => boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rescue?: (self: any, error: any, args: any[], retry: (...newArgs: any[]) => any) => any;
}

// ---- unfold -----------------------------------------------------------------

/**
 * Curried helper for declaring unfold (anamorphism) operations.
 *
 * Phase 1: pass the spec — TypeScript infers `In` from `spec.in`.
 * Phase 2: pass the handlers — each handler receives `(n: InstanceOf<In>)`
 *   as its first (and only) argument, fully typed.
 *
 * For parameterless unfolds (no `in`), handlers receive no argument.
 *
 * Reusable across both `data()` and `behavior()` declarations since both
 * use the same handler shape `(seed) => something`.
 *
 * @example
 * ```typescript
 * // data() — Cons handler receives n: number
 * Range: unfold({ in: Number, out: Family })({
 *   Nil:  (n) => n <= 0 ? {} : null,
 *   Cons: (n) => n > 0  ? { head: n, tail: n - 1 } : null
 * })
 *
 * // behavior() — head/tail handlers receive n: number
 * From: unfold({ in: Number, out: Self })({
 *   head: (n) => n,
 *   tail: (n) => n + 1
 * })
 *
 * // Parameterless — handlers receive no argument
 * Empty: unfold({ out: Self })({
 *   isEmpty: () => true,
 *   member:  () => () => false
 * })
 *
 * // Partial application — reuse spec across multiple operations
 * const numUnfold = unfold({ in: Number, out: Family });
 * Range:   numUnfold({ Nil: (n) => ..., Cons: (n) => ... }),
 * Reverse: numUnfold({ Nil: (n) => ..., Cons: (n) => ... })
 * ```
 */
export function unfold<S extends Record<string | symbol, unknown>>(s: S & ContractCallbacks) {
    return <H extends Record<string, UnfoldHandlerFn<S>>>(
        handlers: H
    ): UnfoldDef<S, H> => {
        const def = Object.assign({ [op]: 'unfold' as const, [spec]: s }, handlers) as UnfoldDef<S, H>;
        Object.defineProperty(def, 'as', {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value(...aliases: string[]) { (this as any)[aliasesSymbol] = aliases; return this; },
            enumerable: false, configurable: true, writable: true
        });
        return def;
    };
}

// ---- fold -------------------------------------------------------------------

/**
 * Curried helper for declaring fold (catamorphism) operations.
 *
 * Phase 1: pass the spec — TypeScript infers `In` (if present) and `Out`.
 * Phase 2: pass the handlers — each handler receives:
 *   - `ctx` (the destructured variant fields or behavior observers) — typed
 *     as `any` since the field types come from the enclosing declaration
 *   - `n: InstanceOf<In>` as the second argument (only for parametric folds)
 *
 * The return type of every handler is inferred as `InstanceOf<Out>`.
 *
 * Note: `ctx` cannot be fully typed without knowing the enclosing variant
 * specs. Add an explicit annotation when stricter checking is needed:
 *   `Cons: ({ head, tail }: { head: number; tail: number }) => head + tail`
 *
 * @example
 * ```typescript
 * // Parameterless fold — return type inferred as number
 * sum: fold({ out: Number })({
 *   Nil:  () => 0,
 *   Cons: ({ head, tail }) => head + tail
 * })
 *
 * // Parametric fold — n: number ✓, return type inferred as boolean
 * contains: fold({ in: Number, out: Boolean })({
 *   Nil:  (_ctx, n) => false,
 *   Cons: ({ head, tail }, n) => head === n || tail(n)
 * })
 *
 * // Wildcard handler — works the same way
 * name: fold({ out: String })({
 *   _: () => 'unknown'
 * })
 * ```
 */
export function fold<S extends Record<string | symbol, unknown>>(s: S & ContractCallbacks) {
    return <H extends Record<string, FoldHandlerFn<S>>>(
        handlers: H
    ): FoldDef<S, H> => {
        const def = Object.assign({ [op]: 'fold' as const, [spec]: s }, handlers) as FoldDef<S, H>;
        Object.defineProperty(def, 'as', {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value(...aliases: string[]) { (this as any)[aliasesSymbol] = aliases; return this; },
            enumerable: false, configurable: true, writable: true
        });
        return def;
    };
}

// ---- map --------------------------------------------------------------------

/**
 * Curried helper for declaring map (homomorphism) operations.
 *
 * Phase 1: pass the spec — typically `{ out: Family }` or `{ out: Self }`.
 *   An optional `inverse` property names the forward map that this map
 *   reverses, establishing a bijective (1:1) relationship. The system
 *   registers the link bidirectionally and enforces that each operation
 *   has at most one inverse.  In a `merge` pipeline, consecutive inverse
 *   pairs are fused to the identity and eliminated at definition time.
 *
 * Phase 2: pass the handlers — keyed by type parameter name (e.g., `T`).
 *
 * Note: the handler input type is the runtime instance type of the ADT's
 * type parameter `T`, which cannot be inferred from the spec alone. The
 * input param is typed as `any` to avoid spurious errors while still
 * providing the return type context from `spec.out`.
 *
 * @example
 * ```typescript
 * // Basic map
 * increment: map({ out: Family })({
 *   T: (x) => x + 1
 * })
 *
 * // Invertible map pair
 * double: map({ out: Family })({ T: (x) => x * 2 }),
 * halve:  map({ out: Family, inverse: 'double' })({ T: (x) => x / 2 }),
 * ```
 */
export function map<S extends Record<string | symbol, unknown> & { inverse?: string }>(s: S) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <H extends Record<string, (x: any, ...args: any[]) => unknown>>(
        handlers: H
    ): MapDef<S, H> => {
        const def = Object.assign({ [op]: 'map' as const, [spec]: s }, handlers) as MapDef<S, H>;
        Object.defineProperty(def, 'as', {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value(...aliases: string[]) { (this as any)[aliasesSymbol] = aliases; return this; },
            enumerable: false, configurable: true, writable: true
        });
        return def;
    };
}

// ---- merge ------------------------------------------------------------------

/**
 * Helper for declaring merge (pipeline composition) operations.
 *
 * Merges compose two or more named operations into a pipeline:
 * the result of the first operation is fed as input to the second, and so on.
 *
 * Unlike fold/unfold/map, merge has no handlers — only a list of operation names.
 *
 * @example
 * ```typescript
 * Factorial:    merge('Range', 'product'),
 * sumOfSquares: merge('square', 'sum')
 * ```
 */
export function merge<const N extends readonly string[]>(...opNames: N): MergeDef<N> {
    return {
        [op]: 'merge' as const,
        [operations]: opNames
    };
}

// ---- scan ------------------------------------------------------------------

/** The type returned by `scan(targetOpName)`. */
export type ScanDef<N extends string = string> =
    { readonly [op]: 'scan'; readonly [scanTarget]: N };

/**
 * Declares a scan operation: the datatype-generic generalisation of `scanr`.
 * Computes fold(φ) at every subterm in a single bottom-up traversal.
 *
 * Scan Lemma:  L(fold_F(φ)) ∘ subterms  =  scan_F(φ)
 *
 * Result is an array where the first element is `fold(φ)(this)` and
 * subsequent elements are the fold results of each recursive subterm,
 * in traversal order.
 *
 * @param targetOpName  The name of the existing fold operation to scan with.
 *
 * @example
 * ```typescript
 * const MyList = data(() => ({
 *   Nil: {},
 *   Cons: { head: Number, tail: Family }
 * })).ops(({ fold, scan }) => ({
 *   sum: fold({ out: Number })({
 *     Nil: () => 0,
 *     Cons: ({ head, tail }) => head + tail
 *   }),
 *   scanSum: scan('sum')   // [sum(self), sum(tail), ..., sum(Nil)]
 * }));
 * ```
 */
export function scan<N extends string>(targetOpName: N): ScanDef<N> {
    return {
        [op]: 'scan' as const,
        [scanTarget]: targetOpName
    };
}
