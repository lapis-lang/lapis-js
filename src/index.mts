import { MultiKeyWeakMap } from './MultiKeyWeakMap.mjs';
import {
    type Transformer,
    adtTransformers,
    createMatchTransformer,
    HandlerMapSymbol
} from './Transformer.mjs';

export type { Transformer, TransformerConfig } from './Transformer.mjs';
export { createTransformer, composeTransformers } from './Transformer.mjs';

export type Predicate<T = unknown> = (value: T) => boolean

// Generic constructor type that maps to its instance type
export type Constructor<T = any> = abstract new (...args: any[]) => T

// Symbol to mark Family references for recursive ADTs
const FamilyRefSymbol = Symbol('FamilyRef')
const TypeParamSymbol = Symbol('TypeParam')
const BaseADTSymbol = Symbol('BaseADT') // Points to the actual ADT class for callable Proxies

// Type for type parameter placeholder - name is tracked at type level
export interface TypeParam<Name extends string = string> {
    [TypeParamSymbol]: Name
}

// Type for Family reference in recursive ADTs
// Can be used as `Family` or called as `Family(T)` for explicit parameterization
export interface FamilyRef {
    [FamilyRefSymbol]: true
    (typeParam?: TypeParam): FamilyRef
}

// Context provided to callback-style data definitions
// Specific named type parameters for common use cases
export type DataContext = {
    Family: FamilyRef
    T: TypeParam<'T'>
    U: TypeParam<'U'>
    V: TypeParam<'V'>
    W: TypeParam<'W'>
    X: TypeParam<'X'>
    Y: TypeParam<'Y'>
    Z: TypeParam<'Z'>
}

// Type arguments mapping (e.g., {T: Number})
export type TypeArgs = Record<string, FieldSpec>

// Built-in constructors
export type BuiltInConstructor =
    | NumberConstructor
    | StringConstructor
    | BooleanConstructor
    | ObjectConstructor
    | ArrayConstructor
    | DateConstructor
    | RegExpConstructor
    | SymbolConstructor
    | BigIntConstructor

// Abstract base class type for ADTs
export type ADTClass = Constructor

// Use any to break circular reference for recursive types
export type FieldSpec = Predicate | BuiltInConstructor | ADTClass | FamilyRef | TypeParam
// Field definition: single-key object like { x: Number }
export type FieldDef = Record<string, FieldSpec>
// Variant value: empty array [] for singleton, array of FieldDef for structured
export type VariantValue = [] | readonly FieldDef[]
export type DataDecl = Record<string, VariantValue>
export type DataDeclFn = (context: DataContext) => DataDecl

// Extract the first character of a string
type FirstChar<S extends string> = S extends `${infer F}${string}` ? F : never

// Extract keys that are not PascalCase (do not start with uppercase letter)
type InvalidVariantKeys<D> = {
    [K in keyof D]: K extends string
    ? Uppercase<FirstChar<K>> extends FirstChar<K> ? never : K
    : never
}[keyof D]

// Reserved property names that cannot be used as field names
type ReservedPropertyName =
    | 'constructor'
    | 'prototype'
    | '__proto__'
    | 'toString'
    | 'valueOf'
    | 'hasOwnProperty'
    | 'isPrototypeOf'
    | 'propertyIsEnumerable'
    | 'toLocaleString'

// Extract property keys that are not camelCase (start with uppercase letter or underscore) or are reserved
type InvalidPropertyKeys<T> = {
    [K in keyof T]: K extends string
    ? K extends ReservedPropertyName ? K :  // Reserved name - invalid
    Uppercase<FirstChar<K>> extends FirstChar<K> ? K :  // PascalCase - invalid
    K extends `_${string}` ? K : never  // Underscore prefix - invalid
    : never
}[keyof T]

// Check if an object has exactly one key
// Uses union to tuple conversion to count keys
type UnionToTuple<T> = (
    (T extends any ? (t: T) => T : never) extends infer U
    ? (U extends any ? (u: U) => any : never) extends (v: infer V) => any
    ? V
    : never
    : never
) extends (_: any) => infer W
    ? [...UnionToTuple<Exclude<T, W>>, W]
    : [];

type HasSingleKey<T> = UnionToTuple<keyof T>['length'] extends 1 ? true : false

// Check that all variant keys are PascalCase (start with uppercase letter)
type CheckVariantKeys<D> = InvalidVariantKeys<D> extends never
    ? unknown
    : { [K in InvalidVariantKeys<D>]: `Variant '${K & string}' must be PascalCase` }

// Check each element in a tuple of field defs for invalid property names or multiple keys
// Returns never if all valid, otherwise returns union of invalid property names or error strings
type CheckFieldDefTuple<T extends readonly any[]> = T extends readonly []
    ? never  // Empty tuple is valid
    : {
        [K in keyof T]: T[K] extends Record<string, any>
        ? HasSingleKey<T[K]> extends false
        ? 'FieldDefMustHaveExactlyOneKey'
        : InvalidPropertyKeys<T[K]>
        : never
    }[number]  // This creates a union of all invalid keys (or never if all valid)

// Check all variants' field def arrays (treating them as tuples)
// Returns never if all valid, otherwise returns union of all invalid property names
type CheckAllPropertyKeys<D> = {
    [K in keyof D]: D[K] extends readonly any[]
    ? CheckFieldDefTuple<D[K]>
    : never
}[keyof D]

// Check if array is empty []
type IsEmptyArray<T> = T extends readonly [] ? true : false

// Extract field name from single-key object
type FieldName<F> = F extends Record<string, any> ? keyof F : never

// Extract field spec from single-key object  
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type FieldSpecFromDef<F> = F extends Record<infer _K, infer V> ? V : never

// Convert array of field defs to object type { x: number, y: number }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type FieldDefsToObject<Defs extends readonly FieldDef[], Self = any, TypeArgMap = {}> = {
    readonly [K in Defs[number]as FieldName<K>]: FieldSpecFromDef<K> extends FieldSpec
    ? InferFieldType<FieldSpecFromDef<K>, Self, TypeArgMap>
    : never
}

// Convert array of field defs to tuple type [number, number]
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type FieldDefsToTuple<Defs extends readonly FieldDef[], Self = any, TypeArgMap = {}> = {
    [K in keyof Defs]: Defs[K] extends FieldDef
    ? FieldSpecFromDef<Defs[K]> extends FieldSpec
    ? InferFieldType<FieldSpecFromDef<Defs[K]>, Self, TypeArgMap>
    : never
    : never
} extends infer T extends readonly any[] ? T : never

// Infer the TypeScript type from a field specification

// Infer the TypeScript type from a field specification
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type InferFieldType<F, Self = unknown, TypeArgMap = {}> =
    F extends FamilyRef ? Self :
    F extends TypeParam<infer ParamName> ? (
        ParamName extends keyof TypeArgMap ?
        InferTypeFromSpec<TypeArgMap[ParamName]> :
        any
    ) :
    F extends NumberConstructor ? number :
    F extends StringConstructor ? string :
    F extends BooleanConstructor ? boolean :
    F extends ObjectConstructor ? object :
    F extends ArrayConstructor ? unknown[] :
    F extends DateConstructor ? Date :
    F extends RegExpConstructor ? RegExp :
    F extends SymbolConstructor ? symbol :
    F extends BigIntConstructor ? bigint :
    F extends ADTClass ? InstanceType<F> :
    F extends Predicate<infer T> ? T :
    unknown

// Infer TypeScript type from a type specification (Number -> number, etc.)
type InferTypeFromSpec<S> =
    S extends NumberConstructor ? number :
    S extends StringConstructor ? string :
    S extends BooleanConstructor ? boolean :
    S extends ObjectConstructor ? object :
    S extends ArrayConstructor ? unknown[] :
    S extends DateConstructor ? Date :
    S extends RegExpConstructor ? RegExp :
    S extends SymbolConstructor ? symbol :
    S extends BigIntConstructor ? bigint :
    S extends ADTClass ? InstanceType<S> :
    S extends Predicate<infer T> ? T :
    unknown

// Helper to get variant instance types with type argument substitution
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type VariantInstance<D, K extends keyof D, Self = any, TypeArgMap = {}, Operations = {}> =
    IsEmptyArray<D[K]> extends true
    ? { readonly constructor: { readonly name: K } } & Operations
    : D[K] extends readonly FieldDef[]
    ? FieldDefsToObject<D[K], Self, TypeArgMap> & { readonly constructor: { readonly name: K } } & Operations
    : never

// Union of all variant instances with type argument substitution
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type VariantUnion<D, TypeArgMap = {}, Operations = {}> = {
    [K in keyof D]: VariantInstance<D, K, any, TypeArgMap, Operations>
}[keyof D]

// Helper to extract handler parameter type for a variant
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type HandlerParam<D, K extends keyof D, TypeArgMap = {}> =
    IsEmptyArray<D[K]> extends true
    ? [] // Singleton variant - no parameters
    : D[K] extends readonly FieldDef[]
    ? [FieldDefsToObject<D[K], any, TypeArgMap>] // Structured variant - named fields
    : never

// Helper to create handler signature for a variant
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type HandlerFn<D, K extends keyof D, R, TypeArgMap = {}> =
    HandlerParam<D, K, TypeArgMap> extends []
    ? () => R
    : HandlerParam<D, K, TypeArgMap> extends [infer P]
    ? (fields: P) => R
    : never

// Handler map for match operation - enforces exhaustiveness when no wildcard
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type MatchHandlers<D, R, TypeArgMap = {}, Operations = {}> =
    | ({
        [K in keyof D]: HandlerFn<D, K, R, TypeArgMap>
    } & {
        _?: never  // Wildcard not allowed when all cases are handled
    })
    | ({
        [K in keyof D]?: HandlerFn<D, K, R, TypeArgMap>
    } & {
        _: (instance: VariantUnion<D, TypeArgMap, Operations>) => R  // Wildcard required when cases are optional
    })


// Definition of the DataDef type with type argument substitution
// Supports both named and positional arguments with full type safety
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type DataDef<D extends DataDecl, TypeArgMap = {}, Operations = {}> = (abstract new (...args: any[]) => VariantUnion<D, TypeArgMap, Operations>) & {
    readonly [K in keyof D]: IsEmptyArray<D[K]> extends true
    ? VariantInstance<D, K, any, TypeArgMap, Operations>
    : D[K] extends readonly FieldDef[]
    ? ((
        // Named argument form: Point2D({ x: 3, y: 2 })
        data: FieldDefsToObject<D[K], any, TypeArgMap>
    ) => VariantInstance<D, K, any, TypeArgMap, Operations>) & ((
        // Positional argument form: Point2D(3, 2)
        ...args: FieldDefsToTuple<D[K], any, TypeArgMap>
    ) => VariantInstance<D, K, any, TypeArgMap, Operations>) & {
        new(data: FieldDefsToObject<D[K], any, TypeArgMap>): VariantInstance<D, K, any, TypeArgMap, Operations>
        new(...args: FieldDefsToTuple<D[K], any, TypeArgMap>): VariantInstance<D, K, any, TypeArgMap, Operations>
    }
    : never
} & {
    extend<const E extends DataDecl>(
        decl: unknown extends CheckVariantKeys<E>
            ? (CheckAllPropertyKeys<E> extends never ? E : never)
            : never
    ): DataDef<D & E, TypeArgMap, Operations>;
    extend<const E extends DataDecl>(
        fn: (context: DataContext) => (unknown extends CheckVariantKeys<E>
            ? (CheckAllPropertyKeys<E> extends never ? E : never)
            : never)
    ): DataDef<D & E, TypeArgMap, Operations>;
    match<Name extends string, R>(
        name: Name,
        spec: { out: any },
        handlers: MatchHandlers<D, R, TypeArgMap, Operations>
    ): DataDef<D, TypeArgMap, Operations & Record<Name, () => R>>;
    match<Name extends string, R>(
        name: Name,
        spec: { out: any },
        handlersFn: (Family: DataDef<D, TypeArgMap, Operations>) => MatchHandlers<D, R, TypeArgMap, Operations>
    ): DataDef<D, TypeArgMap, Operations & Record<Name, () => R>>;
}

/**
 * Checks if the value is an object literal.
 * @param value The value to check.
 * @returns Returns true if the value is an object literal, else false.
 */
function isObjectLiteral(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Checks if a function is constructable
 */
function isConstructable(fn: unknown): fn is new (...args: any[]) => any {
    if (typeof fn !== 'function') return false;
    try {
        new new Proxy(fn as any, { construct: () => ({}) })();
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks if a value is a FamilyRef
 */
function isFamilyRef(value: unknown): value is FamilyRef {
    return (typeof value === 'object' || typeof value === 'function') && value !== null && FamilyRefSymbol in value;
}

/**
 * Checks if a value is a TypeParam
 */
function isTypeParam(value: unknown): value is TypeParam {
    return typeof value === 'object' && value !== null && TypeParamSymbol in value;
}

/**
 * Helper to create a variant instance from either named or positional arguments
 */
function createVariantInstance<T>(
    VariantClass: new (data: Record<string, unknown>) => T,
    fieldNames: string[],
    argumentsList: unknown[],
    variantName: string,
    pool: MultiKeyWeakMap,
    prefix = ''
): T {
    // Detect argument style: named (object literal) vs positional
    let namedArgs: Record<string, unknown>;

    // To distinguish named vs positional when length === 1:
    // - Named: object literal with ALL expected field names as keys
    // - Positional: anything else (including object literals that don't match field names)
    const firstArg = argumentsList[0];
    if (argumentsList.length === 1 &&
        isObjectLiteral(firstArg) &&
        fieldNames.every(name => name in firstArg)) {
        // Named argument form: Point2D({ x: 3, y: 2 })
        namedArgs = firstArg;
    } else {
        // Positional argument form: Point2D(3, 2) or Point2D(someObject)
        // Validate arity
        if (argumentsList.length !== fieldNames.length) {
            throw new TypeError(
                `Wrong number of arguments. Expected: ${prefix}${variantName}(${fieldNames.join(', ')}), got: ${prefix}${variantName}(${argumentsList.map((_, i) => `arg${i}`).join(', ')})`
            );
        }

        // Convert positional args to named object
        namedArgs = {};
        fieldNames.forEach((fieldName, index) => {
            namedArgs[fieldName] = argumentsList[index];
        });
    }

    // Extract field values in order for pooling lookup
    const fieldValues = fieldNames.map(name => namedArgs[name]);

    // Check pool for existing instance with same values
    const pooled = pool.get(...fieldValues);
    if (pooled !== undefined) {
        return pooled;
    }

    // Create new instance
    const instance = new VariantClass(namedArgs);

    // Store in pool
    pool.set(...fieldValues, instance);

    return instance;
}

/**
 * Creates a Family reference for recursive ADTs
 * Can be used directly as a field spec (Family) or called with type param (Family(T))
 */
function createFamily(): FamilyRef {
    // Create the callable function first
    const fn = function (_typeParam?: TypeParam): FamilyRef {
        // Calling Family(T) returns the same Family reference
        // In the future, this could track the type param for validation
        return fn as FamilyRef;
    };

    // Add the FamilyRef symbol marker
    (fn as any)[FamilyRefSymbol] = true;

    return fn as FamilyRef;
}

/**
 * Installs an operation on a variant's prototype.
 * Creates a method that extracts fields and calls the transformer's handler.
 * 
 * @param variant - The variant (constructor or singleton instance)
 * @param opName - Name of the operation to install
 * @param transformer - The transformer containing the operation logic
 */
function installOperationOnVariant(variant: any, opName: string, transformer: Transformer): void {
    let VariantClass: any;

    if (typeof variant === 'function') {
        // Structured variant - Proxy-wrapped constructor
        VariantClass = variant;
    } else if (variant && typeof variant === 'object') {
        // Singleton variant - get constructor
        VariantClass = variant.constructor;
    } else {
        return;
    }

    // Install method on variant class prototype (skip if already present)
    if (!VariantClass?.prototype || VariantClass.prototype[opName]) {
        return;
    }

    VariantClass.prototype[opName] = function (this: any) {
        const ctorTransform = transformer.getCtorTransform?.(this.constructor);
        if (!ctorTransform) {
            throw new Error(
                `No handler for variant '${this.constructor.name}' in match operation '${opName}'`
            );
        }

        // Check if this is a wildcard handler
        const handlers = (transformer as any)[HandlerMapSymbol];
        const isWildcard = handlers && !handlers[this.constructor.name];

        if (isWildcard && handlers._) {
            // Wildcard handler receives the full instance
            return ctorTransform(this);
        }

        // Get field names if structured variant
        const fieldNames = (this.constructor as any)._fieldNames;

        if (fieldNames && fieldNames.length > 0) {
            // Structured variant - extract fields as object for named destructuring
            const fields: Record<string, any> = {};
            for (const fieldName of fieldNames) {
                fields[fieldName] = this[fieldName];
            }
            return ctorTransform(fields);
        } else {
            // Singleton variant - no fields to pass
            return ctorTransform();
        }
    };
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
function collectVariantsFromChain(adt: any, accumulated: Map<string, any> = new Map()): Map<string, any> {
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
 * Checks if a value is a valid field specification
 */
function isFieldSpec(value: unknown): value is FieldSpec {
    return typeof value === 'function' || isFamilyRef(value) || isTypeParam(value);
}

/**
 * Checks if a value is a field definition (single-key object with FieldSpec value)
 */
function isFieldDef(value: unknown): value is FieldDef {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    if (keys.length !== 1) return false;
    const fieldSpec = (value as Record<string, unknown>)[keys[0]];
    return isFieldSpec(fieldSpec);
}

/**
 * Checks if a variant value is structured (non-empty array of field defs)
 */
function isStructuredVariant(value: unknown): value is readonly FieldDef[] {
    if (!Array.isArray(value)) return false;
    if (value.length === 0) return false;  // Empty array [] = singleton
    return value.every(isFieldDef);
}

/**
 * Validates a value against a field specification
 */
function validateField(value: unknown, spec: FieldSpec, fieldName: string, adtClass?: abstract new (...args: any[]) => any): void {
    // Skip validation for type parameters - compile-time types handle this
    if (isTypeParam(spec)) {
        return;
    }

    // Handle Family reference
    if (isFamilyRef(spec)) {
        if (!adtClass) {
            throw new Error('FamilyRef used without ADT class context');
        }
        if (!(value instanceof adtClass)) {
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
        // ADT class - check instanceof
        if (!(value instanceof spec)) {
            throw new TypeError(`Field '${fieldName}' must be an instance of ${spec.name || 'ADT'}`);
        }
    } else if (typeof spec === 'function') {
        // Predicate function (not a constructor)
        const predicateFn = spec as (value: unknown) => boolean;
        if (!predicateFn(value)) {
            throw new TypeError(`Field '${fieldName}' failed predicate validation`);
        }
    }
}

/**
 * Defines a new algebraic data type (ADT) with the given variants.
 */
export function data<const D extends DataDecl>(
    decl: unknown extends CheckVariantKeys<D>
        ? (CheckAllPropertyKeys<D> extends never ? D : never)
        : never
): DataDef<D>;
export function data<const D extends DataDecl>(
    fn: (context: DataContext) => (unknown extends CheckVariantKeys<D>
        ? (CheckAllPropertyKeys<D> extends never ? D : never)
        : never)
): DataDef<D> & (<TArgs extends TypeArgs>(typeArgs: TArgs) => DataDef<D, TArgs>);
export function data<const D extends DataDecl>(
    declOrFn: (unknown extends CheckVariantKeys<D>
        ? (CheckAllPropertyKeys<D> extends never ? D : never)
        : never)
        | ((context: DataContext) => (unknown extends CheckVariantKeys<D>
            ? (CheckAllPropertyKeys<D> extends never ? D : never)
            : never))
): DataDef<D> | (DataDef<D> & (<TArgs extends TypeArgs>(typeArgs: TArgs) => DataDef<D, TArgs>)) {
    const isCallbackStyle = typeof declOrFn === 'function';

    // typeArgs parameter is used for the instantiation API (e.g., List({ T: Number }))
    // but not consumed during validation. Type safety is enforced at compile-time by TypeScript
    // through the type system (TypeArgMap substitution in DataDef types).
    // Runtime validation of type parameters was intentionally removed - if users bypass
    // TypeScript with 'as any', that's their responsibility per Henry Spencer's principle:
    // "If you lie to the compiler, it will get its revenge"
    function createADT(_typeArgs?: TypeArgs): DataDef<D> {
        abstract class ADT {
            constructor() {
                // Allow subclasses to instantiate
            }

            /**
             * Register a transformer for an operation.
             * @internal
             */
            static _registerTransformer(this: any, name: string, transformer: Transformer): void {
                // Check for name collision with variant fields
                // Iterate through variant constructors/instances
                for (const key of Object.keys(this)) {
                    if (key === 'extend' || key.startsWith('_')) {
                        continue;
                    }

                    const variant = this[key];

                    // Check if this is a function (constructor) - could be Proxy or direct
                    if (typeof variant === 'function') {
                        // Check if it has _fieldNames (structured variant)
                        if (variant._fieldNames && variant._fieldNames.includes(name)) {
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

                // Get or create the registry for this ADT class
                let registry = adtTransformers.get(this);
                if (!registry) {
                    // If parent has a registry, copy it
                    const parentRegistry = adtTransformers.get(Object.getPrototypeOf(this));
                    registry = parentRegistry ? new Map(parentRegistry) : new Map();
                    adtTransformers.set(this, registry);
                }

                registry.set(name, transformer);
            }

            /**
             * Get a registered transformer by name.
             * Looks up the prototype chain to find inherited transformers.
             * @internal
             */
            static _getTransformer(this: any, name: string): Transformer | undefined {
                const registry = adtTransformers.get(this);
                if (registry?.has(name)) {
                    return registry.get(name);
                }

                // Check parent class
                const parent = Object.getPrototypeOf(this);
                if (parent && parent._getTransformer) {
                    return parent._getTransformer(name);
                }

                return undefined;
            }

            /**
             * Get all registered transformer names.
             * @internal
             */
            static _getTransformerNames(this: any): string[] {
                const registry = adtTransformers.get(this);
                return registry ? Array.from(registry.keys()) : [];
            }

            /**
             * Define a match operation (non-recursive pattern matching).
             * Dispatches on variant constructors without structural recursion.
             * 
             * @param name - Name of the operation (becomes instance method name)
             * @param spec - Type specification { out: ReturnType }
             * @param handlersOrFn - Handler map or callback returning handlers
             * @returns The ADT with the match operation installed
             */
            static match<R>(
                this: any,
                name: string,
                spec: { out: any },
                handlersOrFn: Record<string, ((...args: any[]) => R) | ((fields: any) => R)> | ((Family: any) => Record<string, ((...args: any[]) => R) | ((fields: any) => R)>)
            ): any {
                // Unwrap Proxy to get actual ADT class for callback-style ADTs
                const actualADT = this[BaseADTSymbol] || this;

                // Resolve handlers - support callback form for consistency with fold/unfold
                const handlers = typeof handlersOrFn === 'function'
                    ? handlersOrFn(this)
                    : handlersOrFn;

                const transformer = createMatchTransformer(name, handlers);

                actualADT._registerTransformer(name, transformer);

                // Install operation method on all variant prototypes
                // Iterate through all variants (including inherited ones from parent ADTs)
                const allVariants = collectVariantsFromChain(actualADT);

                // Install operation on all collected variants
                for (const [, variant] of allVariants) {
                    let VariantClass: any;

                    // Get the variant class
                    if (typeof variant === 'function') {
                        // Structured variant - Proxy-wrapped, but target is the VariantClass
                        // We can access prototype directly through the Proxy
                        VariantClass = variant;
                    } else if (variant && typeof variant === 'object') {
                        // Singleton variant - get constructor
                        VariantClass = variant.constructor;
                    } else {
                        continue;
                    }

                    // Install method on variant class prototype
                    if (VariantClass && VariantClass.prototype) {
                        VariantClass.prototype[name] = function (this: any): R {
                            const ctorTransform = transformer.getCtorTransform?.(this.constructor);
                            if (!ctorTransform) {
                                throw new Error(
                                    `No handler for variant '${this.constructor.name}' in match operation '${name}'`
                                );
                            }

                            // Check if this is a wildcard handler (by checking if the handler is from the wildcard)
                            const handlers = (transformer as any)[HandlerMapSymbol];
                            const isWildcard = handlers && !handlers[this.constructor.name];

                            if (isWildcard && handlers._) {
                                // Wildcard handler receives the full instance
                                return ctorTransform(this);
                            }

                            // Get field names if structured variant
                            const fieldNames = (this.constructor as any)._fieldNames;

                            if (fieldNames && fieldNames.length > 0) {
                                // Structured variant - extract fields as object for named destructuring
                                const fields: Record<string, any> = {};
                                for (const fieldName of fieldNames) {
                                    fields[fieldName] = this[fieldName];
                                }
                                return ctorTransform(fields);
                            } else {
                                // Singleton variant - no fields to pass
                                return ctorTransform();
                            }
                        };
                    }
                }

                return this;
            }

            // Static extend method - inherited by all ADTs and extended ADTs
            static extend<const E extends DataDecl>(
                this: any,
                extensionDeclOrFn: E | ((context: DataContext) => E)
            ): DataDef<D & E> {
                // eslint-disable-next-line @typescript-eslint/no-this-alias
                const parentADT = this; // 'this' is the parent ADT class
                const isExtensionCallback = typeof extensionDeclOrFn === 'function';

                // Get the actual ADT class to extend from
                // For callable Proxies, unwrap to get the base ADT
                const parentADTClass = (parentADT as any)[BaseADTSymbol] || parentADT;

                // Create extended ADT class that inherits from parent ADT class
                abstract class ExtendedADT extends (parentADTClass as any) {
                    constructor() {
                        super();
                    }
                }

                const extendedResult = ExtendedADT as any;

                // Resolve the extension declaration
                const extensionFamily = createFamily();
                const extensionDecl = isExtensionCallback
                    ? extensionDeclOrFn({ Family: extensionFamily, T, U, V, W, X, Y, Z })
                    : extensionDeclOrFn;

                // Check for variant name collisions
                for (const variantName of Object.keys(extensionDecl)) {
                    if (variantName in result) {
                        throw new Error(
                            `Variant name collision: '${variantName}' already exists in base ADT`
                        );
                    }
                }

                // Create new variants for the extension
                for (const [variantName, value] of Object.entries(extensionDecl)) {
                    if (isStructuredVariant(value)) {
                        // Structured variant with field definitions
                        const fieldDefs = value as readonly FieldDef[];

                        // Extract field names and specs from array of single-key objects
                        const fields: Array<{ name: string; spec: FieldSpec }> = fieldDefs.map(fieldDef => {
                            const [name, spec] = Object.entries(fieldDef)[0];
                            return { name, spec: spec as FieldSpec };
                        });

                        class VariantClass extends ExtendedADT {
                            constructor(data: Record<string, unknown>) {
                                super();

                                // Validate field types against specifications
                                // Use root/result ADT for Family references
                                for (const { name, spec } of fields) {
                                    validateField(data[name], spec, name, result);
                                }

                                // Assign fields to instance
                                for (const { name } of fields) {
                                    Object.defineProperty(this, name, {
                                        value: data[name],
                                        writable: false,
                                        enumerable: true,
                                        configurable: false
                                    });
                                }

                                Object.freeze(this);
                            }
                        }

                        // Set the class name for reflection
                        Object.defineProperty(VariantClass, 'name', {
                            value: variantName,
                            writable: false,
                            configurable: false
                        });

                        // Create pool for this variant
                        const variantPool = new MultiKeyWeakMap();

                        // Wrap in a Proxy to make it callable without 'new'
                        const fieldNames = fields.map(f => f.name);
                        extendedResult[variantName] = new Proxy(VariantClass, {
                            apply(_target, _thisArg, argumentsList) {
                                return createVariantInstance(VariantClass, fieldNames, argumentsList, variantName, variantPool);
                            },
                            construct(_target, argumentsList) {
                                return createVariantInstance(VariantClass, fieldNames, argumentsList, variantName, variantPool, 'new ');
                            }
                        });
                    } else {
                        // Simple enumerated variant (empty array [])
                        class VariantClass extends ExtendedADT {
                            protected constructor() {
                                super();
                                Object.freeze(this);
                            }

                            private static _instance: VariantClass;
                            static {
                                this._instance = new VariantClass();
                            }
                        }

                        // Set the class name for reflection
                        Object.defineProperty(VariantClass, 'name', {
                            value: variantName,
                            writable: false,
                            configurable: false
                        });

                        extendedResult[variantName] = (VariantClass as any)._instance;
                    }
                }

                // Install parent operations on new variants
                const parentTransformerNames = parentADTClass._getTransformerNames?.() || [];
                for (const opName of parentTransformerNames) {
                    const transformer = parentADTClass._getTransformer?.(opName);
                    if (!transformer) continue;

                    // Install operation on each new variant
                    for (const variantName of Object.keys(extensionDecl)) {
                        installOperationOnVariant(extendedResult[variantName], opName, transformer);
                    }
                }

                Object.freeze(extendedResult);
                return extendedResult;
            }
        }

        const result = ADT as any;

        // Resolve the declaration - handle both object and callback styles
        const Family = createFamily();
        const T: TypeParam<'T'> = { [TypeParamSymbol]: 'T' };
        const U: TypeParam<'U'> = { [TypeParamSymbol]: 'U' };
        const V: TypeParam<'V'> = { [TypeParamSymbol]: 'V' };
        const W: TypeParam<'W'> = { [TypeParamSymbol]: 'W' };
        const X: TypeParam<'X'> = { [TypeParamSymbol]: 'X' };
        const Y: TypeParam<'Y'> = { [TypeParamSymbol]: 'Y' };
        const Z: TypeParam<'Z'> = { [TypeParamSymbol]: 'Z' };

        const decl = isCallbackStyle
            ? declOrFn({ Family, T, U, V, W, X, Y, Z })
            : declOrFn;

        for (const [variantName, value] of Object.entries(decl)) {
            if (isStructuredVariant(value)) {
                // Structured variant with field definitions
                const fieldDefs = value as readonly FieldDef[];

                // Extract field names and specs from array of single-key objects
                const fields: Array<{ name: string; spec: FieldSpec }> = fieldDefs.map(fieldDef => {
                    const [name, spec] = Object.entries(fieldDef)[0];
                    return { name, spec: spec as FieldSpec };
                });
                class VariantClass extends ADT {
                    constructor(data: Record<string, unknown>) {
                        super();

                        // Validate field types against specifications
                        for (const { name, spec } of fields) {
                            validateField(data[name], spec, name, ADT);
                        }

                        // Assign fields to instance
                        for (const { name } of fields) {
                            Object.defineProperty(this, name, {
                                value: data[name],
                                writable: false,
                                enumerable: true,
                                configurable: false
                            });
                        }

                        Object.freeze(this);
                    }
                }

                // Set the class name for reflection
                Object.defineProperty(VariantClass, 'name', {
                    value: variantName,
                    writable: false,
                    configurable: false
                });

                // Create pool for this variant
                const variantPool = new MultiKeyWeakMap();

                // Wrap in a Proxy to make it callable without 'new'
                const fieldNames = fields.map(f => f.name);

                // Store field names on the VariantClass for later inspection
                (VariantClass as any)._fieldNames = fieldNames;

                result[variantName] = new Proxy(VariantClass, {
                    apply(_target, _thisArg, argumentsList) {
                        return createVariantInstance(VariantClass, fieldNames, argumentsList, variantName, variantPool);
                    },
                    construct(_target, argumentsList) {
                        return createVariantInstance(VariantClass, fieldNames, argumentsList, variantName, variantPool, 'new ');
                    }
                });
            } else {
                // Simple enumerated variant (empty array [])
                class VariantClass extends ADT {
                    protected constructor() {
                        super();
                        Object.freeze(this);
                    }

                    private static _instance: VariantClass;
                    static {
                        this._instance = new VariantClass();
                    }
                }

                // Set the class name for reflection
                Object.defineProperty(VariantClass, 'name', {
                    value: variantName,
                    writable: false,
                    configurable: false
                });

                result[variantName] = (VariantClass as any)._instance;
            }
        }

        Object.freeze(result);
        return result;
    }

    // Object style: return ADT directly
    if (!isCallbackStyle) {
        return createADT();
    }

    // Callback style: create a callable version
    // The ADT can be used directly (if non-parameterized) or called with type args
    const baseADT = createADT();

    // Create a callable that wraps the ADT
    const callable: any = new Proxy(
        function (typeArgs: TypeArgs = {}) {
            return createADT(typeArgs);
        },
        {
            // Forward property access to the base ADT
            get(target, prop) {
                // Return stored baseADT reference
                if (prop === BaseADTSymbol) {
                    return baseADT;
                }
                if (prop in baseADT) {
                    return (baseADT as any)[prop];
                }
                return (target as any)[prop];
            },
            // Make instanceof work
            getPrototypeOf() {
                return Object.getPrototypeOf(baseADT);
            }
        }
    );

    return callable;
}