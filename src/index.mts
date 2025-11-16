export type Predicate<T = unknown> = (value: T) => boolean

// Generic constructor type that maps to its instance type
export type Constructor<T = any> = abstract new (...args: any[]) => T

// Symbol to mark Family references for recursive ADTs
const FamilyRefSymbol = Symbol('FamilyRef')
const TypeParamSymbol = Symbol('TypeParam')

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
export type StructDef = Record<string, FieldSpec>
export type DataDecl = Record<string, object>
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

// Check that all variant keys are PascalCase (start with uppercase letter)
type CheckVariantKeys<D> = InvalidVariantKeys<D> extends never
    ? unknown
    : { [K in InvalidVariantKeys<D>]: `Variant '${K & string}' must be PascalCase` }

// Check that all property keys in a struct are camelCase
type CheckPropertyKeys<T> = InvalidPropertyKeys<T> extends never
    ? T
    : InvalidPropertyKeys<T>

// Check all structs in the declaration have valid property names
type CheckAllPropertyKeys<D> = {
    [K in keyof D]: IsEmptyObject<D[K]> extends true
    ? D[K]
    : D[K] extends Record<string, any>
    ? CheckPropertyKeys<D[K]>
    : D[K]
}

// Check if an object is an empty object literal
type IsEmptyObject<T> = keyof T extends never ? true : false

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
    IsEmptyObject<D[K]> extends true
    ? { readonly constructor: { readonly name: K } }
    : D[K] extends Record<string, any>
    ? { readonly [F in keyof D[K]]: InferFieldType<D[K][F], Self, TypeArgMap> } & { readonly constructor: { readonly name: K } }
    : never

// Union of all variant instances with type argument substitution
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type VariantUnion<D, TypeArgMap = {}> = {
    [K in keyof D]: VariantInstance<D, K, any, TypeArgMap>
}[keyof D]

// Definition of the DataDef type with type argument substitution
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type DataDef<D extends DataDecl, TypeArgMap = {}> = (abstract new (...args: any[]) => VariantUnion<D, TypeArgMap>) & {
    readonly [K in keyof D]: IsEmptyObject<D[K]> extends true
    ? VariantInstance<D, K, any, TypeArgMap>
    : D[K] extends Record<string, any>
    ? ((data: { [F in keyof D[K]]: InferFieldType<D[K][F], any, TypeArgMap> }) => VariantInstance<D, K, any, TypeArgMap>) & { new(data: { [F in keyof D[K]]: InferFieldType<D[K][F], any, TypeArgMap> }): VariantInstance<D, K, any, TypeArgMap> }
    : never
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
 * Checks if an object is a struct definition (all values are field specs)
 */
function isStructDef(obj: object): obj is StructDef {
    if (Object.keys(obj).length === 0) return false;
    return Object.values(obj).every(isFieldSpec);
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
 * - An empty object {} for simple enumerated types
 * - A struct definition with fields mapped to constructors, predicates, or other ADTs
 * Returns an abstract base class with variant classes/instances as static properties.
 * 
 * @param declOrFn - Either an object defining the ADT variants, or a function that receives a context and returns the variants. Use the function form for recursive ADTs.
 * @example
 * ```ts
 * const Color = data({ Red: {}, Green: {}, Blue: {} });
 * 
 * const ColorPoint = data({ 
 *   Point2: { x: Number, y: Number, color: Color },
 *   Point3: { x: Number, y: Number, z: Number, color: Color }
 * })
 * 
 * const isEven = (x) => x % 2 === 0;
 * const EvenPoint = data({ Point2: { x: isEven, y: isEven }})
 * 
 * // Recursive ADT (non-parameterized) - can pass empty object or nothing
 * const Peano = data(({ Family }) => ({ Zero: {}, Succ: { pred: Family } }))
 * const zero = Peano.Zero  // Works if Peano doesn't use T
 * // OR: const Peano = data(({ Family }) => ...)({})  // Also works
 * 
 * // Parameterized ADT - must instantiate with type arguments
 * // Both `tail: Family` and `tail: Family(T)` work - Family(T) is more explicit
 * const List = data(({ Family, T }) => ({ Nil: {}, Cons: { head: T, tail: Family(T) } }))
 * const NumList = List({ T: Number })
 * ```
 */
export function data<const D extends DataDecl>(
    decl: D & CheckVariantKeys<D> & CheckAllPropertyKeys<D>
): DataDef<D>;
export function data<const D extends DataDecl>(
    fn: (context: DataContext) => D & CheckVariantKeys<D> & CheckAllPropertyKeys<D>
): DataDef<D> & (<TArgs extends TypeArgs>(typeArgs: TArgs) => DataDef<D, TArgs>);
export function data<const D extends DataDecl>(
    declOrFn: (D & CheckVariantKeys<D> & CheckAllPropertyKeys<D>) | ((context: DataContext) => D & CheckVariantKeys<D> & CheckAllPropertyKeys<D>)
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
            if (isStructDef(value as object)) {
                // Structured variant - create a constructable class
                const structDef = value as StructDef;

                class VariantClass extends ADT {
                    constructor(data: Record<string, unknown>) {
                        super();

                        // Validate field types against specifications
                        for (const [fieldName, fieldSpec] of Object.entries(structDef)) {
                            validateField(data[fieldName], fieldSpec, fieldName, ADT);
                        }

                        // Assign fields to instance
                        for (const [fieldName, fieldValue] of Object.entries(data)) {
                            Object.defineProperty(this, fieldName, {
                                value: fieldValue,
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
                result[variantName] = new Proxy(VariantClass, {
                    apply(_target, _thisArg, argumentsList) {
                        return new VariantClass(argumentsList[0]);
                    }
                });
            } else {
                // Simple enumerated variant - create singleton instance
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