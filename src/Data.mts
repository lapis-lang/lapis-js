import {
    FamilyRefSymbol,
    TypeParamSymbol,
    isOperationDef,
    extend,
    op,
    spec,
    operations,
    validateTypeSpec,
    validateReturnType
} from './operations.mjs';

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
    isPascalCase,
    isCamelCase,
    isObjectLiteral,
    HandlerMapSymbol,
    isBuiltInType,
    hasInputSpec
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

const TypeArgsSymbol: unique symbol = Symbol('TypeArgs'),
    VariantNameSymbol: unique symbol = Symbol('VariantName'),

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

    return Variant as unknown as VariantLike;
}

function createSingletonVariant(name: string, ADT: ADTLike): SingletonInstance {
    function Variant(this: object) {
        if (!new.target) return new (Variant as unknown as new () => unknown)();
        (this as Record<symbol, unknown>)[VariantNameSymbol] = name;
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

function checkInvariant(
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
                        (typeof delegatedValue === 'object' && delegatedValue !== null)))
                    return createChildVariant(target, prop as string, delegatedValue as VariantLike | SingletonInstance);


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

function createFamilyMarker(): FamilyMarker {
    const marker = function (typeParam?: unknown): FamilyMarker {
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
                checkInvariant(this, parentInvariantFn, variantName);
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
        if (!isPascalCase(name))
            throw new Error(`Variant '${name}' must be PascalCase`);


        let invariantFn: ((instance: object) => boolean) | null = null,
            fieldSpec = rawSpec as SpecRecord;

        if (rawSpec && typeof rawSpec === 'object') {
            const rawObj = rawSpec as Record<string | symbol, unknown>;
            if (invariant in rawObj) {
                invariantFn = rawObj[invariant as unknown as string] as (instance: object) => boolean;
                fieldSpec = {};
                for (const key of Object.keys(rawObj)) {
                    if (key !== String(invariant))
                        fieldSpec[key] = rawObj[key];

                }
                for (const sym of Object.getOwnPropertySymbols(rawObj)) {
                    if (sym !== (invariant as unknown as symbol))
                        (fieldSpec as Record<symbol, unknown>)[sym] = rawObj[sym];

                }
            }

            for (const fieldName of Object.keys(fieldSpec)) {
                if (!isCamelCase(fieldName))
                    throw new Error(`Field '${fieldName}' in variant '${name}' must be camelCase`);

            }
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
                    checkInvariant(this, invariantFn, name);
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
    if (fieldSpec && (typeof fieldSpec === 'object' || typeof fieldSpec === 'function') &&
        FamilyRefSymbol in (fieldSpec as object)) {
        let rootBase: object = ADT as object;
        while (parentADTMap.has(rootBase))
            rootBase = parentADTMap.get(rootBase)!;


        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(value instanceof (rootBase as unknown as abstract new (...args: any[]) => unknown)))
            throw new TypeError(`Field '${fieldName}' must be an instance of the same ADT family`);

        return;
    }

    // Built-in types
    switch (true) {
        case fieldSpec === Number && typeof value !== 'number':
            throw new TypeError(`Field '${fieldName}' must be a Number`);
        case fieldSpec === String && typeof value !== 'string':
            throw new TypeError(`Field '${fieldName}' must be a String`);
        case fieldSpec === Boolean && typeof value !== 'boolean':
            throw new TypeError(`Field '${fieldName}' must be a Boolean`);
        case fieldSpec === Symbol && typeof value !== 'symbol':
            throw new TypeError(`Field '${fieldName}' must be a Symbol`);
        case fieldSpec === BigInt && typeof value !== 'bigint':
            throw new TypeError(`Field '${fieldName}' must be a BigInt`);
    }

    // Predicate function validation
    if (typeof fieldSpec === 'function' && !isBuiltInType(fieldSpec)) {
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

type DepFrame = { name: string; phase: 'pre' | 'post' };

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
                    if (!parentHasOp)
                        throw new Error(`Cannot merge: operation '${frame.name}' not found`);

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

    const hasExtraParams = !hasInput && Object.values(handlers).some(h =>
        typeof h === 'function' && (h as HandlerFn).length > 1
    );

    if (!isCamelCase(opName))
        throw new Error(`Fold operation '${opName}' must be camelCase`);


    const transformer = createFoldTransformer(
        opName,
        handlers as Record<string, HandlerFn>,
        finalSpec['out'] as ReturnType<typeof createFoldTransformer> extends { outSpec?: infer T } ? T : unknown,
        finalSpec['in'] as ReturnType<typeof createFoldTransformer> extends { inSpec?: infer T } ? T : unknown
    );
    ADT._registerTransformer(opName, transformer, false, variants);

    // DAG-safe fold cache — closure-scoped so each (ADT, opName) pair is
    // fully isolated.  Recursive children share the cache via this same
    // closure; re-entrant cross-ADT folds with the same operation name
    // use their own closure and never interfere.
    const canCache = !hasInput && !hasExtraParams;
    let dagCache: WeakMap<object, unknown> | null = null,
        dagCacheDepth = 0;

    const foldImpl = function (this: Record<symbol, unknown>, ...args: unknown[]) {
        if (canCache) {
            if (dagCacheDepth === 0)
                dagCache = new WeakMap();

            if (dagCache!.has(this as object))
                return dagCache!.get(this as object);

            dagCacheDepth++;
        }

        try {
            const variantName = this[VariantNameSymbol] as string,
                variantCtor = (this as { constructor: VariantLike }).constructor;

            let handler: HandlerFn | null = null,
                parentHandler: HandlerFn | null = null,
                foundAtADT: ADTLike | null = null,

                currentSearchADT: ADTLike | null = ADT;

            while (currentSearchADT) {
                const registry = adtTransformers.get(currentSearchADT as unknown as object),
                    localTransformer = registry?.get(opName);

                if (localTransformer && localTransformer.getCtorTransform) {
                    const handlerMap = localTransformer[HandlerMapSymbol] as Record<string, HandlerFn> | undefined;
                    if (handlerMap && (handlerMap[variantName] || handlerMap['_'])) {
                        handler = localTransformer.getCtorTransform(variantCtor as unknown as VariantConstructorLike);
                        foundAtADT = currentSearchADT;
                        break;
                    }
                }
                currentSearchADT = parentADTMap.get(currentSearchADT as unknown as object) as ADTLike | null ?? null;
            }

            if (!handler)
                throw new Error(`No handler for variant '${variantName}' in fold operation '${opName}'`);


            if (foundAtADT) {
                let searchParent = parentADTMap.get(foundAtADT as unknown as object) as ADTLike | null ?? null;
                while (searchParent) {
                    const parentRegistry = adtTransformers.get(searchParent as unknown as object),
                        parentTransformer = parentRegistry?.get(opName);

                    if (parentTransformer && parentTransformer.getCtorTransform) {
                        const parentHandlerMap = parentTransformer[HandlerMapSymbol] as Record<string, HandlerFn> | undefined;
                        if (parentHandlerMap && (parentHandlerMap[variantName] || parentHandlerMap['_'])) {
                            parentHandler = parentTransformer.getCtorTransform(variantCtor as unknown as VariantConstructorLike);
                            break;
                        }
                    }
                    searchParent = parentADTMap.get(searchParent as unknown as object) as ADTLike | null ?? null;
                }
            }

            const foldedFields: Record<string, unknown> = {};
            if (variantCtor.spec) {
                for (const [fieldName, fieldSpec] of Object.entries(variantCtor.spec)) {
                    if (fieldSpec &&
                    (typeof fieldSpec === 'object' || typeof fieldSpec === 'function') &&
                    FamilyRefSymbol in (fieldSpec as object)) {
                        const fieldValue = (this as Record<string, unknown>)[fieldName];
                        if (hasInput || hasExtraParams) {
                            foldedFields[fieldName] = (...params: unknown[]) =>
                                (fieldValue as Record<string, (...p: unknown[]) => unknown>)[opName](...params);
                        } else
                            foldedFields[fieldName] = (fieldValue as Record<string, unknown>)[opName];

                    } else
                        foldedFields[fieldName] = (this as Record<string, unknown>)[fieldName];

                }
            }

            let context: object = this;

            if (parentHandler) {
                context = Object.create(this);

                if (hasInput || hasExtraParams) {
                    Object.defineProperty(context, parent, {
                        get: () => (...parentArgs: unknown[]) =>
                            (parentHandler as HandlerFn).call(this, foldedFields, ...parentArgs),
                        enumerable: false,
                        configurable: true
                    });
                } else {
                    Object.defineProperty(context, parent, {
                        get: () => (parentHandler as HandlerFn).call(this, foldedFields),
                        enumerable: false,
                        configurable: true
                    });
                }
            }

            const result = (handler as HandlerFn).call(context, foldedFields, ...args);

            if (hasOutput)
                validateReturnType(result, opSpecObj['out'] as Parameters<typeof validateReturnType>[1], opName);

            if (canCache) dagCache!.set(this as object, result);

            return result;
        } finally {
            if (canCache) {
                dagCacheDepth--;
                if (dagCacheDepth === 0) dagCache = null;
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

    if (!isPascalCase(opName))
        throw new Error(`Unfold operation '${opName}' must be PascalCase`);


    if (opSpecObj && 'in' in opSpecObj && opSpecObj['in'] === Function)
        throw new TypeError(`cannot use Function as 'in' guard`);


    const generator = (seed: unknown) => seed,
        transformer = createTransformer({
            name: opName,
            inSpec: opSpecObj['in'] as Parameters<typeof createTransformer>[0]['inSpec'],
            generator
        });

    (transformer as unknown as Record<string, unknown>).unfoldCases = cases;
    (transformer as unknown as Record<string, unknown>).unfoldSpec = opSpecObj;

    ADT._registerTransformer(opName, transformer, false, variants);

    (ADT as Record<string, unknown>)[opName] = function unfoldImpl(seed: unknown): unknown {
        if (hasInputSpec(opSpecObj)) {
            validateTypeSpec(
                seed,
                opSpecObj['in'] as Parameters<typeof validateTypeSpec>[1],
                opName,
                'input of type'
            );
        }

        for (const [variantName, caseFn] of Object.entries(cases)) {
            const result = (caseFn as (s: unknown) => unknown)(seed);
            if (result !== null && result !== undefined) {
                const variantValue = variants[variantName] ||
                    (ADT as Record<string, unknown>)[variantName];
                if (!variantValue)
                    throw new Error(`Unknown variant '${variantName}' in unfold '${opName}'`);


                if (typeof variantValue === 'object' && Object.isFrozen(variantValue))
                    return variantValue;


                const Variant = variantValue as VariantLike;
                if (Variant.spec) {
                    const transformedResult = { ...(result as Record<string, unknown>) };
                    for (const [fieldName, fieldSpec] of Object.entries(Variant.spec)) {
                        if (fieldSpec &&
                            (typeof fieldSpec === 'object' || typeof fieldSpec === 'function') &&
                            FamilyRefSymbol in (fieldSpec as object)) {
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

    if (!isCamelCase(opName))
        throw new Error(`Map operation '${opName}' must be camelCase`);


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

            if (fieldSpec &&
                (typeof fieldSpec === 'object' || typeof fieldSpec === 'function') &&
                FamilyRefSymbol in (fieldSpec as object)) {
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

    if (hasUnfold) {
        if (!isPascalCase(opName))
            throw new Error(`Merged operation '${opName}' with unfold must be PascalCase`);

    } else {
        if (!isCamelCase(opName))
            throw new Error(`Merged operation '${opName}' without unfold must be camelCase`);

    }

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
                    descriptor = Object.getOwnPropertyDescriptor(ADT.prototype, nextOpName);

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
                const descriptor = Object.getOwnPropertyDescriptor(ADT.prototype, mOpName);
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

    return Object.assign(ProxiedParameterized, paramVariants) as unknown as ADTLike;
}
