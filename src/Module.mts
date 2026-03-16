/**
 * Module system for Lapis JS
 *
 * Implements:
 *   - module() — parameterized module definitions following Bracha's "Ban on Imports"
 *   - system() — program entry point as a Mealy machine (outermost coalgebra)
 *
 * Design:
 *   - module(spec, body) → ModuleDef: callable with deps, returns frozen exports
 *   - [extend] in body return: merge parent exports + LSP contract subcontracting
 *   - system(modules, wiring) → MealyMachine: { init, request, respond }
 *
 * @module Module
 */

import { extend, LapisTypeSymbol } from './operations.mjs';
import { DemandsError, EnsuresError, InvariantError } from './contracts.mjs';

// ---- Types ------------------------------------------------------------------

/**
 * Contract specification for a module definition.
 * Mirrors fold/behavior spec but with module-specific signatures:
 *   - name:      optional human-readable identifier, used in contract error messages
 *   - demands: precondition on supplied dependencies
 *   - ensures: postcondition on produced exports
 *   - invariant: coherence constraint across dependencies
 */
export interface ModuleSpec<Deps = unknown, Exports = unknown> {
    name?: string;
    demands?: (deps: Deps) => boolean;
    ensures?: (exports: Exports) => boolean;
    invariant?: (deps: Deps) => boolean;
}

/**
 * A module definition — callable with concrete dependencies to produce a frozen instance.
 * Carries _spec and _body for [extend] chain contract composition.
 */
export interface ModuleDef<Deps = unknown, Exports = unknown> {
    (deps: Deps): Readonly<Exports>;
    readonly _spec: ModuleSpec;
    readonly _body: (deps: Deps) => Record<string | symbol, unknown>;
}

/**
 * The Mealy machine definition returned by system()'s wiring function.
 * Defines the IO protocol: what does the program request, and how does it
 * transition on receiving a response?
 */
export interface MealyMachine<State = unknown, Req = unknown, Res = unknown> {
    /** Initial program state */
    init: State;
    /** Pure query: what IO does the program want given current state? */
    request: (state: State) => Req;
    /** Continuation: given current state and an IO result, produce next state */
    respond: (state: State) => (response: Res) => State;
}

/**
 * A Lapis type: the result of `data()`, `behavior()`, `relation()`, or `observer()`.
 *
 * The compile-time type is intentionally broad (`{ [key: string]: any }`) because
 * the concrete return types of those four factories (`DataADT`, `BehaviorADT`, etc.)
 * carry incompatible index signatures that cannot be unified into a single union
 * without producing TypeScript errors at every call site.
 *
 * The structural constraint ("must be an object with string keys") is enough to
 * exclude primitive values and plain functions at the type level. The actual
 * semantic constraint — "must have been produced by one of the four factories" —
 * is enforced at runtime by {@link isLapisValue}, which checks for the
 * {@link LapisTypeSymbol} brand stamped onto every factory return value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LapisValue = { [key: string]: any };

// ---- Type helpers for [extend] chain resolution ----------------------------

/**
 * Resolves the effective exports type after merging parent exports via [extend].
 *
 * Uses an inline mapped type with key remapping (not Omit) so TypeScript
 * evaluates the result eagerly to a concrete object type. Omit<T, unique symbol>
 * is deferred and stays opaque, breaking property access; the mapped form below
 * is evaluated per-key at instantiation time.
 *
 * - No [extend]: returns the body return type unchanged.
 * - Has [extend]: strips the key and intersects with the parent's export type.
 */
type MergedExports<B> =
    typeof extend extends keyof B
        ? { [K in keyof B as K extends typeof extend ? never : K]: B[K] } &
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (B[typeof extend] extends ModuleDef<any, infer PE> ? PE : unknown)
        : { [K in keyof B as K extends typeof extend ? never : K]: B[K] };

// ---- Internal types ---------------------------------------------------------

/**
 * ModuleSpec with all type parameters resolved to `unknown`, used internally
 * after the [extend] chain is collected and composed. Avoids the need for
 * double casts (`as unknown as`) when passing predicates to error constructors.
 */
interface InternalModuleSpec {
    name?: string;
    demands?: (arg: unknown) => boolean;
    ensures?: (arg: unknown) => boolean;
    invariant?: (arg: unknown) => boolean;
}

interface ChainEntry {
    rawReturn: Record<string | symbol, unknown>;
    spec: InternalModuleSpec;
}

// ---- Internal helpers -------------------------------------------------------

/** Calls fn(arg), returning false instead of propagating exceptions. */
function tryEval(fn: (arg: unknown) => boolean, arg: unknown): boolean {
    try { return fn(arg); } catch { return false; }
}

/**
 * Compose two predicates with OR-weakening (parent.demands ∨ child.demands).
 * Either predicate passing is sufficient; exceptions count as false.
 */
function composeOr(
    p: (a: unknown) => boolean,
    c: (a: unknown) => boolean
): (a: unknown) => boolean {
    return (a) => tryEval(p, a) || tryEval(c, a);
}

/**
 * Compose two predicates with AND-strengthening (p ∧ c).
 * Both predicates must pass; exceptions count as false.
 */
function composeAnd(
    p: (a: unknown) => boolean,
    c: (a: unknown) => boolean
): (a: unknown) => boolean {
    return (a) => tryEval(p, a) && tryEval(c, a);
}

/**
 * Compose two module specs using LSP subcontracting rules:
 *   - demands:   OR-weakened   (parent.demands ∨ child.demands)
 *   - ensures:   AND-strengthened (parent.ensures ∧ child.ensures)
 *   - invariant: AND-strengthened (parent.invariant ∧ child.invariant)
 */
function composeModuleSpecs(parent: InternalModuleSpec, child: InternalModuleSpec): InternalModuleSpec {
    const composed: InternalModuleSpec = {};

    if (parent.demands || child.demands) {
        const pd = parent.demands, cd = child.demands;
        composed.demands = (pd && cd) ? composeOr(pd, cd) : (cd ?? pd);
    }

    if (parent.ensures || child.ensures) {
        const pe = parent.ensures, ce = child.ensures;
        composed.ensures = (pe && ce) ? composeAnd(pe, ce) : (ce ?? pe);
    }

    if (parent.invariant || child.invariant) {
        const pi = parent.invariant, ci = child.invariant;
        composed.invariant = (pi && ci) ? composeAnd(pi, ci) : (ci ?? pi);
    }

    return composed;
}

/**
 * Collect the full inheritance chain for a ModuleDef by running each body once.
 * Returns entries root-first (grandparent → parent → child).
 * Does NOT check contracts — used to gather the chain for composition.
 */
function collectAncestorChain(moduleDef: ModuleDef, deps: unknown): ChainEntry[] {
    const rawReturn = (moduleDef._body as (d: unknown) => Record<string | symbol, unknown>)(deps);
    const entry: ChainEntry = { rawReturn, spec: moduleDef._spec as InternalModuleSpec };

    if (extend in rawReturn) {
        const parentDef = rawReturn[extend] as ModuleDef;
        return [...collectAncestorChain(parentDef, deps), entry];
    }

    return [entry];
}

/** Compose a chain of specs from root to child. */
function composeChain(entries: ChainEntry[]): InternalModuleSpec {
    if (entries.length === 0) return {};
    return entries.slice(1).reduce(
        (acc, { spec }) => composeModuleSpecs(acc, spec),
        entries[0].spec
    );
}

/**
 * Build merged exports by reducing the chain root-to-child.
 * Each child's exports override parent exports; [extend] symbol is stripped.
 */
function buildExports(entries: ChainEntry[]): Record<string | symbol, unknown> {
    return entries.reduce((acc, { rawReturn }) => {
        const extra: Record<string | symbol, unknown> = {};
        for (const key of Reflect.ownKeys(rawReturn)) {
            if (key !== extend)
                extra[key as string | symbol] = rawReturn[key as string | symbol];
        }
        return { ...acc, ...extra };
    }, {} as Record<string | symbol, unknown>);
}

/** Returns true iff v was produced by data(), behavior(), relation(), or observer(). */
function isLapisValue(v: unknown): boolean {
    return typeof v === 'function' &&
        (v as unknown as Record<symbol, unknown>)[LapisTypeSymbol] === true;
}

// ---- Shared validation -----------------------------------------------------

/**
 * Assert that `machine` is a structurally valid MealyMachine.
 * Throws a TypeError if the object is missing required properties.
 * Exported so the platform runtime can reuse the same check without duplication.
 */
export function validateMealyMachine(machine: unknown): asserts machine is MealyMachine<unknown, unknown, unknown> {
    if (
        machine === null ||
        typeof machine !== 'object' ||
        !('init' in (machine as object)) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof (machine as any).request !== 'function' ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof (machine as any).respond !== 'function'
    )
        throw new TypeError('Invalid MealyMachine: must be an object with { init, request, respond }');
}

// ---- Public API -------------------------------------------------------------

/**
 * Define a parameterized module.
 *
 * @param spec - Optional contract specification (demands, ensures, invariant).
 *               Follows LSP subcontracting rules when [extend] is used.
 * @param body - Dependency receiver returning the module's public exports.
 *               May include `[extend]: ParentModuleDef` to inherit parent exports
 *               and compose contracts across the hierarchy.
 * @returns A ModuleDef — callable with concrete dependencies to produce a frozen
 *          module instance. Carries _spec and _body for [extend] chain resolution.
 *
 * @example
 * const PointModule = module({}, () => ({
 *   Point: data(() => ({ Point2D: { x: Number, y: Number } }))
 * }));
 * const { Point } = PointModule({});
 *
 * @example
 * const SoundSystem = module(
 *   { demands: ({ player }) => typeof player.decode === 'function' },
 *   ({ player }) => ({ play: (src) => player.decode(src) })
 * );
 */
export function module<
    // `any` (not `unknown`) is intentional: `Record<string, unknown>` would make every
    // dep access inside the body require a type assertion or guard. Using `any` lets
    // TypeScript infer the concrete dep types from the call site while still accepting
    // any record shape — the runtime validation is structural, not nominal.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Deps extends Record<string, any> = Record<string, any>,
    // `ModuleDef<any, any>` is required for the [extend] constraint because
    // `ModuleDef` is generic and covariant in its return but contravariant in its
    // argument. `ModuleDef<unknown, unknown>` would reject a concrete `ModuleDef<X, Y>`
    // due to function-parameter contravariance, making every extend usage a type error.
    // `any` bypasses variance checks so the constraint means "any ModuleDef,
    // regardless of its Deps/Exports parameters" — which is all we need here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    BodyReturn extends { [extend]?: ModuleDef<any, any> } & Record<string, LapisValue> = Record<string, LapisValue>
>(
    spec: ModuleSpec<Deps, Readonly<MergedExports<BodyReturn>>>,
    body: (deps: Deps) => BodyReturn
): ModuleDef<Deps, MergedExports<BodyReturn>> {
    const createModuleInstance = (deps: Deps): Readonly<MergedExports<BodyReturn>> => {
        // Run current body once to get raw return (may contain [extend])
        const rawReturn = body(deps) as Record<string | symbol, unknown>;
        const selfEntry: ChainEntry = { rawReturn, spec: spec as InternalModuleSpec };

        // Collect full chain: root-first (grandparent → parent → self)
        let chain: ChainEntry[];
        if (extend in rawReturn) {
            const parentDef = rawReturn[extend] as ModuleDef;
            chain = [...collectAncestorChain(parentDef, deps), selfEntry];
        } else
            chain = [selfEntry];

        // Compose specs across the entire chain (LSP rules)
        const effectiveSpec = composeChain(chain);

        // Use the local spec name (if provided) for error context.
        // This identifies the module definition being instantiated rather than
        // the ancestor whose composed contract happened to fail.
        const errorContext = spec.name ? `ModuleDef '${spec.name}'` : 'ModuleDef';

        // Check demands
        if (effectiveSpec.demands && !tryEval(effectiveSpec.demands, deps))
            throw new DemandsError('module:instantiate', errorContext, effectiveSpec.demands);

        // Check invariant
        if (effectiveSpec.invariant && !tryEval(effectiveSpec.invariant, deps))
            throw new InvariantError('module:instantiate', errorContext, 'pre', effectiveSpec.invariant);

        // Build merged exports (root contributions first, child overrides last)
        const exports = buildExports(chain);

        // Validate all exports are Lapis types
        for (const key of Reflect.ownKeys(exports)) {
            if (key === extend) continue;
            const v = exports[key as string | symbol];
            if (!isLapisValue(v)) {
                const keyName = typeof key === 'symbol' ? String(key) : `"${key}"`;
                throw new TypeError(
                    `module() exports may only be Lapis types (data, behavior, relation, or observer). ` +
                    `Key ${keyName} has an invalid export value (type: ${typeof v}).`
                );
            }
        }

        // Check ensures
        if (effectiveSpec.ensures && !tryEval(effectiveSpec.ensures, exports as unknown as Readonly<MergedExports<BodyReturn>>))
            throw new EnsuresError('module:instantiate', errorContext, effectiveSpec.ensures);

        return Object.freeze(exports) as unknown as Readonly<MergedExports<BodyReturn>>;
    };

    // Attach spec and body for [extend] chain resolution in subclasses
    Object.defineProperties(createModuleInstance, {
        _spec: { value: spec, writable: false, configurable: false, enumerable: false },
        _body: { value: body, writable: false, configurable: false, enumerable: false }
    });

    return createModuleInstance as unknown as ModuleDef<Deps, MergedExports<BodyReturn>>;
}

/**
 * Define the program as a Mealy machine — the single composition and entry point.
 *
 * system() is always a program (does IO). Library composition (no IO) uses plain
 * module calls: `const { x } = MyModule({ dep })`.
 *
 * The wiring function receives the module definitions, instantiates and connects
 * them, and returns `{ init, request, respond }` — the Mealy machine definition.
 * The platform runtime drives the loop externally.
 *
 * @param modules - Record of ModuleDef values (the composition namespace)
 * @param wiring  - Callback receiving module definitions; must return
 *                  `{ init, request, respond }`.
 * @returns The Mealy machine definition.
 *
 * @example
 * const app = system({
 *   Processor: ProcessorModule,
 *   IO: NodePlatform
 * }, ({ Processor, IO }) => {
 *   const { run } = Processor({ IO });
 *   return {
 *     init: { phase: 'start', args: process.argv.slice(2) },
 *     request: ({ phase, args }) => IO.Request.Read({ path: args[0] }),
 *     respond: (state) => (response) => ({ ...state, content: response.content })
 *   };
 * });
 */
export function system<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    M extends Record<string, ModuleDef<any, any>>,
    S = unknown,
    Req = unknown,
    Res = unknown
>(
    modules: M,
    wiring: (mods: M) => MealyMachine<S, Req, Res>
): MealyMachine<S, Req, Res> {
    const machine = wiring(modules);
    validateMealyMachine(machine);
    return machine;
}

