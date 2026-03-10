import { behaviorObservers } from './Observer.mjs';
import type { Observer } from './Observer.mjs';

import {
    IsParameterizedInstance,
    ParentADTSymbol,
    TypeArgsSymbol,
    VariantDeclSymbol,
    TypeParamSymbol,
    callable,
    isObjectLiteral,
    isConstructable,
    hasInputSpec
} from './utils.mjs';

import {
    validateTypeSpec,
    validateSpecGuard,
    isSelfRef,
    SelfRefSymbol,
    op,
    spec,
    operations,
    extend,
    history,
    aux,
    parseAux,
    assertCamelCase,
    assertPascalCase
} from './operations.mjs';

import {
    isCheckedMode,
    extractContracts,
    checkDemands,
    checkEnsures,
    executeRescue,
    DemandsError,
    type ContractSpec
} from './contracts.mjs';

import type { BehaviorADT, BehaviorDeclParams } from './types.mjs';

// ---- Internal symbols -------------------------------------------------------

/** Marks behavior instances */
const BehaviorSymbol: unique symbol = Symbol('Behavior'),

    /** Stores behavior type reference on an instance */
    BehaviorTypeSymbol: unique symbol = Symbol('BehaviorType'),

    /** Stores registered fold operations on a behavior type */
    FoldOpsSymbol: unique symbol = Symbol('FoldOps'),

    /** Stores registered map operations on a behavior type */
    MapOpsSymbol: unique symbol = Symbol('MapOps'),

    /** Stores raw unfold handler sets on a behavior type (for inheritance) */
    UnfoldOpsSymbol: unique symbol = Symbol('UnfoldOps');

// ---- Internal types ---------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => unknown;

interface ObserverEntry {
    name: string;
    spec: unknown;
    isSimple: boolean;
    isParametric: boolean;
    isContinuation: boolean;
}

interface MapTransformEntry {
    typeParam: string;
    transformFn: AnyFn;
}

interface FoldOpEntry {
    spec: Record<string, unknown>;
    handler: AnyFn;
    hasInput: boolean;
    isHisto: boolean;
    auxNames: string[] | null;
    auxIsArray: boolean;
    preMapTransforms?: MapTransformEntry[];
    contracts?: ContractSpec;
}

interface MapOpEntry {
    typeParam: string;
    transformFn: AnyFn;
    isGetter: boolean;
}

interface UnfoldOpEntry {
    spec: Record<string, unknown>;
    handlers: Record<string, AnyFn>;
    contracts?: ContractSpec;
}

interface BehaviorInstanceState {
    seed: unknown;
    memo: Map<string, unknown>;
    handlers: Record<string, AnyFn> | undefined;
}

type BehaviorTypeLike = {
    [BehaviorSymbol]?: boolean;
    [VariantDeclSymbol]?: unknown;
    [FoldOpsSymbol]?: Map<string, FoldOpEntry>;
    [MapOpsSymbol]?: Map<string, MapOpEntry>;
    [UnfoldOpsSymbol]?: Map<string, UnfoldOpEntry>;
    _call?: AnyFn;
    prototype?: object;
    [key: string]: unknown;
    [sym: symbol]: unknown;
};

// ---- Instance state WeakMap -------------------------------------------------

/**
 * WeakMap to store state for each behavior instance.
 * Maps instance -> { seed, memo: Map }
 */
const behaviorInstanceState = new WeakMap<object, BehaviorInstanceState>();

// ---- Self reference ---------------------------------------------------------

function createSelf(): { [SelfRefSymbol]: true; (typeParam?: unknown): unknown } {
    const fn = function (_typeParam?: unknown): unknown {
        return fn as unknown;
    };
    (fn as unknown as Record<symbol, boolean>)[SelfRefSymbol] = true;
    return fn as unknown as { [SelfRefSymbol]: true; (typeParam?: unknown): unknown };
}

// ---- Observer spec predicates -----------------------------------------------

function isSimpleObserver(obsSpec: unknown): boolean {
    if (isSelfRef(obsSpec)) return false;
    return !isObjectLiteral(obsSpec) || (!('in' in obsSpec) && !('out' in obsSpec));
}

function isParametricObserver(obsSpec: unknown): boolean {
    return isObjectLiteral(obsSpec) && ('in' in obsSpec || 'out' in obsSpec);
}

function specsCompatible(a: unknown, b: unknown): boolean {
    if (isSelfRef(a) && isSelfRef(b)) return true;
    return a === b;
}

function ensureOwnMap<K, V>(
    target: Record<symbol, unknown>,
    symbol: symbol
): Map<K, V> {
    if (!Object.hasOwn(target, symbol)) target[symbol] = new Map<K, V>();
    return target[symbol] as Map<K, V>;
}

// ---- Main entry point -------------------------------------------------------

/**
 * Defines a new behavior type with the given observers.
 * Behavior is defined by how it can be observed (destructors), not how it's constructed.
 */
export function behavior<D extends Record<string, unknown>>(
    declFn: (params: BehaviorDeclParams) => D
): BehaviorADT<D> {
    if (typeof declFn !== 'function') {
        throw new TypeError(
            'behavior() requires a callback function: behavior(({ Self, T }) => ({ observers }))'
        );
    }

    // Extract type parameter names from callback function
    // ts-runtime-only: cannot be typed statically — reads function source
    let typeParamNames: string[] = [];
    const fnStr = declFn.toString(),

        destructuredMatch = fnStr.match(/^\s*(?:function\s*[^(]*)?\(\s*\{\s*([^}]+)\s*\}/);

    if (destructuredMatch) {
        const params = destructuredMatch[1];
        typeParamNames = params
            .split(',')
            .map((p: string) => p.trim())
            .filter((p: string) => p && p !== 'Self');
    }

    function createBehavior(
        typeArgs?: Record<string, unknown> | null,
        paramParent?: BehaviorTypeLike | null
    ): {
        class: BehaviorTypeLike;
        observers: Map<string, ObserverEntry>;
        observerDecl: Record<string, unknown>;
        parentBehaviorType: BehaviorTypeLike | null;
        declarations: {
            unfold: { name: string; spec: Record<string, unknown> }[];
            fold: { name: string; spec: Record<string, unknown> }[];
            map: { name: string; spec: Record<string, unknown> }[];
            merge: { name: string; spec: Record<string, unknown> }[];
        };
    } {
        const Self = createSelf(),

            typeParamObjects: Record<string, { [TypeParamSymbol]: string }> = {};
        for (const paramName of typeParamNames)
            typeParamObjects[paramName] = { [TypeParamSymbol]: paramName };


        const observerDecl = declFn({
            Self: Self as unknown as BehaviorDeclParams['Self'],
            ...typeParamObjects
        } as unknown as BehaviorDeclParams) as unknown as Record<string, unknown>;

        if (!observerDecl || typeof observerDecl !== 'object') {
            throw new TypeError(
                'behavior() callback must return an object with observer definitions'
            );
        }

        const parentBehaviorType =
            (observerDecl[extend as unknown as string] as BehaviorTypeLike | undefined) ?? null;

        if (parentBehaviorType !== null) {
            if (!behaviorObservers.has(parentBehaviorType as object)) {
                throw new TypeError(
                    `[extend] must reference a behavior type created with behavior(), got ${String(parentBehaviorType)}`
                );
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let BaseClass: new (...args: any[]) => object;
        if (typeArgs && paramParent) {
            BaseClass = class extends (paramParent as unknown as new () => object) { };
            (BaseClass as unknown as Record<symbol, unknown>)[IsParameterizedInstance] = true;
            (BaseClass as unknown as Record<symbol, unknown>)[ParentADTSymbol] = paramParent;
            (BaseClass as unknown as Record<symbol, unknown>)[TypeArgsSymbol] = typeArgs;
        } else if (parentBehaviorType)
            BaseClass = class extends (parentBehaviorType as unknown as new () => object) { };
        else
            BaseClass = class Behavior { };


        const result = BaseClass,

            observerMap = new Map<string, ObserverEntry>(),
            declarations = {
                unfold: [] as { name: string; spec: Record<string, unknown> }[],
                fold: [] as { name: string; spec: Record<string, unknown> }[],
                map: [] as { name: string; spec: Record<string, unknown> }[],
                merge: [] as { name: string; spec: Record<string, unknown> }[]
            };

        if (parentBehaviorType) {
            for (const [name, obs] of behaviorObservers.get(parentBehaviorType as object) ?? [])
                observerMap.set(name, obs as unknown as ObserverEntry);

        }

        for (const [entryName, entrySpec] of Object.entries(observerDecl)) {
            const opKind = isObjectLiteral(entrySpec) ? entrySpec[op as unknown as string] : null;
            if (opKind === 'unfold') {
                assertPascalCase(entryName, 'Unfold operation');
                declarations.unfold.push({ name: entryName, spec: entrySpec as Record<string, unknown> });
            } else if (opKind === 'fold') {
                assertCamelCase(entryName, 'Fold operation');
                declarations.fold.push({ name: entryName, spec: entrySpec as Record<string, unknown> });
            } else if (opKind === 'map') {
                assertCamelCase(entryName, 'Map operation');
                declarations.map.push({ name: entryName, spec: entrySpec as Record<string, unknown> });
            } else if (opKind === 'merge')
                declarations.merge.push({ name: entryName, spec: entrySpec as Record<string, unknown> });
            else {
                assertCamelCase(entryName, 'Observer');
                observerMap.set(entryName, {
                    name: entryName,
                    spec: entrySpec,
                    isSimple: isSimpleObserver(entrySpec),
                    isParametric: isParametricObserver(entrySpec),
                    isContinuation: isSelfRef(entrySpec)
                });
            }
        }

        (result as unknown as Record<symbol, unknown>)[VariantDeclSymbol] = observerDecl;
        (result as unknown as Record<symbol, boolean>)[BehaviorSymbol] = true;

        return {
            class: result as unknown as BehaviorTypeLike,
            observers: observerMap,
            observerDecl,
            parentBehaviorType,
            declarations
        };
    }

    const {
        class: behaviorClass,
        observers: observerMap,
        parentBehaviorType,
        declarations
    } = createBehavior();

    behaviorClass._call = function (...typeArgsList: unknown[]): unknown {
        if (typeArgsList.length === 0)
            return callableBehavior;


        let typeArgsObj: Record<string, unknown>;
        if (typeArgsList.length === 1 &&
            typeof typeArgsList[0] === 'object' &&
            typeArgsList[0] !== null &&
            !isConstructable(typeArgsList[0]))
            typeArgsObj = typeArgsList[0] as Record<string, unknown>;
        else {
            typeArgsObj = {};
            typeParamNames.forEach((paramName, index) => {
                if (index < typeArgsList.length)
                    typeArgsObj[paramName] = typeArgsList[index];

            });
        }

        const { class: parameterizedBehavior } =
            createBehavior(typeArgsObj, callableBehavior as unknown as BehaviorTypeLike);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return callable(parameterizedBehavior as unknown as abstract new (...args: any[]) => any);
    };

    const callableBehavior = callable(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        behaviorClass as unknown as abstract new (...args: any[]) => any
    ) as unknown as BehaviorTypeLike;

    behaviorObservers.set(callableBehavior as unknown as object, observerMap as unknown as Map<string, Observer>);

    // LSP Enforcement: validate spec invariance for overridden unfolds
    if (parentBehaviorType) {
        const parentUnfoldOpsForCheck =
            (parentBehaviorType as Record<symbol, unknown>)[UnfoldOpsSymbol] as
            Map<string, UnfoldOpEntry> | undefined;
        if (parentUnfoldOpsForCheck) {
            for (const { name, spec: entrySpec } of declarations.unfold) {
                const parentEntry = parentUnfoldOpsForCheck.get(name);
                if (!parentEntry) continue;
                const childOpSpec = entrySpec[spec as unknown as string],
                    childParsedSpec = typeof childOpSpec === 'function'
                        ? (childOpSpec as (bt: unknown) => Record<string, unknown>)(callableBehavior)
                        : (childOpSpec as Record<string, unknown> ?? {}),
                    parentOpSpec = parentEntry.spec,
                    parentHasIn = 'in' in parentOpSpec,
                    parentHasOut = 'out' in parentOpSpec,
                    childHasIn = 'in' in childParsedSpec,
                    childHasOut = 'out' in childParsedSpec;

                if (!parentHasIn && childHasIn)
                    throw new Error(`Cannot change unfold '${name}' from parameterless to parameterized when overriding`);
                if (childHasIn && parentHasIn && !specsCompatible(childParsedSpec['in'], parentOpSpec['in']))
                    throw new Error(`Cannot change unfold '${name}' input specification when overriding`);
                if (childHasOut && parentHasOut && !specsCompatible(childParsedSpec['out'], parentOpSpec['out']))
                    throw new Error(`Cannot change unfold '${name}' output specification when overriding`);
            }
        }
    }

    // Register inline unfold operations
    const parentUnfoldOpsForMerge =
        parentBehaviorType
            ? (parentBehaviorType as Record<symbol, unknown>)[UnfoldOpsSymbol] as
            Map<string, UnfoldOpEntry> | undefined
            : undefined;

    for (const { name, spec: entrySpec } of declarations.unfold) {
        const {
            [op as unknown as string]: _op,
            [spec as unknown as string]: opSpec,
            ...handlers
        } = entrySpec;
        const parentEntry = parentUnfoldOpsForMerge?.get(name);
        const mergedSpec = parentEntry
            ? { ...parentEntry.spec, ...(opSpec as Record<string, unknown> ?? {}) }
            : opSpec as Record<string, unknown>;
        addUnfoldOperation(
            callableBehavior,
            observerMap,
            name,
            mergedSpec,
            handlers as Record<string, AnyFn>
        );
    }

    // Register inline fold operations
    for (const { name, spec: entrySpec } of declarations.fold) {
        const {
            [op as unknown as string]: _op,
            [spec as unknown as string]: opSpec = {},
            _: handler
        } = entrySpec;
        addFoldOperation(
            callableBehavior,
            observerMap,
            name,
            opSpec as Record<string, unknown>,
            handler as AnyFn
        );
    }

    // Register inline map operations
    for (const { name, spec: entrySpec } of declarations.map) {
        const { [op as unknown as string]: _op, ...transforms } = entrySpec;
        addMapOperation(callableBehavior, observerMap, name, transforms as Record<string, AnyFn>);
    }

    // Register inline merge operations
    for (const { name, spec: entrySpec } of declarations.merge) {
        const {
            [op as unknown as string]: _op,
            [operations as unknown as string]: operationsList
        } = entrySpec;
        addMergeOperation(
            callableBehavior,
            observerMap,
            name,
            operationsList as string[]
        );
    }

    // Inherit parent operations
    if (parentBehaviorType) {
        const ptBT = parentBehaviorType as Record<symbol, unknown>,

            parentFoldOps = ptBT[FoldOpsSymbol] as Map<string, FoldOpEntry> | undefined;
        if (parentFoldOps) {
            const childFoldOps = ensureOwnMap<string, FoldOpEntry>(
                callableBehavior as unknown as Record<symbol, unknown>,
                FoldOpsSymbol
            );
            for (const [opName, opEntry] of parentFoldOps)
                if (!childFoldOps.has(opName)) childFoldOps.set(opName, opEntry);

        }

        const parentMapOps = ptBT[MapOpsSymbol] as Map<string, MapOpEntry> | undefined;
        if (parentMapOps) {
            const childMapOps = ensureOwnMap<string, MapOpEntry>(
                callableBehavior as unknown as Record<symbol, unknown>,
                MapOpsSymbol
            );
            for (const [opName, opEntry] of parentMapOps)
                if (!childMapOps.has(opName)) childMapOps.set(opName, opEntry);

        }

        const parentUnfoldOps = ptBT[UnfoldOpsSymbol] as Map<string, UnfoldOpEntry> | undefined;
        if (parentUnfoldOps) {
            const childUnfoldNames = new Set(declarations.unfold.map(d => d.name));
            for (const [opName, { spec: opSpec, handlers }] of parentUnfoldOps) {
                if (childUnfoldNames.has(opName)) continue;
                const allCovered =
                    [...observerMap.keys()].every(k => k in handlers);
                if (allCovered) {
                    addUnfoldOperation(
                        callableBehavior,
                        observerMap,
                        opName,
                        opSpec,
                        handlers
                    );
                }
            }
        }
    }

    // Validate that every fold with aux references names a known fold operation.
    // This runs after all folds (own + inherited) are registered.
    const allFoldOps = (callableBehavior as unknown as Record<symbol, unknown>)[FoldOpsSymbol] as
        Map<string, FoldOpEntry> | undefined;
    if (allFoldOps) {
        for (const [foldName, entry] of allFoldOps) {
            if (entry.auxNames) {
                for (const auxName of entry.auxNames) {
                    if (!allFoldOps.has(auxName)) {
                        throw new Error(
                            `Fold operation '${foldName}' references auxiliary fold '${auxName}' via 'aux', ` +
                            `but no fold named '${auxName}' exists on this behavior type`
                        );
                    }
                }
            }
        }
    }

    return callableBehavior as unknown as BehaviorADT<D>;
}

// ---- Unfold operation -------------------------------------------------------

function addUnfoldOperation(
    BehaviorType: BehaviorTypeLike,
    observerMap: Map<string, ObserverEntry>,
    name: string,
    opSpec: unknown,
    handlers: Record<string, AnyFn>
): BehaviorTypeLike {
    assertPascalCase(name, 'Unfold operation');

    let parsedSpec: Record<string, unknown>;
    if (typeof opSpec === 'function') {
        const specResult = (opSpec as (bt: unknown) => unknown)(BehaviorType);
        if (!specResult || typeof specResult !== 'object') {
            throw new TypeError(
                `Unfold operation '${name}' spec callback must return an object with optional 'in' and 'out' properties`
            );
        }
        parsedSpec = specResult as Record<string, unknown>;
    } else if (isObjectLiteral(opSpec))
        parsedSpec = opSpec as Record<string, unknown>;
    else if (opSpec === undefined || opSpec === null)
        parsedSpec = {};
    else
        throw new TypeError(`Unfold operation '${name}' spec must be a function or object literal`);


    if ('in' in parsedSpec)
        validateSpecGuard(parsedSpec['in'], 'in', name);

    if ('out' in parsedSpec)
        validateSpecGuard(parsedSpec['out'], 'out', name);


    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError(
            `Unfold operation '${name}' requires handlers object mapping observer names to functions`
        );
    }

    for (const observerName of observerMap.keys()) {
        if (!(observerName in handlers)) {
            throw new Error(
                `Unfold operation '${name}' missing handler for observer '${observerName}'`
            );
        }
    }

    for (const [observerName, handler] of Object.entries(handlers)) {
        if (typeof handler !== 'function') {
            throw new TypeError(
                `Handler for observer '${observerName}' in unfold '${name}' must be a function, got ${typeof handler}`
            );
        }
    }

    for (const handlerName of Object.keys(handlers)) {
        if (!observerMap.has(handlerName)) {
            throw new Error(
                `Unfold operation '${name}' has handler '${handlerName}' which does not correspond to any observer. ` +
                `Valid observers are: ${Array.from(observerMap.keys()).join(', ')}`
            );
        }
    }

    // Extract contracts from spec
    const unfoldContracts: ContractSpec | null = extractContracts(parsedSpec);

    const hasInput = hasInputSpec(parsedSpec),
        makeInstance = (seed: unknown) =>
            createBehaviorInstance(BehaviorType, observerMap, seed, handlers);

    if (hasInput) {
        BehaviorType[name] = function (seed: unknown) {
            validateTypeSpec(seed, parsedSpec['in'] as Parameters<typeof validateTypeSpec>[1], name, 'input of type');

            // Contract: demands check
            if (isCheckedMode() && unfoldContracts?.demands)
                checkDemands(unfoldContracts.demands, name, 'unfold', null, [seed]);

            const result = makeInstance(seed);

            // Contract: ensures check
            if (isCheckedMode() && unfoldContracts?.ensures)
                checkEnsures(unfoldContracts.ensures, name, 'unfold', null, seed, result, [seed]);

            return result;
        };
    } else {
        Object.defineProperty(BehaviorType, name, {
            get() {
                return makeInstance(undefined);
            },
            enumerable: true,
            configurable: true
        });
    }

    ensureOwnMap<string, UnfoldOpEntry>(
        BehaviorType as unknown as Record<symbol, unknown>,
        UnfoldOpsSymbol
    ).set(name, { spec: parsedSpec, handlers, contracts: unfoldContracts ?? undefined });

    return BehaviorType;
}

// ---- Fold execution ---------------------------------------------------------

function executeFold(
    proxyInstance: Record<string, unknown>,
    observerMap: Map<string, ObserverEntry>,
    handler: AnyFn,
    params: unknown[],
    isHisto: boolean = false,
    auxNames: string[] | null = null,
    auxIsArray: boolean = false,
    BehaviorType: BehaviorTypeLike | null = null,
    contracts: ContractSpec | null = null,
    opName: string = ''
): unknown {
    const observations: Record<string | symbol, unknown> = {};
    for (const [name, obs] of observerMap) {
        if (obs.isContinuation) {
            observations[name] = (...nextParams: unknown[]) => {
                const nextInstance = proxyInstance[name];
                return executeFold(
                    nextInstance as Record<string, unknown>,
                    observerMap,
                    handler,
                    nextParams,
                    isHisto,
                    auxNames,
                    auxIsArray,
                    BehaviorType
                );
            };
        } else
            observations[name] = proxyInstance[name];

    }

    // Histomorphism: inject [history] into observations.
    // For behavior folds, history provides access to the sub-observations
    // of continuations. Each continuation entry in history is a getter
    // that lazily produces the observations of the next behavior instance.
    if (isHisto) {
        const historyObj: Record<string, unknown> = {};
        for (const [name, obs] of observerMap) {
            if (obs.isContinuation) {
                Object.defineProperty(historyObj, name, {
                    get: () => {
                        const nextInstance = proxyInstance[name];
                        const subObs: Record<string | symbol, unknown> = {};
                        for (const [subName, subEntry] of observerMap) {
                            if (!subEntry.isContinuation)
                                subObs[subName] = (nextInstance as Record<string, unknown>)[subName];
                        }
                        // Recursively add [history] to sub-observations
                        const subHistoryObj: Record<string, unknown> = {};
                        for (const [subName, subEntry] of observerMap) {
                            if (subEntry.isContinuation) {
                                Object.defineProperty(subHistoryObj, subName, {
                                    get: () => {
                                        const nextNext = (nextInstance as Record<string, unknown>)[subName];
                                        return executeFoldObservations(
                                            nextNext as Record<string, unknown>,
                                            observerMap,
                                            true
                                        );
                                    },
                                    enumerable: true,
                                    configurable: true
                                });
                            }
                        }
                        subObs[history as unknown as symbol] = subHistoryObj;
                        return subObs;
                    },
                    enumerable: true,
                    configurable: true
                });
            }
        }
        observations[history as unknown as symbol] = historyObj;
    }

    // Zygomorphism: inject [aux] — auxiliary fold results on continuations.
    // For behavior folds, each auxiliary fold is executed on the continuation's
    // proxy instance. String aux → flat shape, array aux → nested shape.
    if (auxNames && auxNames.length > 0 && BehaviorType) {
        const auxObj: Record<string, unknown> = {};
        const foldMap = (BehaviorType as Record<symbol, unknown>)[FoldOpsSymbol] as
            Map<string, FoldOpEntry> | undefined;

        if (foldMap) {
            if (auxIsArray)
                for (const auxName of auxNames) auxObj[auxName] = {};

            // String form uses a single aux fold name; array form
            // iterates all names.  Kept as distinct branches so flat
            // mode cannot accidentally overwrite keys.
            const singleAuxName = auxIsArray ? null : auxNames[0];
            for (const [name, obs] of observerMap) {
                if (obs.isContinuation) {
                    const nextInstance = proxyInstance[name];
                    if (singleAuxName !== null) {
                        // Flat shape: auxObj[continuationName]
                        const auxFoldOp = foldMap.get(singleAuxName);
                        if (auxFoldOp) {
                            auxObj[name] = auxFoldOp.hasInput
                                ? (...p: unknown[]) => executeFold(
                                    nextInstance as Record<string, unknown>,
                                    observerMap, auxFoldOp.handler, p,
                                    auxFoldOp.isHisto
                                )
                                : executeFold(
                                    nextInstance as Record<string, unknown>,
                                    observerMap, auxFoldOp.handler, [],
                                    auxFoldOp.isHisto
                                );
                        }
                    } else {
                        // Nested shape: auxObj[foldName][continuationName]
                        for (const auxName of auxNames) {
                            const auxFoldOp = foldMap.get(auxName);
                            if (auxFoldOp) {
                                (auxObj[auxName] as Record<string, unknown>)[name] = auxFoldOp.hasInput
                                    ? (...p: unknown[]) => executeFold(
                                        nextInstance as Record<string, unknown>,
                                        observerMap, auxFoldOp.handler, p,
                                        auxFoldOp.isHisto
                                    )
                                    : executeFold(
                                        nextInstance as Record<string, unknown>,
                                        observerMap, auxFoldOp.handler, [],
                                        auxFoldOp.isHisto
                                    );
                            }
                        }
                    }
                }
            }
        }
        observations[aux as unknown as symbol] = auxObj;
    }

    // Contract checking around the fold handler
    if (isCheckedMode() && contracts) {
        // 1. Demands check
        if (contracts.demands)
            checkDemands(contracts.demands, opName, 'behavior', proxyInstance, params);

        const old = proxyInstance;

        try {
            const result = handler(observations, ...params);

            // 2. Ensures check
            if (contracts.ensures)
                checkEnsures(contracts.ensures, opName, 'behavior', proxyInstance, old, result, params);

            return result;
        } catch (error) {
            // 3. Rescue
            if (contracts.rescue && !(error instanceof DemandsError)) {
                const { result: rescueResult } = executeRescue(
                    contracts.rescue,
                    proxyInstance,
                    error,
                    params,
                    (...newArgs: unknown[]) => executeFold(
                        proxyInstance, observerMap, handler, newArgs,
                        isHisto, auxNames, auxIsArray, BehaviorType,
                        contracts, opName
                    ),
                    opName,
                    'behavior'
                );

                return rescueResult;
            }

            throw error;
        }
    }

    return handler(observations, ...params);
}

/**
 * Build an observations object for a behavior instance (used by histo
 * to lazily produce sub-observations at deeper levels).
 */
function executeFoldObservations(
    proxyInstance: Record<string, unknown>,
    observerMap: Map<string, ObserverEntry>,
    isHisto: boolean
): Record<string | symbol, unknown> {
    const obs: Record<string | symbol, unknown> = {};
    for (const [name, entry] of observerMap) {
        if (!entry.isContinuation)
            obs[name] = proxyInstance[name];
    }
    if (isHisto) {
        const historyObj: Record<string, unknown> = {};
        for (const [name, entry] of observerMap) {
            if (entry.isContinuation) {
                Object.defineProperty(historyObj, name, {
                    get: () => {
                        const nextInstance = proxyInstance[name];
                        return executeFoldObservations(
                            nextInstance as Record<string, unknown>,
                            observerMap,
                            true
                        );
                    },
                    enumerable: true,
                    configurable: true
                });
            }
        }
        obs[history as unknown as symbol] = historyObj;
    }
    return obs;
}

// ---- Mapped handlers --------------------------------------------------------

function createMappedHandlers(
    originalHandlers: Record<string, AnyFn> | undefined,
    observerMap: Map<string, ObserverEntry>,
    typeParam: string,
    transformFn: AnyFn
): Record<string, AnyFn> {
    const mappedHandlers: Record<string, AnyFn> = {};
    for (const [name, obs] of observerMap) {
        const origHandler = originalHandlers?.[name];
        if (!origHandler) continue;

        if (obs.isContinuation)
            mappedHandlers[name] = origHandler;

        else if (obs.isSimple &&
            (obs.spec as Record<symbol, unknown>)?.[TypeParamSymbol] === typeParam)
            mappedHandlers[name] = (seed: unknown) => transformFn(origHandler(seed));

        else if (obs.isParametric &&
            (obs.spec as { out?: Record<symbol, unknown> })?.out?.[TypeParamSymbol] === typeParam &&
            !isSelfRef((obs.spec as { out?: unknown })?.out)) {
            mappedHandlers[name] = (seed: unknown) => {
                const fn = origHandler(seed);
                return (...args: unknown[]) =>
                    transformFn((fn as AnyFn)(...args));
            };

        } else
            mappedHandlers[name] = origHandler;

    }
    return mappedHandlers;
}

/**
 * Pre-compose multiple map transforms into a single handler set.
 * This eliminates intermediate behavior instances in merge pipelines.
 */
function composeHandlers(
    originalHandlers: Record<string, AnyFn> | undefined,
    observerMap: Map<string, ObserverEntry>,
    transforms: MapTransformEntry[]
): Record<string, AnyFn> {
    let handlers: Record<string, AnyFn> = originalHandlers ?? {};
    for (const { typeParam, transformFn } of transforms)
        handlers = createMappedHandlers(handlers, observerMap, typeParam, transformFn);

    return handlers;
}

// ---- Fold operation registration --------------------------------------------

function addFoldOperation(
    BehaviorType: BehaviorTypeLike,
    _observerMap: Map<string, ObserverEntry>,
    name: string,
    opSpecArg: Record<string, unknown>,
    handler: AnyFn
): void {
    assertCamelCase(name, 'Fold operation');

    if (typeof handler !== 'function')
        throw new TypeError(`Fold operation '${name}' requires a '_' handler function`);


    const parsedSpec = opSpecArg || {};
    const parsedAux = parseAux(parsedSpec['aux']);

    // String form invariant: exactly one aux fold name.
    if (parsedAux.names && !parsedAux.isArray && parsedAux.names.length !== 1) {
        throw new TypeError(
            `Fold operation '${name}': string-form aux must reference exactly one fold, ` +
            `got ${parsedAux.names.length}`
        );
    }

    // Extract contracts from spec
    const foldContracts: ContractSpec | null = extractContracts(parsedSpec);

    ensureOwnMap<string, FoldOpEntry>(
        BehaviorType as unknown as Record<symbol, unknown>,
        FoldOpsSymbol
    ).set(name, {
        spec: parsedSpec,
        handler,
        hasInput: handler.length > 1,
        isHisto: parsedSpec['history'] === true,
        auxNames: parsedAux.names,
        auxIsArray: parsedAux.isArray,
        contracts: foldContracts ?? undefined
    });
}

// ---- Map operation registration ---------------------------------------------

function addMapOperation(
    BehaviorType: BehaviorTypeLike,
    _observerMap: Map<string, ObserverEntry>,
    name: string,
    transforms: Record<string, AnyFn>
): void {
    assertCamelCase(name, 'Map operation');


    const typeParam0Names = Object.keys(transforms);
    if (typeParam0Names.length !== 1) {
        throw new TypeError(
            `Map operation '${name}' must specify exactly one type parameter transform (got: ${typeParam0Names.join(', ')})`
        );
    }
    const typeParam = typeParam0Names[0],
        transformFn = transforms[typeParam];
    if (typeof transformFn !== 'function')
        throw new TypeError(`Map operation '${name}' transform for '${typeParam}' must be a function`);


    const isGetter = transformFn.length <= 1;

    ensureOwnMap<string, MapOpEntry>(
        BehaviorType as unknown as Record<symbol, unknown>,
        MapOpsSymbol
    ).set(name, { typeParam, transformFn, isGetter });
}

// ---- Merge helpers ----------------------------------------------------------

function getSymbolMap<V>(
    bt: BehaviorTypeLike,
    sym: symbol
): Map<string, V> | null {
    return (bt as Record<symbol, unknown>)[sym] instanceof Map
        ? (bt as Record<symbol, unknown>)[sym] as Map<string, V>
        : null;
}

/**
 * Collect pre-composable getter-map transforms from the given map names.
 * Returns `null` if any map is non-getter (cannot be pre-composed).
 */
function collectMapTransforms(
    mapOpsMap: Map<string, MapOpEntry> | null,
    mapNames: string[]
): MapTransformEntry[] | null {
    const transforms: MapTransformEntry[] = [];
    for (const mapName of mapNames) {
        const mapOp = mapOpsMap?.get(mapName);
        if (!mapOp || !mapOp.isGetter) return null;
        transforms.push({ typeParam: mapOp.typeParam, transformFn: mapOp.transformFn });
    }
    return transforms;
}

/**
 * Optionally fold an instance.  Returns the fold result when a fold
 * operation is present, otherwise returns the instance as-is.
 */
function maybeFold(
    instance: unknown,
    observerMap: Map<string, ObserverEntry>,
    foldOp: FoldOpEntry | null,
    params: unknown[],
    BehaviorType: BehaviorTypeLike | null = null,
    foldName: string = ''
): unknown {
    if (!foldOp) return instance;
    return executeFold(
        instance as Record<string, unknown>,
        observerMap, foldOp.handler,
        foldOp.hasInput ? params : [],
        foldOp.isHisto,
        foldOp.auxNames ?? null,
        foldOp.auxIsArray ?? false,
        BehaviorType,
        foldOp.contracts ?? null,
        foldName
    );
}

// ---- Merge operation registration -------------------------------------------

function addMergeOperation(
    BehaviorType: BehaviorTypeLike,
    observerMap: Map<string, ObserverEntry>,
    name: string,
    operationNames: string[]
): void {
    if (!Array.isArray(operationNames) || operationNames.length === 0)
        throw new TypeError(`Merge operation '${name}' requires a non-empty 'operations' array`);

    const foldMap = getSymbolMap<FoldOpEntry>(BehaviorType, FoldOpsSymbol),
        mapOpsMap = getSymbolMap<MapOpEntry>(BehaviorType, MapOpsSymbol),
        unfoldOpsMap = getSymbolMap<UnfoldOpEntry>(BehaviorType, UnfoldOpsSymbol);

    const unfoldNames = operationNames.filter(opName => {
            const desc = Object.getOwnPropertyDescriptor(BehaviorType, opName);
            return desc !== undefined;
        }),
        foldNames = operationNames.filter(opName => foldMap?.has(opName) ?? false),
        mapNames = operationNames.filter(opName => mapOpsMap?.has(opName) ?? false);

    for (const opName of operationNames) {
        const known = unfoldNames.includes(opName) ||
            foldNames.includes(opName) || mapNames.includes(opName);
        if (!known)
            throw new TypeError(`Merge operation '${name}' references unknown operation '${opName}'`);

    }

    const hasUnfold = unfoldNames.length > 0,
        foldName = foldNames[0],
        foldOp = foldName ? foldMap?.get(foldName) ?? null : null;

    if (hasUnfold) assertPascalCase(name, 'Merge operation (with unfold)');
    else assertCamelCase(name, 'Merge operation (without unfold)');

    // Reject non-getter maps: merge pipelines cannot supply map parameters
    for (const mapName of mapNames) {
        const mapOp = mapOpsMap?.get(mapName);
        if (mapOp && !mapOp.isGetter) {
            throw new TypeError(
                `Merge operation '${name}' references parameterized map '${mapName}' which requires arguments. ` +
                `Only getter maps (arity 0-1) can be used in merge pipelines.`
            );
        }
    }

    const mapTransforms = collectMapTransforms(mapOpsMap, mapNames);

    if (hasUnfold) {
        const unfoldName = unfoldNames[0],
            unfoldDescriptor = Object.getOwnPropertyDescriptor(BehaviorType, unfoldName),
            unfoldIsGetter = unfoldDescriptor?.get !== undefined,
            unfoldEntry = unfoldOpsMap?.get(unfoldName);

        // Pre-compose map transforms into unfold handlers when possible
        const composedHandlers = mapTransforms && unfoldEntry
            ? composeHandlers(unfoldEntry.handlers, observerMap, mapTransforms)
            : null;

        // Cache the unfold's input spec for validation on the deforestation path
        const unfoldInSpec = unfoldEntry?.spec?.['in'] as
            Parameters<typeof validateTypeSpec>[1] | undefined;

        const buildInstance = (seed: unknown): unknown => {
            if (composedHandlers) {
                if (unfoldInSpec)
                    validateTypeSpec(seed, unfoldInSpec, unfoldName, 'input of type');
                return createBehaviorInstance(BehaviorType, observerMap, seed, composedHandlers);
            }

            // Fallback: sequential application (non-getter maps or no maps)
            let instance: unknown = unfoldIsGetter
                ? BehaviorType[unfoldName]
                : (BehaviorType[unfoldName] as AnyFn)(seed);
            if (!unfoldIsGetter) {
                for (const mapName of mapNames) {
                    const mapOp = mapOpsMap?.get(mapName);
                    if (mapOp?.isGetter) instance = (instance as Record<string, unknown>)[mapName];
                }
            } else {
                for (const mapName of mapNames) {
                    const mapOp = mapOpsMap?.get(mapName);
                    if (mapOp?.isGetter) instance = (instance as Record<string, unknown>)[mapName];
                }
            }

            return instance;
        };

        if (!unfoldIsGetter) {
            BehaviorType[name] = function (seed: unknown, ...rest: unknown[]) {
                return maybeFold(buildInstance(seed), observerMap, foldOp ?? null, rest, BehaviorType);
            };
        } else {
            Object.defineProperty(BehaviorType, name, {
                get() {
                    return maybeFold(buildInstance(undefined), observerMap, foldOp ?? null, [], BehaviorType);
                },
                enumerable: true,
                configurable: true
            });
        }
    } else {
        if (!foldOp)
            throw new TypeError(`Merge operation '${name}' has no fold operation`);

        ensureOwnMap<string, FoldOpEntry>(
            BehaviorType as unknown as Record<symbol, unknown>,
            FoldOpsSymbol
        ).set(name, {
            spec: foldOp.spec,
            handler: foldOp.handler,
            hasInput: foldOp.hasInput,
            isHisto: foldOp.isHisto,
            auxNames: foldOp.auxNames,
            auxIsArray: foldOp.auxIsArray,
            preMapTransforms: mapTransforms && mapTransforms.length > 0 ? mapTransforms : undefined
        });
    }
}

// ---- Behavior instance creation ---------------------------------------------

function createBehaviorInstance(
    BehaviorType: BehaviorTypeLike,
    observerMap: Map<string, ObserverEntry>,
    seed: unknown,
    unfoldHandlers: Record<string, AnyFn> | undefined
): object {
    const instance = Object.create(
        (BehaviorType as { prototype?: object }).prototype || Object.prototype
    );

    (instance as Record<symbol, unknown>)[BehaviorSymbol] = true;
    (instance as Record<symbol, unknown>)[BehaviorTypeSymbol] = BehaviorType;

    behaviorInstanceState.set(instance, {
        seed,
        memo: new Map(),
        handlers: unfoldHandlers
    });

    const makeInstance = (s: unknown, h: Record<string, AnyFn> | undefined) =>
            createBehaviorInstance(BehaviorType, observerMap, s, h),

        proxy = new Proxy(instance, {
            get(target, prop, receiver) {
                if (typeof prop === 'symbol')
                    return Reflect.get(target, prop, receiver);


                if (prop === 'constructor' || prop === 'toString' || prop === 'valueOf')
                    return Reflect.get(target, prop, receiver);


                const observer = observerMap.get(prop);
                if (!observer) {
                    const bt = (target as Record<symbol, unknown>)[BehaviorTypeSymbol] as
                        BehaviorTypeLike | undefined,

                        foldOp = bt?.[FoldOpsSymbol] instanceof Map
                            ? (bt[FoldOpsSymbol] as Map<string, FoldOpEntry>).get(prop)
                            : undefined;
                    if (foldOp) {
                        const { hasInput, handler, isHisto: foldIsHisto,
                            auxNames: foldAuxNames, auxIsArray: foldAuxIsArray } = foldOp;

                        // Determine the target instance for the fold.
                        // With preMapTransforms, compose maps into current handlers
                        // to create a single mapped instance (deforestation).
                        let foldTarget: unknown;
                        if (foldOp.preMapTransforms && foldOp.preMapTransforms.length > 0) {
                            const state = behaviorInstanceState.get(target);
                            const composedHandlers = composeHandlers(
                                state?.handlers, observerMap, foldOp.preMapTransforms
                            );
                            foldTarget = makeInstance(
                                state?.seed, composedHandlers
                            );
                        } else
                            foldTarget = receiver;


                        if (hasInput) {
                            return function (...params: unknown[]) {
                                return executeFold(
                                    foldTarget as Record<string, unknown>,
                                    observerMap, handler, params, foldIsHisto,
                                    foldAuxNames, foldAuxIsArray, bt ?? null,
                                    foldOp.contracts ?? null, prop
                                );
                            };
                        }
                        return executeFold(
                            foldTarget as Record<string, unknown>, observerMap, handler, [],
                            foldIsHisto,
                            foldAuxNames, foldAuxIsArray, bt ?? null,
                            foldOp.contracts ?? null, prop
                        );
                    }

                    const mapOp = bt?.[MapOpsSymbol] instanceof Map
                        ? (bt[MapOpsSymbol] as Map<string, MapOpEntry>).get(prop)
                        : undefined;
                    if (mapOp) {
                        const state = behaviorInstanceState.get(target),
                            { typeParam, transformFn, isGetter } = mapOp;
                        if (isGetter) {
                            const mappedHandlers = createMappedHandlers(
                                state?.handlers, observerMap, typeParam, transformFn
                            );
                            return makeInstance(state?.seed, mappedHandlers);
                        } else {
                            return function (...extraArgs: unknown[]) {
                                const mappedHandlers = createMappedHandlers(
                                    state?.handlers, observerMap, typeParam,
                                    (value: unknown) => transformFn(value, ...extraArgs)
                                );
                                return makeInstance(state?.seed, mappedHandlers);
                            };
                        }
                    }

                    return Reflect.get(target, prop, receiver);
                }

                const state = behaviorInstanceState.get(target);
                if (!state)
                    throw new Error(`Behavior instance state not found for property '${prop}'`);


                const handler = unfoldHandlers?.[prop];
                if (!handler) {
                    throw new Error(
                        `No unfold handler defined for observer '${prop}'. ` +
                        `Define an unfold operation (e.g., 'From: { [op]: "unfold", [spec]: {...}, ...handlers }') to construct behavior instances.`
                    );
                }

                if (observer.isContinuation) {
                    if (state.memo.has(prop))
                        return state.memo.get(prop);


                    const nextSeed = (handler as AnyFn)(state.seed),
                        nextInstance = makeInstance(nextSeed, unfoldHandlers);

                    state.memo.set(prop, nextInstance);
                    return nextInstance;

                } else if (observer.isParametric) {
                    const outputIsSelf = isSelfRef((observer.spec as { out?: unknown })?.out);

                    if (state.memo.has(prop))
                        return state.memo.get(prop);


                    const observerFn = function (...args: unknown[]) {
                        const fn = (handler as AnyFn)(state.seed);
                        if (typeof fn !== 'function') {
                            throw new Error(
                                `Parametric observer '${prop}' handler must return a function, got ${typeof fn}`
                            );
                        }
                        const result = (fn as AnyFn)(...args);

                        if (outputIsSelf)
                            return makeInstance(result, unfoldHandlers);


                        return result;
                    };

                    state.memo.set(prop, observerFn);
                    return observerFn;

                } else if (observer.isSimple)
                    return (handler as AnyFn)(state.seed);
                else
                    throw new Error(`Unknown observer type for '${prop}'`);

            },

            has(target, prop) {
                if (observerMap.has(prop as string))
                    return true;

                const bt = (target as Record<symbol, unknown>)[BehaviorTypeSymbol] as
                    BehaviorTypeLike | undefined;
                if (bt?.[FoldOpsSymbol] instanceof Map &&
                    (bt[FoldOpsSymbol] as Map<string, unknown>).has(prop as string)) return true;
                if (bt?.[MapOpsSymbol] instanceof Map &&
                    (bt[MapOpsSymbol] as Map<string, unknown>).has(prop as string)) return true;
                return Reflect.has(target, prop);
            },

            set(_target, prop, _value) {
                throw new Error(
                    `Cannot set property '${String(prop)}' on behavior instance. Behavior instances are immutable.`
                );
            }
        });

    return proxy;
}
