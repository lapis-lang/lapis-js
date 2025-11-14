export type DataDecl = Record<string, object>

// Extract the first character of a string
type FirstChar<S extends string> = S extends `${infer F}${string}` ? F : never

// Extract keys that are not PascalCase (do not start with uppercase letter)
type InvalidKeys<D> = {
    [K in keyof D]: K extends string
    ? Uppercase<FirstChar<K>> extends FirstChar<K> ? never : K
    : never
}[keyof D]

// Check if a type has any properties (is not empty object literal)
type HasProperties<T> = keyof T extends never ? false : true

// Extract keys with non-empty object values
type InvalidValues<D> = {
    [K in keyof D]: HasProperties<D[K]> extends true ? K : never
}[keyof D]

// Check that all keys are PascalCase (start with uppercase letter)
type CheckKeys<D> = InvalidKeys<D> extends never
    ? unknown
    : { [K in InvalidKeys<D>]: `Key '${K & string}' must be PascalCase` }

// Check that all values are empty object literals
type CheckValues<D> = InvalidValues<D> extends never
    ? unknown
    : { [K in InvalidValues<D>]: `Value of '${K & string}' must be an empty object literal {}` }

export type DataDef<D extends DataDecl> = Readonly<D>

/**
 * Recursively freezes an object and all its properties
 */
function deepFreeze<T extends object>(obj: T): T {
    Object.freeze(obj);
    
    Object.getOwnPropertyNames(obj).forEach(prop => {
        const value = (obj as any)[prop];
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            deepFreeze(value);
        }
    });
    
    return obj;
}

/**
 * Defines a new algebraic data type (ADT) with the given variants.
 * Each variant name must be in PascalCase (i.e., start with an uppercase letter).
 * The value of each variants currently must be an empty object.
 * The resulting ADT is a frozen object with the variant names as properties.
 * 
 * @param definition 
 * @example
 * ```ts
 * const Color = data({ Red: {}, Green: {}, Blue: {} });
 * 
 * Color.Red 
 * ```
 */
export function data<const D extends DataDecl>(
    decl: D & CheckKeys<D> & CheckValues<D>
): DataDef<D> {
    return deepFreeze(decl) as unknown as DataDef<D>;
}