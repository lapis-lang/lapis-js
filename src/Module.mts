/**
 * Module system for Lapis JS
 *
 * Implements:
 *   - module() — parameterized module definitions following Bracha's "Ban on Imports"
 *   - system() — program entry point as a Mealy machine (outermost coalgebra)
 *
 * Design:
 *   - module(spec, body) → ModuleDef: callable with deps, returns frozen exports
 *   - extend in spec: merge parent exports + LSP contract subcontracting
 *   - system(modules, wiring) → MealyMachine: { init, request, respond }
 *
 * @module Module
 */

import { LapisTypeSymbol } from './operations.mjs';
import { DemandsError, EnsuresError, InvariantError } from './contracts.mjs';

// ---- Types ------------------------------------------------------------------

/**
 * Contract specification for a module definition.
 * Mirrors fold/behavior spec but with module-specific signatures:
 *   - name:      optional human-readable identifier, used in contract error messages
 *   - demands:   precondition on supplied dependencies
 *   - ensures:   postcondition on produced exports
 *   - invariant: coherence constraint across dependencies
 *   - extend:    parent ModuleDef whose exports are inherited and contracts composed
 */
export interface ModuleSpec<Deps = unknown, Exports = unknown> {
    name?: string;
    demands?(deps: Deps): boolean;
    ensures?(exports: Exports): boolean;
    invariant?(deps: Deps): boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extend?: ModuleDef<any, any>;
}

/**
 * A module definition — callable with concrete dependencies to produce a frozen instance.
 * Carries _spec and _body for extend chain contract composition.
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
 * At the type level this constraint only rules out primitives (`string`, `number`,
 * `boolean`, `bigint`, `symbol`, `null`, `undefined`) — plain objects and plain
 * functions both satisfy it. The actual semantic constraint — "must have been
 * produced by one of the four factories" — is enforced exclusively at runtime by
 * {@link isLapisValue}, which checks for the {@link LapisTypeSymbol} brand stamped
 * onto every factory return value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LapisValue = { [key: string]: any };

// ---- Internal types ---------------------------------------------------------

/**
 * ModuleSpec with all type parameters resolved to `unknown`, used internally
 * after the extend chain is collected and composed. Avoids the need for
 * double casts (`as unknown as`) when passing predicates to error constructors.
 */
interface InternalModuleSpec {
    name?: string;
    demands?(arg: unknown): boolean;
    ensures?(arg: unknown): boolean;
    invariant?(arg: unknown): boolean;
    /** Parent ModuleDef whose exports are inherited and contracts composed. */
    extend?: ModuleDef;
}

/** Spec + body pair for a single link in the ancestor chain (pre-execution). */
interface ChainLink {
    spec: InternalModuleSpec;
    body: (deps: unknown) => Record<string | symbol, unknown>;
}

/** Body result + spec pair produced after a body has executed. */
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
 * Walk the extend chain via spec pointers without executing any body.
 * Returns links root-first (grandparent → parent → child).
 *
 * Validates that each `moduleDef` is a proper ModuleDef and detects cycles
 * via a WeakSet of already-visited definitions. The caller pre-seeds `visited`
 * with the current (child) module so back-references to self are also caught.
 */
function collectSpecChain(
    moduleDef: ModuleDef,
    visited = new WeakSet<ModuleDef>()
): ChainLink[] {
    // Runtime guard: the argument is typed as ModuleDef but may have been
    // unsafely cast (e.g. from spec.extend as ModuleDef).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = moduleDef as any;
    if (
        typeof moduleDef !== 'function' ||
        typeof m._body !== 'function' ||
        m._spec === null ||
        typeof m._spec !== 'object'
    ) {
        throw new TypeError(
            `module() spec 'extend' must reference a ModuleDef returned by module(). ` +
            `Got: ${moduleDef === null ? 'null' : typeof moduleDef}.`
        );
    }

    if (visited.has(moduleDef)) {
        throw new TypeError(
            'module() extend cycle detected: a module definition appears more than once in the ancestor chain.'
        );
    }
    visited.add(moduleDef);

    const spec = m._spec as InternalModuleSpec;
    const link: ChainLink = {
        spec,
        body: m._body as (deps: unknown) => Record<string | symbol, unknown>
    };

    if (spec.extend !== undefined)
        return [...collectSpecChain(spec.extend as ModuleDef, visited), link];

    return [link];
}

/** Compose a chain of specs root-to-child. */
function composeChain(links: { spec: InternalModuleSpec }[]): InternalModuleSpec {
    if (links.length === 0) return {};
    return links.slice(1).reduce(
        (acc, { spec }) => composeModuleSpecs(acc, spec),
        links[0].spec
    );
}

/**
 * Build merged exports by reducing the chain root-to-child.
 * Each child's exports override parent exports.
 */
function buildExports(entries: ChainEntry[]): Record<string | symbol, unknown> {
    return entries.reduce((acc, { rawReturn }) => {
        const extra: Record<string | symbol, unknown> = {};
        for (const key of Reflect.ownKeys(rawReturn))
            extra[key as string | symbol] = rawReturn[key as string | symbol];
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
 * @param spec - Contract specification and optional parent reference.
 *               Use `extend: ParentModuleDef` to inherit parent exports and
 *               compose contracts across the hierarchy following LSP rules.
 *               Contract predicates: `demands`, `ensures`, `invariant`.
 * @param body - Dependency receiver returning this module's own exports.
 * @returns A ModuleDef — callable with concrete dependencies to produce a frozen
 *          module instance. Carries _spec and _body for extend chain resolution.
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
// Overload 1: spec has a required `extend` property → parent exports are merged in.
export function module<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Deps extends Record<string, any>,
    BodyReturn extends Record<string, LapisValue>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Parent extends ModuleDef<any, any>
>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spec: ModuleSpec<Deps, any> & { extend: Parent },
    body: (deps: Deps) => BodyReturn
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): ModuleDef<Deps, (Parent extends ModuleDef<any, infer PE> ? PE : unknown) & { [K in keyof BodyReturn]: BodyReturn[K] }>;
// Overload 2: spec without `extend` (or widened spec) → body exports only.
export function module<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Deps extends Record<string, any> = Record<string, any>,
    BodyReturn extends Record<string, LapisValue> = Record<string, LapisValue>
>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spec: ModuleSpec<Deps, any>,
    body: (deps: Deps) => BodyReturn
): ModuleDef<Deps, { [K in keyof BodyReturn]: BodyReturn[K] }>;
export function module<
    // `any` (not `unknown`) is intentional: `Record<string, unknown>` would make every
    // dep access inside the body require a type assertion or guard. Using `any` lets
    // TypeScript infer the concrete dep types from the call site while still accepting
    // any record shape — the runtime validation is structural, not nominal.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Deps extends Record<string, any> = Record<string, any>,
    BodyReturn extends Record<string, LapisValue> = Record<string, LapisValue>
>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spec: ModuleSpec<Deps, any>,
    body: (deps: Deps) => BodyReturn
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): ModuleDef<any, any> {
    const createModuleInstance = (deps: Deps): Readonly<Record<string | symbol, unknown>> => {
        // Use the local spec name (if provided) for error context.
        // This identifies the module definition being instantiated rather than
        // the ancestor whose composed contract happened to fail.
        const errorContext = spec.name ? `ModuleDef '${spec.name}'` : 'ModuleDef';

        // Pre-seed visited set with the current module so any back-reference to self
        // in the spec chain is detected as a cycle before any body runs.
        const visited = new WeakSet<ModuleDef>();
        visited.add(createModuleInstance as unknown as ModuleDef);

        // Step 1: Walk the extend chain via spec pointers — no body execution.
        const selfLink: ChainLink = {
            spec: spec as unknown as InternalModuleSpec,
            body: body as unknown as (deps: unknown) => Record<string | symbol, unknown>
        };
        const chain: ChainLink[] = spec.extend !== undefined
            ? [...collectSpecChain(spec.extend as unknown as ModuleDef, visited), selfLink]
            : [selfLink];

        // Step 2: Compose specs across the full chain (LSP rules).
        const effectiveSpec = composeChain(chain);

        // Step 3: Check composed demands BEFORE running any body.
        // (OR-weakened: passes if any module in the chain accepts deps)
        if (effectiveSpec.demands && !tryEval(effectiveSpec.demands, deps))
            throw new DemandsError('module:instantiate', errorContext, effectiveSpec.demands);

        // Step 4: Check composed invariant BEFORE running any body.
        // (AND-strengthened: all modules' invariants must hold)
        if (effectiveSpec.invariant && !tryEval(effectiveSpec.invariant, deps))
            throw new InvariantError('module:instantiate', errorContext, 'pre', effectiveSpec.invariant);

        // Step 5: Run all bodies root-first to produce raw exports.
        const entries: ChainEntry[] = chain.map(({ spec: entrySpec, body: entryBody }) => {
            const rawReturn = entryBody(deps);
            if (rawReturn === null || typeof rawReturn !== 'object') {
                throw new TypeError(
                    `module() body must return a plain object. ` +
                    `Got: ${rawReturn === null ? 'null' : typeof rawReturn}.`
                );
            }
            return { rawReturn: rawReturn as Record<string | symbol, unknown>, spec: entrySpec };
        });

        // Step 6: Build merged exports (root contributions first, child overrides last).
        const exports = buildExports(entries);

        // Validate all exports are Lapis types.
        for (const key of Reflect.ownKeys(exports)) {
            const v = exports[key as string | symbol];
            if (!isLapisValue(v)) {
                const keyName = typeof key === 'symbol' ? String(key) : `"${key}"`;
                throw new TypeError(
                    `module() exports may only be Lapis types (data, behavior, relation, or observer). ` +
                    `Key ${keyName} has an invalid export value (type: ${typeof v}).`
                );
            }
        }

        // Step 7: Check ensures (postcondition — always after exports are built).
        if (effectiveSpec.ensures && !tryEval(effectiveSpec.ensures, exports))
            throw new EnsuresError('module:instantiate', errorContext, effectiveSpec.ensures);

        return Object.freeze(exports);
    };

    // Attach spec and body for extend chain resolution in child modules.
    Object.defineProperties(createModuleInstance, {
        _spec: { value: spec, writable: false, configurable: false, enumerable: false },
        _body: { value: body, writable: false, configurable: false, enumerable: false }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createModuleInstance as unknown as ModuleDef<any, any>;
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

