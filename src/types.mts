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
    TypeParamRef,
    TypeSpec
} from './operations.mjs';

// Re-export so consumers can import all types from a single place
export type { TypeSpec, FamilyRef, FamilyRefCallable, SelfRef, SelfRefCallable, TypeParamRef };

// ---- SpecValue: TypeSpec → runtime value type ---------------------------------

/**
 * Maps a TypeSpec value (e.g. `NumberConstructor`, `StringConstructor`, an ADT class,
 * or a `FamilyRef`) to the corresponding runtime value type.
 *
 * `Self` is threaded through for recursive `FamilyRef` / `SelfRef` fields.
 */
export type SpecValue<S, Self = unknown> =
    S extends NumberConstructor ? number :
        S extends StringConstructor ? string :
            S extends BooleanConstructor ? boolean :
                S extends SymbolConstructor ? symbol :
                    S extends BigIntConstructor ? bigint :
                        S extends FamilyRef ? Self :
                            S extends SelfRef ? Self :
                                S extends TypeParamRef ? unknown :
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    S extends abstract new (...args: any[]) => infer I ? I :
                                        unknown;

// ---- Field values -----------------------------------------------------------

/** Resolve all field specs to their runtime value types, excluding symbol keys (e.g. [invariant]). */
export type FieldValues<Spec extends Record<string, TypeSpec>, Self = unknown> = {
    readonly [K in keyof Spec & string]: SpecValue<Spec[K], Self>
};

// ---- Variant instance --------------------------------------------------------

/** A constructed variant instance: frozen fields + an internal variant-name symbol tag. */
export type VariantInstance<
    _Name extends string,
    Fields extends Record<string, unknown> = Record<never, never>
> = { readonly [k: symbol]: unknown } & { readonly [K in keyof Fields]: Fields[K] };

// ---- Variant spec ------------------------------------------------------------

/** A variant field specification: maps field names to TypeSpec values. */
export type VariantSpec = Record<string, TypeSpec>;

/** True when a VariantSpec has no fields (i.e. the variant is a singleton). */
type IsEmpty<T> = keyof T extends never ? true : false;

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
        // Positional construction: MyVariant(field1, field2, ...) — order follows declaration order
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (...args: any[]): VariantInstance<Name, FieldValues<Spec, Self>> & Ops;
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

// ---- Operation result types -------------------------------------------------

/** Extract the output type from an operation spec, if declared. */
type OpOutType<V, Self = unknown> =
    (typeof spec) extends keyof V
        ? V[typeof spec] extends { out: infer Out }
            ? SpecValue<Out, Self>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            : any   // no 'out' spec → treated as any (untyped)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : any;  // no [spec] key → treated as any (untyped)

/** Extract the input type from an operation spec, if declared. */
type OpInType<V> =
    (typeof spec) extends keyof V
        ? V[typeof spec] extends { in: infer In }
            ? SpecValue<In, never>
            : undefined
        : undefined;

/** Derives the instance-level method/getter shape of an operation. */
type OpShape<V, Self = unknown> =
    OpInType<V> extends undefined | never
        ? OpOutType<V, Self>   // parameterless → getter
        : (input: NonNullable<OpInType<V>>) => OpOutType<V, Self>;  // parameterized → method

/**
 * Map of operation name → method/getter type for ADT instances.
 * `Instance` is the concrete ADT instance type threaded through for `Family`/`Self` outputs.
 */
export type OperationMethods<D, Instance = unknown> = {
    readonly [K in OperationKeys<D>]: OpShape<D[K], Instance>
};

// ---- Unfold static constructors on the ADT ----------------------------------

/** Helper: from a key union Keys (all ⊆ keyof D), pick keys whose [op] equals Kind. */
type OpKindKeys<Keys extends keyof D, D, Kind extends string> = {
    [K in Keys]: D[K] extends { readonly [op]: Kind } ? K : never
}[Keys];

/** All OperationKeys<D> whose declaration has [op] === 'unfold'. */
type UnfoldOpKeys<D> = OpKindKeys<OperationKeys<D>, D, 'unfold'>;

/** Static unfold factory shape: callable when spec has `in`, bare instance otherwise. */
type UnfoldCtorShape<V, Instance> =
    OpInType<V> extends undefined | never
        ? Instance
        : (n: NonNullable<OpInType<V>>) => Instance;

/** Shared unfold constructor mapped type, parameterised over a pre-filtered key union. */
type UnfoldCtorsFor<Keys extends keyof D, D, Instance = unknown> = {
    readonly [K in Keys]: UnfoldCtorShape<D[K], Instance>
};

/** Static unfold constructors exposed on the DataADT value (e.g. `List.Range(3)`). */
type UnfoldCtors<D, Instance = unknown> = UnfoldCtorsFor<UnfoldOpKeys<D> & keyof D, D, Instance>;

// ---- Merge static constructors on the ADT -----------------------------------

/** All OperationKeys<D> whose declaration has [op] === 'merge'. */
type MergeOpKeys<D> = OpKindKeys<OperationKeys<D>, D, 'merge'>;

/**
 * Shared merge constructor shape: composed input/output types cannot be inferred
 * from string names alone, so the shape is a generic any-arg callable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MergeCtorsFor<Keys extends string> = { readonly [K in Keys]: (...args: any[]) => any };

type MergeCtors<D> = MergeCtorsFor<MergeOpKeys<D> & string>;

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
        ? D[typeof extend] extends DataADT<infer P> ? P : never
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

/**
 * The full instance type for an ADT: union of variant shapes plus all operation methods.
 *
 * When `[extend]` is used, parent variant shapes and parent operation methods
 * are folded in so that `DataInstance<ChildDecl>` includes everything the child
 * inherits — preventing it from collapsing to `never` when the child declares
 * no own variants.
 *
 * The string index signature (`[k: string]: any`) allows accessing variant fields
 * (e.g. `cons.head`) without narrowing — necessary because `DataInstance<D>` is a
 * union over all variants and TypeScript can't know which variant is active at a
 * given use-site.
 */
export type DataInstance<D> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    CombinedADTInstances<D, CombinedADTInstances<D> & CombinedOperationMethods<D, any>>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    & CombinedOperationMethods<D, any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    & { readonly [k: string]: any };

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
          & UnfoldCtors<ParentDecl<D>, DataInstance<Leaf>>
          & MergeCtors<ParentDecl<D>>
          & ExtendedParentCtorsImpl<ParentDecl<D>, Leaf>;

/** Public entry point: hides the `Leaf` parameter. */
type ExtendedParentCtors<D> = ExtendedParentCtorsImpl<D, D>;

/**
 * The full type of the value returned by `data()`.
 *
 * It is:
 * - Callable as a function for parameterization: `List(Number)`
 * - Has static variant constructors/singletons as own properties
 * - Its instances have the declared operation methods/getters
 *
 * Note: the string index `[key: string]: any` is intentional — it lets callers
 * narrow on variant fields (e.g. `list.head`) without exhaustive narrowing.
 * `BehaviorADT` uses `unknown` because behavior instances are accessed only
 * through typed observer getters and do not need the same escape hatch.
 */
export type DataADT<D = Record<string, unknown>> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((...typeArgs: any[]) => DataADT<D>) &
    VariantCtors<D, DataInstance<D>, CombinedOperationMethods<D, DataInstance<D>>> &
    ExtendedParentCtors<D> &
    UnfoldCtors<D, DataInstance<D>> &
    MergeCtors<D> & {
        readonly prototype: DataInstance<D>;
        /** @internal */ _registerTransformer(
            name: string, transformer: unknown, skip?: boolean, variants?: unknown
        ): void;
        /** @internal */ _getTransformer(name: string): unknown;
        /** @internal */ _getTransformerNames(): string[];
        /** @internal */ _rawADT?: unknown;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
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
        ? D[typeof extend] extends BehaviorADT<infer P> ? BehaviorObservers<P> : unknown
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
export type BehaviorObservers<D> = ExtendedParentObservers<D> & {
    readonly [K in keyof D & string]:
    D[K] extends { readonly [op]: 'fold' | 'map' }
        ? OpShape<D[K], BehaviorObservers<D>>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : D[K] extends { readonly [op]: 'merge' } ? (...args: any[]) => any
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
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ObserverInputValue<In, Self = unknown> = In extends ((...args: any[]) => unknown) | (abstract new (...args: any[]) => unknown)
    ? SpecValue<In, Self>
    : In extends Record<string, unknown>
        ? { [K in keyof In]: SpecValue<In[K], Self> }
        : SpecValue<In, Self>;

type ObserverValue<S, Self = unknown> =
    S extends SelfRef ? Self :
        S extends { in: infer In; out: infer Out }
            ? (input: ObserverInputValue<In, Self>) => SpecValue<Out, Self>
            : S extends { out: infer Out }
                ? SpecValue<Out, Self>
                : S extends TypeSpec
                    ? SpecValue<S>
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

type BehaviorMergeCtors<D>  = MergeCtorsFor<BehaviorMergeOpKeys<D> & string>;

// ---- Full behavior type -----------------------------------------------------

/**
 *
 * It is:
 * - Callable for parameterization: `Stream(Number)`
 * - Has static unfold factory methods (PascalCase)
 * - Its instances expose observer getters/methods
 */
export type BehaviorADT<D = Record<string, unknown>> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((...typeArgs: any[]) => BehaviorADT<D>) &
    BehaviorUnfoldCtors<D, BehaviorObservers<D>> &
    BehaviorMergeCtors<D> & {
        readonly prototype: BehaviorObservers<D>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        /** @internal */ _call?: (...typeArgs: any[]) => BehaviorADT<D>;
        [key: string]: unknown;
    };

// ---- DeclParams types -------------------------------------------------------

/** Context passed to the `data()` declaration callback. */
export type DataDeclParams = {
    readonly Family: FamilyRefCallable;
    readonly [key: string]: TypeParamRef | FamilyRefCallable;
};

/** Extended context passed to the `behavior()` declaration callback. */
export type BehaviorDeclParams = {
    /** Callable as `Self` (continuation) or `Self(T)` (parameterized continuation). */
    readonly Self: SelfRefCallable;
    readonly [key: string]: TypeParamRef | SelfRefCallable;
};

// Re-export symbols used as declaration keys
export type { op, spec, operations, extend };
