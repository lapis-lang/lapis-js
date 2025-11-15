export type Predicate<T = unknown> = (value: T) => boolean

// Generic constructor type that maps to its instance type
export type Constructor<T = any> = abstract new (...args: any[]) => T

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

// Use any to break circular reference
export type FieldSpec = Predicate | BuiltInConstructor | ADTClass
export type StructDef = Record<string, FieldSpec>
export type DataDecl = Record<string, object>

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
type InferFieldType<F> =
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

// Helper to get variant instance types
type VariantInstance<D, K extends keyof D> =
    IsEmptyObject<D[K]> extends true
    ? { readonly constructor: { readonly name: K } }
    : D[K] extends Record<string, any>
    ? { readonly [F in keyof D[K]]: InferFieldType<D[K][F]> } & { readonly constructor: { readonly name: K } }
    : never

// Union of all variant instances
type VariantUnion<D> = {
    [K in keyof D]: VariantInstance<D, K>
}[keyof D]

// Definition of the DataDef type
export type DataDef<D extends DataDecl> = (abstract new (...args: any[]) => VariantUnion<D>) & {
    readonly [K in keyof D]: IsEmptyObject<D[K]> extends true
    ? VariantInstance<D, K>
    : D[K] extends Record<string, any>
    ? ((data: { [F in keyof D[K]]: InferFieldType<D[K][F]> }) => VariantInstance<D, K>) & { new(data: { [F in keyof D[K]]: InferFieldType<D[K][F]> }): VariantInstance<D, K> }
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
 * Checks if a value is a valid field specification
 */
function isFieldSpec(value: unknown): value is FieldSpec {
    return typeof value === 'function' || isConstructable(value);
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
function validateField(value: unknown, spec: FieldSpec, fieldName: string): void {
    if (spec === Number) {
        if (typeof value !== 'number') {
            throw new TypeError(`Field '${fieldName}' must be a number`);
        }
    } else if (spec === String) {
        if (typeof value !== 'string') {
            throw new TypeError(`Field '${fieldName}' must be a string`);
        }
    } else if (spec === Boolean) {
        if (typeof value !== 'boolean') {
            throw new TypeError(`Field '${fieldName}' must be a boolean`);
        }
    } else if (spec === Object) {
        if (typeof value !== 'object' || value === null) {
            throw new TypeError(`Field '${fieldName}' must be an object`);
        }
    } else if (spec === Array) {
        if (!Array.isArray(value)) {
            throw new TypeError(`Field '${fieldName}' must be an array`);
        }
    } else if (spec === Date) {
        if (!(value instanceof Date)) {
            throw new TypeError(`Field '${fieldName}' must be a Date`);
        }
    } else if (spec === RegExp) {
        if (!(value instanceof RegExp)) {
            throw new TypeError(`Field '${fieldName}' must be a RegExp`);
        }
    } else if (spec === Symbol) {
        if (typeof value !== 'symbol') {
            throw new TypeError(`Field '${fieldName}' must be a symbol`);
        }
    } else if (spec === BigInt) {
        if (typeof value !== 'bigint') {
            throw new TypeError(`Field '${fieldName}' must be a bigint`);
        }
    } else if (isConstructable(spec)) {
        // ADT class - check instanceof
        if (!(value instanceof spec)) {
            throw new TypeError(`Field '${fieldName}' must be an instance of ${spec.name || 'ADT'}`);
        }
    } else {
        // Predicate function
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
 * @param decl - The object defining the ADT variants, where each key is a variant name in PascalCase and each value is either an empty object or struct definition.
 * @example
 * ```ts
 * const Color = data({ Red: {}, Green: {}, Blue: {} });
 * 
 * const ColorPoint = data({ 
 *   Point2: { x: Number, y: Number, color: Color },
 *   Point3: { x: Number, y: Number, z: Number, color: Color }
 * })
 * 
 * const isEven = (x) => x % 2 == 0;
 * const EvenPoint = data({ Point2: { x: isEven, y: isEven }})
 * ```
 */
export function data<const D extends DataDecl>(
    decl: D & CheckVariantKeys<D> & CheckAllPropertyKeys<D>
): DataDef<D> {
    abstract class ADT {
        protected constructor() {
            // Allow subclasses to instantiate
        }
    }

    const result = ADT as any;

    for (const [variantName, value] of Object.entries(decl)) {
        if (isStructDef(value as object)) {
            // Structured variant - create a constructable class
            const structDef = value as StructDef;

            class VariantClass extends ADT {
                constructor(data: Record<string, unknown>) {
                    super();

                    // Validate field types against specifications
                    for (const [fieldName, fieldSpec] of Object.entries(structDef)) {
                        validateField(data[fieldName], fieldSpec, fieldName);
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