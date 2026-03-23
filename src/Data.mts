import {
    FamilyRefSymbol,
    TypeParamSymbol,
    SortRefSymbol,
    sort,
    isOperationDef,
    extend,
    op,
    spec,
    operations,
    history,
    parseAux,
    validateTypeSpec,
    validateReturnType,
    isFamilyRefSpec,
    isSortRefSpec,
    assertCamelCase,
    assertPascalCase,
    LapisTypeSymbol,
    invariant,
    satisfies,
    parseProperties,
    type TypeSpec
} from './operations.mjs';

import {
    checkDemands,
    checkEnsures,
    checkInvariant,
    tryRescue,
    EnsuresError
} from './contracts.mjs';

import {
    adtTransformers,
    createTransformer,
    createFoldTransformer,
    composeMultipleTransformers,
    type Transformer,
    type HandlerFn,
    type VariantConstructorLike
} from './DataOps.mjs';

import {
    isObjectLiteral,
    HandlerMapSymbol,
    SortNameSymbol,
    hasInputSpec,
    omitSymbol,
    builtInTypeChecks,
    composeFunctions,
    installGetter,
    installOperation
} from './utils.mjs';

import type { DataADTWithParams, DataInstance, DataDeclParams, VariantKeys, SpecValue, FamilyRef, SelfRef, SortRef, TypeParamRef, DeclBrand } from './types.mjs';
import { isSort } from './types.mjs';
import type { FoldDef, InstanceOf, ContractCallbacks, ExpandAliases } from './ops.mjs';
import { fold as foldOp, unfold as unfoldOp, map as mapOp, merge as mergeOp, getAliases } from './ops.mjs';

import {
    type ProtocolEntry,
    registerConformance,
    applyUnconditionalProtocols,
    validateProtocolInvariant,
    validateProtocolConformance,
    parseProtocolEntries,
    conformanceRegistry,
    resolveOperationContracts,
    gatherProtocolSpec
} from './Protocol.mjs';

// Re-export symbols.
// `invariant` is defined in `operations.mts` but re-exported here so that
// internal consumers (e.g. `Relation.mts`) and the public API via `index.mts`
// can continue to import it from `Data.mjs` without a breaking change.
export { extend, invariant };
export const parent: unique symbol = Symbol('parent');
export type parent = typeof parent;

export const IsSingleton: unique symbol = Symbol('IsSingleton');
export type IsSingleton = typeof IsSingleton;

// Maps raw (unwrapped) ADT constructors to their delegation-Proxy
// counterparts so that `foldImpl` can recover the public, proxied ADT
// from the prototype chain of a variant instance.
//
// Entries are added in two places:
//   • createADT        – for the base ADT constructor
//   • createParameterized – for each parameterized specialization
//
// Using a WeakMap ensures that entries are automatically eligible for
// garbage collection once the raw constructor (key) is no longer
// reachable — no manual cleanup is needed.
const rawToProxiedMap = new WeakMap<object, object>();

// Per-ADT sort declaration info: stores sort params and sort→variant mappings.
// Entries are set during createADT for multi-sorted ADTs.
const sortDeclMap = new WeakMap<object, { sortParams: SpecRecord; sortVariants: Map<string, string[]> }>();

// Per-ADT inverse map registry: bidirectional opName ↔ inverseOpName.
// When map `halve` declares `inverse: 'double'`, both directions are
// recorded so the system can detect inverse pairs in merge pipelines
// and fuse them to identity.
const inverseRegistry = new WeakMap<object, Map<string, string>>();

/** Guard flag to prevent re-entrant round-trip verification. */
let _inRoundTripCheck = false;

/** Look up the inverse operation name for a given operation on an ADT. */
function getInverse(ADT: ADTLike, opName: string): string | undefined {
    return inverseRegistry.get(ADT as unknown as object)?.get(opName);
}

/**
 * Extract the `inverse` target name from an operation definition's spec.
 * Returns the target operation name string, or null if not declared.
 */
function getInverseTarget(opDef: Record<string, unknown>): string | null {
    const mapSpec = opDef[spec as unknown as string] as Record<string, unknown> | undefined;

    return mapSpec && typeof mapSpec['inverse'] === 'string'
        ? mapSpec['inverse']
        : null;
}

/** A map transformer: has param/atom transforms, no fold handler, no generator. */
function isMapTransformer(t: Transformer): boolean {
    return !t.generator && !t.getCtorTransform &&
        (t.getParamTransform !== undefined || t.getAtomTransform !== undefined);
}

/** A fold transformer: has getCtorTransform, no generator. */
function isFoldTransformer(t: Transformer): boolean {
    return t.getCtorTransform !== undefined && !t.generator;
}

/** Check whether an operation is installed as a getter (no extra params). */
function isGetterOp(ADT: ADTLike, opName: string): boolean {
    let proto: object | null = ADT.prototype as object;
    while (proto) {
        const desc = Object.getOwnPropertyDescriptor(proto, opName);
        if (desc)  return 'get' in desc;
        proto = Object.getPrototypeOf(proto) as object | null;
    }
    return false;
}

// Module-level fold-execution context: holds the current parameterized
// (proxied) ADT during fold handler invocation so that Family(T) can
// resolve type-param markers to the correct parameterized ADT without
// requiring the user to hardcode concrete type arguments.
let _currentFoldParameterizedADT: object | null = null;

// Module-level context: when set, fold operations pre-apply this map
// transformer to non-recursive (type-parameter) fields before passing
// them to the fold handler.  Used by merge pipelines to fuse adjacent
// map → fold operations into a single traversal.
let _currentMapFoldPreTransform: Transformer | null = null;

const TypeArgsSymbol: unique symbol = Symbol('TypeArgs'),
    VariantNameSymbol: unique symbol = Symbol('VariantName'),
    // Brands variant constructors and singleton instances so the delegation
    // proxy (`createDelegationProxy`) can distinguish them from operations
    // with a single `IsVariantSymbol in obj` check.  Without this brand
    // the proxy would need fragile multi-condition heuristics (checking
    // `.variantName`, `.spec`, `IsSingleton`, etc.) on every property access.
    IsVariantSymbol: unique symbol = Symbol('IsVariant'),
    // Marks wrapper contexts created for parent dispatch so that
    // re-entrancy guards can resolve back to the underlying node.
    FoldContextOriginSymbol: unique symbol = Symbol('FoldContextOrigin'),

    // WeakMap to store parent ADT references (for Comb Inheritance parent chain)
    parentADTMap = new WeakMap<object, object>();

/** Provides access to auxiliary fold results in zygomorphism folds */
export const aux: unique symbol = Symbol('aux');
export type aux = typeof aux;

export { TypeArgsSymbol, FamilyRefSymbol };

// ---- Internal types ---------------------------------------------------------

type SpecRecord = Record<string, unknown>;
type VariantLike = {
    variantName?: string;
    spec?: SpecRecord;
    _invariant?: ((instance: object) => boolean) | null;
    [IsSingleton]?: boolean;
    prototype?: object;
} & (new (...args: unknown[]) => unknown);

type SingletonInstance = object & {
    [VariantNameSymbol]: string;
};

type ADTLike = {
    prototype: object;
    _registerTransformer: (
        name: string, transformer: unknown, skip?: boolean, variants?: unknown
    ) => void;
    _getTransformer: (name: string) => Transformer | undefined;
    _getTransformerNames: () => string[];
    _rawADT?: unknown;
    [TypeArgsSymbol]?: SpecRecord;
    [key: string]: unknown;
    [sym: symbol]: unknown;
} & (new (...args: unknown[]) => unknown);

type ParsedDecl = {
    typeParams: SpecRecord;
    sortParams: SpecRecord;
    sortVariants: Map<string, string[]>;
    variants: SpecRecord;
    operations: SpecRecord;
    parentADT: ADTLike | null;
    Family: FamilyMarker | null;
    protocols: ProtocolEntry[];
};

export type FamilyMarker = {
    [FamilyRefSymbol]: true;
    _adt: ((typeParam?: unknown) => FamilyMarker) | ADTLike | null;
    (typeParam?: unknown): FamilyMarker;
};

type TransformerMethods = {
    _registerTransformer(
        name: string, transformer: unknown, skip?: boolean, variants?: unknown
    ): void;
    _getTransformer(name: string): Transformer | undefined;
    _getTransformerNames(): string[];
};

// ---- D-aware fold types for .ops() context ----------------------------------

/**
 * Interface holding [history] and [aux] symbols for fold context.
 * Made into an exported interface so TypeScript's declaration emitter can
 * reference this by name rather than expanding the raw unique symbols into
 * consumer .d.ts files (workaround for TypeScript bug microsoft/TypeScript#37888).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface FoldCtxSymbolKeys { readonly [history]: any; readonly [aux]: any; }

/**
 * D-aware fold output type: resolves `out` spec against the concrete family
 * instance type `DataInstance<D>` so that `out: Family` gives `DataInstance<D>`
 * instead of `never` for fold handler return types.
 */
type DataFoldOutType<D, S> =
    S extends { out: infer Out } ? SpecValue<Out, DataInstance<D>> : unknown;

/**
 * D-aware version of FoldFieldType: substitutes `DataFoldOutType<D, S>` so
 * Family/Self fields in fold contexts resolve to `DataInstance<D>` rather than
 * `never`.
 */
type DataFoldFieldType<D, FieldSpec, S> =
    FieldSpec extends FamilyRef | SelfRef | SortRef
        ? (FoldInType<S> extends never
            ? DataFoldOutType<D, S>
            : (n: FoldInType<S>) => DataFoldOutType<D, S>)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : FieldSpec extends TypeParamRef ? any
            : SpecValue<FieldSpec, DataFoldOutType<D, S>>;

/**
 * D-aware fold handler context: like FoldCtx but resolves Family/Self fields
 * to `DataInstance<D>` rather than `never`.
 */
type DataFoldCtx<D, VariantSpec, S> =
    VariantSpec extends Record<string, unknown>
        ? { readonly [F in keyof VariantSpec & string]: DataFoldFieldType<D, VariantSpec[F], S> }
            & FoldCtxSymbolKeys
        : Record<string, never>;


/**
 * Resolve the input type from a fold spec S.
 */
type FoldInType<S> =
    S extends { in: infer In } ? InstanceOf<In> : never;

/**
 * Per-variant handler function for a D-aware data fold.
 * - `ctx` is the variant's fields with Family→OutType substitution.
 * - For parametric folds (has `in`), receives an additional input argument.
 * - `this` is bound to the variant instance.
 *
 * `this` is typed as `DataInstance<D> & { [k: string | symbol]: any }`:
 *  - Named variant fields (from CombinedVariantFieldAccess) are properly typed.
 *  - Symbol-keyed access (e.g. `this[parent]`) and dynamic operation access resolve to `any`.
 *  - The intersection is assignable to `DataInstance<D>`, so `return this` compiles for `out: Family` folds.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataFoldHandlerThis<D> = DataInstance<D> & { [k: string | symbol]: any };

type DataFoldHandlerForVariant<D, VariantSpec, S> =
    FoldInType<S> extends never
        ? (this: DataFoldHandlerThis<D>, ctx: DataFoldCtx<D, VariantSpec, S>) => DataFoldOutType<D, S>
        : (this: DataFoldHandlerThis<D>, ctx: DataFoldCtx<D, VariantSpec, S>, n: FoldInType<S>) => DataFoldOutType<D, S>;

/**
 * Extract the parent declaration P from D's [extend] property.
 */
type ParentDataDecl<D> =
    (typeof extend) extends keyof D
        ? D[typeof extend] extends { readonly [DeclBrand]: infer P } ? P : never
        : never;

/**
 * All variant-only string keys from D and its parent [extend] chain.
 */
type AllVariantKeys<D> =
    | VariantKeys<D>
    | (ParentDataDecl<D> extends never ? never : AllVariantKeys<ParentDataDecl<D>>);

/**
 * Resolve the variant spec for key K by walking D and its parent chain.
 */
type VariantSpecForKey<D, K> =
    K extends keyof D ? D[K]
        : ParentDataDecl<D> extends never ? Record<string, never>
            : VariantSpecForKey<ParentDataDecl<D>, K>;

/**
 * Maps variant keys in D (including inherited) to their typed fold handler functions.
 * Also allows a `_` wildcard key.
 */
type DataFoldHandlers<D, S> = {
    [K in AllVariantKeys<D>]?: DataFoldHandlerForVariant<D, VariantSpecForKey<D, K>, S>
} & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _?: (this: DataFoldHandlerThis<D>, ...args: any[]) => DataFoldOutType<D, S>
};

/**
 * D-aware fold: threads the data declaration D into handler types so variant
 * field types are inferred from the declaration specs.
 */
export type DataFoldFn<D> = <S extends Record<string | symbol, unknown>>(s: S & ContractCallbacks) =>
(handlers: DataFoldHandlers<D, S>) => FoldDef<S, DataFoldHandlers<D, S>>;

// ---- Ops context type -------------------------------------------------------

type DataOpsContext<D> = {
    fold: DataFoldFn<D>;
    unfold: typeof unfoldOp;
    map: typeof mapOp;
    merge: typeof mergeOp;
    Family: FamilyMarker & DataADTWithParams<D>;
    [key: string]: unknown;
};

// ---- Intermediate structure returned by data() ------------------------------

export type DataStructure<D> = DataADTWithParams<D> & {
    ops<O extends Record<string, unknown>>(
        opsFn: (ctx: DataOpsContext<D>) => O
    ): DataADTWithParams<D & O & ExpandAliases<O>>;
};

// ---- Main entry point -------------------------------------------------------

/**
 * Main entry point: data(() => { variants })
 *    .ops(({ fold, unfold, map, merge, Family, T }) => ({ operations }))
 *
 * When the declaration uses type parameters (single uppercase letters A–Z),
 * the returned ADT is callable with a type-arg record for compile-time
 * substitution: `List({ T: Number })` yields fields typed as `number`.
 *
 * The legacy single-phase form (variants + operations in one declaration) is
 * also supported for internal use.
 */
export function data<D extends Record<string, unknown>>(
    declFn: (params: DataDeclParams) => D
): DataStructure<D> {
    const decl = parseDeclaration(declFn as unknown as (params: object) => Record<string, unknown>);

    // If the declaration already contains operations (legacy / internal form),
    // create the ADT immediately.
    const hasOps = Object.keys(decl.operations).length > 0;
    if (hasOps) {
        const ADT = createADT(decl);
        (ADT as unknown as Record<symbol, boolean>)[LapisTypeSymbol] = true;
        attachOpsMethod<D>(ADT as unknown as Record<string, unknown>, decl);
        return ADT as unknown as DataStructure<D>;
    }

    // Pure structure declaration: create a partial ADT (variants only),
    // and attach .ops() for phase 2.
    const ADT = createADT(decl);
    (ADT as unknown as Record<symbol, boolean>)[LapisTypeSymbol] = true;
    attachOpsMethod<D>(ADT as unknown as Record<string, unknown>, decl);
    return ADT as unknown as DataStructure<D>;
}

/**
 * Attach the `.ops()` method onto an ADT-like object.
 * The method accepts a callback that receives a context with fold/unfold/map/merge
 * and all type params, then registers the returned operations on the ADT.
 *
 * @template D - The declaration type (variant specs map)
 */
function attachOpsMethod<D extends Record<string, unknown>>(
    ADT: Record<string, unknown>,
    decl: ParsedDecl
): void {
    (ADT as DataStructure<D>).ops = function ops<O extends Record<string, unknown>>(
        opsFn: (ctx: DataOpsContext<D>) => O
    ): DataADTWithParams<D & O & ExpandAliases<O>> {
        // Build the context: type params + Family + operations
        const ctx = {
            fold: foldOp as DataFoldFn<D>,
            unfold: unfoldOp,
            map: mapOp,
            merge: mergeOp,
            Family: decl.Family ?? createFamilyMarker()
        } as DataOpsContext<D>;

        // Forward all type param markers (T, A, B, …)
        for (const [name, param] of Object.entries(decl.typeParams))
            (ctx as Record<string, unknown>)[name] = param;

        // Forward all sort param markers ($A, $B, …)
        for (const [name, param] of Object.entries(decl.sortParams))
            (ctx as Record<string, unknown>)[name] = param;

        const opsObj = opsFn(ctx);

        // Parse and install the operations on the (already-created) ADT.
        const opsDecl = parseDeclarationOps(opsObj);
        // Use the raw (un-proxied) ADT so parentADTMap / adtTransformers are keyed consistently.
        const rawADT = ((ADT as unknown as { _rawADT?: ADTLike })._rawADT ?? ADT) as unknown as ADTLike;
        createOperations(
            rawADT,
            // Recover ownVariants from the ADT (they are enumerable properties that are variant-like)
            getOwnVariantsFromADT(rawADT),
            opsDecl,
            decl.typeParams,
            decl.protocols
        );

        // Validate protocol conformance and register unconditional conformances
        applyUnconditionalProtocols(
            rawADT.prototype,
            new Set(rawADT._getTransformerNames()),
            decl.protocols,
            'ADT',
            rawADT
        );

        return ADT as DataADTWithParams<D & O & ExpandAliases<O>>;
    };
}

/**
 * Extract the variant entries from an already-created ADT proxy.
 */
function getOwnVariantsFromADT(ADT: ADTLike): Record<string, unknown> {
    const variants: Record<string, unknown> = {};
    for (const key of Object.keys(ADT as object)) {
        const val = (ADT as Record<string, unknown>)[key];
        if (val && typeof val === 'object' && (val as Record<symbol, unknown>)[IsVariantSymbol])
            variants[key] = val;
        else if (typeof val === 'function' && (val as unknown as Record<symbol, unknown>)[IsVariantSymbol])
            variants[key] = val;
    }
    return variants;
}

/**
 * Parse only the operations portion of a declaration object (all keys
 * are expected to be operation defs — no variant or meta keys).
 */
function parseDeclarationOps(
    opsObj: Record<string, unknown>
): SpecRecord {
    const result: SpecRecord = {};
    for (const [key, value] of Object.entries(opsObj)) {
        if (isOperationDef(key, value))
            result[key] = value;
    }
    return result;
}

// ---- Declaration parsing ----------------------------------------------------

function parseDeclaration(
    declFn: (params: object) => Record<string, unknown>
): ParsedDecl {
    const typeParams: SpecRecord = {},
        sortParams: SpecRecord = {},
        variantsObj: SpecRecord = {},
        operationsObj: SpecRecord = {};
    let parentADT: ADTLike | null = null,
        Family: FamilyMarker | null = null;

    const context = {
            get Family() {
                if (!Family)
                    Family = createFamilyMarker();

                return Family;
            }
        },

        typeParamProxy = new Proxy({} as Record<string, unknown>, {
            get(_target, prop: string | symbol) {
                if (prop === 'Family') return context.Family;
                if (typeof prop === 'string' && /^\$[A-Z]$/.test(prop)) {
                    if (!sortParams[prop])
                        sortParams[prop] = createSortParam(prop);

                    return sortParams[prop];
                }
                if (typeof prop === 'string' && /^[A-Z]$/.test(prop)) {
                    if (!typeParams[prop])
                        typeParams[prop] = createTypeParam(prop);

                    return typeParams[prop];
                }
                return undefined;
            }
        }),

        declObj = declFn(typeParamProxy);

    if (extend in declObj)
        parentADT = declObj[extend as unknown as string] as ADTLike;

    const rawDeclObj = declObj as Record<string | symbol, unknown>;
    const protocols = parseProtocolEntries(rawDeclObj[satisfies]);

    for (const [key, value] of Object.entries(declObj)) {
        if (isOperationDef(key, value))
            operationsObj[key] = value;
        else if (key !== String(extend) && typeof key === 'string')
            variantsObj[key] = value;

    }

    if (parentADT) {
        for (const variantName of Object.keys(variantsObj)) {
            if (variantName in (parentADT as object))
                throw new Error(`Variant name collision: '${variantName}' already exists in base ADT`);

        }
    }

    // ---- Sort scanning ----
    // Collect [sort] annotations from variant specs and build the
    // sort → variants mapping.
    const hasSorts = Object.keys(sortParams).length > 0;
    const sortVariants = new Map<string, string[]>();

    if (hasSorts) {
        for (const [variantName, rawSpec] of Object.entries(variantsObj)) {
            if (!rawSpec || typeof rawSpec !== 'object') continue;
            const rawObj = rawSpec as Record<string | symbol, unknown>;
            const sortAnnotation = rawObj[sort as unknown as string];

            if (sortAnnotation && isSortRefSpec(sortAnnotation)) {
                const sortName = (sortAnnotation as Record<symbol, string>)[SortRefSymbol];
                if (!sortVariants.has(sortName))
                    sortVariants.set(sortName, []);
                sortVariants.get(sortName)!.push(variantName);
            } else if (Object.keys(sortParams).length > 1) {
                throw new Error(
                    `Multi-sorted ADT requires [sort] annotation on every variant, ` +
                    `but variant '${variantName}' is missing one`
                );
            }
        }

        // Single-sort inference: if only one sort param, default any
        // unannotated variants to that single sort.
        if (Object.keys(sortParams).length === 1) {
            const singleSortName = Object.keys(sortParams)[0];
            const annotated = new Set(
                Array.from(sortVariants.values()).flat()
            );
            if (!sortVariants.has(singleSortName))
                sortVariants.set(singleSortName, []);
            const list = sortVariants.get(singleSortName)!;
            for (const vn of Object.keys(variantsObj)) {
                if (!annotated.has(vn))
                    list.push(vn);
            }
        }
    }

    return { typeParams, sortParams, sortVariants, variants: variantsObj, operations: operationsObj, parentADT, Family, protocols };
}

// ---- Variant constructor factories ------------------------------------------

function createVariantConstructor({
    name,
    spec: fieldSpec,
    invariantFn,
    ADT,
    constructorBody
}: {
    name: string;
    spec: SpecRecord;
    invariantFn: ((instance: object) => boolean) | null;
    ADT: ADTLike;
    constructorBody: (this: object, ...args: unknown[]) => void;
}): VariantLike {
    // Uses `function` (not arrow/class) intentionally: needs new.target support
    function Variant(this: object, ...args: unknown[]) {
        if (!new.target) return new (Variant as unknown as new (...a: unknown[]) => unknown)(...args);
        constructorBody.call(this, ...args);
    }

    Object.defineProperty(Variant, 'name', { value: name, configurable: true });
    (Variant as unknown as VariantLike).prototype = Object.create(ADT.prototype);
    Object.defineProperty((Variant as unknown as VariantLike).prototype, 'constructor', {
        value: Variant,
        writable: true,
        enumerable: false,
        configurable: true
    });
    (Variant as unknown as { variantName: string }).variantName = name;
    (Variant as unknown as { spec: SpecRecord }).spec = fieldSpec;
    (Variant as unknown as { _invariant: unknown })._invariant = invariantFn;
    (Variant as unknown as Record<symbol, unknown>)[IsSingleton] = false;
    (Variant as unknown as Record<symbol, unknown>)[IsVariantSymbol] = true;

    return Variant as unknown as VariantLike;
}

function createSingletonVariant(name: string, ADT: ADTLike, sortName?: string | null): SingletonInstance {
    function Variant(this: object) {
        if (!new.target) return new (Variant as unknown as new () => unknown)();
        (this as Record<symbol, unknown>)[VariantNameSymbol] = name;
        (this as Record<symbol, unknown>)[IsVariantSymbol] = true;
        if (sortName)
            (this as Record<symbol, unknown>)[SortNameSymbol] = sortName;
        Object.freeze(this);
    }

    Object.defineProperty(Variant, 'name', { value: name, configurable: true });
    (Variant as unknown as { prototype: object }).prototype = Object.create(ADT.prototype);
    Object.defineProperty((Variant as unknown as { prototype: object }).prototype, 'constructor', {
        value: Variant,
        writable: true,
        enumerable: false,
        configurable: true
    });
    (Variant as unknown as { variantName: string }).variantName = name;
    (Variant as unknown as { spec: SpecRecord }).spec = {};
    (Variant as unknown as Record<symbol, boolean>)[IsSingleton] = true;

    return Object.freeze(new (Variant as unknown as new () => unknown)()) as SingletonInstance;
}

function checkConstructorInvariant(
    instance: object,
    invariantFn: ((instance: object) => boolean) | null,
    variantName: string
): void {
    if (invariantFn) {
        const isValid = invariantFn(instance);
        if (!isValid) {
            const fnName = invariantFn.name ? `: ${invariantFn.name}` : '';
            throw new TypeError(
                `Invariant violation in variant '${variantName}'${fnName}`
            );
        }
    }
}

// ---- Proxy factory ----------------------------------------------------------

function createDelegationProxy(
    target: ADTLike,
    ownVariants: Record<string, unknown>,
    delegate: ADTLike | null,
    isParentExtension = true
): ADTLike {
    return new Proxy(target, {
        has(_target, prop: string | symbol) {
            if (prop in ownVariants) return true;
            if (prop in _target) return true;
            if (delegate) return prop in (delegate as object);
            return false;
        },

        get(_target, prop: string | symbol, receiver: unknown) {
            if (prop === '_registerTransformer' || prop === '_getTransformer' || prop === '_getTransformerNames')
                return (_target as Record<string | symbol, unknown>)[prop];


            if (prop in ownVariants)
                return ownVariants[prop as string];


            if (prop in _target)
                return Reflect.get(_target, prop, receiver);


            if (delegate && prop in (delegate as object)) {
                const delegatedValue = (delegate as Record<string | symbol, unknown>)[prop];

                if (isParentExtension &&
                    (typeof delegatedValue === 'function' ||
                        (typeof delegatedValue === 'object' && delegatedValue !== null))) {
                    // Only variant constructors and singletons are re-wrapped
                    // for the child ADT.  Operations (fold, unfold, map, merge)
                    // are plain functions / property descriptors installed on
                    // the prototype chain and must be delegated as-is so they
                    // continue to use the transformer registry of the ADT that
                    // defined them.  Wrapping an operation would incorrectly
                    // re-parent its prototype to the child, breaking lookup.
                    if (IsVariantSymbol in (delegatedValue as object))
                        return createChildVariant(target, prop as string, delegatedValue as VariantLike | SingletonInstance);

                }

                return delegatedValue;
            }

            return undefined;
        }
    }) as unknown as ADTLike;
}

// ---- Transformer registry methods -------------------------------------------

function createTransformerMethods(ADT: ADTLike): TransformerMethods {
    return {
        _registerTransformer(name, transformer, skipCollisionCheck = false, variants = null) {
            const key = ADT;
            let registry = adtTransformers.get(key);
            if (!registry) {
                registry = new Map();
                adtTransformers.set(key, registry);
            }

            if (!skipCollisionCheck) {
                const variantsToCheck = (variants ?? this) as Record<string, unknown>;
                for (const k of Object.keys(variantsToCheck)) {
                    if (k === 'extend' || k.startsWith('_')) continue;

                    const variant = variantsToCheck[k];

                    if (typeof variant === 'function') {
                        const vl = variant as unknown as VariantLike;
                        if (!vl[IsSingleton] && vl.spec) {
                            const fieldNames = Object.keys(vl.spec);
                            if (fieldNames.includes(name)) {
                                throw new Error(
                                    `Operation name '${name}' conflicts with field '${name}' in variant '${k}'`
                                );
                            }
                        }
                    } else if (variant && typeof variant === 'object' && !Array.isArray(variant)) {
                        if (Object.prototype.hasOwnProperty.call(variant, name)) {
                            throw new Error(
                                `Operation name '${name}' conflicts with field '${name}' in variant '${k}'`
                            );
                        }
                    }
                }
            }

            registry.set(name, transformer as Transformer);
        },

        _getTransformer(name) {
            const key = ADT,
                registry = adtTransformers.get(key);
            if (registry?.has(name))
                return registry.get(name);


            const parentKey = parentADTMap.get(key);
            if (parentKey && (parentKey as ADTLike)._getTransformer)
                return (parentKey as ADTLike)._getTransformer(name);


            return undefined;
        },

        _getTransformerNames() {
            const key = ADT,
                registry = adtTransformers.get(key);
            return registry ? Array.from(registry.keys()) : [];
        }
    };
}

// ---- Family / TypeParam markers ---------------------------------------------

/**
 * Walks a variant constructor's prototype chain to find the proxied
 * parameterized ADT (if any).  Returns the proxied ADT when the variant
 * belongs to a parameterized specialization, or `null` otherwise.
 *
 * Extracted as a module-level helper so that its locals live in their
 * own (non-recursive) frame rather than bloating the hot recursive
 * `foldImpl` frame.
 */
function resolveFoldParameterizedADT(variantCtor: VariantLike): object | null {
    const proto = Object.getPrototypeOf(
        (variantCtor as unknown as { prototype: object }).prototype
    );
    return resolveProxiedADT(proto);
}

/**
 * Given a prototype object whose `constructor` points at a (possibly raw)
 * ADT constructor, return the proxied parameterized ADT — or `null` when
 * the ADT is not parameterized.
 *
 * Shared by `resolveFoldParameterizedADT` (starting from a variant
 * constructor's prototype chain) and the metamorphism runtime (starting
 * from an instance's prototype chain).
 */
function resolveProxiedADT(proto: object | null): object | null {
    const adtCtor = proto?.constructor ?? null;
    const proxied = adtCtor ? rawToProxiedMap.get(adtCtor as object) : null;
    return proxied && TypeArgsSymbol in (proxied as Record<symbol, unknown>)
        ? proxied
        : null;
}

function createFamilyMarker(): FamilyMarker {
    const marker = function (typeParam?: unknown): FamilyMarker {
        // During fold execution on a parameterized ADT, resolve type-param
        // markers (e.g. `T`) to the current parameterized ADT.  This allows
        // fold handlers to write `Family(T).Push(...)` instead of hardcoding
        // `Stack(Number).Push(...)`.
        // We also verify that the param name is actually declared in the
        // current fold-context ADT's TypeArgs, so a stray type param from
        // a *different* ADT won't silently resolve to the wrong ADT.
        if (_currentFoldParameterizedADT !== null &&
            typeParam && typeof typeParam === 'object' &&
            TypeParamSymbol in (typeParam as object)
        ) {
            const paramName = (typeParam as Record<symbol, string>)[TypeParamSymbol],
                typeArgs = (_currentFoldParameterizedADT as Record<symbol, unknown>)[TypeArgsSymbol] as Record<string, unknown> | undefined;
            if (typeArgs && paramName in typeArgs)
                return _currentFoldParameterizedADT as unknown as FamilyMarker;
        }

        if ((marker as FamilyMarker)._adt)
            return ((marker as FamilyMarker)._adt as (typeParam?: unknown) => FamilyMarker)(typeParam);

        return marker as unknown as FamilyMarker;
    };
    (marker as unknown as Record<symbol, unknown>)[FamilyRefSymbol] = true;
    (marker as unknown as { _adt: null })._adt = null;

    // Wrap marker in a Proxy to delegate variant constructor access to _adt
    return new Proxy(marker as unknown as FamilyMarker, {
        get(target, prop, receiver) {
            // Return properties from the marker itself (like _adt, FamilyRefSymbol)
            if (prop === '_adt' || prop === FamilyRefSymbol || typeof prop === 'symbol')
                return Reflect.get(target, prop, receiver);

            // Delegate variant constructor access to _adt if it exists
            const adt = target._adt;
            if (adt && (typeof adt === 'object' || typeof adt === 'function') && prop in adt)
                return Reflect.get(adt, prop, adt);

            // Otherwise return from the marker itself
            return Reflect.get(target, prop, receiver);
        }
    });
}

function createTypeParam(name: string): object {
    const marker: Record<symbol, unknown> = {};
    marker[TypeParamSymbol] = name;
    return marker;
}

function createSortParam(name: string): object {
    const marker: Record<symbol, unknown> = {};
    marker[SortRefSymbol] = name;
    return marker;
}

// ---- ADT creation -----------------------------------------------------------

function createADT(decl: ParsedDecl): ADTLike {
    const hasTypeParams = Object.keys(decl.typeParams).length > 0,
        parentADT = decl.parentADT;

    function ADT(this: object, ...args: unknown[]) {
        if (!new.target && hasTypeParams && args.length > 0) {
            const firstArg = args[0];

            if (isObjectLiteral(firstArg))
                return createParameterized(ADT as unknown as ADTLike, firstArg as SpecRecord, decl);

            throw new TypeError(
                'Parameterized ADTs must be instantiated with an object: ' +
                `e.g. MyADT({ ${Object.keys(decl.typeParams).map(k => `${k}: Number`).join(', ')} })`
            );
        }

        if (new.target)
            return;

        throw new Error('Use ADT variants or parameterize with type arguments');
    }

    if (parentADT) {
        (ADT as unknown as { prototype: object }).prototype = Object.create(parentADT.prototype);
        (ADT as unknown as { prototype: { constructor: unknown } }).prototype.constructor = ADT;
        const rawParentADT = (parentADT as { _rawADT?: ADTLike })._rawADT || parentADT;
        parentADTMap.set(ADT as unknown as object, rawParentADT as object);
    }

    Object.assign(ADT, createTransformerMethods(ADT as unknown as ADTLike));

    // Store sort info on the ADT for fold/unfold/map to access
    if (decl.sortVariants.size > 0) {
        sortDeclMap.set(ADT as unknown as object, {
            sortParams: decl.sortParams,
            sortVariants: decl.sortVariants
        });

        // Sort reflection: ADT[isSort](instance, '$E') → boolean
        Object.defineProperty(ADT, isSort, {
            value: (instance: unknown, sortName: string): boolean =>
                instance !== null && instance !== undefined &&
                (instance as Record<symbol, unknown>)[SortNameSymbol] === sortName,
            writable: false,
            enumerable: false,
            configurable: true
        });
    }

    const ownVariants = createVariants(ADT as unknown as ADTLike, decl.variants, decl.typeParams, decl.sortVariants);

    createOperations(ADT as unknown as ADTLike, ownVariants, decl.operations, decl.typeParams, decl.protocols);

    // Inherit unfold operations from parent, rebound to child variants
    if (parentADT)
        inheritUnfoldOperations(ADT as unknown as ADTLike, ownVariants, parentADT, decl.operations, decl.protocols);

    const ProxiedADT = createDelegationProxy(
        ADT as unknown as ADTLike,
        ownVariants,
        parentADT,
        true
    );

    (ProxiedADT as { _rawADT: ADTLike })._rawADT = ADT as unknown as ADTLike;

    for (const [name, variant] of Object.entries(ownVariants)) {
        Object.defineProperty(ADT, name, {
            value: variant,
            writable: false,
            enumerable: true,
            configurable: true
        });
    }

    if (decl.Family)
        decl.Family._adt = ProxiedADT as unknown as ADTLike;

    // Register raw → proxied mapping so fold handlers can recover the
    // proxied ADT from the prototype chain.
    rawToProxiedMap.set(ADT as unknown as object, ProxiedADT as unknown as object);

    return ProxiedADT;
}

// ---- Child variant -----------------------------------------------------------

/** Resolve the sort name for a variant by walking the ADT's ancestry chain. */
function resolveInheritedSortName(
    adt: ADTLike,
    variantName: string
): string | null {
    let current: object | undefined = adt as unknown as object;
    while (current) {
        const info = sortDeclMap.get(current);
        if (info) {
            const sortName = resolveSortName(variantName, info.sortVariants);
            if (sortName !== null) return sortName;
        }
        current = parentADTMap.get(current) as object | undefined;
    }
    return null;
}

function createChildVariant(
    ChildADT: ADTLike,
    variantName: string,
    ParentVariant: VariantLike | SingletonInstance
): VariantLike | SingletonInstance {
    const parentSpec = (ParentVariant as VariantLike).spec || {},
        parentInvariantFn = (ParentVariant as VariantLike)._invariant || null;

    // Resolve sort name for inherited variant from the ancestry chain
    const childSortName = resolveInheritedSortName(ChildADT, variantName);

    if (Object.keys(parentSpec).length === 0)
        return createSingletonVariant(variantName, ChildADT, childSortName);
    else {
        return createVariantConstructor({
            name: variantName,
            spec: parentSpec,
            invariantFn: parentInvariantFn,
            ADT: ChildADT,
            constructorBody: function (...args: unknown[]) {
                const fields = normalizeFields(args[0], args.slice(1), parentSpec, variantName);
                validateAndAssignFields(this, fields, parentSpec, ChildADT);
                checkConstructorInvariant(this, parentInvariantFn, variantName);
                (this as Record<symbol, unknown>)[VariantNameSymbol] = variantName;
                if (childSortName !== null)
                    (this as Record<symbol, unknown>)[SortNameSymbol] = childSortName;
                Object.freeze(this);
            }
        });
    }
}

// ---- Variant creation -------------------------------------------------------

/** Resolve the sort name for a variant, given the sort→variants mapping. */
function resolveSortName(
    variantName: string,
    sortVariants: Map<string, string[]>
): string | null {
    for (const [sortName, variants] of sortVariants)
        if (variants.includes(variantName))  return sortName;


    return null;
}

function createVariants(
    ADT: ADTLike,
    variantSpecs: SpecRecord,
    _typeParams: SpecRecord,
    sortVariants?: Map<string, string[]>
): Record<string, VariantLike | SingletonInstance> {
    const variants: Record<string, VariantLike | SingletonInstance> = {},
        hasSorts = sortVariants !== undefined && sortVariants.size > 0;

    for (const [name, rawSpec] of Object.entries(variantSpecs)) {
        assertPascalCase(name, 'Variant');

        const variantSortName = hasSorts ? resolveSortName(name, sortVariants!) : null;

        let invariantFn: ((instance: object) => boolean) | null = null,
            fieldSpec = rawSpec as SpecRecord;

        if (rawSpec && typeof rawSpec === 'object') {
            const rawObj = rawSpec as Record<string | symbol, unknown>;
            if (invariant in rawObj) {
                invariantFn = rawObj[invariant as unknown as string] as (instance: object) => boolean;
                fieldSpec = omitSymbol(rawObj, invariant as unknown as symbol) as SpecRecord;
            }
            // Strip [sort] annotation from variant spec — it's metadata, not a field
            if (sort in rawObj)
                fieldSpec = omitSymbol(fieldSpec as Record<string | symbol, unknown>, sort as unknown as symbol) as SpecRecord;

            for (const fieldName of Object.keys(fieldSpec))
                assertCamelCase(fieldName, 'Field');

        }

        const isEmpty = !fieldSpec || Object.keys(fieldSpec).length === 0;

        if (isEmpty) {
            if (invariantFn) {
                throw new TypeError(
                    `Invariant on singleton variant '${name}' is meaningless: singletons have no state to evaluate`
                );
            }
            variants[name] = createSingletonVariant(name, ADT, variantSortName);
        } else {
            variants[name] = createVariantConstructor({
                name,
                spec: fieldSpec,
                invariantFn,
                ADT,
                constructorBody: function (...args: unknown[]) {
                    const fields = normalizeFields(args[0], args.slice(1), fieldSpec, name);
                    validateAndAssignFields(this, fields, fieldSpec, ADT);
                    checkConstructorInvariant(this, invariantFn, name);
                    (this as Record<symbol, unknown>)[VariantNameSymbol] = name;
                    if (variantSortName !== null)
                        (this as Record<symbol, unknown>)[SortNameSymbol] = variantSortName;
                    Object.freeze(this);
                }
            });
        }
    }

    return variants;
}

// ---- Field normalization & validation ---------------------------------------

function normalizeFields(
    firstArg: unknown,
    restArgs: unknown[],
    spec: SpecRecord,
    variantName: string
): Record<string, unknown> {
    if (isObjectLiteral(firstArg) && restArgs.length === 0)
        return firstArg as Record<string, unknown>;


    const fieldNames = Object.keys(spec),
        allArgs = [firstArg, ...restArgs];

    if (allArgs.length !== fieldNames.length)
        throw new Error(`Wrong number of arguments for ${variantName}: expected ${fieldNames.length}, got ${allArgs.length}`);


    const fields: Record<string, unknown> = {};
    for (let i = 0; i < fieldNames.length; i++)
        fields[fieldNames[i]] = allArgs[i];

    return fields;
}

function validateAndAssignFields(
    instance: object,
    fields: Record<string, unknown>,
    spec: SpecRecord,
    ADT: ADTLike
): void {
    for (const [fieldName, fieldSpec] of Object.entries(spec)) {
        if (!(fieldName in fields))
            throw new TypeError(`Missing required field '${fieldName}'`);


        const value = fields[fieldName];
        validateField(value, fieldSpec, fieldName, ADT);
        (instance as Record<string, unknown>)[fieldName] = value;
    }

    for (const fieldName of Object.keys(fields)) {
        if (!(fieldName in spec))
            throw new TypeError(`Unexpected field '${fieldName}'`);

    }
}

/**
 * Produces a human-readable description of an ADT for error messages.
 *
 * For a base ADT like `Color`, returns its variant names: `"ADT{Red, Green, Blue}"`.
 * For a parameterized ADT like `Pair(String, Number)`, returns
 * `"ADT{MakePair}(String, Number)"` by walking its parent chain and type args.
 */
function describeADT(adt: ADTLike): string {
    // Unwrap proxied ADT to raw constructor before walking parentADTMap,
    // which is keyed by raw constructors, not proxied ones.
    let root: object = ((adt as { _rawADT?: object })._rawADT ?? adt) as object;
    while (parentADTMap.has(root))
        root = parentADTMap.get(root)!;

    // Recover the proxied base ADT to enumerate variant names
    const proxiedRoot = rawToProxiedMap.get(root) ?? root;
    const variantNames: string[] = [];
    for (const key of Object.keys(proxiedRoot as object)) {
        const val = (proxiedRoot as Record<string, unknown>)[key];
        if (val && typeof val === 'object' && IsVariantSymbol in (val as object))
            variantNames.push(key);
        else if (typeof val === 'function' && IsVariantSymbol in (val as object))
            variantNames.push(key);
    }
    const baseName = variantNames.length > 0
        ? `ADT{${variantNames.join(', ')}}`
        : 'ADT';

    // If the ADT carries type arguments, format them
    const typeArgs = (adt as Record<symbol, unknown>)[TypeArgsSymbol] as SpecRecord | undefined;
    if (typeArgs) {
        const argDescs = Object.values(typeArgs).map(arg => {
            // Primitive constructors
            if (typeof arg === 'function' && (arg as { name?: string }).name)
                return (arg as { name: string }).name;
            // Nested ADT
            if (typeof arg === 'function' && typeof (arg as unknown as ADTLike)._getTransformer === 'function')
                return describeADT(arg as unknown as ADTLike);
            return String(arg);
        });
        return `${baseName}(${argDescs.join(', ')})`;
    }

    return baseName;
}

function validateField(
    value: unknown,
    fieldSpec: unknown,
    fieldName: string,
    ADT: ADTLike
): void {
    // Type parameter
    if (fieldSpec && typeof fieldSpec === 'object' && TypeParamSymbol in (fieldSpec as object)) {
        const paramName = (fieldSpec as Record<symbol, unknown>)[TypeParamSymbol] as string,
            typeArgs = (ADT as Record<symbol, unknown>)[TypeArgsSymbol] as SpecRecord | undefined;
        if (typeArgs && typeArgs[paramName]) {
            const instantiatedType = typeArgs[paramName];
            validateField(value, instantiatedType, fieldName, ADT);
            return;
        }
        return;
    }

    // Family reference - check against root base
    if (isFamilyRefSpec(fieldSpec)) {
        let rootBase: object = ADT as object;
        while (parentADTMap.has(rootBase))
            rootBase = parentADTMap.get(rootBase)!;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(value instanceof (rootBase as unknown as abstract new (...args: any[]) => unknown)))
            throw new TypeError(`Field '${fieldName}' must be an instance of the same ADT family`);

        return;
    }

    // Sort reference — check instanceof ADT family AND sort name match
    if (isSortRefSpec(fieldSpec)) {
        let rootBase: object = ADT as object;
        while (parentADTMap.has(rootBase))
            rootBase = parentADTMap.get(rootBase)!;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(value instanceof (rootBase as unknown as abstract new (...args: any[]) => unknown)))
            throw new TypeError(`Field '${fieldName}' must be an instance of the same ADT family`);

        const expectedSort = (fieldSpec as Record<symbol, string>)[SortRefSymbol];
        const actualSort = (value as Record<symbol, unknown>)[SortNameSymbol];
        if (actualSort !== expectedSort) {
            throw new TypeError(
                `Field '${fieldName}' expected a variant of sort '${expectedSort}', but got sort '${String(actualSort ?? 'none')}'`
            );
        }

        return;
    }

    // Built-in types — O(1) Map lookup
    const expectedType = builtInTypeChecks.get(fieldSpec);
    if (expectedType) {
        if (typeof value !== expectedType)
            throw new TypeError(`Field '${fieldName}' must be a ${(fieldSpec as { name: string }).name}`);
        return;
    }

    // ADT type argument — instanceof check against the exact ADT (including
    // parameterisation-level matching, since each parameterized ADT has its
    // own unique prototype chain).
    if (typeof fieldSpec === 'function') {
        const asADT = fieldSpec as unknown as ADTLike;
        if (typeof asADT._getTransformer === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (!(value instanceof (fieldSpec as unknown as abstract new (...args: any[]) => unknown))) {
                throw new TypeError(
                    `Field '${fieldName}' must be an instance of ${describeADT(asADT)}`
                );
            }

            return;
        }
    }

    // Predicate function validation
    if (typeof fieldSpec === 'function' && !builtInTypeChecks.has(fieldSpec)) {
        try {
            const result = (fieldSpec as (v: unknown) => unknown)(value);
            if (result === false)
                throw new TypeError(`Field '${fieldName}' failed predicate validation`);

            if (result)
                return;

        } catch (e) {
            if ((e as Error).message?.includes('failed predicate validation'))
                throw e;

            if (typeof value === 'object' && value !== null) {
                if ((value as object).constructor === fieldSpec ||
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    value instanceof (fieldSpec as abstract new (...args: any[]) => unknown))
                    return;

            }
            throw new TypeError(`Field '${fieldName}' failed predicate validation: ${(e as Error).message}`);
        }
        return;
    }
}

// ---- Topological sort -------------------------------------------------------

type DepFrame = { name: string; phase: 'pre' | 'post'; isAuxDep?: boolean };

function topologicalSortOperations(
    operationSpecs: SpecRecord,
    localParentADT: ADTLike | null = null
): [string, Record<string, unknown>][] {
    const sorted: [string, Record<string, unknown>][] = [],
        visiting = new Set<string>(),
        visited = new Set<string>(),

        opEntries = Object.entries(operationSpecs) as [string, Record<string, unknown>][],
        opMap = new Map(opEntries);

    for (const [opName] of opEntries) {
        const stack: DepFrame[] = [{ name: opName, phase: 'pre' }];

        while (stack.length > 0) {
            const frame = stack[stack.length - 1];

            if (visited.has(frame.name)) {
                stack.pop();
                continue;
            }

            if (frame.phase === 'pre') {
                if (visiting.has(frame.name)) {
                    throw new Error(
                        `Circular dependency detected in operations involving '${frame.name}'`
                    );
                }

                visiting.add(frame.name);

                const opDef = opMap.get(frame.name);
                if (!opDef) {
                    const parentHasOp = localParentADT &&
                        (localParentADT as ADTLike)._getTransformer &&
                        (localParentADT as ADTLike)._getTransformer(frame.name);
                    if (!parentHasOp && !frame.isAuxDep)
                        throw new Error(`Cannot merge: operation '${frame.name}' not found`);

                    // For aux deps that don't exist locally or on a parent,
                    // silently skip — fold registration validation will
                    // produce a specific error later.
                    visiting.delete(frame.name);
                    visited.add(frame.name);
                    stack.pop();
                    continue;
                }

                frame.phase = 'post';

                if (opDef[op as unknown as string] === 'merge' && opDef[operations as unknown as string]) {
                    const opList = opDef[operations as unknown as string] as string[];
                    for (let i = opList.length - 1; i >= 0; i--) {
                        const depName = opList[i];
                        if (!visited.has(depName))
                            stack.push({ name: depName, phase: 'pre' });

                    }
                }

                // Fold aux dependency: if this fold specifies `aux`, the
                // auxiliary fold(s) must be registered first.
                if (opDef[op as unknown as string] === 'fold') {
                    const foldSpec = opDef[spec as unknown as string] as Record<string, unknown> | undefined;
                    if (foldSpec) {
                        const { names: auxDeps } = parseAux(foldSpec['aux']);
                        if (auxDeps) {
                            for (let i = auxDeps.length - 1; i >= 0; i--) {
                                const depName = auxDeps[i];
                                if (!visited.has(depName))
                                    stack.push({ name: depName, phase: 'pre', isAuxDep: true });
                            }
                        }
                    }
                }

                // Map inverse dependency: the forward map must be registered
                // before a map that declares `inverse: 'forwardName'`.
                if (opDef[op as unknown as string] === 'map') {
                    const invTarget = getInverseTarget(opDef);
                    if (invTarget && !visited.has(invTarget))
                        stack.push({ name: invTarget, phase: 'pre' });
                }
            } else {
                stack.pop();
                visiting.delete(frame.name);
                visited.add(frame.name);

                const opDef = opMap.get(frame.name);
                if (opDef)
                    sorted.push([frame.name, opDef]);

            }
        }
    }

    return sorted;
}

// ---- Operation creation -----------------------------------------------------

function createOperations(
    ADT: ADTLike,
    variants: Record<string, unknown>,
    operationSpecs: SpecRecord,
    _typeParams: SpecRecord,
    protocols: ProtocolEntry[] = []
): void {
    const localParentADT = parentADTMap.get(ADT as unknown as object) as ADTLike | null ?? null,
        sortedOps = topologicalSortOperations(operationSpecs, localParentADT);

    for (const [opName, opDef] of sortedOps) {
        const opKind = opDef[op as unknown as string];

        if (opKind === 'fold')
            createFoldOperation(ADT, variants, opName, opDef, protocols);
        else if (opKind === 'unfold')
            createUnfoldOperation(ADT, variants, opName, opDef, protocols);
        else if (opKind === 'map')
            createMapOperation(ADT, variants, opName, opDef, protocols);
        else if (opKind === 'merge')
            createMergeOperation(ADT, variants, opName, opDef);

    }
}

/**
 * If `value` is a variant instance whose constructor defines an [invariant],
 * run a post-check against that invariant.  This ensures continuous invariant
 * enforcement on operation *results* — not just on the receiver (`self`).
 * Data instances are frozen, so the receiver's invariant cannot change; the
 * interesting post-condition is whether the produced value satisfies *its own*
 * variant's invariant.
 */
function checkResultInvariant(value: unknown, opName: string): void {
    if (value === null || value === undefined || typeof value !== 'object') return;
    const ctor = (value as { constructor?: VariantLike }).constructor;
    if (!ctor?._invariant) return;
    const variantName = (value as Record<symbol, unknown>)[VariantNameSymbol] as string | undefined;
    if (!variantName) return;
    checkInvariant(ctor._invariant as (i: unknown) => boolean, opName, variantName, 'post', value);
}

/**
 * Resolve algebraic property annotations for an operation:
 * prefers the explicitly declared `properties` key on the local spec; falls
 * back to the same key gathered from the matching protocol spec, if any.
 */
function resolvePropertiesWithFallback(
    spec: Record<string, unknown>,
    protocols: ProtocolEntry[],
    opName: string
): ReadonlySet<string> {
    const protoSpec = gatherProtocolSpec(protocols, opName);
    const source = spec.properties ?? protoSpec?.properties;
    return parseProperties(source, opName);
}

function createFoldOperation(
    ADT: ADTLike,
    variants: Record<string, unknown>,
    opName: string,
    opDef: Record<string, unknown>,
    protocols: ProtocolEntry[] = []
): void {
    // Exclude op and spec keys from handlers
    const { [op as unknown as string]: _op, [spec as unknown as string]: opSpec = {}, ...handlers } = opDef,
        opSpecObj = opSpec as Record<string, unknown>,

        localParentADT = parentADTMap.get(ADT as unknown as object) as ADTLike | null ?? null;
    let hasInput = hasInputSpec(opSpecObj),
        hasOutput = 'out' in opSpecObj;
    const finalSpec = { ...opSpecObj };

    if (localParentADT) {
        const parentRegistry = adtTransformers.get(localParentADT as unknown as object),
            parentTransformer = parentRegistry?.get(opName);

        if (parentTransformer && parentTransformer[HandlerMapSymbol]) {
            const parentHasInput = parentTransformer.inSpec !== undefined,
                parentHasOutput = parentTransformer.outSpec !== undefined,

                specKeys = Object.keys(opSpecObj),
                specIsEmpty = specKeys.length === 0;

            if (!specIsEmpty) {
                const childDefinesIn = 'in' in opSpecObj,
                    childDefinesOut = 'out' in opSpecObj;

                if (parentHasInput && !childDefinesIn) {
                    throw new Error(
                        `Cannot change operation '${opName}' from parameterized (method) to parameterless (getter) when extending`
                    );
                }
                if (!parentHasInput && childDefinesIn) {
                    throw new Error(
                        `Cannot change operation '${opName}' from parameterless (getter) to parameterized (method) when extending`
                    );
                }

                if (childDefinesIn && parentHasInput && opSpecObj['in'] !== parentTransformer.inSpec) {
                    throw new Error(
                        `Cannot change operation '${opName}' input specification when extending`
                    );
                }

                if (childDefinesOut && parentHasOutput && opSpecObj['out'] !== parentTransformer.outSpec) {
                    throw new Error(
                        `Cannot change operation '${opName}' output specification when extending`
                    );
                }
            }

            if (!hasInput && parentHasInput) {
                finalSpec['in'] = parentTransformer.inSpec;
                hasInput = true;
            }
            if (!hasOutput && parentHasOutput) {
                finalSpec['out'] = parentTransformer.outSpec;
                hasOutput = true;
            }
        }
    }

    // Extract + subcontract: compose child contracts with parent's (LSP rules)
    // Protocol contracts form the outermost layer (algebraic law); parent ADT
    // contracts compose on top; then the child implementation's own contracts.
    const parentFoldTransformer = localParentADT
        ? adtTransformers.get(localParentADT as unknown as object)?.get(opName)
        : undefined;
    const foldContracts = resolveOperationContracts(
        protocols, opName, opSpecObj, parentFoldTransformer?.contracts
    );

    const hasExtraParams = !hasInput && Object.values(handlers).some(h =>
        typeof h === 'function' && (h as HandlerFn).length > 1
    );

    assertCamelCase(opName, 'Fold operation');

    // Detect per-sort carrier out specification (e.g. out: { $E: Number, $S: undefined })
    let perSortOut: Record<string, unknown> | null = null;
    const resolvedOut = finalSpec['out'];
    if (resolvedOut !== null && resolvedOut !== undefined && typeof resolvedOut === 'object' && typeof resolvedOut !== 'function') {
        const sortInfo = sortDeclMap.get(ADT as unknown as object);
        if (!sortInfo || sortInfo.sortVariants.size === 0) {
            throw new Error(
                `Operation '${opName}': object-valued 'out' requires a multi-sorted ADT with declared sorts`
            );
        }
        const outObj = resolvedOut as Record<string, unknown>,
            outKeys = Object.keys(outObj),
            sortNames = [...sortInfo.sortVariants.keys()],
            missing = sortNames.filter(s => !(s in outObj)),
            extra = outKeys.filter(k => !sortNames.includes(k));

        if (missing.length > 0) {
            throw new Error(
                `Operation '${opName}': per-sort 'out' is missing sort(s): ${missing.join(', ')}`
            );
        }
        if (extra.length > 0) {
            throw new Error(
                `Operation '${opName}': per-sort 'out' has unknown sort(s): ${extra.join(', ')}`
            );
        }
        perSortOut = outObj;
    }

    const transformer = createFoldTransformer(
        opName,
        handlers as Record<string, HandlerFn>,
        finalSpec['out'] as ReturnType<typeof createFoldTransformer> extends { outSpec?: infer T } ? T : unknown,
        finalSpec['in'] as ReturnType<typeof createFoldTransformer> extends { inSpec?: infer T } ? T : unknown
    );
    // Store contracts on transformer for subcontracting inheritance
    if (foldContracts)
        transformer.contracts = foldContracts;
    // Store algebraic property annotations — fall back to protocol spec if implementor omitted them
    const foldProps = resolvePropertiesWithFallback(finalSpec as Record<string, unknown>, protocols, opName);
    if (foldProps.size > 0)
        transformer.properties = foldProps;
    ADT._registerTransformer(opName, transformer, false, variants);

    // DAG-safe fold cache — closure-scoped so each (ADT, opName) pair is
    // fully isolated.  Recursive children share the cache via this same
    // closure; re-entrant cross-ADT folds with the same operation name
    // use their own closure and never interfere.
    const canCache = !hasInput && !hasExtraParams;
    let dagCache: WeakMap<object, unknown> | null = null,
        dagCacheDepth = 0;
    const inProgress = new WeakSet<object>();
    // Tracks the node whose fold is currently executing (including handler
    // invocation).  Used to distinguish data‐structure cycles from
    // `this.opName` misuse: when `inProgress` fires and `currentNode ===
    // this`, the handler directly re‐entered the fold on itself; otherwise
    // the fold traversed back to an ancestor — a true cycle.
    let currentNode: object | null = null;

    // Handler resolution cache — maps variant constructors to their resolved
    // {handler, parentHandler} pair so the parent-chain walk runs at most once
    // per variant type.
    const handlerCache = new Map<object, { handler: HandlerFn; parentHandler: HandlerFn | null }>();

    // Spec entries cache — avoids re-allocating Object.entries(variantCtor.spec)
    // on every fold invocation.  Keyed by variant constructor.
    const specEntriesCache = new Map<object, [string, unknown][]>();

    // Contract depth counter — contracts only execute at the top-level call
    // (depth 1), not during recursive traversal of child nodes.  Since data
    // instances are frozen, invariants and demands are deterministic so
    // checking once at the entry point is sufficient.
    let contractDepth = 0;

    // Pre-check whether any contracts are defined (avoids repeated property
    // access inside the hot loop).
    const hasAnyContracts = foldContracts !== null;

    // Histomorphism support — when `history: true` in spec, each node's
    // foldedFields are cached so that handlers can access deeper sub-results
    // via the [history] symbol.
    const isHisto = finalSpec['history'] === true;
    let histoFieldsCache: WeakMap<object, Record<string | symbol, unknown>> | null = null,
        histoFieldsDepth = 0;

    // Zygomorphism support — when `aux` in spec, auxiliary fold results are
    // computed at each node for every recursive field and injected via the
    // [aux] symbol.  Accepted forms: `aux: 'foldName'` or `aux: ['f1','f2']`.
    const { names: auxNames, isArray: auxIsArray } = parseAux(finalSpec['aux']);
    const isZygo = auxNames !== null && auxNames.length > 0;

    // String form invariant: exactly one aux fold name.
    if (isZygo && !auxIsArray && auxNames!.length !== 1) {
        throw new Error(
            `Fold operation '${opName}': string-form aux must reference exactly one fold, ` +
            `got ${auxNames!.length}`
        );
    }

    // Validate that every auxiliary fold name references a known *fold*
    // operation on this ADT (own or inherited).  Because operations are
    // topologically sorted, the aux fold must already be registered by the
    // time we get here.
    //
    // The check is two-pronged:
    //   1. A transformer with HandlerMapSymbol must exist (fold transformer).
    //      This excludes unfolds, maps, and merges whose transformers lack
    //      that symbol.
    //   2. The operation must be present on the prototype chain (getter or
    //      method), confirming it is an instance-level fold, not a static
    //      ADT method like an unfold.
    //
    // We also record each aux fold's call shape (getter vs method) so the
    // runtime zygo block wraps lookups correctly.
    const auxIsMethod = new Map<string, boolean>();
    if (isZygo && auxNames) {
        for (const auxName of auxNames) {
            const transformer = ADT._getTransformer(auxName);
            if (!transformer || !transformer[HandlerMapSymbol]) {
                throw new Error(
                    `Fold operation '${opName}' references auxiliary fold '${auxName}' via 'aux', ` +
                    `but no fold named '${auxName}' exists on this data type`
                );
            }
            // Walk the prototype chain to find how the aux fold was installed:
            //   getter  (defineProperty with `get`) → direct value access
            //   method  (plain `value` on descriptor) → function call
            let proto: object | null = ADT.prototype as object;
            let found = false;
            while (proto) {
                const desc = Object.getOwnPropertyDescriptor(proto, auxName);
                if (desc) {
                    auxIsMethod.set(auxName, 'value' in desc);
                    found = true;
                    break;
                }
                proto = Object.getPrototypeOf(proto) as object | null;
            }
            if (!found) {
                throw new Error(
                    `Fold operation '${opName}' references auxiliary fold '${auxName}' via 'aux', ` +
                    `but '${auxName}' is not an instance-level fold on this data type`
                );
            }
        }
    }

    const foldImpl = function (this: Record<symbol, unknown>, ...args: unknown[]) {
        // Resolve wrapper contexts (created for parent dispatch) to the
        // underlying node so that re-entrancy guards, DAG caches, and
        // histo caches all key on the original node identity.
        const self: object = (this as Record<symbol, unknown>)[FoldContextOriginSymbol] as object ?? this;

        // Validate structured input spec at the outermost call only (contractDepth === 0
        // means we have not yet entered any recursive fold for this operation).
        // Only applies to the new structured object-literal form { key: Guard, ... };
        // primitive/constructor specs (Number, Function, etc.) are type-level annotations
        // and continue to be enforced via TypeScript alone, preserving contract ordering.
        if (contractDepth === 0 && hasInput && isObjectLiteral(opSpecObj['in'])) {
            validateTypeSpec(
                args[0],
                opSpecObj['in'] as Parameters<typeof validateTypeSpec>[1],
                opName,
                'input of type'
            );
        }

        if (canCache) {
            if (dagCacheDepth === 0)
                dagCache = new WeakMap();

            if (dagCache!.has(self))
                return dagCache!.get(self);

            dagCacheDepth++;
        }

        if (isHisto) {
            if (histoFieldsDepth === 0)
                histoFieldsCache = new WeakMap();
            histoFieldsDepth++;
        }

        contractDepth++;
        let prevNode: object | null = null;
        let entered = false;

        try {
            // Re-entrancy guard: detect cycles and `this.opName` misuse
            if (inProgress.has(self)) {
                if (currentNode !== null && currentNode !== self) {
                    // A descendant's Family field points back to this node —
                    // a true cycle in the data structure.
                    throw new Error(
                        `Cycle detected in data structure: fold operation '${opName}' encountered the same ` +
                        `node twice during recursive traversal. Data ADTs must be acyclic (trees or DAGs).`
                    );
                }
                // The handler called this.opName on itself directly.
                throw new Error(
                    `Circular fold detected: operation '${opName}' re-entered on the same instance during its own evaluation. ` +
                    `Use destructured fields for structural recursion instead of \`this.${opName}\`.`
                );
            }

            prevNode = currentNode;
            currentNode = self;
            inProgress.add(self);
            entered = true;

            const variantName = (self as Record<symbol, unknown>)[VariantNameSymbol] as string,
                variantCtor = (self as { constructor: VariantLike }).constructor;

            // ---- Cached handler resolution ----
            let resolved = handlerCache.get(variantCtor as object);
            if (!resolved) {
                let handlerFound: HandlerFn | null = null,
                    parentHandlerFound: HandlerFn | null = null,
                    foundAtADT: ADTLike | null = null,
                    currentSearchADT: ADTLike | null = ADT;

                while (currentSearchADT) {
                    const registry = adtTransformers.get(currentSearchADT as unknown as object),
                        localTransformer = registry?.get(opName);

                    if (localTransformer && localTransformer.getCtorTransform) {
                        const handlerMap = localTransformer[HandlerMapSymbol] as Record<string, HandlerFn> | undefined;
                        if (handlerMap && (handlerMap[variantName] || handlerMap['_'])) {
                            handlerFound = localTransformer.getCtorTransform(variantCtor as unknown as VariantConstructorLike);
                            foundAtADT = currentSearchADT;
                            break;
                        }
                    }
                    currentSearchADT = parentADTMap.get(currentSearchADT as unknown as object) as ADTLike | null ?? null;
                }

                if (!handlerFound)
                    throw new Error(`No handler for variant '${variantName}' in fold operation '${opName}'`);

                if (foundAtADT) {
                    let searchParent = parentADTMap.get(foundAtADT as unknown as object) as ADTLike | null ?? null;
                    while (searchParent) {
                        const parentRegistry = adtTransformers.get(searchParent as unknown as object),
                            parentTransformer = parentRegistry?.get(opName);

                        if (parentTransformer && parentTransformer.getCtorTransform) {
                            const parentHandlerMap = parentTransformer[HandlerMapSymbol] as Record<string, HandlerFn> | undefined;
                            if (parentHandlerMap && (parentHandlerMap[variantName] || parentHandlerMap['_'])) {
                                parentHandlerFound = parentTransformer.getCtorTransform(variantCtor as unknown as VariantConstructorLike);
                                break;
                            }
                        }
                        searchParent = parentADTMap.get(searchParent as unknown as object) as ADTLike | null ?? null;
                    }
                }

                resolved = { handler: handlerFound, parentHandler: parentHandlerFound };
                handlerCache.set(variantCtor as object, resolved);
            }

            const handler = resolved.handler,
                parentHandler = resolved.parentHandler;

            // ---- Cached spec entries ----
            let specEntries = specEntriesCache.get(variantCtor as object);
            if (!specEntries) {
                specEntries = variantCtor.spec ? Object.entries(variantCtor.spec) as [string, unknown][] : [];
                specEntriesCache.set(variantCtor as object, specEntries);
            }

            const foldedFields: Record<string | symbol, unknown> = {};
            for (const [fieldName, fieldSpec] of specEntries) {
                if (isFamilyRefSpec(fieldSpec) || isSortRefSpec(fieldSpec)) {
                    const fieldValue = (self as Record<string, unknown>)[fieldName];
                    if (hasInput || hasExtraParams) {
                        foldedFields[fieldName] = (...params: unknown[]) =>
                            (fieldValue as Record<string, (...p: unknown[]) => unknown>)[opName](...params);
                    } else
                        foldedFields[fieldName] = (fieldValue as Record<string, unknown>)[opName];

                } else {
                    let val = (self as Record<string, unknown>)[fieldName];
                    // Map-fold fusion: pre-apply map transform to T-typed fields
                    // so the fold handler sees mapped values without an
                    // intermediate structure being created.
                    if (_currentMapFoldPreTransform &&
                        fieldSpec && typeof fieldSpec === 'object' && TypeParamSymbol in fieldSpec) {
                        const paramName = (fieldSpec as Record<symbol, string>)[TypeParamSymbol],
                            fn = _currentMapFoldPreTransform.getParamTransform?.(paramName) ??
                                _currentMapFoldPreTransform.getAtomTransform?.(fieldName);
                        if (fn)  val = fn(val);
                    }
                    foldedFields[fieldName] = val;
                }
            }

            // Histomorphism: inject [history] into foldedFields.
            // history is an object keyed by recursive field names, where each
            // value is the child's own foldedFields (which recursively carries
            // its own [history]).
            // For parameterized folds, history entries are thunks (like the
            // recursive fields themselves) that resolve after the child fold runs.
            if (isHisto && histoFieldsCache) {
                if (hasInput || hasExtraParams) {
                    // Parameterized: history entries are lazy — the child fold
                    // hasn't run yet. We create getters that read from the cache
                    // after the child thunk has been invoked.
                    const historyObj: Record<string | symbol, unknown> = {};
                    for (const [fieldName, fieldSpec] of specEntries) {
                        if (isFamilyRefSpec(fieldSpec) || isSortRefSpec(fieldSpec)) {
                            const fieldValue = (self as Record<string, unknown>)[fieldName];
                            Object.defineProperty(historyObj, fieldName, {
                                get: () => histoFieldsCache?.get(fieldValue as object),
                                enumerable: true,
                                configurable: true
                            });
                        }
                    }
                    (foldedFields as Record<symbol, unknown>)[history as unknown as symbol] = historyObj;
                } else {
                    // Non-parameterized: children have already been folded
                    // (bottom-up), so their foldedFields are in the cache.
                    const historyObj: Record<string | symbol, unknown> = {};
                    for (const [fieldName, fieldSpec] of specEntries) {
                        if (isFamilyRefSpec(fieldSpec) || isSortRefSpec(fieldSpec)) {
                            const fieldValue = (self as Record<string, unknown>)[fieldName];
                            const childFields = histoFieldsCache.get(fieldValue as object);
                            if (childFields)
                                historyObj[fieldName] = childFields;
                        }
                    }
                    (foldedFields as Record<symbol, unknown>)[history as unknown as symbol] = historyObj;
                }
            }

            // Zygomorphism: compute auxiliary fold results at each recursive
            // child and inject them via [aux].
            // String form → flat shape: auxObj[fieldName] = auxResult
            // Array form  → nested:     auxObj[foldName][fieldName] = auxResult
            if (isZygo && auxNames) {
                const auxObj: Record<string, unknown> = {};
                if (auxIsArray)
                    for (const auxName of auxNames) auxObj[auxName] = {};

                // String form uses a single aux fold name; array form
                // iterates all names.  Kept as distinct branches so flat
                // mode cannot accidentally overwrite keys.
                const singleAuxName = auxIsArray ? null : auxNames[0];
                for (const [fieldName, fieldSpec] of specEntries) {
                    if (isFamilyRefSpec(fieldSpec) || isSortRefSpec(fieldSpec)) {
                        const fieldValue = (self as Record<string, unknown>)[fieldName];
                        if (singleAuxName !== null) {
                            // Flat shape: auxObj[fieldName]
                            // Use the aux fold's own call shape, not the primary fold's.
                            auxObj[fieldName] = auxIsMethod.get(singleAuxName)
                                ? (...params: unknown[]) =>
                                    (fieldValue as Record<string, (...p: unknown[]) => unknown>)[singleAuxName](...params)
                                : (fieldValue as Record<string, unknown>)[singleAuxName];
                        } else {
                            // Nested shape: auxObj[foldName][fieldName]
                            for (const auxName of auxNames) {
                                const isAuxParam = auxIsMethod.get(auxName) ?? false;
                                (auxObj[auxName] as Record<string, unknown>)[fieldName] = isAuxParam
                                    ? (...params: unknown[]) =>
                                        (fieldValue as Record<string, (...p: unknown[]) => unknown>)[auxName](...params)
                                    : (fieldValue as Record<string, unknown>)[auxName];
                            }
                        }
                    }
                }
                (foldedFields as Record<symbol, unknown>)[aux as unknown as symbol] = auxObj;
            }

            // Histomorphism: cache this node's foldedFields so ancestor nodes
            // can access them through [history] chains.  This must happen
            // *after* all symbol injections ([history], [aux]) so that the
            // cached object fully reflects what the handler receives.
            if (isHisto && histoFieldsCache)
                histoFieldsCache.set(self, foldedFields as Record<string | symbol, unknown>);

            let context: object = self;

            if (parentHandler) {
                context = Object.create(self);
                (context as Record<symbol, unknown>)[FoldContextOriginSymbol] = self;

                if (hasInput || hasExtraParams) {
                    Object.defineProperty(context, parent, {
                        get: () => (...parentArgs: unknown[]) =>
                            (parentHandler as HandlerFn).call(self, foldedFields, ...parentArgs),
                        enumerable: false,
                        configurable: true
                    });
                } else {
                    Object.defineProperty(context, parent, {
                        get: () => (parentHandler as HandlerFn).call(self, foldedFields),
                        enumerable: false,
                        configurable: true
                    });
                }
            }

            // ---- Parameterized ADT context for Family(T) ----
            // Set the module-level _currentFoldParameterizedADT just before
            // the handler runs (not during recursive field evaluation) so
            // that Family(T) in the handler closure resolves correctly.
            // Resolved via a helper to keep its locals off this hot frame.
            const prevFoldADT = _currentFoldParameterizedADT;
            _currentFoldParameterizedADT = resolveFoldParameterizedADT(variantCtor);
            try {
                // Resolve per-sort carrier: if the out spec is per-sort,
                // pick the carrier matching this variant's sort.
                const effectiveOut: TypeSpec = (perSortOut !== null
                    ? perSortOut[(self as Record<symbol, unknown>)[SortNameSymbol] as string]
                    : opSpecObj['out']) as TypeSpec;

                // ---- Contract enforcement (Design by Contract) ----
                // Demands/ensures/invariants only enforce at the top-level call
                // (contractDepth === 1), not during recursive traversal of child
                // nodes.  Since data instances are frozen, invariants and demands
                // on a node are deterministic — checking once at the entry point
                // is sufficient.  Rescue, however, is an error-recovery mechanism
                // and must remain active at every recursion level.

                // Get the invariant function for this instance's variant
                const variantInvariantFn: ((instance: object) => boolean) | null =
                    variantCtor
                        ? (variantCtor as VariantLike)._invariant ?? null
                        : null;

                const checked = contractDepth === 1
                && (hasAnyContracts || variantInvariantFn !== null);
                let result: unknown;

                if (checked) {
                    const variantCtx = variantName || 'unknown';

                    // 1. Invariant pre-check on self
                    if (variantInvariantFn)
                        checkInvariant(variantInvariantFn as (i: unknown) => boolean, opName, variantCtx, 'pre', self);

                    // 2. Demands check (precondition)
                    if (foldContracts?.demands)
                        checkDemands(foldContracts.demands, opName, variantCtx, self, args);

                    // 3. Capture old state for ensures (reference to self since data is frozen/immutable)
                    const old = self;

                    // Helper to execute the handler body + ensures
                    const executeBody = (...bodyArgs: unknown[]): unknown => {
                        const bodyResult = (handler as HandlerFn).call(context, foldedFields, ...bodyArgs);
                        if (hasOutput)
                            validateReturnType(bodyResult, effectiveOut, opName);

                        // 4. Ensures check (postcondition)
                        if (foldContracts?.ensures)
                            checkEnsures(foldContracts.ensures, opName, variantCtx, self, old, bodyResult, bodyArgs);

                        return bodyResult;
                    };

                    try {
                        result = executeBody(...args);
                    } catch (error) {
                    // 5. Rescue handler for body/ensures errors
                        const rescued = tryRescue(foldContracts, error, self, args, executeBody, opName, variantCtx);
                        if (rescued !== null) {
                            // 6. Invariant post-check on result (if it's a variant with an invariant)
                            checkResultInvariant(rescued.result, opName);
                            if (canCache) dagCache!.set(self, rescued.result);
                            return rescued.result;
                        }
                        throw error;
                    }

                    // 6. Invariant post-check on result (if it's a variant with an invariant)
                    checkResultInvariant(result, opName);
                } else if (foldContracts?.rescue) {
                // Inner recursion level with rescue active:
                // Skip demands/ensures/invariant but still wrap in rescue
                // so handler errors can be recovered at every level.
                    try {
                        result = (handler as HandlerFn).call(context, foldedFields, ...args);
                        if (hasOutput)
                            validateReturnType(result, effectiveOut, opName);
                    } catch (error) {
                        const innerBody = (...newArgs: unknown[]): unknown => {
                            const r = (handler as HandlerFn).call(context, foldedFields, ...newArgs);
                            if (hasOutput)
                                validateReturnType(r, effectiveOut, opName);
                            return r;
                        };
                        const rescued = tryRescue(foldContracts, error, self, args, innerBody, opName, variantName || 'unknown');
                        if (rescued !== null) {
                            if (canCache) dagCache!.set(self, rescued.result);
                            return rescued.result;
                        }
                        throw error;
                    }
                } else {
                // Fast path: no active contracts — call handler directly,
                // skipping closure allocation for executeBody and rescue machinery.
                    result = (handler as HandlerFn).call(context, foldedFields, ...args);
                    if (hasOutput)
                        validateReturnType(result, effectiveOut, opName);
                }

                if (canCache) dagCache!.set(self, result);

                return result;
            } finally {
                _currentFoldParameterizedADT = prevFoldADT;
            }
        } finally {
            contractDepth--;
            if (entered) {
                currentNode = prevNode;
                inProgress.delete(self);
            }
            if (canCache) {
                dagCacheDepth--;
                if (dagCacheDepth === 0) dagCache = null;
            }
            if (isHisto) {
                histoFieldsDepth--;
                if (histoFieldsDepth === 0) histoFieldsCache = null;
            }
        }
    };

    installOperation(ADT.prototype, opName, foldImpl, !hasInput && !hasExtraParams);

    // Install any aliases declared via .as(...)
    const foldAliases = getAliases(opDef);
    if (foldAliases?.length) {
        const isGetter = !hasInput && !hasExtraParams;
        for (const aliasName of foldAliases) {
            assertCamelCase(aliasName, 'Fold alias');
            if (ADT._getTransformer(aliasName) !== undefined)
                throw new Error(`Fold alias '${aliasName}' conflicts with existing operation '${aliasName}'`);
            ADT._registerTransformer(aliasName, transformer, false, variants);
            installOperation(ADT.prototype, aliasName, foldImpl, isGetter);
        }
    }
}

// ---- Unfold helpers ---------------------------------------------------------

/**
 * Walk the `parentADTMap` chain to find a variant by name, creating
 * a child-bound copy when found.  Returns `undefined` when no ancestor
 * provides the variant.
 */
function resolveAncestorVariant(
    childADT: ADTLike,
    variantName: string
): unknown | undefined {
    let ancestor: object | undefined =
        parentADTMap.get(childADT as unknown as object) as object | undefined;
    while (ancestor) {
        const ancestorVariant = (ancestor as Record<string, unknown>)[variantName];
        if (ancestorVariant) {
            return createChildVariant(
                childADT, variantName,
                ancestorVariant as VariantLike | SingletonInstance
            );
        }

        ancestor = parentADTMap.get(ancestor) as object | undefined;
    }
    return undefined;
}

/**
 * Core unfold installation: registers the transformer and creates the
 * static ADT method that unfolds a seed into a recursive structure.
 */
function installUnfoldImpl(
    ADT: ADTLike,
    variants: Record<string, unknown>,
    opName: string,
    cases: Record<string, (seed: unknown) => unknown | null>,
    opSpecObj: Record<string, unknown>,
    protocols: ProtocolEntry[] = []
): void {
    // Extract + subcontract: compose child contracts with parent's (LSP rules)
    // Protocol contracts form the outermost layer; parent ADT contracts compose on top.
    const localParentADT = parentADTMap.get(ADT as unknown as object) as ADTLike | null ?? null;
    const parentUnfoldTransformer = localParentADT
        ? adtTransformers.get(localParentADT as unknown as object)?.get(opName)
        : undefined;
    const unfoldContracts = resolveOperationContracts(
        protocols, opName, opSpecObj, parentUnfoldTransformer?.contracts
    );

    const hasAnyUnfoldContracts = unfoldContracts !== null;
    let unfoldContractDepth = 0;

    const generator = (seed: unknown) => seed,
        transformer = createTransformer({
            name: opName,
            inSpec: opSpecObj['in'] as Parameters<typeof createTransformer>[0]['inSpec'],
            generator
        });

    (transformer as unknown as Record<string, unknown>).unfoldCases = cases;
    (transformer as unknown as Record<string, unknown>).unfoldSpec = opSpecObj;
    // Store contracts on transformer for subcontracting inheritance
    if (unfoldContracts)
        transformer.contracts = unfoldContracts;
    // Store algebraic property annotations — fall back to protocol spec if implementor omitted them
    const unfoldProps = resolvePropertiesWithFallback(opSpecObj as Record<string, unknown>, protocols, opName);
    if (unfoldProps.size > 0)
        transformer.properties = unfoldProps;

    ADT._registerTransformer(opName, transformer, false, variants);

    // Resolve variants for all case names, including inherited ones
    const resolvedVariants: Record<string, unknown> = { ...variants };
    for (const caseName of Object.keys(cases)) {
        if (!(caseName in resolvedVariants)) {
            const fromAncestor = resolveAncestorVariant(ADT, caseName);
            if (fromAncestor) resolvedVariants[caseName] = fromAncestor;
        }
    }

    (ADT as Record<string, unknown>)[opName] = function unfoldImpl(seed: unknown): unknown {
        if (hasInputSpec(opSpecObj)) {
            validateTypeSpec(
                seed,
                opSpecObj['in'] as Parameters<typeof validateTypeSpec>[1],
                opName,
                'input of type'
            );
        }

        unfoldContractDepth++;

        const executeUnfold = (currentSeed: unknown): unknown => {
            for (const [variantName, caseFn] of Object.entries(cases)) {
                const result = (caseFn as (s: unknown) => unknown)(currentSeed);
                if (result !== null && result !== undefined) {
                    const variantValue = resolvedVariants[variantName] ||
                        (ADT as Record<string, unknown>)[variantName];
                    if (!variantValue)
                        throw new Error(`Unknown variant '${variantName}' in unfold '${opName}'`);


                    if (typeof variantValue === 'object' && Object.isFrozen(variantValue))
                        return variantValue;


                    const Variant = variantValue as VariantLike;
                    if (Variant.spec) {
                        const transformedResult = { ...(result as Record<string, unknown>) };
                        for (const [fieldName, fieldSpec] of Object.entries(Variant.spec)) {
                            if (isFamilyRefSpec(fieldSpec) || isSortRefSpec(fieldSpec)) {
                                if (fieldName in (result as object)) {
                                    transformedResult[fieldName] =
                                        (ADT as Record<string, unknown>)[opName] as ((s: unknown) => unknown);
                                    transformedResult[fieldName] =
                                        ((ADT as Record<string, unknown>)[opName] as (s: unknown) => unknown)(
                                            (result as Record<string, unknown>)[fieldName]
                                        );
                                }
                            }
                        }
                        return (Variant as unknown as (f: object) => unknown)(transformedResult);
                    }

                    return (Variant as unknown as (f: object) => unknown)(result as object);
                }
            }

            throw new Error(`No case matched in unfold '${opName}'`);
        };

        // Only check demands/ensures at the top-level entry (depth 1).
        // Recursive calls re-enter unfoldImpl but data is immutable,
        // so intermediate demands/ensures checks are redundant.
        // Rescue, however, is an error-recovery mechanism and must
        // remain active at every recursion level.
        const checked = unfoldContractDepth === 1 && hasAnyUnfoldContracts;

        if (checked) {
            let finalResult: unknown;
            try {
                // Contract: demands check
                if (unfoldContracts!.demands)
                    checkDemands(unfoldContracts!.demands, opName, 'unfold', null, [seed]);

                finalResult = executeUnfold(seed);

                // Contract: ensures check
                if (unfoldContracts!.ensures)
                    checkEnsures(unfoldContracts!.ensures, opName, 'unfold', null, seed, finalResult, [seed]);
            } catch (error) {
                const rescued = tryRescue(unfoldContracts, error, null, [seed],
                    (...newArgs: unknown[]) =>
                        ((ADT as Record<string, unknown>)[opName] as (s: unknown) => unknown)(newArgs[0]),
                    opName, 'unfold');
                if (rescued !== null) return rescued.result;
                throw error;
            } finally {
                unfoldContractDepth--;
            }

            return finalResult;
        } else if (unfoldContracts?.rescue) {
            // Inner recursion level with rescue active
            try {
                const innerResult = executeUnfold(seed);
                return innerResult;
            } catch (error) {
                const rescued = tryRescue(unfoldContracts, error, null, [seed],
                    (...newArgs: unknown[]) =>
                        ((ADT as Record<string, unknown>)[opName] as (s: unknown) => unknown)(newArgs[0]),
                    opName, 'unfold');
                if (rescued !== null) return rescued.result;
                throw error;
            } finally {
                unfoldContractDepth--;
            }
        } else {
            // Fast path: no contracts active or recursive call
            try {
                return executeUnfold(seed);
            } finally {
                unfoldContractDepth--;
            }
        }
    };
}

/**
 * Inherit unfold operations from a parent ADT, rebound to the child's
 * variant set.  Skips operations the child explicitly overrides.
 */
function inheritUnfoldOperations(
    childADT: ADTLike,
    ownVariants: Record<string, unknown>,
    parentADT: ADTLike,
    childOperations: Record<string, unknown>,
    protocols: ProtocolEntry[] = []
): void {
    const rawParent = (parentADT as { _rawADT?: ADTLike })._rawADT || parentADT,
        parentRegistry = adtTransformers.get(rawParent as unknown as object);
    if (!parentRegistry) return;

    for (const [name, transformer] of parentRegistry) {
        const tx = transformer as unknown as Record<string, unknown>;
        // Only inherit unfold operations not overridden by the child
        if (!tx.unfoldCases || name in childOperations) continue;

        // Strip demands/ensures/rescue from the inherited spec so that
        // installUnfoldImpl inherits the parent's contracts verbatim
        // (via the transformer lookup) instead of composing them with
        // an identical copy extracted from the spec.
        const parentSpec = (tx.unfoldSpec ?? {}) as Record<string, unknown>;
        const { demands: _, ensures: _e, rescue: _r, ...cleanSpec } = parentSpec;

        installUnfoldImpl(
            childADT, ownVariants, name,
            tx.unfoldCases as Record<string, (seed: unknown) => unknown | null>,
            cleanSpec as Record<string, unknown>,
            protocols
        );
    }
}

function createUnfoldOperation(
    ADT: ADTLike,
    variants: Record<string, unknown>,
    opName: string,
    opDef: Record<string, unknown>,
    protocols: ProtocolEntry[] = []
): void {
    const {
        [op as unknown as string]: _op,
        [spec as unknown as string]: opSpec = {},
        cases: casesObj,
        ...rest
        } = opDef,
        cases = (casesObj || rest) as Record<string, (seed: unknown) => unknown | null>,
        opSpecObj = opSpec as Record<string, unknown>;

    assertPascalCase(opName, 'Unfold operation');


    if (opSpecObj && 'in' in opSpecObj && opSpecObj['in'] === Function)
        throw new TypeError(`cannot use Function as 'in' guard`);


    installUnfoldImpl(ADT, variants, opName, cases, opSpecObj, protocols);

    // Install any aliases declared via .as(...)
    const unfoldAliases = getAliases(opDef);
    if (unfoldAliases?.length) {
        const transformer = ADT._getTransformer(opName);
        if (transformer) {
            for (const aliasName of unfoldAliases) {
                assertPascalCase(aliasName, 'Unfold alias');
                if (ADT._getTransformer(aliasName) !== undefined)
                    throw new Error(`Unfold alias '${aliasName}' conflicts with existing operation '${aliasName}'`);
                ADT._registerTransformer(aliasName, transformer, false, variants);
                (ADT as Record<string, unknown>)[aliasName] = (ADT as Record<string, unknown>)[opName];
            }
        }
    }
}

// ---- Map implementation factory ---------------------------------------------

/**
 * Build a map implementation function.  Used by both `createMapOperation`
 * (for user-declared maps) and `fuseConsecutiveMaps` (for synthetic fused maps).
 *
 * @param getTransform  Given a type-parameter name and a field name, return the
 *   transform function to apply (or undefined to copy as-is).
 * @param hasExtraParams  When true, the map is installed as a method that
 *   forwards extra arguments through the recursive descent.
 */
function buildMapImpl(
    ADT: ADTLike,
    variants: Record<string, unknown>,
    opName: string,
    getTransform: (paramName: string, fieldName: string) => HandlerFn | undefined,
    hasExtraParams: boolean
): (...args: unknown[]) => unknown {
    return function (this: Record<symbol, unknown>, ...args: unknown[]) {
        const variantName = this[VariantNameSymbol] as string,
            variant = variants[variantName] || (ADT as Record<string, unknown>)[variantName];

        if (!variant || typeof variant !== 'function')
            return this;

        const variantSpec = (variant as VariantLike).spec;
        if (!variantSpec) return this;

        const mappedFields: Record<string, unknown> = {};
        for (const [fieldName, fieldSpec] of Object.entries(variantSpec)) {
            const value = (this as Record<string, unknown>)[fieldName];

            if (isFamilyRefSpec(fieldSpec) || isSortRefSpec(fieldSpec)) {
                if (hasExtraParams && args.length > 0) {
                    mappedFields[fieldName] =
                        (value as Record<string, (...a: unknown[]) => unknown>)[opName](...args);
                } else
                    mappedFields[fieldName] = (value as Record<string, unknown>)[opName];

            } else if (fieldSpec && typeof fieldSpec === 'object' && TypeParamSymbol in fieldSpec) {
                const paramName = (fieldSpec as Record<symbol, string>)[TypeParamSymbol],
                    transformFn = getTransform(paramName, fieldName);
                if (transformFn)
                    mappedFields[fieldName] = transformFn(value, ...args);
                else
                    mappedFields[fieldName] = value;

            } else
                mappedFields[fieldName] = value;

        }

        const result = (variant as (f: object) => unknown)(mappedFields);

        // Round-trip verification for invertible maps (allegory ensures)
        if (!hasExtraParams && !_inRoundTripCheck) {
            const inverseName = getInverse(ADT, opName);
            if (inverseName) {
                _inRoundTripCheck = true;
                try {
                    const roundTripped = (result as Record<string, unknown>)[inverseName] as Record<string, unknown>;
                    for (const [fn, fs] of Object.entries(variantSpec)) {
                        if (fs && typeof fs === 'object' && TypeParamSymbol in fs) {
                            if (roundTripped[fn] !== (this as Record<string, unknown>)[fn]) {
                                throw new EnsuresError(
                                    opName,
                                    `Round-trip failed: ${opName} \u2192 ${inverseName} did not restore field '${fn}'`
                                );
                            }
                        }
                    }
                } finally {
                    _inRoundTripCheck = false;
                }
            }
        }

        return result;
    };
}

function createMapOperation(
    ADT: ADTLike,
    variants: Record<string, unknown>,
    opName: string,
    opDef: Record<string, unknown>,
    protocols: ProtocolEntry[] = []
): void {
    const {
        [op as unknown as string]: _op,
        [spec as unknown as string]: _opSpec = {},
        ...transformers
    } = opDef;

    assertCamelCase(opName, 'Map operation');

    // ---- Inverse registration (allegory support) ----
    const inverseTarget = getInverseTarget(opDef);

    if (inverseTarget) {
        // Validate the forward operation exists
        const forwardTransformer = ADT._getTransformer(inverseTarget);
        if (!forwardTransformer) {
            throw new Error(
                `Map '${opName}' declares inverse: '${inverseTarget}', but '${inverseTarget}' is not a registered operation`
            );
        }

        // Enforce 1:1 — the forward operation must not already have an inverse
        const existing = getInverse(ADT, inverseTarget);
        if (existing) {
            throw new Error(
                `Map '${opName}' declares inverse: '${inverseTarget}', but '${inverseTarget}' already has inverse '${existing}' (inverses must be 1:1)`
            );
        }

        // Register bidirectional link
        let reg = inverseRegistry.get(ADT as unknown as object);
        if (!reg) {
            reg = new Map();
            inverseRegistry.set(ADT as unknown as object, reg);
        }
        reg.set(opName, inverseTarget);
        reg.set(inverseTarget, opName);
    }


    const hasExtraParams = Object.values(transformers).some(t =>
            typeof t === 'function' && (t as HandlerFn).length > 1
        ),

        transformer = createTransformer({
            name: opName,
            getParamTransform: (paramName) => transformers[paramName] as HandlerFn | undefined,
            getAtomTransform: (fieldName) => transformers[fieldName] as HandlerFn | undefined
        });

    // Store algebraic property annotations — fall back to protocol spec if implementor omitted them
    const mapSpec = (_opSpec ?? {}) as Record<string, unknown>;
    const mapProps = resolvePropertiesWithFallback(mapSpec, protocols, opName);
    if (mapProps.size > 0)
        transformer.properties = mapProps;

    ADT._registerTransformer(opName, transformer, false, variants);

    const mapImpl = buildMapImpl(
        ADT, variants, opName,
        (paramName, fieldName) =>
            transformers[paramName] as HandlerFn | undefined ??
            transformers[fieldName] as HandlerFn | undefined,
        hasExtraParams
    );

    installOperation(ADT.prototype, opName, mapImpl, !hasExtraParams);

    // Install any aliases declared via .as(...)
    const mapAliases = getAliases(opDef);
    if (mapAliases?.length) {
        for (const aliasName of mapAliases) {
            assertCamelCase(aliasName, 'Map alias');
            if (ADT._getTransformer(aliasName) !== undefined)
                throw new Error(`Map alias '${aliasName}' conflicts with existing operation '${aliasName}'`);
            ADT._registerTransformer(aliasName, transformer, false, variants);
            installOperation(ADT.prototype, aliasName, mapImpl, !hasExtraParams);
        }
    }
}

// ---- Map-map fusion ---------------------------------------------------------

/**
 * Eliminate consecutive inverse pairs from a merge pipeline.
 *
 * When two adjacent operations in the pipeline are declared inverses
 * of each other, their composition is the identity and both can be
 * removed.  This is applied repeatedly until no more pairs remain.
 *
 * Example: `['double', 'halve', 'increment']` where `halve` is the
 * declared inverse of `double` → fused to `['increment']`.
 */
function fuseInversePairs(ADT: ADTLike, opList: string[]): string[] {
    let result = opList;
    let changed = true;

    while (changed) {
        changed = false;
        const next: string[] = [];
        let i = 0;

        while (i < result.length) {
            if (i + 1 < result.length) {
                const a = result[i], b = result[i + 1];
                if (getInverse(ADT, a) === b) {
                    // a and b are inverses — eliminate both
                    i += 2;
                    changed = true;
                    continue;
                }
            }
            next.push(result[i]);
            i++;
        }

        result = next;
    }

    return result;
}

// Counter for generating unique synthetic fused-map names.
let _fusedMapCounter = 0;

/**
 * Fuse runs of consecutive getter-map operations into a single map.
 *
 * Given `['double', 'triple', 'increment']` where `double` and `triple`
 * are both map getters, the first two are replaced by a single synthetic
 * map whose transforms are `triple ∘ double` for each type parameter.
 * This eliminates the intermediate structure between the two maps.
 *
 * Only getter maps (no extra parameters) are eligible for fusion.
 * The function returns a new opList with fused names substituted.
 */
function fuseConsecutiveMaps(
    ADT: ADTLike,
    variants: Record<string, unknown>,
    opList: string[]
): string[] {
    const result: string[] = [];
    let i = 0;

    while (i < opList.length) {
        const t = ADT._getTransformer(opList[i]);

        // Start of a potential map run — must be a getter map
        if (t && isMapTransformer(t) && isGetterOp(ADT, opList[i])) {
            const run: { name: string; transformer: Transformer }[] =
                [{ name: opList[i], transformer: t }];
            let j = i + 1;

            while (j < opList.length) {
                const next = ADT._getTransformer(opList[j]);
                if (next && isMapTransformer(next) && isGetterOp(ADT, opList[j])) {
                    run.push({ name: opList[j], transformer: next });
                    j++;
                } else
                    break;

            }

            if (run.length >= 2) {
                // Compose transforms: for each param/atom, chain
                // runN ∘ ... ∘ run1 (left-to-right pipeline order).
                const fusedName = `_fused${_fusedMapCounter++}`;

                const composedGetParamTransform = (paramName: string): HandlerFn | undefined => {
                    let composed: HandlerFn | undefined;
                    for (const { transformer: tr } of run) {
                        const fn = tr.getParamTransform?.(paramName);
                        if (fn)  composed = composed ? composeFunctions(composed, fn) as HandlerFn : fn;
                    }
                    return composed;
                };

                const composedGetAtomTransform = (fieldName: string): HandlerFn | undefined => {
                    let composed: HandlerFn | undefined;
                    for (const { transformer: tr } of run) {
                        const fn = tr.getAtomTransform?.(fieldName);
                        if (fn)  composed = composed ? composeFunctions(composed, fn) as HandlerFn : fn;
                    }
                    return composed;
                };

                // Register the composed transformer for introspection
                const fusedTransformer = createTransformer({
                    name: fusedName,
                    getParamTransform: composedGetParamTransform,
                    getAtomTransform: composedGetAtomTransform
                });
                ADT._registerTransformer(fusedName, fusedTransformer, false, variants);

                // Install the fused map getter on the prototype
                const fusedImpl = buildMapImpl(
                    ADT, variants, fusedName,
                    (paramName, fieldName) =>
                        composedGetParamTransform(paramName) ?? composedGetAtomTransform(fieldName),
                    false
                );
                Object.defineProperty(ADT.prototype, fusedName, {
                    get: fusedImpl,
                    enumerable: false,       // internal — not user-visible
                    configurable: true
                });

                result.push(fusedName);
                i = j;
            } else {
                result.push(opList[i]);
                i++;
            }
        } else {
            result.push(opList[i]);
            i++;
        }
    }

    return result;
}

function createMergeOperation(
    ADT: ADTLike,
    variants: Record<string, unknown>,
    opName: string,
    opDef: Record<string, unknown>
): void {
    let opList = opDef[operations as unknown as string] as string[];

    /** Walk the prototype chain to find a property descriptor. */
    function getPrototypeDescriptor(propName: string): PropertyDescriptor | undefined {
        let proto: object | null = ADT.prototype as object;
        while (proto) {
            const desc = Object.getOwnPropertyDescriptor(proto, propName);
            if (desc) return desc;
            proto = Object.getPrototypeOf(proto);
        }
        return undefined;
    }

    if (!Array.isArray(opList) || opList.length === 0)
        throw new Error(`Merge requires a non-empty array of operation names`);


    if (opList.length < 2)
        throw new Error(`Merge requires at least 2 operations`);

    // ---- Allegory law: inverse pair elimination ----
    // When consecutive operations in the pipeline are declared inverses
    // of each other (f followed by f⁻¹, or f⁻¹ followed by f), they
    // compose to the identity and can be eliminated entirely.
    // This is the allegory law: f° ∘ f = id.
    opList = fuseInversePairs(ADT, opList);

    // ---- Map-map fusion ----
    // Consecutive getter-map operations are composed into a single
    // synthetic map whose transforms are the pipeline composition
    // of each individual map's transform.  This eliminates intermediate
    // structures between adjacent maps.
    opList = fuseConsecutiveMaps(ADT, variants, opList);

    // After fusion the pipeline may have fewer than 2 operations.
    // If it collapsed to nothing, the merge is the identity.
    if (opList.length === 0) {
        installGetter(ADT.prototype, opName, function(this: unknown) { return this; });
        // Still register a no-op transformer for introspection
        ADT._registerTransformer(opName, createTransformer({
            name: opName,
            getParamTransform: () => undefined,
            getAtomTransform: () => undefined
        }), false, variants);
        return;
    }

    if (opList.length === 1) {
        // Pipeline collapsed to a single operation — alias it
        const sole = opList[0];
        installGetter(ADT.prototype, opName, function(this: unknown) { return (this as Record<string, unknown>)[sole]; });
        const t = ADT._getTransformer(sole);
        if (t)
            ADT._registerTransformer(opName, t, false, variants);
        return;
    }


    const transformerList = opList.map(operationName => {
            const t = ADT._getTransformer(operationName);
            if (!t)
                throw new Error(`Cannot merge: operation '${operationName}' not found`);

            return t;
        }),

        hasUnfold = transformerList.some(t => t.generator),
        unfoldIndex = transformerList.findIndex(t => t.generator),
        // Hylomorphism: unfold is first. Metamorphism: unfold is not first (fold→unfold).
        isHylomorphism = hasUnfold && unfoldIndex === 0,
        isMetamorphism = hasUnfold && unfoldIndex > 0;

    if (isHylomorphism)
        assertPascalCase(opName, 'Merged operation (with unfold)');
    else
        assertCamelCase(opName, 'Merged operation (without unfold)');


    if (isHylomorphism && opName in variants)
        throw new Error(`Merged operation name '${opName}' conflicts with existing variant`);


    const composedTransformer = composeMultipleTransformers(transformerList, opName);
    ADT._registerTransformer(opName, composedTransformer, false, variants);

    // ---- Map-fold fusion: execution plan ----
    // Build a plan that detects map → fold adjacencies and marks them
    // for fused execution.  At runtime, when a mapFold step is reached
    // the map transformer is set as a module-level context variable and
    // the fold accesses pre-transformed type-parameter fields directly,
    // eliminating the intermediate mapped structure.
    type MergeStep =
        | { kind: 'access'; name: string }
        | { kind: 'mapFold'; mapTransformer: Transformer; foldName: string };

    function buildPlan(ops: string[], startIdx: number, endIdx?: number): MergeStep[] {
        const steps: MergeStep[] = [];
        const endIndex = endIdx ?? ops.length;
        let k = startIdx;
        while (k < endIndex) {
            const tCur = ADT._getTransformer(ops[k]);
            if (tCur && isMapTransformer(tCur) && isGetterOp(ADT, ops[k])
                && k + 1 < endIndex) {
                const tNext = ADT._getTransformer(ops[k + 1]);
                if (tNext && isFoldTransformer(tNext)) {
                    steps.push({
                        kind: 'mapFold',
                        mapTransformer: tCur,
                        foldName: ops[k + 1]
                    });
                    k += 2;
                    continue;
                }
            }
            steps.push({ kind: 'access', name: ops[k] });
            k++;
        }
        return steps;
    }

    /**
     * Resolve a named operation on `obj` and invoke it (getter or function call).
     *
     * @param obj  The target object to invoke the operation on.
     * @param opName  The name of the operation to resolve and invoke.
     * @param args  Arguments to pass if the operation is a function (ignored for getters).
     * @returns The result of the getter access or function call.
     * @throws {Error} If `opName` does not correspond to a getter or function on the prototype chain.
     */
    function invokeOp(
        obj: unknown,
        opName: string,
        args: unknown[]
    ): unknown {
        const descriptor = getPrototypeDescriptor(opName);
        if (descriptor && descriptor.get)
            return (obj as Record<string, unknown>)[opName];
        else if (typeof (obj as Record<string, unknown>)[opName] === 'function')
            return ((obj as Record<string, (...a: unknown[]) => unknown>)[opName])(...args);

        throw new Error(`Operation '${opName}' not found`);
    }

    /** Execute one step of the plan, returning the new result. */
    function executeStep(
        result: unknown,
        step: MergeStep,
        args: unknown[]
    ): unknown {
        if (step.kind === 'mapFold') {
            _currentMapFoldPreTransform = step.mapTransformer;
            try {
                return invokeOp(result, step.foldName, args);
            } finally {
                _currentMapFoldPreTransform = null;
            }
        }
        return invokeOp(result, step.name, args);
    }

    if (isMetamorphism) {
        // Metamorphism pipeline: [maps*] → fold → [maps*] → unfold → [maps*]
        // Instance method: fold consumes the structure, result seeds the unfold.
        const prePlan = buildPlan(opList, 0, unfoldIndex);
        const postPlan = buildPlan(opList, unfoldIndex + 1);

        const mergeImpl = function (this: Record<string, unknown>, ...args: unknown[]) {
            // Phase 1: execute pre-unfold steps (maps and fold) on the instance
            let result: unknown = this;
            for (const step of prePlan)
                result = executeStep(result, step, args);

            // Phase 2: unfold — the fold result becomes the seed.
            // Resolve unfold from the instance's parameterized ADT (if any)
            // so that parameterized specializations use their rebound unfold
            // rather than the base ADT's. Falls back to the closure-captured
            // ADT for non-parameterized types.
            const unfoldOpName = opList[unfoldIndex],
                adtProto = Object.getPrototypeOf(Object.getPrototypeOf(this)),
                callerADT = (resolveProxiedADT(adtProto) ?? ADT) as Record<string, unknown>,
                unfoldOp = callerADT[unfoldOpName] as
                    ((s: unknown) => unknown) | undefined;

            if (!unfoldOp)
                throw new Error(`Unfold operation '${unfoldOpName}' not found`);

            result = unfoldOp(result);

            // Phase 3: execute post-unfold steps (maps) on the generated structure
            for (const step of postPlan)
                result = executeStep(result, step, []);

            return result;
        };

        installGetter(ADT.prototype, opName, mergeImpl);
    } else if (isHylomorphism) {
        // Hylomorphism pipeline: unfold → [maps*] → [fold]
        const plan = buildPlan(opList, 1);

        (ADT as Record<string, unknown>)[opName] = function (this: unknown, seed: unknown) {
            const unfoldName = opList[0],
                // Resolve unfold from the call receiver so that parameterized
                // ADT proxies use their rebound unfold rather than the base's.
                // Falls back to the closure-captured ADT for detached calls.
                callerADT = (this ?? ADT) as Record<string, unknown>,
                unfoldOp = callerADT[unfoldName] as
                    ((s: unknown) => unknown) | undefined;

            if (!unfoldOp)
                throw new Error(`Unfold operation '${unfoldName}' not found`);

            let result: unknown = unfoldOp(seed);
            for (const step of plan)
                result = executeStep(result, step, []);

            return result;
        };
    } else {
        const plan = buildPlan(opList, 0);

        const mergeImpl = function (this: Record<string, unknown>, ...args: unknown[]) {
            let result: unknown = this;
            for (const step of plan)
                result = executeStep(result, step, args);

            return result;
        };

        installGetter(ADT.prototype, opName, mergeImpl);
    }
}

// ---- Parameterized instance -------------------------------------------------

function createParameterized(
    Base: ADTLike,
    typeArgs: SpecRecord,
    decl: ParsedDecl
): ADTLike {
    function ParameterizedADT(this: object, ...args: unknown[]) {
        return (Base as unknown as (...a: unknown[]) => unknown).call(this, ...args);
    }

    (ParameterizedADT as unknown as { prototype: object }).prototype = Object.create(Base.prototype);
    (ParameterizedADT as unknown as { prototype: { constructor: unknown } }).prototype.constructor =
        ParameterizedADT;
    (ParameterizedADT as unknown as Record<symbol, unknown>)[TypeArgsSymbol] = typeArgs;
    parentADTMap.set(ParameterizedADT as unknown as object, Base as unknown as object);

    // Propagate sort info from the base ADT to the parameterized specialization
    if (decl.sortVariants.size > 0) {
        sortDeclMap.set(ParameterizedADT as unknown as object, {
            sortParams: decl.sortParams,
            sortVariants: decl.sortVariants
        });
    }

    Object.assign(ParameterizedADT, createTransformerMethods(ParameterizedADT as unknown as ADTLike));

    const paramVariants = createVariants(
        ParameterizedADT as unknown as ADTLike,
        decl.variants,
        decl.typeParams,
        decl.sortVariants
    );

    // Reinstall unfold operations from the base ADT, rebound to the
    // parameterized variants so that constructed instances carry the
    // parameterized ADT in their prototype chain.
    inheritUnfoldOperations(
        ParameterizedADT as unknown as ADTLike,
        paramVariants,
        Base,
        {}
    );

    const ProxiedParameterized = createDelegationProxy(
        ParameterizedADT as unknown as ADTLike,
        paramVariants,
        Base,
        false
    );

    // Store raw ADT reference on the proxied parameterized ADT so that
    // describeADT can unwrap proxies before walking parentADTMap.
    (ProxiedParameterized as { _rawADT: ADTLike })._rawADT = ParameterizedADT as unknown as ADTLike;

    // Register raw → proxied mapping for fold-context resolution.
    rawToProxiedMap.set(ParameterizedADT as unknown as object, ProxiedParameterized as unknown as object);

    // Register conditional protocol conformances based on satisfied type arg constraints.
    // Ops from unconditional protocols are always available; collect them first so that
    // any op shared with a failed conditional protocol is not unnecessarily stubbed out.
    const satisfiedOpNames = new Set<string>();
    for (const entry of decl.protocols) {
        if (!entry.conditional) {
            for (const opName of entry.protocol.requiredOps.keys())
                satisfiedOpNames.add(opName);
        }
    }

    type FailedEntry = { ownOps: string[]; failedParams: Array<{ param: string; argName: string }> };
    const failedEntries: FailedEntry[] = [];

    // Hoist paramProto so contract wrappers inside the satisfaction loop can use it.
    const paramProto = (ParameterizedADT as unknown as { prototype: object }).prototype;

    for (const entry of decl.protocols) {
        if (!entry.conditional) continue;
        let allSatisfied = true;
        const failedParams: Array<{ param: string; argName: string }> = [];
        for (const [paramName, requiredProto] of Object.entries(entry.constraints)) {
            const typeArgValue = typeArgs[paramName];
            if (!typeArgValue) {
                allSatisfied = false;
                failedParams.push({ param: paramName, argName: 'undefined' });
                continue;
            }
            // Walk the prototype chain of the type arg to find conformance
            const typeArgProto =
                typeof typeArgValue === 'function'
                    ? (typeArgValue as { prototype?: object }).prototype ?? null
                    : typeof typeArgValue === 'object' && typeArgValue !== null
                        ? typeArgValue as object
                        : null;
            if (!typeArgProto) {
                allSatisfied = false;
                failedParams.push({ param: paramName, argName: String(typeArgValue) });
                continue;
            }
            let found = false;
            let proto: object | null = typeArgProto;
            while (proto !== null) {
                if (conformanceRegistry.get(proto)?.has(requiredProto)) { found = true; break; }
                proto = Object.getPrototypeOf(proto) as object | null;
            }
            if (!found) {
                allSatisfied = false;
                const argName =
                    typeof typeArgValue === 'function' &&
                    typeof (typeArgValue as { name?: unknown }).name === 'string'
                        ? (typeArgValue as { name: string }).name
                        : String(typeArgValue);
                failedParams.push({ param: paramName, argName });
            }
        }
        if (allSatisfied) {
            registerConformance((ParameterizedADT as unknown as { prototype: object }).prototype, entry.protocol);
            validateProtocolInvariant(entry.protocol, ParameterizedADT, 'Parameterized ADT');

            // Apply conditional protocol contracts onto the parameterized type.
            //
            // Composition rules (LSP subcontracting):
            //   demands : OR  — if the fold already has baked-in demands (from unconditional
            //                   protocols + parent + own), those are broader by LSP, so we only
            //                   add a demands check when there are no existing baked demands
            //                   (the conditional protocol is the sole demands source).
            //   ensures : AND — always wrap; the additional ensures check fires after the inner
            //                   result is produced, giving AND(bakedEnsures, protocolEnsures).
            //   rescue  : skip — the operation's own rescue (baked in) takes precedence.
            //
            // Note: ops with missing implementations are handled after this loop by
            // validateProtocolConformance, which installs defaults (with contracts baked
            // in) for ops with a defaultBody, and throws for genuinely-absent ops.
            for (const [opName, opSpec] of entry.protocol.requiredOps) {
                if (!opSpec.contracts) continue;
                const c = opSpec.contracts;

                if (opSpec.kind === 'fold') {
                    // Folds are instance-level getters or methods on the prototype chain.
                    let desc: PropertyDescriptor | undefined;
                    let searchProto: object | null = Base.prototype as object;
                    while (searchProto !== null) {
                        const d = Object.getOwnPropertyDescriptor(searchProto, opName);
                        if (d) { desc = d; break; }
                        searchProto = Object.getPrototypeOf(searchProto) as object | null;
                    }
                    if (!desc) continue;

                    // Only add a demands wrapper when the fold has no baked-in demands.
                    // If baked demands exist, LSP guarantees they are at least as broad as
                    // the protocol's demands — OR-composition is already satisfied.
                    const bakedContracts = adtTransformers.get(Base as unknown as object)?.get(opName)?.contracts ?? null;
                    const mustAddDemands = !!c.demands && !bakedContracts?.demands;

                    if ('get' in desc) {
                        const origGetter = desc.get!;
                        Object.defineProperty(paramProto, opName, {
                            get(this: unknown) {
                                if (mustAddDemands)
                                    checkDemands(c.demands!, opName, 'conditional protocol', this, []);
                                const result = origGetter.call(this);
                                if (c.ensures)
                                    checkEnsures(c.ensures, opName, 'conditional protocol', this, this, result, []);
                                return result;
                            },
                            configurable: desc.configurable ?? true,
                            enumerable: desc.enumerable ?? true
                        });
                    } else {
                        const origMethod = desc.value as (...a: unknown[]) => unknown;
                        Object.defineProperty(paramProto, opName, {
                            value(this: unknown, ...args: unknown[]) {
                                if (mustAddDemands)
                                    checkDemands(c.demands!, opName, 'conditional protocol', this, args);
                                const result = origMethod.apply(this, args);
                                if (c.ensures)
                                    checkEnsures(c.ensures, opName, 'conditional protocol', this, this, result, args);
                                return result;
                            },
                            writable: desc.writable ?? true,
                            configurable: desc.configurable ?? true,
                            enumerable: desc.enumerable ?? true
                        });
                    }
                } else if (opSpec.kind === 'unfold') {
                    // Unfolds are static methods on the ADT constructor.
                    const origUnfold = (ParameterizedADT as unknown as Record<string, unknown>)[opName] as
                        ((seed: unknown) => unknown) | undefined;
                    if (!origUnfold) continue;

                    const bakedContracts = adtTransformers.get(ParameterizedADT as unknown as object)?.get(opName)?.contracts ?? null;
                    const mustAddDemands = !!c.demands && !bakedContracts?.demands;

                    (ParameterizedADT as unknown as Record<string, unknown>)[opName] = function wrappedUnfold(seed: unknown): unknown {
                        if (mustAddDemands)
                            checkDemands(c.demands!, opName, 'conditional protocol', null, [seed]);
                        const result = origUnfold(seed);
                        if (c.ensures)
                            checkEnsures(c.ensures, opName, 'conditional protocol', null, seed, result, [seed]);
                        return result;
                    };
                }
                // map / merge kinds: no demands/ensures in the protocol spec, nothing to wrap.
            }

            // Verify all required ops are now reachable on the parameterized prototype chain
            // (either inherited, contract-wrapped above, or default-installable). For ops
            // whose defaultBody is non-null and that are genuinely absent, installDefaultOp
            // is called here so defaults are auto-installed — the same behaviour as
            // applyUnconditionalProtocols provides for unconditional protocols.
            //
            // Unfold ops are constructor-level static methods, not instance-level. They
            // can't be probed with `opName in prototype`, so mark them satisfied upfront;
            // the contract-wrapping loop above already handles their absence gracefully.
            //
            // Pass undefined for `type` — protocol invariant was already checked above.
            for (const [opName, opSpec] of entry.protocol.requiredOps)
                if (opSpec.kind === 'unfold') satisfiedOpNames.add(opName);
            validateProtocolConformance(satisfiedOpNames, entry.protocol, 'Parameterized ADT', undefined, paramProto);
        } else
            failedEntries.push({ ownOps: [...entry.protocol.requiredOps.keys()], failedParams });

    }

    // For each op from an unsatisfied conditional protocol that is not covered by any
    // satisfied protocol, install an error-throwing stub on ParameterizedADT.prototype.
    // This ensures callers get a clear TypeError at the call site rather than a cryptic
    // failure deep inside the handler.
    for (const { ownOps, failedParams } of failedEntries) {
        const failDesc = failedParams.length > 0
            ? failedParams.map(({ param, argName }) => `'${param}' is '${argName}'`).join(', ')
            : 'type argument constraints were not satisfied';
        for (const opName of ownOps) {
            if (satisfiedOpNames.has(opName)) continue;
            const msg = `'${opName}' is not available: this type was not instantiated with ` +
                `compatible type arguments (${failDesc} — does not satisfy the required constraint). ` +
                `Provide a type argument that satisfies the required protocol.`;
            const throwFn = (): never => { throw new TypeError(msg); };
            // Detect getter vs method from the descriptor on the base prototype chain
            let desc: PropertyDescriptor | undefined;
            let searchProto: object | null = Base.prototype as object;
            while (searchProto !== null) {
                const d = Object.getOwnPropertyDescriptor(searchProto, opName);
                if (d) { desc = d; break; }
                searchProto = Object.getPrototypeOf(searchProto) as object | null;
            }
            if (desc && 'get' in desc)
                Object.defineProperty(paramProto, opName, { get: throwFn, configurable: desc.configurable ?? true, enumerable: desc.enumerable ?? true });
            else
                Object.defineProperty(paramProto, opName, { value: throwFn, writable: desc?.writable ?? true, configurable: desc?.configurable ?? true, enumerable: desc?.enumerable ?? true });

        }
    }

    return Object.assign(ProxiedParameterized, paramVariants) as unknown as ADTLike;
}
