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

// Extract property keys that are not camelCase (start with uppercase letter or underscore)
type InvalidPropertyKeys<T> = {
    [K in keyof T]: K extends string
    ? Uppercase<FirstChar<K>> extends FirstChar<K> ? K :
    K extends `_${string}` ? K : never
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
type VariantInstance<D, K extends keyof D, Self = any, TypeArgMap = {}> =
    IsEmptyArray<D[K]> extends true
    ? { readonly constructor: { readonly name: K } }
    : D[K] extends readonly FieldDef[]
    ? FieldDefsToObject<D[K], Self, TypeArgMap> & { readonly constructor: { readonly name: K } }
    : never

// Union of all variant instances with type argument substitution
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type VariantUnion<D, TypeArgMap = {}> = {
    [K in keyof D]: VariantInstance<D, K, any, TypeArgMap>
}[keyof D]

// Definition of the DataDef type with type argument substitution
// Supports both named and positional arguments with full type safety
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type DataDef<D extends DataDecl, TypeArgMap = {}> = (abstract new (...args: any[]) => VariantUnion<D, TypeArgMap>) & {
    readonly [K in keyof D]: IsEmptyArray<D[K]> extends true
    ? VariantInstance<D, K, any, TypeArgMap>
    : D[K] extends readonly FieldDef[]
    ? ((
        // Named argument form: Point2D({ x: 3, y: 2 })
        data: FieldDefsToObject<D[K], any, TypeArgMap>
    ) => VariantInstance<D, K, any, TypeArgMap>) & ((
        // Positional argument form: Point2D(3, 2)
        ...args: FieldDefsToTuple<D[K], any, TypeArgMap>
    ) => VariantInstance<D, K, any, TypeArgMap>) & {
        new(data: FieldDefsToObject<D[K], any, TypeArgMap>): VariantInstance<D, K, any, TypeArgMap>
        new(...args: FieldDefsToTuple<D[K], any, TypeArgMap>): VariantInstance<D, K, any, TypeArgMap>
    }
    : never
} & {
    extend<const E extends DataDecl>(
        decl: unknown extends CheckVariantKeys<E>
            ? (CheckAllPropertyKeys<E> extends never ? E : never)
            : never
    ): DataDef<D & E, TypeArgMap>;
    extend<const E extends DataDecl>(
        fn: (context: DataContext) => (unknown extends CheckVariantKeys<E>
            ? (CheckAllPropertyKeys<E> extends never ? E : never)
            : never)
    ): DataDef<D & E, TypeArgMap>;
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
    prefix = ''
): T {
    // Detect argument style: named (object literal) vs positional
    if (argumentsList.length === 1 && isObjectLiteral(argumentsList[0])) {
        // Named argument form: Point2D({ x: 3, y: 2 })
        return new VariantClass(argumentsList[0]);
    } else {
        // Positional argument form: Point2D(3, 2)
        // Validate arity
        if (argumentsList.length !== fieldNames.length) {
            throw new TypeError(
                `Wrong number of arguments. Expected: ${prefix}${variantName}(${fieldNames.join(', ')}), got: ${prefix}${variantName}(${argumentsList.map((_, i) => `arg${i}`).join(', ')})`
            );
        }

        // Convert positional args to named object
        const namedArgs: Record<string, unknown> = {};
        fieldNames.forEach((fieldName, index) => {
            namedArgs[fieldName] = argumentsList[index];
        });

        return new VariantClass(namedArgs);
    }
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
 * Each variant name must be in PascalCase (i.e., start with an uppercase letter).
 * The value of each variant can be:
 * - An empty array [] for simple enumerated types (singletons)
 * - An array of field definitions [{field: Type}, ...] for structured variants
 * Returns an abstract base class with variant classes/instances as static properties.
 * 
 * Structured variants support both named and positional arguments:
 * - Named: Point2D({ x: 3, y: 2 })
 * - Positional: Point2D(3, 2)
 * 
 * @param declOrFn - Either an object defining the ADT variants, or a function that receives a context and returns the variants. Use the function form for recursive ADTs.
 * @example
 * ```ts
 * const Color = data({ Red: [], Green: [], Blue: [] });
 * 
 * const Point = data({ 
 *   Point2D: [{ x: Number }, { y: Number }],
 *   Point3D: [{ x: Number }, { y: Number }, { z: Number }]
 * });
 * 
 * const p1 = Point.Point2D(3, 2);              // Positional
 * const p2 = Point.Point2D({ x: 3, y: 2 });    // Named
 * 
 * const ColorPoint = data({ 
 *   Point2: [{ x: Number }, { y: Number }, { color: Color }]
 * });
 * 
 * const isEven = (x: unknown): x is number => typeof x === 'number' && x % 2 === 0;
 * const EvenPoint = data({ Point2D: [{ x: isEven }, { y: isEven }] });
 * 
 * // Recursive ADT (non-parameterized)
 * const Peano = data(({ Family }) => ({ 
 *   Zero: [], 
 *   Succ: [{ pred: Family }] 
 * }));
 * const two = Peano.Succ(Peano.Succ(Peano.Zero));  // Positional is much cleaner!
 * 
 * // Parameterized ADT
 * const List = data(({ Family, T }) => ({ 
 *   Nil: [], 
 *   Cons: [{ head: T }, { tail: Family }] 
 * }));
 * const NumList = List({ T: Number });
 * const nums = NumList.Cons(1, NumList.Cons(2, NumList.Nil));
 * ```
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

                        // Wrap in a Proxy to make it callable without 'new'
                        const fieldNames = fields.map(f => f.name);
                        extendedResult[variantName] = new Proxy(VariantClass, {
                            apply(_target, _thisArg, argumentsList) {
                                return createVariantInstance(VariantClass, fieldNames, argumentsList, variantName);
                            },
                            construct(_target, argumentsList) {
                                return createVariantInstance(VariantClass, fieldNames, argumentsList, variantName, 'new ');
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

                // Wrap in a Proxy to make it callable without 'new'
                const fieldNames = fields.map(f => f.name);
                result[variantName] = new Proxy(VariantClass, {
                    apply(_target, _thisArg, argumentsList) {
                        return createVariantInstance(VariantClass, fieldNames, argumentsList, variantName);
                    },
                    construct(_target, argumentsList) {
                        return createVariantInstance(VariantClass, fieldNames, argumentsList, variantName, 'new ');
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