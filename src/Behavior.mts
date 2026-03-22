import { behaviorObservers } from './BehaviorOps.mjs';
import type { Observer } from './BehaviorOps.mjs';

import {
    IsParameterizedInstance,
    ParentADTSymbol,
    TypeArgsSymbol,
    VariantDeclSymbol,
    TypeParamSymbol,
    callable,
    isObjectLiteral,
    isConstructable,
    hasInputSpec,
    ensureOwnMap,
    installGetter,
    extractParamNames
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
    assertPascalCase,
    LapisTypeSymbol,
    satisfies,
    properties as propertiesSym,
    parseProperties
} from './operations.mjs';

import {
    type ProtocolEntry,
    parseProtocolEntries,
    applyUnconditionalProtocols,
    resolveOperationContracts
} from './Protocol.mjs';

import {
    checkDemands,
    checkEnsures,
    tryRescue,
    type ContractSpec
} from './contracts.mjs';

import type { BehaviorADT, BehaviorADTWithParams, BehaviorDeclParams, ObserverInputValue, SpecValue, SelfRef } from './types.mjs';
import type { UnfoldDef, ContractCallbacks } from './ops.mjs';
import { fold as foldOp, unfold as unfoldOp, map as mapOp, merge as mergeOp } from './ops.mjs';

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
    UnfoldOpsSymbol: unique symbol = Symbol('UnfoldOps'),

    /** Tracks merge operation names on a behavior type (for protocol conformance) */
    MergeOpsSymbol: unique symbol = Symbol('MergeOps');

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
    properties?: ReadonlySet<string>;
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
    properties?: ReadonlySet<string>;
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
    [MergeOpsSymbol]?: Set<string>;
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

function createSelf(behaviorType?: BehaviorTypeLike): { [SelfRefSymbol]: true; (typeParam?: unknown): unknown } {
    const fn = function (_typeParam?: unknown): unknown {
        return fn;
    };
    (fn as unknown as Record<symbol, boolean>)[SelfRefSymbol] = true;

    if (!behaviorType) return fn as unknown as { [SelfRefSymbol]: true; (typeParam?: unknown): unknown };

    // Return a Proxy that delegates property access to the BehaviorType.
    // Handlers capture Self in closures during .ops(), but aren't called until
    // the behavior instance is observed — by which time constructors are registered.
    return new Proxy(fn, {
        get(target, prop, receiver) {
            if (prop === SelfRefSymbol) return true;
            if (prop in (behaviorType as Record<string | symbol, unknown>))
                return (behaviorType as Record<string | symbol, unknown>)[prop];
            return Reflect.get(target, prop, receiver);
        },
        has(target, prop) {
            if (prop === SelfRefSymbol) return true;
            if (prop in (behaviorType as Record<string | symbol, unknown>)) return true;
            return Reflect.has(target, prop);
        }
    }) as unknown as { [SelfRefSymbol]: true; (typeParam?: unknown): unknown };
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

function validateAuxFoldReferences(behaviorType: BehaviorTypeLike): void {
    const allFoldOps = (behaviorType as unknown as Record<symbol, unknown>)[FoldOpsSymbol] as
        Map<string, FoldOpEntry> | undefined;
    if (!allFoldOps) return;
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

// ---- Main entry point -------------------------------------------------------

/**
 * The intermediate structure returned by behavior() before .ops() is called.
 * Includes the behavior type plus the two-phase .ops() method.
 */
export type BehaviorStructure<D> = BehaviorADTWithParams<D> & {
    ops<O extends Record<string, unknown>>(
        opsFn: (ctx: BehaviorOpsContext<D>) => O
    ): BehaviorADTWithParams<D & O>;
};

/**
 * Defines a new behavior type with the given observers.
 * Behavior is defined by how it can be observed (destructors), not how it's constructed.
 */
export function behavior<D extends Record<string, unknown>>(
    declFn: (params: BehaviorDeclParams) => D
): BehaviorStructure<D> {
    if (typeof declFn !== 'function') {
        throw new TypeError(
            'behavior() requires a callback function: behavior(({ Self, T }) => ({ observers }))'
        );
    }

    // Extract type parameter names from callback function
    // ts-runtime-only: cannot be typed statically — reads function source
    const typeParamNames = extractParamNames(
        declFn as (...args: unknown[]) => unknown, p => p !== 'Self'
    );

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
        observerDecl: behaviorObserverDecl,
        parentBehaviorType,
        declarations
    } = createBehavior();

    const behaviorProtocols = parseProtocolEntries(
        (behaviorObserverDecl as Record<string | symbol, unknown>)[satisfies]
    );

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
            throw new TypeError(
                'Parameterized behaviors must be instantiated with an object: ' +
                `e.g. MyBehavior({ ${typeParamNames.map(k => `${k}: Number`).join(', ')} })`
            );
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

    // Store parent behavior reference for .ops() contract inheritance
    if (parentBehaviorType)
        (callableBehavior as unknown as Record<symbol, unknown>)[Symbol.for('__lapisParentBehavior__')] = parentBehaviorType;

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
            handler as AnyFn,
            parentBehaviorType
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

        const parentMergeOps = ptBT[MergeOpsSymbol] as Set<string> | undefined;
        if (parentMergeOps) {
            const childBT = callableBehavior as unknown as Record<symbol, unknown>;
            let childMergeOps = childBT[MergeOpsSymbol] as Set<string> | undefined;
            if (!childMergeOps) { childMergeOps = new Set(); childBT[MergeOpsSymbol] = childMergeOps; }
            for (const opName of parentMergeOps)
                childMergeOps.add(opName);
        }
    }

    // (paramParent ops are inherited via prototype chain for parameterized specializations)

    // Validate that every fold with aux references names a known fold operation.
    // This runs after all folds (own + inherited) are registered.
    validateAuxFoldReferences(callableBehavior);

    (callableBehavior as unknown as Record<symbol, boolean>)[LapisTypeSymbol] = true;

    // Attach .ops() method for two-phase declarations
    const opsTypeParamObjects: Record<string, { [TypeParamSymbol]: string }> = {};
    for (const paramName of typeParamNames)
        opsTypeParamObjects[paramName] = { [TypeParamSymbol]: paramName };
    attachBehaviorOpsMethod<D>(callableBehavior, observerMap, opsTypeParamObjects, behaviorProtocols);

    return callableBehavior as unknown as BehaviorStructure<D>;
}

// ---- D-aware operation types for .ops() context -----------------------------

/**
 * Resolve a single observer spec to its unfold handler return type.
 * Uses `unknown` for continuations (SelfRef) since unfold handlers return
 * seeds for the next instance, not full behavior instances.
 */
type UnfoldObserverValue<Spec> =
    Spec extends SelfRef ? unknown :
        Spec extends { in: infer In; out: infer Out }
            ? (input: ObserverInputValue<In, unknown>) => SpecValue<Out, unknown>
            : Spec extends { out: infer Out }
                ? SpecValue<Out, unknown>
                : SpecValue<Spec, unknown>;

/**
 * String keys of D that are NOT operation definitions (no [op] symbol key).
 */
type NonOpKeys<D> = {
    [K in keyof D & string]: (typeof op) extends keyof D[K] ? never : K
}[keyof D & string];

/**
 * Extract the parent declaration P from D's [extend] property.
 */
type ParentBehaviorDecl<D> =
    (typeof extend) extends keyof D
        ? D[typeof extend] extends BehaviorADT<infer P> ? P : never
        : never;

/**
 * All observer-only string keys from D and its parent [extend] chain.
 * Filters out operation entries (those carrying [op]) at each level.
 */
type AllObserverKeys<D> =
    | NonOpKeys<D>
    | (ParentBehaviorDecl<D> extends never ? never : AllObserverKeys<ParentBehaviorDecl<D>>);

/**
 * Resolve the expected return type of an unfold handler for key K.
 * Own keys (in D) use UnfoldObserverValue for safe resolution.
 * Inherited keys walk the [extend] chain to find the original observer spec.
 */
type UnfoldHandlerReturn<D, K extends string> =
    K extends keyof D ? UnfoldObserverValue<D[K]>
        : ParentBehaviorDecl<D> extends never ? unknown
            : UnfoldHandlerReturn<ParentBehaviorDecl<D>, K>;

/**
 * Maps behavior observer keys to unfold handler functions with inferred types.
 * Each handler's return type is resolved from the observer declaration.
 * When the unfold spec has `in: In`, handlers receive a seed argument.
 */
type BehaviorUnfoldHandlers<D, S> = {
    [K in AllObserverKeys<D>]: S extends { in: infer In }
        ? (seed: ObserverInputValue<In, never>) => UnfoldHandlerReturn<D, K & string>
        : () => UnfoldHandlerReturn<D, K & string>
};

/**
 * D-aware unfold: threads the behavior's observer declarations D into handler
 * types so parameters and return types are inferred from the observer specs.
 */
type BehaviorUnfoldFn<D> = <S extends Record<string | symbol, unknown>>(s: S & ContractCallbacks) =>
(handlers: BehaviorUnfoldHandlers<D, S>) => UnfoldDef<S, BehaviorUnfoldHandlers<D, S>>;

// ---- Ops context type -------------------------------------------------------

type BehaviorOpsContext<D> = {
    fold: typeof foldOp;
    unfold: BehaviorUnfoldFn<D>;
    map: typeof mapOp;
    merge: typeof mergeOp;
    Self: { [SelfRefSymbol]: true; (typeParam?: unknown): unknown; [key: string]: (...args: unknown[]) => unknown };
    [key: string]: unknown;
};

/**
 * Collect the names of all registered operations (fold, map, unfold) on a
 * behavior type into a single `Set`. Used for protocol conformance checking.
 *
 * @param BehaviorType - The callable behavior type to inspect.
 * @returns A set of operation name strings across all operation kinds.
 */
function getBehaviorOpNames(BehaviorType: BehaviorTypeLike): Set<string> {
    const names = new Set<string>();
    const bt = BehaviorType as unknown as Record<symbol, unknown>;
    const foldOps = bt[FoldOpsSymbol] as Map<string, unknown> | undefined;
    if (foldOps) for (const name of foldOps.keys()) names.add(name);
    const mapOps = bt[MapOpsSymbol] as Map<string, unknown> | undefined;
    if (mapOps) for (const name of mapOps.keys()) names.add(name);
    const unfoldOps = bt[UnfoldOpsSymbol] as Map<string, unknown> | undefined;
    if (unfoldOps) for (const name of unfoldOps.keys()) names.add(name);
    const mergeOps = bt[MergeOpsSymbol] as Set<string> | undefined;
    if (mergeOps) for (const name of mergeOps) names.add(name);
    return names;
}

/**
 * Attach the `.ops()` method onto a callable behavior object.
 *
 * `.ops()` is the second phase of a two-phase behavior declaration. It
 * receives an operations context (fold, unfold, map, merge, Self, and any
 * type-param markers) and registers the returned operations — fold handlers,
 * unfold constructors, map transforms, and merge aliases — onto the behavior
 * type. After all operations are registered it validates protocol conformance
 * against any `[satisfies]` entries declared in phase 1.
 *
 * @template D - The observer declaration type passed to `behavior()`.
 * @param BehaviorType     - The callable behavior object to attach `.ops()` to.
 * @param observerMap      - The map of observer name → `ObserverEntry` built
 *                           during phase 1; used to wire unfold handlers to
 *                           their corresponding observer fields.
 * @param typeParamObjects - Optional map of type-parameter name → marker
 *                           object (e.g. `{ T: { [TypeParamSymbol]: 'T' } }`).
 *                           These are forwarded into the ops context so that
 *                           parameterized behaviors can reference `T` etc.
 * @param protocols        - Normalized `ProtocolEntry[]` parsed from the
 *                           phase-1 `[satisfies]` declaration. Unconditional
 *                           entries are validated and registered after all
 *                           operations are installed.
 */
function attachBehaviorOpsMethod<D extends Record<string, unknown>>(
    BehaviorType: BehaviorTypeLike,
    observerMap: Map<string, ObserverEntry>,
    typeParamObjects: Record<string, { [TypeParamSymbol]: string }> = {},
    protocols: ProtocolEntry[] = []
): void {
    (BehaviorType as BehaviorStructure<D>).ops = function behaviorOps<O extends Record<string, unknown>>(
        opsFn: (ctx: BehaviorOpsContext<D>) => O
    ): BehaviorADTWithParams<D & O> {
        const ctx = {
            fold: foldOp,
            unfold: unfoldOp as BehaviorUnfoldFn<D>,
            map: mapOp,
            merge: mergeOp,
            Self: createSelf(BehaviorType)
        } as BehaviorOpsContext<D>;

        // Forward type param markers passed explicitly from the behavior() closure
        for (const [key, value] of Object.entries(typeParamObjects))
            (ctx as Record<string, unknown>)[key] = value;

        const opsObj = opsFn(ctx);
        const parentBT = (BehaviorType as Record<symbol, unknown>)[
            Symbol.for('__lapisParentBehavior__')
        ] as BehaviorTypeLike | undefined ?? null;

        // Register operations from the ops callback
        for (const [entryName, entrySpec] of Object.entries(opsObj)) {
            if (!entrySpec || typeof entrySpec !== 'object') continue;
            const opKind = (entrySpec as Record<symbol, string>)[op as unknown as symbol];
            if (opKind === 'unfold') {
                const {
                    [op as unknown as string]: _op,
                    [spec as unknown as string]: opSpec,
                    ...handlers
                } = entrySpec as Record<string, unknown>;
                const parentUnfoldOps = (BehaviorType as Record<symbol, unknown>)[UnfoldOpsSymbol] as
                    Map<string, UnfoldOpEntry> | undefined;
                const parentEntry = parentUnfoldOps?.get(entryName);
                if (parentEntry) {
                    const childOpSpec = opSpec as Record<string, unknown> ?? {},
                        parentOpSpec = parentEntry.spec,
                        parentHasIn = 'in' in parentOpSpec,
                        childHasIn = 'in' in childOpSpec,
                        childHasOut = 'out' in childOpSpec,
                        parentHasOut = 'out' in parentOpSpec;
                    if (!parentHasIn && childHasIn)
                        throw new Error(`Cannot change unfold '${entryName}' from parameterless to parameterized when overriding`);
                    if (childHasIn && parentHasIn && !specsCompatible(childOpSpec['in'], parentOpSpec['in']))
                        throw new Error(`Cannot change unfold '${entryName}' input specification when overriding`);
                    if (childHasOut && parentHasOut && !specsCompatible(childOpSpec['out'], parentOpSpec['out']))
                        throw new Error(`Cannot change unfold '${entryName}' output specification when overriding`);
                }
                const mergedSpec = parentEntry
                    ? { ...parentEntry.spec, ...(opSpec as Record<string, unknown> ?? {}) }
                    : opSpec as Record<string, unknown>;
                addUnfoldOperation(
                    BehaviorType, observerMap, entryName,
                    mergedSpec, handlers as Record<string, AnyFn>,
                    protocols
                );
            } else if (opKind === 'fold') {
                const {
                    [op as unknown as string]: _op,
                    [spec as unknown as string]: opSpec = {},
                    _: handler
                } = entrySpec as Record<string, unknown>;
                addFoldOperation(
                    BehaviorType, observerMap, entryName,
                    opSpec as Record<string, unknown>,
                    handler as AnyFn,
                    parentBT,
                    protocols
                );
            } else if (opKind === 'map') {
                const { [op as unknown as string]: _op, ...transforms } = entrySpec as Record<string, unknown>;
                addMapOperation(BehaviorType, observerMap, entryName, transforms as Record<string, AnyFn>);
            } else if (opKind === 'merge') {
                const {
                    [op as unknown as string]: _op,
                    [operations as unknown as string]: operationsList
                } = entrySpec as Record<string, unknown>;
                addMergeOperation(
                    BehaviorType, observerMap, entryName, operationsList as string[]
                );
            }
        }

        // Validate aux references after all ops from .ops() are registered
        validateAuxFoldReferences(BehaviorType);

        // Validate protocol conformance and register unconditional conformances
        const registeredOpNames = getBehaviorOpNames(BehaviorType);
        applyUnconditionalProtocols(
            (BehaviorType as unknown as { prototype: object }).prototype,
            registeredOpNames,
            protocols,
            'Behavior',
            BehaviorType
        );

        return BehaviorType as BehaviorADTWithParams<D & O>;
    };
}

// ---- Unfold operation -------------------------------------------------------

function addUnfoldOperation(
    BehaviorType: BehaviorTypeLike,
    observerMap: Map<string, ObserverEntry>,
    name: string,
    opSpec: unknown,
    handlers: Record<string, AnyFn>,
    protocols: ProtocolEntry[] = []
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

    // Extract contracts from spec, composing with any protocol-level contracts
    // as the outermost layer (algebraic law → implementation).
    const unfoldContracts = resolveOperationContracts(protocols, name, parsedSpec);

    const hasInput = hasInputSpec(parsedSpec),
        makeInstance = (seed: unknown) =>
            createBehaviorInstance(BehaviorType, observerMap, seed, handlers);

    // Shared checked-mode helper for both seeded and seedless unfold paths.
    const checkedUnfold = (
        seed: unknown,
        args: unknown[],
        retryBody: (...newArgs: unknown[]) => unknown
    ): unknown => {
        if (unfoldContracts!.demands)
            checkDemands(unfoldContracts!.demands, name, 'unfold', null, args);

        try {
            const result = makeInstance(seed);

            if (unfoldContracts!.ensures)
                checkEnsures(unfoldContracts!.ensures, name, 'unfold', null, seed, result, args);

            return result;
        } catch (error) {
            const rescued = tryRescue(unfoldContracts, error, null, args, retryBody, name, 'unfold');
            if (rescued !== null) return rescued.result;
            throw error;
        }
    };

    if (hasInput) {
        BehaviorType[name] = function (seed: unknown) {
            validateTypeSpec(seed, parsedSpec['in'] as Parameters<typeof validateTypeSpec>[1], name, 'input of type');

            if (unfoldContracts) {
                return checkedUnfold(seed, [seed],
                    (...newArgs: unknown[]) =>
                        (BehaviorType[name] as (s: unknown) => unknown)(newArgs[0]));
            }

            return makeInstance(seed);
        };
    } else {
        installGetter(BehaviorType as unknown as object, name, function() {
            if (unfoldContracts) {
                return checkedUnfold(undefined, [],
                    () => BehaviorType[name] as unknown);
            }

            return makeInstance(undefined);
        });
    }

    ensureOwnMap<string, UnfoldOpEntry>(
        BehaviorType as unknown as Record<symbol, unknown>,
        UnfoldOpsSymbol
    ).set(name, {
        spec: parsedSpec,
        handlers,
        contracts: unfoldContracts ?? undefined,
        properties: (() => {
            const p = parseProperties(
                (parsedSpec as Record<string | symbol, unknown>)[propertiesSym], name
            );
            return p.size > 0 ? p : undefined;
        })()
    });

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
    if (contracts) {
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
            const rescued = tryRescue(contracts, error, proxyInstance, params,
                (...newArgs: unknown[]) => executeFold(
                    proxyInstance, observerMap, handler, newArgs,
                    isHisto, auxNames, auxIsArray, BehaviorType,
                    contracts, opName
                ),
                opName, 'behavior');
            if (rescued !== null) return rescued.result;
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
    handler: AnyFn,
    parentBehaviorType?: BehaviorTypeLike | null,
    protocols: ProtocolEntry[] = []
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

    // Extract contracts from spec, composing with protocol-level contracts (outermost)
    // then parent behavior contracts (middle), then child implementation contracts.
    const parentFoldEntry = parentBehaviorType
        ? ((parentBehaviorType as Record<symbol, unknown>)[FoldOpsSymbol] as
            Map<string, FoldOpEntry> | undefined)?.get(name)
        : undefined;
    const foldContracts = resolveOperationContracts(
        protocols, name, parsedSpec, parentFoldEntry?.contracts
    );

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
        contracts: foldContracts ?? undefined,
        properties: (() => {
            const p = parseProperties(
                (parsedSpec as Record<string | symbol, unknown>)[propertiesSym], name
            );
            return p.size > 0 ? p : undefined;
        })()
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

    // Track merge operation name for protocol conformance checking
    const bt = BehaviorType as unknown as Record<symbol, unknown>;
    let mergeSet = bt[MergeOpsSymbol] as Set<string> | undefined;
    if (!mergeSet) { mergeSet = new Set(); bt[MergeOpsSymbol] = mergeSet; }
    mergeSet.add(name);

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

    // Determine pipeline shape: hylomorphism (unfold first) vs metamorphism (fold first)
    const unfoldIndex = hasUnfold
            ? operationNames.indexOf(unfoldNames[0])
            : -1,
        isHylomorphism = hasUnfold && unfoldIndex === 0,
        isMetamorphism = hasUnfold && unfoldIndex > 0;

    if (isHylomorphism) assertPascalCase(name, 'Merge operation (with unfold)');
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

    // ---- Shared unfold setup (used by both metamorphism and hylomorphism) ----
    const unfoldName = hasUnfold ? unfoldNames[0] : '',
        unfoldDescriptor = hasUnfold
            ? Object.getOwnPropertyDescriptor(BehaviorType, unfoldName) : undefined,
        unfoldIsGetter = unfoldDescriptor?.get !== undefined,
        unfoldEntry = hasUnfold ? unfoldOpsMap?.get(unfoldName) : undefined;

    /**
     * Unfold a seed into a new behavior instance, then sequentially apply
     * getter-map operations to the result.
     *
     * When pre-composed `handlers` are available (deforestation path), a single
     * behavior instance is created directly from the fused handlers, bypassing
     * intermediate structures.  Otherwise, the unfold is executed first and each
     * map is applied in pipeline order as a sequential fallback.
     *
     * Shared between metamorphism (post-unfold phase) and hylomorphism pipelines.
     *
     * @param seed  The value used to seed the unfold operation.
     * @param handlers  Pre-composed unfold+map handler set, or `null` to fall
     *   back to sequential unfold → map application.
     * @param mapNamesToApply  Ordered list of getter-map operation names to
     *   apply after the unfold (ignored when `handlers` is non-null).
     * @returns The resulting behavior instance (possibly map-transformed).
     */
    const unfoldAndApplyMaps = (
        seed: unknown,
        handlers: Record<string, AnyFn> | null,
        mapNamesToApply: string[]
    ): unknown => {
        if (handlers)
            return createBehaviorInstance(BehaviorType, observerMap, seed, handlers);

        // Fallback: sequential application
        let instance: unknown = unfoldIsGetter
            ? BehaviorType[unfoldName]
            : (BehaviorType[unfoldName] as AnyFn)(seed);
        for (const mapName of mapNamesToApply) {
            const mapOp = mapOpsMap?.get(mapName);
            if (mapOp?.isGetter) instance = (instance as Record<string, unknown>)[mapName];
        }

        return instance;
    };

    if (isMetamorphism) {
        // Metamorphism: fold → unfold (instance method)
        // The fold consumes the current instance, the result seeds the unfold.

        // Collect map operations that appear AFTER the unfold in the pipeline
        const postUnfoldMapNames = operationNames.slice(unfoldIndex + 1)
            .filter(opName => mapNames.includes(opName));
        const postUnfoldMapTransforms = collectMapTransforms(mapOpsMap, postUnfoldMapNames);

        // Pre-compose post-unfold map transforms into unfold handlers when possible
        const composedHandlers = postUnfoldMapTransforms && unfoldEntry
            ? composeHandlers(unfoldEntry.handlers, observerMap, postUnfoldMapTransforms)
            : null;

        // Collect map operations that appear BEFORE the fold in the pipeline
        const foldIndex = foldName ? operationNames.indexOf(foldName) : unfoldIndex;
        const preFoldMapNames = operationNames.slice(0, foldIndex)
            .filter(opName => mapNames.includes(opName));

        // Metamorphism is always an instance getter (starts with fold on existing structure)
        Object.defineProperty(
            (BehaviorType as { prototype?: object }).prototype || BehaviorType,
            name,
            {
                get() {
                    // Phase 1a: apply pre-fold maps to the instance
                    let foldTarget: unknown = this;
                    for (const mapName of preFoldMapNames) {
                        const mapOp = mapOpsMap?.get(mapName);
                        if (mapOp?.isGetter)
                            foldTarget = (foldTarget as Record<string, unknown>)[mapName];
                    }

                    // Phase 1b: fold the (possibly mapped) instance
                    const foldResult = maybeFold(
                        foldTarget, observerMap, foldOp, [], BehaviorType, foldName
                    );
                    // Phase 2: unfold the fold result into a new behavior instance
                    return unfoldAndApplyMaps(foldResult, composedHandlers, postUnfoldMapNames);
                },
                enumerable: true,
                configurable: true
            }
        );
    } else if (isHylomorphism) {
        // Pre-compose map transforms into unfold handlers when possible
        const composedHandlers = mapTransforms && unfoldEntry
            ? composeHandlers(unfoldEntry.handlers, observerMap, mapTransforms)
            : null;

        // Cache the unfold's input spec for validation on the deforestation path
        const unfoldInSpec = unfoldEntry?.spec?.['in'] as
            Parameters<typeof validateTypeSpec>[1] | undefined;

        const buildInstance = (seed: unknown): unknown => {
            if (composedHandlers && unfoldInSpec)
                validateTypeSpec(seed, unfoldInSpec, unfoldName, 'input of type');
            return unfoldAndApplyMaps(seed, composedHandlers, mapNames);
        };

        if (!unfoldIsGetter) {
            BehaviorType[name] = function (seed: unknown, ...rest: unknown[]) {
                return maybeFold(buildInstance(seed), observerMap, foldOp ?? null, rest, BehaviorType);
            };
        } else {
            installGetter(BehaviorType as unknown as object, name, function() {
                return maybeFold(buildInstance(undefined), observerMap, foldOp ?? null, [], BehaviorType);
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
                        `Define an unfold operation (e.g., 'From: unfold({ in: Number, out: Self })({ ... })') to construct behavior instances.`
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
