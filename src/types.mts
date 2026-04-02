
/**
 * Core type vocabulary for lapis-js
 *
 * Provides the type-level algebra for `data()` and `behavior()` declarations.
 * These types bridge the declarative JavaScript runtime model and TypeScript's
 * static type system.
 *
 * Key challenge: the runtime uses Proxy objects and dynamic property assignment.
 * This module provides the best static approximation achievable without HKT,
 * using mapped types, conditional types, and intersection types.
 *
 * @module types
 */

import type {
    op,
    spec,
    operations,
    extend,
    FamilyRef,
    FamilyRefCallable,
    SelfRef,
    SelfRefCallable,
    TypeSpec,
    AnyConstructor,
    NothingConstructor
} from './operations.mjs';

/** Phantom brand symbol: carries the declaration shape D on DataADTWithParams/BehaviorADTWithParams */
export const DeclBrand: unique symbol = Symbol('DeclBrand');
export type DeclBrand = typeof DeclBrand;

import type { origin, destination } from './Relation.mjs';
import type { output, done, accept } from './Query.mjs';

// Re-export so consumers can import all types from a single place
export type { TypeSpec, FamilyRef, FamilyRefCallable, SelfRef, SelfRefCallable, origin, destination, output, done, accept };

// ---- SpecValue: TypeSpec → runtime value type ---------------------------------

/**
 * Lookup table for known built-in constructors → runtime instance types.
 * Using an interface map + indexed access is O(1) for the type checker —
 * a single index lookup instead of a chain of `extends` checks.
 *
 * Includes `Array` and `Object` because they are common in data/behavior
 * field specs and unfold `in` specs. Resolving them via the map avoids
 * the expensive fallback conditional chain.
 *
 * Also includes the lattice bounds:
 *   - key `'any'`     (maps `typeof Any`)     → `unknown`  (top type — accepts every value)
 *   - key `'nothing'` (maps `typeof Nothing`) → `never`    (bottom type — no valid value)
 */
interface BuiltinSpecMap {
    any: unknown;
    nothing: never;
    number: number;
    string: string;
    boolean: boolean;
    symbol: symbol;
    bigint: bigint;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    array: any[];
    // eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
    object: Object;
}

/**
 * Maps a known built-in constructor to a key in `BuiltinSpecMap`.
 * Returns `never` for non-builtin constructors (handled by fallback).
 */
type BuiltinTag<S> =
    S extends AnyConstructor ? 'any' :
        S extends NothingConstructor ? 'nothing' :
            S extends NumberConstructor ? 'number' :
                S extends StringConstructor ? 'string' :
                    S extends BooleanConstructor ? 'boolean' :
                        S extends SymbolConstructor ? 'symbol' :
                            S extends BigIntConstructor ? 'bigint' :
                                S extends ArrayConstructor ? 'array' :
                                    S extends ObjectConstructor ? 'object' :
                                        never;

/**
 * Maps a TypeSpec value (e.g. `NumberConstructor`, `StringConstructor`, an ADT class,
 * or a `FamilyRef`) to the corresponding runtime value type.
 *
 * `Self` is threaded through for recursive `FamilyRef` / `SelfRef` fields.
 *
 * Uses a two-tier strategy to minimize type instantiation depth:
 *   1. Known primitive constructors resolve via `PrimitiveSpecMap` (indexed access, depth 1).
 *   2. Ref types, custom constructors, and prototype-based ADTs use a shallow fallback (depth ≤ 3).
 */
export type SpecValue<S, Self = unknown> =
    BuiltinTag<S> extends never
        ? (S extends FamilyRef | SelfRef ? Self
        // DataADT<D> / BehaviorADT<D> carry their instance type
        // on `readonly prototype`. Checked before the constructor
        // guard because ADT values are callable and would otherwise
        // match `(...args) => any` (issue #126).
            : S extends { readonly prototype: infer I } ? I
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                : S extends abstract new (...args: any[]) => infer I ? I
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    : S extends (...args: any[]) => any ? unknown
                        : unknown)
        : BuiltinSpecMap[BuiltinTag<S>];

// ---- Field values -----------------------------------------------------------

/**
 * Resolve all field specs to their runtime value types, excluding symbol keys (e.g. [invariant]).
 *
 * Built-in constructors are resolved via `BuiltinSpecMap` directly (bypassing
 * `SpecValue`) so that the result is Self-independent and TypeScript can reuse
 * it across the `_DataInstanceSelf` layers without creating separate per-layer
 * `SpecValue<…, Layer>` instantiations.
 */
export type FieldValues<Spec extends Record<string, unknown>, Self = unknown> = {
    readonly [K in keyof Spec & string]:
    BuiltinTag<Spec[K]> extends never
        ? SpecValue<Spec[K], Self>
        : BuiltinSpecMap[BuiltinTag<Spec[K]>]
};

// ---- Variant instance --------------------------------------------------------

/** A constructed variant instance: frozen fields + an internal variant-name symbol tag. */
export type VariantInstance<
    _Name extends string,
    Fields extends Record<string, unknown> = Record<never, never>
> = { readonly [k: symbol]: unknown } & { readonly [K in keyof Fields]: Fields[K] };

// ---- Variant spec ------------------------------------------------------------

/**
 * A variant field specification: maps field names to type descriptors.
 *
 * Widened to `Record<string, unknown>` so that ADT values and other non-primitive
 * type descriptors (e.g. `color: Color`) are accepted. `SpecValue` gracefully
 * falls through to `unknown` for anything outside the TypeSpec union.
 */
export type VariantSpec = Record<string, unknown>;

/** True when a VariantSpec has no fields (i.e. the variant is a singleton). */
type IsEmpty<T> = keyof T extends never ? true : false;

/**
 * Rest-parameter type for the positional variant constructor overload.
 *
 * Resolves to an array of the union of all field value types, with `Self`
 * fixed to `unknown`. Builtin primitives (`Number`, `String`, etc.) resolve
 * to their concrete types (`number`, `string`, etc.); all other field kinds —
 * recursive (`Family`/`SelfRef`), type-parameter (`T`, `U`, …), and predicate
 * functions — resolve to `unknown`.
 *
 * Because `unknown` absorbs any union (`unknown | string ≡ unknown`), a spec
 * that contains even one non-primitive field produces `unknown[]`, making the
 * entire positional overload permissive. Compile-time type checking therefore
 * only takes effect when **every** field in the spec is a builtin primitive.
 */
type PositionalArgs<Spec extends VariantSpec> = FieldValues<Spec, unknown>[keyof Spec & string][];

// ---- Variant constructor type -----------------------------------------------

/**
 * The static-side type of a variant constructor.
 *
 * - Singleton (empty spec): the frozen instance itself (no-arg value)
 * - Constructor: a callable that accepts a field-values object and returns an instance
 *
 * `Ops` carries the operation methods from the ADT declaration so that
 * every constructed instance exposes them (they live on the shared prototype).
 */
export type VariantCtor<
    Name extends string,
    Spec extends VariantSpec,
    Self = unknown,
    Ops extends Record<string, unknown> = Record<never, never>
> = IsEmpty<Spec> extends true
    ? VariantInstance<Name> & Ops
    : {
        (fields: FieldValues<Spec, Self>): VariantInstance<Name, FieldValues<Spec, Self>> & Ops;
        (...args: PositionalArgs<Spec>): VariantInstance<Name, FieldValues<Spec, Self>> & Ops;
        new(fields: FieldValues<Spec, Self>): VariantInstance<Name, FieldValues<Spec, Self>> & Ops;
        readonly variantName: Name;
        readonly spec: Spec;
    };

// ---- Discriminate variant entries in declaration ----------------------------

/** True if the declaration value V looks like an operation definition (has `[op]`). */
type IsOpEntry<V> = (typeof op) extends keyof V ? true : false;

/** Helper: filter keyof D to string keys where IsOpEntry equals `Include`. */
type FilterDeclKeys<D, Include extends boolean> = {
    [K in keyof D]: K extends string
        ? IsOpEntry<D[K]> extends Include ? K : never
        : never
}[keyof D];

/** All string keys in D that are NOT operation definitions. */
export type VariantKeys<D> = FilterDeclKeys<D, false>;

/** All string keys in D that ARE operation definitions. */
export type OperationKeys<D> = FilterDeclKeys<D, true>;

/** Symbol keys in D that are operation definitions (e.g. [origin], [destination]). */
type SymbolOperationKeys<D> = {
    [K in keyof D]: K extends symbol
        ? IsOpEntry<D[K]> extends true ? K : never
        : never
}[keyof D];

// ---- ADT variant union type -------------------------------------------------

/**
 * Union of all variant instance types produced by an ADT declaration.
 * Used as the prototype / instance type of the ADT class.
 */
export type ADTInstances<D, Self = unknown> = {
    [K in VariantKeys<D>]: D[K] extends VariantSpec
        ? VariantInstance<K & string, FieldValues<D[K], Self>>
        : VariantInstance<K & string>
}[VariantKeys<D>];

// ---- ADT static variant constructors ----------------------------------------

/**
 * Map of variant name → constructor function (or frozen singleton).
 * Represents the static side of the ADT returned by `data()`.
 */
export type VariantCtors<
    D,
    Self = unknown,
    Ops extends Record<string, unknown> = Record<never, never>
> = {
    readonly [K in VariantKeys<D>]: D[K] extends VariantSpec
        ? VariantCtor<K & string, D[K], Self, Ops>
        : VariantInstance<K & string> & Ops
};

// ---- Common fallback --------------------------------------------------------

/** Fallback callable shape used when merge/unfold types cannot be resolved. */
type FallbackFn = (...args: unknown[]) => unknown;

// ---- Operation result types -------------------------------------------------

/**
 * Extract the output type from an operation spec, if declared.
 *
 * Built-in constructors are resolved via `BuiltinSpecMap` directly so that
 * the result is Self-independent across `_DataInstanceSelf` layers.
 */
type OpOutType<V, Self = unknown> =
    (typeof spec) extends keyof V
        ? V[typeof spec] extends { out: infer Out }
            ? BuiltinTag<Out> extends never
                ? SpecValue<Out, Self>
                : BuiltinSpecMap[BuiltinTag<Out>]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            : any   // no 'out' spec → treated as any (untyped)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : any;  // no [spec] key → treated as any (untyped)

/** Extract the input type from an operation spec, if declared.
 *
 * **Design compromise — Family/Self ref inputs resolve to `unknown`**
 *
 * When an operation's `in` spec is `Family` or `Self` (e.g.
 * `combine: fold({ in: Family, out: Family })`), the ideal parameter type
 * would be `DataInstance<D>`.  However threading the full instance type into
 * the parameter position is unsafe because function parameters are
 * *contravariant*: `(x: DataInstance<D>) => R` is only assignable if every
 * caller supplies a value that is at-least as specific as `DataInstance<D>`.
 *
 * `DataInstance<D>` is built from a four-level bounded self-approximation
 * (`_DataInstanceSelf0..._DataInstanceSelf`).  At each level the `Self`
 * placeholder for recursive fields is substituted with the previous layer.
 * The deepest layer uses `unknown` as the base.  Because of contravariance,
 * TypeScript requires the parameter types of two otherwise-identical
 * function signatures to be mutually assignable before it considers them
 * compatible.  A function that accepts `_DataInstanceSelf<D>` (where the
 * deepest `Identity: unknown`) is *not* assignable to one that accepts
 * `_DataInstanceSelf0<D>` (where `Identity: _DataInstanceSelf0<D>`), so the
 * cross-layer compatibility check fails with a cascade of "Type … is not
 * assignable to type …" errors.
 *
 * Using `unknown` for self-ref inputs is the standard TypeScript idiom for
 * "accepts any value" — equivalent to bivariant parameter handling but
 * opt-in.  The **runtime** already validates the actual argument type via
 * `validateTypeSpec`, so type safety at the call site is maintained by the
 * library at run time.
 *
 * **Consumer-visible limitation**: TypeScript will not statically reject
 * passing an unrelated type to a binary fold like `equals` or `compare`,
 * e.g. `myNum.equals(42)` compiles without error.  The type-level signal
 * for "this parameter should be the same ADT type" is therefore weakened to
 * `unknown`.  If stricter call-site checking is desired, consumers can cast:
 * ```ts
 * const typedEquals = myNum.equals as (other: typeof myNum) => boolean;
 * typedEquals(42); // TS2345 — correctly rejected
 * ```
 */
type OpInType<V, Self = unknown> =
    (typeof spec) extends keyof V
        ? V[typeof spec] extends { in: infer In }
            ? In extends FamilyRef | SelfRef
                ? unknown
                : SpecValue<In, Self>
            : undefined
        : undefined;

/** Derives the instance-level method/getter shape of an operation. */
type OpShape<V, Self = unknown> =
    OpInType<V, Self> extends undefined
        ? OpOutType<V, Self>   // parameterless → getter
        : (input: NonNullable<OpInType<V, Self>>) => OpOutType<V, Self>;  // parameterized → method

/**
 * Map of operation name → method/getter type for ADT instances.
 * `Instance` is the concrete ADT instance type threaded through for `Family`/`Self` outputs.
 * Includes both string-keyed and symbol-keyed operations (e.g. [origin], [destination]).
 */
export type OperationMethods<D, Instance = unknown> = {
    readonly [K in OperationKeys<D>]: OpShape<D[K], Instance>
} & {
    readonly [K in SymbolOperationKeys<D>]: OpShape<D[K], Instance>
};

// ---- Unfold static constructors on the ADT ----------------------------------

/** Helper: from a key union Keys (all ⊆ keyof D), pick keys whose [op] equals Kind. */
type OpKindKeys<Keys extends keyof D, D, Kind extends string> = {
    [K in Keys]: D[K] extends { readonly [op]: Kind } ? K : never
}[Keys];

/** All OperationKeys<D> whose declaration has [op] === 'unfold'. */
type UnfoldOpKeys<D> = OpKindKeys<OperationKeys<D>, D, 'unfold'>;

/**
 * Behavior unfold factory shape: no-arg unfolds are installed as getters, so
 * the type is the bare Instance. Parameterized unfolds are functions.
 */
type UnfoldCtorShape<V, Instance> =
    OpInType<V> extends undefined | never
        ? Instance
        : (n: NonNullable<OpInType<V>>) => Instance;

/** Static unfold constructors for BehaviorADT (no-arg → getter-typed bare Instance). */
type UnfoldCtorsFor<Keys extends keyof D, D, Instance = unknown> = {
    readonly [K in Keys]: UnfoldCtorShape<D[K], Instance>
};

/**
 * Data unfold factory shape: Data unfolds are always installed as functions
 * at runtime (`function unfoldImpl(seed)`), even when parameterless.
 * No-arg unfolds → `() => Instance`; parameterized → `(n: N) => Instance`.
 */
type DataUnfoldCtorShape<V, Instance> =
    OpInType<V> extends undefined | never
        ? () => Instance
        : (n: NonNullable<OpInType<V>>) => Instance;

type DataUnfoldCtorsFor<Keys extends keyof D, D, Instance = unknown> = {
    readonly [K in Keys]: DataUnfoldCtorShape<D[K], Instance>
};

/** Static unfold constructors for DataADT (all unfolds are callable factories). */
type DataUnfoldCtors<D, Instance = unknown> = DataUnfoldCtorsFor<UnfoldOpKeys<D> & keyof D, D, Instance>;

// ---- Merge static constructors on the ADT -----------------------------------

/** All OperationKeys<D> whose declaration has [op] === 'merge'. */
type MergeOpKeys<D> = OpKindKeys<OperationKeys<D>, D, 'merge'>;

/**
 * Shared merge constructor shape: derives the composed input/output types
 * from all operations in the merge pipeline.
 *
 * Input types are collected from every operation in the pipeline that has an
 * `in` spec, and spread as positional parameters. The output type comes from
 * the last operation's `out` spec. When operations cannot be resolved (e.g.
 * parent-inherited operations not visible in D), falls back to
 * `(...args: unknown[]) => unknown`.
 */
type Last<T extends readonly string[]> = T extends readonly [...string[], infer L extends string] ? L : string;

/** Safe index: D[K] when K extends keyof D, else never. */
type SafeIndex<D, K> = K extends keyof D ? D[K] : never;

/** Collect OpInType from each operation in Names that has an `in` spec. */
type CollectInputs<D, Names extends readonly string[]> =
    Names extends readonly [infer H extends string, ...infer Rest extends string[]]
        ? OpInType<SafeIndex<D, H>> extends undefined | never
            ? CollectInputs<D, Rest>
            : [NonNullable<OpInType<SafeIndex<D, H>>>, ...CollectInputs<D, Rest>]
        : [];

/**
 * Shared merge constructor shape, parameterised over `Self` so that both
 * `DataADT` (Self = `_DataInstanceSelf<D>`) and `BehaviorADT`
 * (Self = `BehaviorObservers<D>`) can reuse the same logic.
 */
type MergeCtorShapeFor<D, Names extends readonly string[], Self> =
    Last<Names> extends keyof D
        ? CollectInputs<D, Names> extends readonly []
            ? OpOutType<SafeIndex<D, Last<Names>>, Self>
            : (...inputs: CollectInputs<D, Names>) => OpOutType<SafeIndex<D, Last<Names>>, Self>
        : FallbackFn;

/** Shared merge-ctors mapped type, parameterised over key union and Self. */
type MergeCtorsFor<Keys extends keyof D, D, Self> = {
    readonly [K in Keys]:
    (typeof operations) extends keyof D[K]
        ? D[K][typeof operations] extends infer Names extends readonly string[]
            ? MergeCtorShapeFor<D, Names, Self>
            : FallbackFn
        : FallbackFn
};

type MergeCtors<D> = MergeCtorsFor<MergeOpKeys<D> & keyof D, D, _DataInstanceSelf<D>>;

// ---- Full ADT type ----------------------------------------------------------

// ---- Inheritance-aware instance and operation types -------------------------

/**
 * Extract the parent declaration `P` from `D`'s `[extend]: DataADT<P>`.
 *
 * This is the type-level analog of the comb-inheritance parent-chain walk:
 * just as the runtime proxy re-enters itself for recursive parent lookup,
 * types that consume `ParentDecl` recurse naturally through the ancestor
 * chain without each consumer reimplementing the `[extend]` extraction.
 */
type ParentDecl<D> =
    (typeof extend) extends keyof D
        ? D[typeof extend] extends { readonly [DeclBrand]: infer P } ? P : never
        : never;

/** Walk the [extend] chain to collect all ancestor variant instances. */
type ParentADTInstances<D, Self = unknown> =
    ParentDecl<D> extends never ? never
        : ADTInstances<ParentDecl<D>, Self> | ParentADTInstances<ParentDecl<D>, Self>;

/** Own + inherited variant instances. */
type CombinedADTInstances<D, Self = unknown> =
    ADTInstances<D, Self> | ParentADTInstances<D, Self>;

/** Walk the [extend] chain to collect all ancestor operation methods. */
type ParentOperationMethods<D, Instance = unknown> =
    ParentDecl<D> extends never ? Record<never, never>
        : OperationMethods<ParentDecl<D>, Instance> & ParentOperationMethods<ParentDecl<D>, Instance>;

/** Own + inherited operation methods on instances. */
type CombinedOperationMethods<D, Instance = unknown> =
    OperationMethods<D, Instance> & ParentOperationMethods<D, Instance>;

// ---- Flattened variant field access (all fields without narrowing) ---------

/** Collect field names from all own variants. */
type VariantFieldNames<D> = {
    [K in VariantKeys<D>]: D[K] extends VariantSpec ? keyof D[K] & string : never
}[VariantKeys<D>];

/**
 * Resolve the runtime type of field name F across own variants.
 *
 * Built-in constructors are resolved via `BuiltinSpecMap` directly so that
 * the result is Self-independent across `_DataInstanceSelf` layers.
 */
type FieldTypeForName<D, F extends string, Self = unknown> = {
    [K in VariantKeys<D>]: D[K] extends VariantSpec
        ? F extends keyof D[K]
            ? BuiltinTag<D[K][F]> extends never
                ? SpecValue<D[K][F], Self>
                : BuiltinSpecMap[BuiltinTag<D[K][F]>]
            : never
        : never
}[VariantKeys<D>];

/** Own variant field access: all field names mapped to their resolved types. */
type OwnVariantFieldAccess<D, Self = unknown> = {
    readonly [F in VariantFieldNames<D>]: FieldTypeForName<D, F, Self>
};

/** Walk the [extend] chain to collect parent variant field access. */
type ParentVariantFieldAccess<D, Self = unknown> =
    ParentDecl<D> extends never ? Record<never, never>
        : OwnVariantFieldAccess<ParentDecl<D>, Self> & ParentVariantFieldAccess<ParentDecl<D>, Self>;

/**
 * Flattened variant field access: all field names from all variants (own +
 * inherited) mapped to their resolved types.  Intersected into the instance
 * type so that field access on the ADT union resolves to the correct type
 * instead of degrading to `unknown` through the string index signature.
 */
type CombinedVariantFieldAccess<D, Self = unknown> =
    OwnVariantFieldAccess<D, Self> & ParentVariantFieldAccess<D, Self>;

// ---- Full ADT instance type -------------------------------------------------

/**
 * The full instance type for an ADT: union of variant shapes plus all operation
 * methods, plus flattened variant field access.
 *
 * When `[extend]` is used, parent variant shapes and parent operation methods
 * are folded in so that `DataInstance<ChildDecl>` includes everything the child
 * inherits — preventing it from collapsing to `never` when the child declares
 * no own variants.
 *
 * `CombinedVariantFieldAccess` provides explicit typed properties for every
 * field across all variants.  Without it, accessing a field that exists in only
 * some variants (e.g. `cons.tail` on a `Nil | Cons` union) would degrade to
 * `unknown` through the string index signature.
 *
 * The string index signature (`[k: string]: unknown`) remains as a fallback
 * for dynamic/untyped field access.
 *
 * Family-returning operations (e.g. `map({ out: Family })`) resolve Self via
 * a four-level bounded approximation to avoid infinite type expansion.  The
 * bottom level uses `unknown` for recursive positions; the result is that
 * chaining recursive fields is properly typed for 4 levels, after which it
 * gracefully degrades to `unknown`.
 */
/** Single layer of the bounded Self approximation. */
type _DataInstanceLayer<D, Self = unknown> =
    CombinedADTInstances<D, Self> & CombinedOperationMethods<D, Self> & CombinedVariantFieldAccess<D, Self>;

type _DataInstanceSelf0<D> = _DataInstanceLayer<D>;
type _DataInstanceSelf1<D> = _DataInstanceLayer<D, _DataInstanceSelf0<D>>;
type _DataInstanceSelf2<D> = _DataInstanceLayer<D, _DataInstanceSelf1<D>>;

/**
 * Bounded Self approximation for DataInstance.
 *
 * Uses 4 Self-recursion levels: recursive field access (e.g. list.tail.tail.tail.head)
 * is typed precisely for 4 levels, then degrades to `unknown`.
 */
type _DataInstanceSelf<D> = _DataInstanceLayer<D, _DataInstanceSelf2<D>>;

export type DataInstance<D> =
    _DataInstanceLayer<D, _DataInstanceSelf<D>>
    & { readonly [k: string]: unknown }
    & (D extends { readonly [origin]?: unknown } ? {
        /** Relation origin endpoint (present when D declares [origin] fold) */
        readonly [origin]: unknown;
    } : object)
    & (D extends { readonly [destination]?: unknown } ? {
        /** Relation destination endpoint (present when D declares [destination] fold) */
        readonly [destination]: unknown;
    } : object);

// ---- Extended variant propagation via [extend] ----------------------------

/**
 * When D has `[extend]: DataADT<P>`, walks the ancestor chain and re-types
 * inherited variant constructors, unfold constructors, and merge constructors
 * so that they produce child-typed instances (DataInstance<Leaf>) rather than
 * parent-typed instances.
 *
 * `Leaf` is the outermost (leaf) child declaration — threaded unchanged through
 * recursion so that grandparent constructors also return leaf-typed instances.
 */
type ExtendedParentCtorsImpl<D, Leaf> =
    ParentDecl<D> extends never ? object
        : VariantCtors<ParentDecl<D>, DataInstance<Leaf>, CombinedOperationMethods<Leaf, DataInstance<Leaf>>>
          & DataUnfoldCtors<ParentDecl<D>, DataInstance<Leaf>>
          & MergeCtors<ParentDecl<D>>
          & ExtendedParentCtorsImpl<ParentDecl<D>, Leaf>;

/** Public entry point: hides the `Leaf` parameter. */
type ExtendedParentCtors<D> = ExtendedParentCtorsImpl<D, D>;

/**
 * The full type of the value returned by `data()`.
 *
 * It is:
 * - Has static variant constructors/singletons as own properties
 * - Its instances have the declared operation methods/getters
 *
 * Note: the string index `[key: string]: any` is removed from this type.
 * Variant constructors, unfold factories, merge factories, and internal methods
 * are all explicitly typed. If dynamic access is needed, cast to a broader type.
 * `BehaviorADT` uses `unknown` because behavior instances are accessed only
 * through typed observer getters and do not need an escape hatch.
 */
export type DataADT<D = Record<string, unknown>> =
    VariantCtors<D, DataInstance<D>, CombinedOperationMethods<D, DataInstance<D>>> &
    ExtendedParentCtors<D> &
    DataUnfoldCtors<D, DataInstance<D>> &
    MergeCtors<D> & {
        readonly prototype: DataInstance<D>;
        [Symbol.hasInstance](value: unknown): boolean;
        /** @internal */ _registerTransformer(
            name: string, transformer: unknown, skip?: boolean, variants?: unknown
        ): void;
        /** @internal */ _getTransformer(name: string): unknown;
        /** @internal */ _getTransformerNames(): string[];
        /** @internal */ _rawADT?: unknown;
    };

// ---- Behavior types ---------------------------------------------------------

/** Valid observer specs: a TypeSpec value (simple), { in?, out? } (parametric), or SelfRef (continuation). */
export type ObserverSpec = TypeSpec | SelfRef | { in?: TypeSpec | Record<string, TypeSpec>; out?: TypeSpec | SelfRef };

/**
 * Extracts the parent observers when a behavior declaration uses `[extend]`.
 * When `D[[extend]]` is `BehaviorADT<P>`, this resolves to `BehaviorObservers<P>`.
 */
type ExtendedParentObservers<D> =
    (typeof extend) extends keyof D
        ? D[typeof extend] extends { readonly [DeclBrand]: infer P } ? BehaviorObservers<P> : unknown
        : unknown;

/**
 * Union of all observer shapes in a behavior declaration.
 * (This is the product-type "interface" implemented by behavior instances.)
 *
 * - `SelfRef` fields (continuations like `tail: Self`) resolve to `BehaviorObservers<D>`.
 * - Fold/map operation entries (carrying `[op]`) resolve via `OpShape`.
 * - Parent observers from `[extend]` are merged in via intersection.
 * - Symbol keys (e.g. `[extend]`, `[op]`) are excluded from the mapped type.
 */
/** Instance-level keys: all string keys except unfold operations (those are static constructors only). */
type BehaviorInstanceKeys<D> = {
    [K in keyof D & string]: D[K] extends { readonly [op]: 'unfold' } ? never : K
}[keyof D & string];

export type BehaviorObservers<D> = ExtendedParentObservers<D> & {
    readonly [K in BehaviorInstanceKeys<D>]:
    D[K] extends { readonly [op]: 'fold' | 'map' }
        ? OpShape<D[K], BehaviorObservers<D>>
        : D[K] extends { readonly [op]: 'merge' } ? FallbackFn
            : D[K] extends ObserverSpec
                ? ObserverValue<D[K], BehaviorObservers<D>>
                : never
};

/**
 * Converts a TypeSpec input (simple or structured) to its runtime value type.
 * - `Number` → `number`
 * - `{ min: Number, max: Number }` → `{ min: number, max: number }`
 *
 * Uses function/constructor presence to distinguish TypeSpec constructors from
 * plain structured input objects (the same logic as `SpecToValue` in ops.mts).
 *
 * Built-in constructors are resolved via `BuiltinSpecMap` directly (bypassing
 * `SpecValue`) so that Self-parameterized instantiations are avoided.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ObserverInputValue<In, Self = unknown> = In extends ((...args: any[]) => unknown) | (abstract new (...args: any[]) => unknown)
    ? BuiltinTag<In> extends never
        ? SpecValue<In, Self>
        : BuiltinSpecMap[BuiltinTag<In>]
    : In extends Record<string, unknown>
        ? { [K in keyof In]:
            BuiltinTag<In[K]> extends never
                ? SpecValue<In[K], Self>
                : BuiltinSpecMap[BuiltinTag<In[K]>] }
        : BuiltinTag<In> extends never
            ? SpecValue<In, Self>
            : BuiltinSpecMap[BuiltinTag<In>];

type ObserverValue<S, Self = unknown> =
    S extends SelfRef ? Self :
        S extends { in: infer In; out: infer Out }
            ? (input: ObserverInputValue<In, Self>) =>
            (BuiltinTag<Out> extends never ? SpecValue<Out, Self> : BuiltinSpecMap[BuiltinTag<Out>])
            : S extends { out: infer Out }
                ? BuiltinTag<Out> extends never ? SpecValue<Out, Self> : BuiltinSpecMap[BuiltinTag<Out>]
                : S extends TypeSpec
                    ? BuiltinTag<S> extends never ? SpecValue<S> : BuiltinSpecMap[BuiltinTag<S>]
                    : unknown;

// ---- Behavior unfold static constructors ------------------------------------

/**
 * All keys in a behavior declaration D that carry [op] === 'unfold'.
 * These become static factories on BehaviorADT (e.g. `Stream.From(5)`).
 */
type BehaviorUnfoldOpKeys<D> = OpKindKeys<keyof D & string, D, 'unfold'>;

/** Static behavior unfold constructors (parallel to UnfoldCtors for DataADT). */
type BehaviorUnfoldCtors<D, Instance = unknown> = UnfoldCtorsFor<BehaviorUnfoldOpKeys<D> & keyof D, D, Instance>;

// ---- Behavior merge static constructors ------------------------------------

type BehaviorMergeOpKeys<D> = OpKindKeys<keyof D & string, D, 'merge'>;

type BehaviorMergeCtors<D> = MergeCtorsFor<BehaviorMergeOpKeys<D> & keyof D, D, BehaviorObservers<D>>;

// ---- Extended behavior static constructor propagation via [extend] -------

type ExtendedParentBehaviorCtorsImpl<D, Leaf> =
    ParentDecl<D> extends never ? object
        : BehaviorUnfoldCtors<ParentDecl<D>, BehaviorObservers<Leaf>>
          & BehaviorMergeCtors<ParentDecl<D>>
          & ExtendedParentBehaviorCtorsImpl<ParentDecl<D>, Leaf>;

type ExtendedParentBehaviorCtors<D> = ExtendedParentBehaviorCtorsImpl<D, D>;

// ---- Full behavior type -----------------------------------------------------

/**
 * The full type of the value returned by `behavior()`.
 *
 * It is:
 * - Callable for parameterization: `Stream({ T: Number })`
 * - Has static unfold factory methods (PascalCase)
 * - Has static merge factory methods
 * - Its instances expose observer getters/methods
 *
 * Note: the string index `[key: string]: unknown` uses `unknown` (not `any`)
 * because behavior instances are accessed only through typed observer getters
 * and do not need the same escape hatch as `DataADT`.
 */
export type BehaviorADT<D = Record<string, unknown>> =
    ExtendedParentBehaviorCtors<D> &
    BehaviorUnfoldCtors<D, BehaviorObservers<D>> &
    BehaviorMergeCtors<D> & {
        readonly prototype: BehaviorObservers<D>;
        /** @internal */ _call?: (...typeArgs: unknown[]) => BehaviorADT<D>;
        [key: string]: unknown;
    } & (D extends { readonly [output]?: unknown } ? {
        /** Observer output cospan projection (present when D declares [output]) */
        readonly [output]?: unknown;
    } : object) & (D extends { readonly [done]?: unknown } ? {
        /** Observer done cospan projection (present when D declares [done]) */
        readonly [done]?: unknown;
    } : object) & (D extends { readonly [accept]?: unknown } ? {
        /** Observer accept cospan projection (present when D declares [accept]) */
        readonly [accept]?: unknown;
    } : object);

// ---- Query type (lightweight dual of BehaviorADT) ------------------------

/**
 * Lightweight static type for values returned by `query()`.
 *
 * Unlike `BehaviorADT`, queries do not support type-parameterisation
 * `QueryADT` omits the parametric callable signature and the `[key: string]: unknown` index signature.
 *
 * The unfold constructor instance type is left as `unknown` instead of the
 * full `BehaviorObservers<D>`.  This avoids expanding the expensive observer
 * mapped type at each call-site while still providing typed unfold factories
 * and `explore()`.  Instances created by unfold ctors are almost never used
 * directly — `explore()` is the primary API.
 */
export type QueryADT<D = Record<string, unknown>> =
    BehaviorUnfoldCtors<D, BehaviorObservers<D>> &
    BehaviorMergeCtors<D> & {
        readonly prototype: BehaviorObservers<D>;
    } & (D extends { readonly [output]?: unknown } ? {
        /** Query output cospan projection (present when D declares [output]) */
        readonly [output]?: unknown;
    } : object) & (D extends { readonly [done]?: unknown } ? {
        /** Query done cospan projection (present when D declares [done]) */
        readonly [done]?: unknown;
    } : object) & (D extends { readonly [accept]?: unknown } ? {
        /** Query accept cospan projection (present when D declares [accept]) */
        readonly [accept]?: unknown;
    } : object);

// ---- DeclParams types -------------------------------------------------------

/**
 * Context passed to the `data()` declaration callback.
 */
export type DataDeclParams = FamilyRefCallable;

/**
 * Context passed to the `behavior()` declaration callback.
 *
 * `self` is the reserved continuation reference (for corecursion).
 */
export type BehaviorDeclParams = SelfRefCallable;

/**
 * Interface holding the [DeclBrand] phantom symbol, carrying the declaration
 * shape `D` on `DataADTWithParams`.
 *
 * Made into an interface so TypeScript's declaration emitter references this
 * by name rather than expanding the raw unique symbol into consumer .d.ts
 * files.
 *
 * Workaround for TypeScript bug {@link https://github.com/microsoft/TypeScript/issues/37888}.
 */
export interface DataADTDeclBrand<D> {
    readonly [DeclBrand]: D;
}

export type DataADTWithParams<D> = DataADT<D> & DataADTDeclBrand<D>;

/**
 * Interface holding the [DeclBrand] phantom symbol for `BehaviorADTWithParams`.
 *
 * Same workaround as `DataADTDeclBrand` for
 * {@link https://github.com/microsoft/TypeScript/issues/37888}.
 */
export interface BehaviorADTDeclBrand<D> {
    readonly [DeclBrand]: D;
}

/**
 * A `BehaviorADT` that additionally provides a callable overload for
 * parameterized type instantiation.
 */
export type BehaviorADTWithParams<D> = BehaviorADT<D> & BehaviorADTDeclBrand<D>;

// Re-export symbols used as declaration keys
export type { op, spec, operations, extend };
