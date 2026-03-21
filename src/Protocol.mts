/**
 * Protocol system for Lapis JS.
 *
 * A protocol is a named collection of operation specs (using the fold/unfold/map/merge
 * vocabulary). ADTs and behaviors declare conformance in phase 1 via `[satisfies]`.
 * Conformance is validated after `.ops()` completes and registered in a weak-key
 * registry so that `instanceof` works via `Symbol.hasInstance`.
 */

import {
    op,
    spec as specSym,
    operations as operationsSymbol,
    extend,
    invariant,
    assertCamelCase,
    assertPascalCase,
    LapisTypeSymbol,
    ProtocolSymbol,
    createFamily,
    properties as propertiesSym,
    parseProperties,
    type FamilyRefCallable
} from './operations.mjs';

import { TypeParamSymbol, installOperation } from './utils.mjs';
import { type ContractSpec, resolveContracts, composeContracts } from './contracts.mjs';

// ---- Symbols ----------------------------------------------------------------

/** Brands values returned by a callable protocol (conditional conformance). */
export const ConditionalConformanceSymbol: unique symbol = Symbol('ConditionalConformance');
export type ConditionalConformanceSymbol = typeof ConditionalConformanceSymbol;

// ---- Conformance registry ---------------------------------------------------

/**
 * Maps ADT/behavior prototype objects to the set of protocols they satisfy.
 * Keyed by prototype objects so that `Symbol.hasInstance` can walk the chain.
 */
export const conformanceRegistry = new WeakMap<object, Set<ProtocolLike>>();

/**
 * Register that the type whose prototype is `adtPrototype` satisfies `protocol`
 * and all of its ancestor protocols transitively.
 */
export function registerConformance(adtPrototype: object, protocol: ProtocolLike): void {
    let set = conformanceRegistry.get(adtPrototype);
    if (!set) {
        set = new Set<ProtocolLike>();
        conformanceRegistry.set(adtPrototype, set);
    }
    if (set.has(protocol)) return; // already registered (avoid infinite loop via [extend])
    set.add(protocol);

    // Transitively register all ancestor protocols
    for (const parent of protocol.parentProtocols)
        registerConformance(adtPrototype, parent);
}

// ---- Type interfaces --------------------------------------------------------

/** Spec for a single required operation in a protocol. */
export interface ProtocolOpSpec {
    /** fold / unfold / map / merge */
    kind: 'fold' | 'unfold' | 'map' | 'merge';
    /** The raw spec object extracted from fold({…}) / unfold({…}) etc. */
    spec: Record<string, unknown>;
    /** Per-operation contract, if any (demands/ensures/rescue from the spec). */
    contracts: ContractSpec | null;
    /**
     * Algebraic property annotations declared via `[properties]: [...]` on the
     * operation spec. Validated against {@link KNOWN_PROPERTIES}. Inherited
     * properties from parent protocols are unioned in (never removed).
     */
    properties: ReadonlySet<string>;
    /**
     * Default implementation provided via the `_` wildcard handler in a
     * two-phase protocol spec declaration:
     *   `equals: fold({ in: Family, out: Boolean })({ _: (ctx, other) => ... })`
     * When non-null, a conforming type that does not implement this operation
     * will have the default installed on its prototype automatically.
     * Unfold defaults are not supported (they require a constructor reference).
     */
    defaultBody: ((...args: unknown[]) => unknown) | null;
}

/** A protocol object — callable to produce a conditional conformance spec. */
export interface ProtocolLike {
    [ProtocolSymbol]: true;
    [LapisTypeSymbol]: true;
    /** All required operation names → their specs. Includes inherited ops. */
    requiredOps: Map<string, ProtocolOpSpec>;
    /** Type parameter names declared by the protocol (e.g. "T", "U"). */
    requiredTypeParams: Set<string>;
    /**
     * All parent protocols declared via `[extend]` (may be an array for
     * multi-parent protocol inheritance). Empty array when no parents.
     */
    parentProtocols: readonly ProtocolLike[];
    /**
     * First parent protocol, or null if none.
     * Kept for backward compatibility; prefer `parentProtocols`.
     */
    parentProtocol: ProtocolLike | null;
    /** Protocol-level invariant predicate, or null. */
    invariantFn: ((type: unknown) => boolean) | null;
    /** When called with a constraint map, produces a ConditionalConformance. */
    (constraints?: Record<string, ProtocolLike>): ConditionalConformance;
    /** ADT instanceof Protocol checks via the conformance registry. */
    [Symbol.hasInstance](instance: unknown): boolean;
}

/** Returned by calling a protocol: `Ordered({ T: Ordered })`. */
export interface ConditionalConformance {
    [ConditionalConformanceSymbol]: true;
    protocol: ProtocolLike;
    constraints: Record<string, ProtocolLike>;
}

/**
 * An entry in the `protocols` list on a parsed declaration.
 * Either unconditional (`[satisfies]: [Monoid]`) or conditional
 * (`[satisfies]: [Ordered({ T: Ordered })]`).
 */
export type ProtocolEntry =
    | { protocol: ProtocolLike; conditional: false }
    | { protocol: ProtocolLike; conditional: true; constraints: Record<string, ProtocolLike> };

// ---- Type guards ------------------------------------------------------------

/** Returns true if `value` is a protocol created by `protocol()`. */
export function isProtocol(value: unknown): value is ProtocolLike {
    return (
        typeof value === 'function' &&
        (value as unknown as Record<symbol, unknown>)[ProtocolSymbol] === true
    );
}

/** Returns true if `value` is a conditional conformance spec from calling a protocol. */
export function isConditionalConformance(value: unknown): value is ConditionalConformance {
    return (
        value !== null &&
        typeof value === 'object' &&
        (value as Record<symbol, unknown>)[ConditionalConformanceSymbol] === true
    );
}

// ---- Spec-only helpers (phase 1, with optional handlers phase) --------------

/**
 * Intermediate result from a protocol spec builder call.
 *
 * Can be used directly as a spec-only entry:
 *   `combine: fold({ in: Family, out: Family })`
 *
 * Or called with a handlers object supplying a `_` wildcard default:
 *   `equals: fold({ in: Family, out: Boolean })({ _: (ctx, other) => ... })`
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProtocolSpecEntry = ((handlers: Record<string, (...args: any[]) => unknown>) => Record<string | symbol, unknown>) & Record<string | symbol, unknown>;

type SpecOnlyOpFn = (specObj: Record<string | symbol, unknown>) => ProtocolSpecEntry;
type SpecOnlyMergeFn = (...names: string[]) => Record<string | symbol, unknown>;

function makeSpecOp(kind: string): SpecOnlyOpFn {
    return (specObj: Record<string | symbol, unknown>): ProtocolSpecEntry => {
        // When called with handlers (e.g. `fold({...})({ _: fn })`), merge and return
        // a plain object carrying [op], [spec], and the handlers (including `_`).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handlersCall = function(handlers: Record<string, (...args: any[]) => unknown>): Record<string | symbol, unknown> {
            return { [op]: kind, [specSym]: specObj, ...handlers };
        };
        // Attach [op] and [specSym] so the parsing loop can detect this spec entry
        // even when the second phase (handlers call) is omitted.
        return Object.assign(handlersCall, {
            [op]: kind,
            [specSym]: specObj
        }) as unknown as ProtocolSpecEntry;
    };
}

const protocolFold = makeSpecOp('fold');
const protocolUnfold = makeSpecOp('unfold');
const protocolMap = makeSpecOp('map');

function protocolMerge(...names: string[]): Record<string | symbol, unknown> {
    return { [op]: 'merge', [operationsSymbol]: names };
}

// ---- Protocol factory -------------------------------------------------------

/**
 * Extract single-uppercase-letter parameter names from a function's source code.
 * Mirrors the technique used in `behavior()`.
 */
function extractTypeParamNames(fn: (...args: unknown[]) => unknown): string[] {
    const src = fn.toString();
    // Match the first destructured parameter: ({ A, B, Family, fold, ... })
    const match = src.match(/^\s*(?:function\s*\w*\s*)?\(\s*\{\s*([^}]*)\}/);
    if (!match) return [];
    return match[1]
        .split(',')
        .map(s => s.trim().replace(/\s*:.*/, '').replace(/\s*=.*/, ''))
        .filter(s => /^[A-Z]$/.test(s));
}

/**
 * Declare a protocol — a named collection of algebraic operation specs.
 *
 * @example
 * ```ts
 * const Monoid = protocol(({ Family, fold, unfold }) => ({
 *     [extend]: Semigroup,
 *     Identity: unfold({ out: Family }),
 *     combine: fold({ in: Family, out: Family })
 * }));
 * ```
 */
/** Context passed to the `protocol()` declaration callback. */
export interface ProtocolDeclContext {
    readonly Family: FamilyRefCallable;
    readonly fold: (specObj: Record<string | symbol, unknown>) => ProtocolSpecEntry;
    readonly unfold: (specObj: Record<string | symbol, unknown>) => ProtocolSpecEntry;
    readonly map: (specObj: Record<string | symbol, unknown>) => ProtocolSpecEntry;
    readonly merge: (...names: string[]) => Record<string | symbol, unknown>;
    readonly [key: string]: unknown;
}

export function protocol(
    callback: (ctx: ProtocolDeclContext) => Record<string | symbol, unknown>
): ProtocolLike {
    // Extract type param names from the callback signature
    const typeParamNames = extractTypeParamNames(callback as (...args: unknown[]) => unknown);

    // Build the Family marker and type-param objects for the callback context
    const Family = createFamily() as unknown as FamilyRefCallable;
    const typeParamObjects: Record<string, object> = {};
    for (const name of typeParamNames)
        typeParamObjects[name] = { [TypeParamSymbol]: name };

    const ctx: Record<string, unknown> = {
        Family,
        fold: protocolFold as SpecOnlyOpFn,
        unfold: protocolUnfold as SpecOnlyOpFn,
        map: protocolMap as SpecOnlyOpFn,
        merge: protocolMerge as SpecOnlyMergeFn,
        ...typeParamObjects
    };

    const result = callback(ctx as ProtocolDeclContext);
    const resultRaw = result as Record<string | symbol, unknown>;

    // Extract [extend] — parent protocol(s).
    // Normalize to an array: a single ProtocolLike is wrapped; an array is validated;
    // absent or null produces an empty array.
    const rawExtend = resultRaw[extend];
    const parentProtocols: ProtocolLike[] = [];
    if (rawExtend !== undefined && rawExtend !== null) {
        const candidates = Array.isArray(rawExtend) ? rawExtend : [rawExtend];
        for (const candidate of candidates) {
            if (!isProtocol(candidate)) {
                throw new TypeError(
                    `[extend] in protocol() must reference a protocol or an array of protocols, ` +
                    `got ${typeof candidate}`
                );
            }
            parentProtocols.push(candidate as ProtocolLike);
        }
    }
    // Backward-compatible single-parent reference
    const parentProtocol = parentProtocols[0] ?? null;

    // Extract [invariant] — protocol-level predicate
    const invariantFn =
        typeof resultRaw[invariant] === 'function'
            ? (resultRaw[invariant] as (type: unknown) => boolean)
            : null;

    // Build requiredOps map by merging from all parents.
    // Diamond resolution rules:
    //   - Same op from two parents with IDENTICAL kinds → merge (union properties, keep first spec).
    //   - Same op from two parents with CONFLICTING kinds → conflict deferred; child re-declaration
    //     resolves it. Remaining conflicts after child ops throw a TypeError.
    // Each ProtocolOpSpec is cloned so mutations never alias back to a parent.
    const requiredOps = new Map<string, ProtocolOpSpec>();
    const parentConflicts = new Set<string>(); // op names with kind conflicts between parents
    for (const parent of parentProtocols) {
        for (const [name, parentSpec] of parent.requiredOps) {
            const existing = requiredOps.get(name);
            if (existing) {
                // Diamond: same op name from two parent paths.
                if (existing.kind !== parentSpec.kind) {
                    // Conflict — defer; child re-declaration can resolve it.
                    parentConflicts.add(name);
                } else {
                    // Same kind — merge properties (Set union) into a fresh Set.
                    const mergedProps = new Set(existing.properties);
                    for (const p of parentSpec.properties) mergedProps.add(p);
                    requiredOps.set(name, { ...existing, properties: mergedProps });
                }
            } else
                requiredOps.set(name, { ...parentSpec, properties: new Set(parentSpec.properties) });
        }
    }

    const childDeclaredOps = new Set<string>();
    for (const [name, value] of Object.entries(result)) {
        const entry = value as Record<string | symbol, unknown>;
        const kind = entry[op] as string | undefined;

        if (kind === 'fold') {
            assertCamelCase(name, 'Protocol fold operation');
            const rawSpec = (entry[specSym] ?? {}) as Record<string | symbol, unknown>;
            const childProps = parseProperties(rawSpec[propertiesSym], name);
            // Inherited properties already merged into requiredOps during parent merge phase.
            const parentProps = requiredOps.get(name)?.properties ?? new Set<string>();
            const wildcardHandler = (entry as Record<string, unknown>)['_'];
            requiredOps.set(name, {
                kind: 'fold',
                spec: rawSpec as Record<string, unknown>,
                contracts: resolveContracts(rawSpec as Record<string, unknown>),
                properties: new Set([...parentProps, ...childProps]),
                defaultBody: typeof wildcardHandler === 'function'
                    ? wildcardHandler as (...args: unknown[]) => unknown
                    : null
            });
            childDeclaredOps.add(name);
        } else if (kind === 'unfold') {
            assertPascalCase(name, 'Protocol unfold operation');
            const rawSpec = (entry[specSym] ?? {}) as Record<string | symbol, unknown>;
            const childProps = parseProperties(rawSpec[propertiesSym], name);
            const parentProps = requiredOps.get(name)?.properties ?? new Set<string>();
            const wildcardHandler = (entry as Record<string, unknown>)['_'];
            requiredOps.set(name, {
                kind: 'unfold',
                spec: rawSpec as Record<string, unknown>,
                contracts: resolveContracts(rawSpec as Record<string, unknown>),
                properties: new Set([...parentProps, ...childProps]),
                defaultBody: typeof wildcardHandler === 'function'
                    ? wildcardHandler as (...args: unknown[]) => unknown
                    : null
            });
            childDeclaredOps.add(name);
        } else if (kind === 'map') {
            assertCamelCase(name, 'Protocol map operation');
            const rawSpec = (entry[specSym] ?? {}) as Record<string | symbol, unknown>;
            const childProps = parseProperties(rawSpec[propertiesSym], name);
            const parentProps = requiredOps.get(name)?.properties ?? new Set<string>();
            const wildcardHandler = (entry as Record<string, unknown>)['_'];
            requiredOps.set(name, {
                kind: 'map',
                spec: rawSpec as Record<string, unknown>,
                contracts: null,
                properties: new Set([...parentProps, ...childProps]),
                defaultBody: typeof wildcardHandler === 'function'
                    ? wildcardHandler as (...args: unknown[]) => unknown
                    : null
            });
            childDeclaredOps.add(name);
        } else if (kind === 'merge') {
            const parentProps = requiredOps.get(name)?.properties ?? new Set<string>();
            requiredOps.set(name, {
                kind: 'merge',
                spec: {},
                contracts: null,
                properties: new Set(parentProps),
                defaultBody: null
            });
            childDeclaredOps.add(name);
        }
        // string keys that are neither op defs nor symbol keys are ignored
        // (e.g. if user mistakenly puts a plain string key)
    }

    // Throw for any parent kind-conflicts not resolved by the child re-declaring the op.
    for (const conflictName of parentConflicts) {
        if (!childDeclaredOps.has(conflictName)) {
            const kinds = [...parentProtocols]
                .filter(p => p.requiredOps.has(conflictName))
                .map(p => p.requiredOps.get(conflictName)!.kind)
                .join("' vs '");
            throw new TypeError(
                `Protocol [extend] conflict: operation '${conflictName}' appears in multiple ` +
                `parents with different kinds ('${kinds}'). ` +
                `Re-declare it in the child protocol to resolve the conflict.`
            );
        }
    }

    // ---- Build the protocol object ------------------------------------------

    // The protocol is itself callable: Ordered({ T: Ordered }) returns a
    // ConditionalConformance value.
    function protocolFn(
        constraints?: Record<string, ProtocolLike>
    ): ConditionalConformance {
        return {
            [ConditionalConformanceSymbol]: true,
            protocol: thisProtocol,
            constraints: constraints ?? {}
        };
    }

    const thisProtocol = protocolFn as unknown as ProtocolLike;

    // Union type param names from all parents with the child's own.
    const allTypeParams = new Set(typeParamNames);
    for (const parent of parentProtocols) {
        for (const tp of parent.requiredTypeParams)
            allTypeParams.add(tp);
    }

    Object.defineProperties(thisProtocol, {
        [ProtocolSymbol]: { value: true, writable: false, enumerable: false, configurable: false },
        [LapisTypeSymbol]: { value: true, writable: false, enumerable: false, configurable: false },
        requiredOps: { value: requiredOps, writable: false, enumerable: true, configurable: false },
        requiredTypeParams: {
            value: allTypeParams,
            writable: false,
            enumerable: true,
            configurable: false
        },
        parentProtocols: {
            value: Object.freeze([...parentProtocols]),
            writable: false,
            enumerable: true,
            configurable: false
        },
        parentProtocol: {
            value: parentProtocol,
            writable: false,
            enumerable: true,
            configurable: false
        },
        invariantFn: {
            value: invariantFn,
            writable: false,
            enumerable: true,
            configurable: false
        },
        [Symbol.hasInstance]: {
            value(instance: unknown): boolean {
                if (instance === null || instance === undefined) return false;
                if (typeof instance !== 'object' && typeof instance !== 'function') return false;
                // Walk the prototype chain looking for a registry entry
                let proto: object | null = Object.getPrototypeOf(instance);
                while (proto !== null) {
                    const set = conformanceRegistry.get(proto);
                    if (set?.has(thisProtocol)) return true;
                    proto = Object.getPrototypeOf(proto);
                }
                return false;
            },
            writable: false,
            enumerable: false,
            configurable: false
        }
    });

    return thisProtocol;
}

// ---- Protocol contract helpers ---------------------------------------------

/**
 * Collect and compose all per-operation contracts declared by unconditional
 * protocol entries for the given operation name.
 *
 * If multiple unconditional protocols define contracts for `opName`, they are
 * composed using LSP subcontracting rules (demands OR, ensures AND).
 *
 * Conditional protocol entries are skipped — their constraints are only
 * resolved at parameterization time.
 */
export function gatherProtocolContracts(
    protocols: ProtocolEntry[],
    opName: string
): ContractSpec | null {
    let combined: ContractSpec | null = null;
    for (const entry of protocols) {
        if (entry.conditional) continue;
        const opContracts = entry.protocol.requiredOps.get(opName)?.contracts ?? null;
        if (!opContracts) continue;
        combined = combined !== null ? composeContracts(combined, opContracts) : opContracts;
    }
    return combined;
}

// ---- Protocol validation helpers --------------------------------------------

// ---- Default implementation installation -----------------------------------

/**
 * Install a protocol default implementation on a prototype.
 *
 * The default body follows the same calling convention as a fold wildcard
 * handler in `.ops()`:
 *   `defaultBody.call(this, this, ...args)`
 * where `this` is the ADT instance, the first explicit argument mirrors the
 * instance (as the `ctx` / fields parameter), and `...args` are the method's
 * own arguments (e.g. the `in` parameter for binary folds).
 *
 * This makes law-derived defaults natural:
 *   `equals: fold({ in: Family, out: Boolean })({ _: function(ctx, other) { return this.compare(other) === 0; } })`
 *
 * Unfold defaults (static constructor-level operations) are not currently
 * supported — they require a constructor reference not available here.
 */
function installDefaultOp(prototype: object, opName: string, opSpec: ProtocolOpSpec): void {
    const { defaultBody, kind } = opSpec;
    if (!defaultBody) return;
    if (kind === 'unfold') return; // Not yet supported

    // A fold/map operation with no `in` spec is a zero-argument getter.
    const isGetter = (kind === 'fold' || kind === 'map') && !opSpec.spec['in'];

    installOperation(
        prototype,
        opName,

        isGetter
            ? function(this: unknown): unknown {
                return (defaultBody as (this: unknown, ctx: unknown) => unknown).call(this, this);
            }
            : function(this: unknown, ...args: unknown[]): unknown {
                return (defaultBody as (this: unknown, ctx: unknown, ...rest: unknown[]) => unknown)
                    .call(this, this, ...args);
            },
        isGetter
    );
}

// ---- Protocol validation helpers --------------------------------------------

/**
 * Validate that `adtOpNames` contains all operations required by `proto`
 * and all of its ancestors. Throws a descriptive TypeError on failure.
 *
 * When `prototype` is provided, any missing operation that has a `defaultBody`
 * on its spec is automatically installed on `prototype` (and added to
 * `adtOpNames`) rather than throwing.
 *
 * @param adtOpNames  - set of operation names provided by the ADT's `.ops()`
 * @param proto       - protocol whose requirements must be satisfied
 * @param adtLabel    - human-readable name / description for error messages
 * @param type        - the ADT/behavior for invariant checking (optional)
 * @param prototype   - the prototype to install defaults on (optional)
 */
export function validateProtocolConformance(
    adtOpNames: Set<string>,
    proto: ProtocolLike,
    adtLabel: string,
    type?: unknown,
    prototype?: object
): void {
    for (const [opName, opSpec] of proto.requiredOps) {
        if (!adtOpNames.has(opName)) {
            if (opSpec.defaultBody !== null && prototype !== undefined) {
                // Install the default implementation and mark the op as satisfied.
                installDefaultOp(prototype, opName, opSpec);
                adtOpNames.add(opName);
            } else {
                throw new TypeError(
                    `${adtLabel} declares [satisfies] for protocol but is missing ` +
                    `required operation '${opName}'`
                );
            }
        }
    }
    if (type !== undefined)
        validateProtocolInvariant(proto, type, adtLabel);
}

/**
 * Check the protocol's `[invariant]` predicate (and those of ancestor
 * protocols) against the given type. Throws a descriptive TypeError when
 * the predicate returns false or itself throws.
 */
export function validateProtocolInvariant(
    proto: ProtocolLike,
    type: unknown,
    label: string
): void {
    // Walk all parent invariants first (breadth-first order of parentProtocols)
    for (const parent of proto.parentProtocols)
        validateProtocolInvariant(parent, type, label);

    if (proto.invariantFn) {
        let ok: boolean;
        try {
            ok = proto.invariantFn(type);
        } catch (e) {
            throw new TypeError(
                `${label} fails protocol [invariant]: predicate threw: ${
                    e instanceof Error ? e.message : String(e)
                }`
            );
        }
        if (!ok) {
            throw new TypeError(
                `${label} fails protocol [invariant]: the type does not satisfy ` +
                `the protocol-level invariant predicate`
            );
        }
    }
}

/**
 * Validate and register all unconditional protocol entries.
 * Conditional entries are handled per-parameterization in Data.mts.
 *
 * @param prototype  - the prototype to register conformance on
 * @param opNames    - set of operation names already provided by the type
 * @param protocols  - normalized protocol entries from `parseProtocolEntries`
 * @param label      - human-readable type label for error messages
 */
export function applyUnconditionalProtocols(
    prototype: object,
    opNames: Set<string>,
    protocols: ProtocolEntry[],
    label: string,
    type?: unknown
): void {
    for (const entry of protocols) {
        if (entry.conditional) continue;
        // Pass `prototype` so that missing ops with defaultBody are auto-installed.
        validateProtocolConformance(opNames, entry.protocol, label, type, prototype);
        registerConformance(prototype, entry.protocol);
    }
}

/**
 * Parse the raw value(s) found under `[satisfies]` in a phase-1 declaration
 * into a normalized `ProtocolEntry[]`.
 *
 * Accepts:
 * - A single ProtocolLike
 * - A single ConditionalConformance
 * - An array mixing both
 */
export function parseProtocolEntries(raw: unknown): ProtocolEntry[] {
    if (!raw) return [];

    const items = Array.isArray(raw) ? raw : [raw];
    return items.map((item): ProtocolEntry => {
        if (isConditionalConformance(item)) {
            return {
                protocol: item.protocol,
                conditional: true,
                constraints: item.constraints
            };
        }
        if (isProtocol(item))
            return { protocol: item, conditional: false };

        throw new TypeError(
            `[satisfies] entries must be protocols or conditional conformances, ` +
            `got ${typeof item}`
        );
    });
}
