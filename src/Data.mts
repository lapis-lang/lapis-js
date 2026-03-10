import {
    FamilyRefSymbol,
    TypeParamSymbol,
    isOperationDef,
    extend,
    op,
    spec,
    operations,
    history,
    aux,
    parseAux,
    validateTypeSpec,
    validateReturnType,
    isFamilyRefSpec,
    assertCamelCase,
    assertPascalCase
} from './operations.mjs';

import {
    isCheckedMode,
    resolveContracts,
    checkDemands,
    checkEnsures,
    checkInvariant,
    executeRescue,
    DemandsError,
    type ContractSpec
} from './contracts.mjs';

import {
    adtTransformers,
    createTransformer,
    createFoldTransformer,
    composeMultipleTransformers,
    type Transformer,
    type HandlerFn,
    type VariantConstructorLike
} from './Transformer.mjs';

import {
    isObjectLiteral,
    HandlerMapSymbol,
    hasInputSpec,
    omitSymbol,
    builtInTypeChecks
} from './utils.mjs';

import type { DataADT, DataDeclParams } from './types.mjs';

// Re-export symbols
export { extend };
export const parent: unique symbol = Symbol('parent');
export type parent = typeof parent;

export const invariant: unique symbol = Symbol('invariant');
export type invariant = typeof invariant;

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

// Module-level fold-execution context: holds the current parameterized
// (proxied) ADT during fold handler invocation so that Family(T) can
// resolve type-param markers to the correct parameterized ADT without
// requiring the user to hardcode concrete type arguments.
let _currentFoldParameterizedADT: object | null = null;

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
    variants: SpecRecord;
    operations: SpecRecord;
    parentADT: ADTLike | null;
    Family: FamilyMarker | null;
};

type FamilyMarker = {
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

// ---- Main entry point -------------------------------------------------------

/**
 * Main entry point: data(() => { variants and operations })
 */
export function data<D extends Record<string, unknown>>(
    declFn: (params: DataDeclParams) => D
): DataADT<D> {
    const decl = parseDeclaration(declFn as unknown as (params: object) => Record<string, unknown>),
        ADT = createADT(decl);
    return ADT as unknown as DataADT<D>;
}

// ---- Declaration parsing ----------------------------------------------------

function parseDeclaration(
    declFn: (params: object) => Record<string, unknown>
): ParsedDecl {
    const typeParams: SpecRecord = {},
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

    return { typeParams, variants: variantsObj, operations: operationsObj, parentADT, Family };
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

function createSingletonVariant(name: string, ADT: ADTLike): SingletonInstance {
    function Variant(this: object) {
        if (!new.target) return new (Variant as unknown as new () => unknown)();
        (this as Record<symbol, unknown>)[VariantNameSymbol] = name;
        (this as Record<symbol, unknown>)[IsVariantSymbol] = true;
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
    return marker as unknown as FamilyMarker;
}

function createTypeParam(name: string): object {
    const marker: Record<symbol, unknown> = {};
    marker[TypeParamSymbol] = name;
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

            const typeParamNames = Object.keys(decl.typeParams);
            if (args.length <= typeParamNames.length) {
                const typeArgs: SpecRecord = {};
                for (let i = 0; i < args.length; i++)
                    typeArgs[typeParamNames[i]] = args[i];

                return createParameterized(ADT as unknown as ADTLike, typeArgs, decl);
            }
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

    const ownVariants = createVariants(ADT as unknown as ADTLike, decl.variants, decl.typeParams);

    createOperations(ADT as unknown as ADTLike, ownVariants, decl.operations, decl.typeParams);

    // Inherit unfold operations from parent, rebound to child variants
    if (parentADT)
        inheritUnfoldOperations(ADT as unknown as ADTLike, ownVariants, parentADT, decl.operations);

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

function createChildVariant(
    ChildADT: ADTLike,
    variantName: string,
    ParentVariant: VariantLike | SingletonInstance
): VariantLike | SingletonInstance {
    const parentSpec = (ParentVariant as VariantLike).spec || {},
        parentInvariantFn = (ParentVariant as VariantLike)._invariant || null;

    if (Object.keys(parentSpec).length === 0)
        return createSingletonVariant(variantName, ChildADT);
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
                Object.freeze(this);
            }
        });
    }
}

// ---- Variant creation -------------------------------------------------------

function createVariants(
    ADT: ADTLike,
    variantSpecs: SpecRecord,
    _typeParams: SpecRecord
): Record<string, VariantLike | SingletonInstance> {
    const variants: Record<string, VariantLike | SingletonInstance> = {};

    for (const [name, rawSpec] of Object.entries(variantSpecs)) {
        assertPascalCase(name, 'Variant');


        let invariantFn: ((instance: object) => boolean) | null = null,
            fieldSpec = rawSpec as SpecRecord;

        if (rawSpec && typeof rawSpec === 'object') {
            const rawObj = rawSpec as Record<string | symbol, unknown>;
            if (invariant in rawObj) {
                invariantFn = rawObj[invariant as unknown as string] as (instance: object) => boolean;
                fieldSpec = omitSymbol(rawObj, invariant as unknown as symbol) as SpecRecord;
            }

            for (const fieldName of Object.keys(fieldSpec))
                assertCamelCase(fieldName, 'Field');

        }

        const isEmpty = !fieldSpec || Object.keys(fieldSpec).length === 0;

        if (isEmpty)
            variants[name] = createSingletonVariant(name, ADT);
        else {
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
    // Walk the parent chain to find the root (base) ADT
    let root: object = adt as unknown as object;
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
    _typeParams: SpecRecord
): void {
    const localParentADT = parentADTMap.get(ADT as unknown as object) as ADTLike | null ?? null,
        sortedOps = topologicalSortOperations(operationSpecs, localParentADT);

    for (const [opName, opDef] of sortedOps) {
        const opKind = opDef[op as unknown as string];

        if (opKind === 'fold')
            createFoldOperation(ADT, variants, opName, opDef);
        else if (opKind === 'unfold')
            createUnfoldOperation(ADT, variants, opName, opDef);
        else if (opKind === 'map')
            createMapOperation(ADT, variants, opName, opDef);
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

function createFoldOperation(
    ADT: ADTLike,
    variants: Record<string, unknown>,
    opName: string,
    opDef: Record<string, unknown>
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
    const parentFoldTransformer = localParentADT
        ? adtTransformers.get(localParentADT as unknown as object)?.get(opName)
        : undefined;
    const foldContracts: ContractSpec | null = resolveContracts(
        opSpecObj, parentFoldTransformer?.contracts
    );

    const hasExtraParams = !hasInput && Object.values(handlers).some(h =>
        typeof h === 'function' && (h as HandlerFn).length > 1
    );

    assertCamelCase(opName, 'Fold operation');


    const transformer = createFoldTransformer(
        opName,
        handlers as Record<string, HandlerFn>,
        finalSpec['out'] as ReturnType<typeof createFoldTransformer> extends { outSpec?: infer T } ? T : unknown,
        finalSpec['in'] as ReturnType<typeof createFoldTransformer> extends { inSpec?: infer T } ? T : unknown
    );
    // Store contracts on transformer for subcontracting inheritance
    if (foldContracts)
        transformer.contracts = foldContracts;
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
                if (isFamilyRefSpec(fieldSpec)) {
                    const fieldValue = (self as Record<string, unknown>)[fieldName];
                    if (hasInput || hasExtraParams) {
                        foldedFields[fieldName] = (...params: unknown[]) =>
                            (fieldValue as Record<string, (...p: unknown[]) => unknown>)[opName](...params);
                    } else
                        foldedFields[fieldName] = (fieldValue as Record<string, unknown>)[opName];

                } else
                    foldedFields[fieldName] = (self as Record<string, unknown>)[fieldName];

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
                        if (isFamilyRefSpec(fieldSpec)) {
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
                        if (isFamilyRefSpec(fieldSpec)) {
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
                    if (isFamilyRefSpec(fieldSpec)) {
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

                // ---- Contract enforcement (Design by Contract) ----
                // Demands/ensures/invariants only enforce at the top-level call
                // (contractDepth === 1), not during recursive traversal of child
                // nodes.  Since data instances are frozen, invariants and demands
                // on a node are deterministic — checking once at the entry point
                // is sufficient.  Rescue, however, is an error-recovery mechanism
                // and must remain active at every recursion level.
                //
                // Invariant checks are gated by isCheckedMode() alone (not by
                // hasAnyContracts) so that a fold with no demands/ensures/rescue
                // still runs invariant pre-checks when the variant defines one.
                const inCheckedMode = isCheckedMode();

                // Get the invariant function for this instance's variant
                const variantInvariantFn: ((instance: object) => boolean) | null =
                    inCheckedMode && variantCtor
                        ? (variantCtor as VariantLike)._invariant ?? null
                        : null;

                const checked = contractDepth === 1 && inCheckedMode
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
                            validateReturnType(bodyResult, opSpecObj['out'] as Parameters<typeof validateReturnType>[1], opName);

                        // 4. Ensures check (postcondition)
                        if (foldContracts?.ensures)
                            checkEnsures(foldContracts.ensures, opName, variantCtx, self, old, bodyResult, bodyArgs);

                        return bodyResult;
                    };

                    try {
                        result = executeBody(...args);
                    } catch (error) {
                    // 5. Rescue handler for body/ensures errors
                        if (foldContracts?.rescue && !(error instanceof DemandsError)) {
                            const { result: rescueResult } = executeRescue(
                                foldContracts.rescue,
                                self,
                                error,
                                args,
                                executeBody,
                                opName,
                                variantCtx
                            );

                            // 6. Invariant post-check on result (if it's a variant with an invariant)
                            checkResultInvariant(rescueResult, opName);

                            if (canCache) dagCache!.set(self, rescueResult);
                            return rescueResult;
                        }

                        throw error;
                    }

                    // 6. Invariant post-check on result (if it's a variant with an invariant)
                    checkResultInvariant(result, opName);
                } else if (inCheckedMode && foldContracts?.rescue) {
                // Inner recursion level with rescue active:
                // Skip demands/ensures/invariant but still wrap in rescue
                // so handler errors can be recovered at every level.
                    try {
                        result = (handler as HandlerFn).call(context, foldedFields, ...args);
                        if (hasOutput)
                            validateReturnType(result, opSpecObj['out'] as Parameters<typeof validateReturnType>[1], opName);
                    } catch (error) {
                        if (!(error instanceof DemandsError)) {
                            const innerBody = (...newArgs: unknown[]): unknown => {
                                const r = (handler as HandlerFn).call(context, foldedFields, ...newArgs);
                                if (hasOutput)
                                    validateReturnType(r, opSpecObj['out'] as Parameters<typeof validateReturnType>[1], opName);
                                return r;
                            };

                            const { result: rescueResult } = executeRescue(
                                foldContracts!.rescue!,
                                self,
                                error,
                                args,
                                innerBody,
                                opName,
                                variantName || 'unknown'
                            );

                            if (canCache) dagCache!.set(self, rescueResult);
                            return rescueResult;
                        } else
                            throw error;

                    }
                } else {
                // Fast path: no active contracts — call handler directly,
                // skipping closure allocation for executeBody and rescue machinery.
                    result = (handler as HandlerFn).call(context, foldedFields, ...args);
                    if (hasOutput)
                        validateReturnType(result, opSpecObj['out'] as Parameters<typeof validateReturnType>[1], opName);
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

    if (hasInput || hasExtraParams)
        (ADT.prototype as Record<string, unknown>)[opName] = foldImpl;
    else {
        Object.defineProperty(ADT.prototype, opName, {
            get: foldImpl,
            enumerable: true,
            configurable: true
        });
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
    opSpecObj: Record<string, unknown>
): void {
    // Extract + subcontract: compose child contracts with parent's (LSP rules)
    const localParentADT = parentADTMap.get(ADT as unknown as object) as ADTLike | null ?? null;
    const parentUnfoldTransformer = localParentADT
        ? adtTransformers.get(localParentADT as unknown as object)?.get(opName)
        : undefined;
    const unfoldContracts: ContractSpec | null = resolveContracts(
        opSpecObj, parentUnfoldTransformer?.contracts
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
                            if (isFamilyRefSpec(fieldSpec)) {
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
        const inCheckedMode = hasAnyUnfoldContracts && isCheckedMode();
        const checked = unfoldContractDepth === 1 && inCheckedMode;

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
                // Rescue handler
                if (unfoldContracts!.rescue && !(error instanceof DemandsError)) {
                    const { result: rescueResult } = executeRescue(
                        unfoldContracts!.rescue,
                        null,
                        error,
                        [seed],
                        (...newArgs: unknown[]) =>
                            ((ADT as Record<string, unknown>)[opName] as (s: unknown) => unknown)(newArgs[0]),
                        opName,
                        'unfold'
                    );

                    return rescueResult;
                }

                throw error;
            } finally {
                unfoldContractDepth--;
            }

            return finalResult;
        } else if (inCheckedMode && unfoldContracts?.rescue) {
            // Inner recursion level with rescue active
            try {
                const innerResult = executeUnfold(seed);
                return innerResult;
            } catch (error) {
                if (!(error instanceof DemandsError)) {
                    const { result: rescueResult } = executeRescue(
                        unfoldContracts!.rescue!,
                        null,
                        error,
                        [seed],
                        (...newArgs: unknown[]) =>
                            ((ADT as Record<string, unknown>)[opName] as (s: unknown) => unknown)(newArgs[0]),
                        opName,
                        'unfold'
                    );

                    return rescueResult;
                }

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
    childOperations: Record<string, unknown>
): void {
    const rawParent = (parentADT as { _rawADT?: ADTLike })._rawADT || parentADT,
        parentRegistry = adtTransformers.get(rawParent as unknown as object);
    if (!parentRegistry) return;

    for (const [name, transformer] of parentRegistry) {
        const tx = transformer as unknown as Record<string, unknown>;
        // Only inherit unfold operations not overridden by the child
        if (!tx.unfoldCases || name in childOperations) continue;

        installUnfoldImpl(
            childADT, ownVariants, name,
            tx.unfoldCases as Record<string, (seed: unknown) => unknown | null>,
            (tx.unfoldSpec ?? {}) as Record<string, unknown>
        );
    }
}

function createUnfoldOperation(
    ADT: ADTLike,
    variants: Record<string, unknown>,
    opName: string,
    opDef: Record<string, unknown>
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


    installUnfoldImpl(ADT, variants, opName, cases, opSpecObj);
}

function createMapOperation(
    ADT: ADTLike,
    variants: Record<string, unknown>,
    opName: string,
    opDef: Record<string, unknown>
): void {
    const {
        [op as unknown as string]: _op,
        [spec as unknown as string]: _opSpec = {},
        ...transformers
    } = opDef;

    assertCamelCase(opName, 'Map operation');


    const hasExtraParams = Object.values(transformers).some(t =>
            typeof t === 'function' && (t as HandlerFn).length > 1
        ),

        transformer = createTransformer({
            name: opName,
            getParamTransform: (paramName) => transformers[paramName] as HandlerFn | undefined,
            getAtomTransform: (fieldName) => transformers[fieldName] as HandlerFn | undefined
        });

    ADT._registerTransformer(opName, transformer, false, variants);

    const mapImpl = function (this: Record<symbol, unknown>, ...args: unknown[]) {
        const variantName = this[VariantNameSymbol] as string,
            variant = variants[variantName] || (ADT as Record<string, unknown>)[variantName];

        if (!variant || typeof variant !== 'function')
            return this;


        const variantSpec = (variant as VariantLike).spec;
        if (!variantSpec) return this;

        const mappedFields: Record<string, unknown> = {};
        for (const [fieldName, fieldSpec] of Object.entries(variantSpec)) {
            const value = (this as Record<string, unknown>)[fieldName];

            if (isFamilyRefSpec(fieldSpec)) {
                if (hasExtraParams && args.length > 0) {
                    mappedFields[fieldName] =
                        (value as Record<string, (...a: unknown[]) => unknown>)[opName](...args);
                } else
                    mappedFields[fieldName] = (value as Record<string, unknown>)[opName];

            } else if (fieldSpec && typeof fieldSpec === 'object' && TypeParamSymbol in fieldSpec) {
                const paramName = (fieldSpec as Record<symbol, string>)[TypeParamSymbol],
                    transformFn = transformers[paramName] as HandlerFn | undefined ??
                        transformers[fieldName] as HandlerFn | undefined;
                if (transformFn)
                    mappedFields[fieldName] = transformFn(value, ...args);
                else
                    mappedFields[fieldName] = value;

            } else
                mappedFields[fieldName] = value;

        }

        return (variant as (f: object) => unknown)(mappedFields);
    };

    if (hasExtraParams)
        (ADT.prototype as Record<string, unknown>)[opName] = mapImpl;
    else {
        Object.defineProperty(ADT.prototype, opName, {
            get: mapImpl,
            enumerable: true,
            configurable: true
        });
    }
}

function createMergeOperation(
    ADT: ADTLike,
    variants: Record<string, unknown>,
    opName: string,
    opDef: Record<string, unknown>
): void {
    const opList = opDef[operations as unknown as string] as string[];

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


    const transformerList = opList.map(operationName => {
            const t = ADT._getTransformer(operationName);
            if (!t)
                throw new Error(`Cannot merge: operation '${operationName}' not found`);

            return t;
        }),

        hasUnfold = transformerList.some(t => t.generator);

    if (hasUnfold)
        assertPascalCase(opName, 'Merged operation (with unfold)');
    else
        assertCamelCase(opName, 'Merged operation (without unfold)');


    if (hasUnfold && opName in variants)
        throw new Error(`Merged operation name '${opName}' conflicts with existing variant`);


    const composedTransformer = composeMultipleTransformers(transformerList, opName);
    ADT._registerTransformer(opName, composedTransformer, false, variants);

    if (composedTransformer.generator) {
        // Sequential pipeline: unfold → [maps*] → [fold]
        // Each operation runs through its own registered machinery,
        // preserving proper `this` context, parent handlers, open recursion,
        // instanceof, and all other documented fold-handler semantics.
        (ADT as Record<string, unknown>)[opName] = function (seed: unknown) {
            const unfoldName = opList[0],
                unfoldOp = (ADT as Record<string, unknown>)[unfoldName] as
                    ((s: unknown) => unknown) | undefined;

            if (!unfoldOp)
                throw new Error(`Unfold operation '${unfoldName}' not found`);

            const intermediate = unfoldOp(seed);
            let result = intermediate;
            for (let i = 1; i < opList.length; i++) {
                const nextOpName = opList[i],
                    descriptor = getPrototypeDescriptor(nextOpName);

                if (descriptor && descriptor.get)
                    result = (result as Record<string, unknown>)[nextOpName];
                else if (typeof (result as Record<string, unknown>)[nextOpName] === 'function')
                    result = ((result as Record<string, () => unknown>)[nextOpName])();
                else
                    throw new Error(`Operation '${nextOpName}' not found on result`);
            }

            return result;
        };
    } else {
        const mergeImpl = function (this: Record<string, unknown>, ...args: unknown[]) {
            let result: unknown = this;
            for (const mOpName of opList) {
                const descriptor = getPrototypeDescriptor(mOpName);
                if (descriptor && descriptor.get)
                    result = (result as Record<string, unknown>)[mOpName];
                else if (typeof (result as Record<string, unknown>)[mOpName] === 'function')
                    result = ((result as Record<string, (...a: unknown[]) => unknown>)[mOpName])(...args);
                else
                    throw new Error(`Operation '${mOpName}' not found`);

            }
            return result;
        };

        Object.defineProperty(ADT.prototype, opName, {
            get: mergeImpl,
            enumerable: true,
            configurable: true
        });
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

    Object.assign(ParameterizedADT, createTransformerMethods(ParameterizedADT as unknown as ADTLike));

    const paramVariants = createVariants(
            ParameterizedADT as unknown as ADTLike,
            decl.variants,
            decl.typeParams
        ),

        ProxiedParameterized = createDelegationProxy(
            ParameterizedADT as unknown as ADTLike,
            paramVariants,
            Base,
            false
        );

    // Register raw → proxied mapping for fold-context resolution.
    rawToProxiedMap.set(ParameterizedADT as unknown as object, ProxiedParameterized as unknown as object);

    return Object.assign(ProxiedParameterized, paramVariants) as unknown as ADTLike;
}
