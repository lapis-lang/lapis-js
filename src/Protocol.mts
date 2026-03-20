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
    type FamilyRefCallable
} from './operations.mjs';

import { TypeParamSymbol } from './utils.mjs';
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

    // Transitively register ancestor protocols
    if (protocol.parentProtocol)
        registerConformance(adtPrototype, protocol.parentProtocol);
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
}

/** A protocol object — callable to produce a conditional conformance spec. */
export interface ProtocolLike {
    [ProtocolSymbol]: true;
    [LapisTypeSymbol]: true;
    /** All required operation names → their specs. Includes inherited ops. */
    requiredOps: Map<string, ProtocolOpSpec>;
    /** Type parameter names declared by the protocol (e.g. "T", "U"). */
    requiredTypeParams: Set<string>;
    /** Parent protocol declared via `[extend]`, or null. */
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

// ---- Spec-only helpers (phase 1 only, no handlers phase) --------------------

type SpecOnlyOpFn = (specObj: Record<string, unknown>) => Record<string | symbol, unknown>;
type SpecOnlyMergeFn = (...names: string[]) => Record<string | symbol, unknown>;

function makeSpecOp(kind: string): SpecOnlyOpFn {
    return (specObj: Record<string, unknown>): Record<string | symbol, unknown> =>
        ({ [op]: kind, [specSym]: specObj });
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
    readonly fold: (specObj: Record<string, unknown>) => Record<string | symbol, unknown>;
    readonly unfold: (specObj: Record<string, unknown>) => Record<string | symbol, unknown>;
    readonly map: (specObj: Record<string, unknown>) => Record<string | symbol, unknown>;
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

    // Extract [extend] — parent protocol
    const parentProtocol =
        isProtocol(resultRaw[extend])
            ? (resultRaw[extend] as ProtocolLike)
            : null;

    // Extract [invariant] — protocol-level predicate
    const invariantFn =
        typeof resultRaw[invariant] === 'function'
            ? (resultRaw[invariant] as (type: unknown) => boolean)
            : null;

    // Build requiredOps map, starting with inherited ops from parent
    const requiredOps = new Map<string, ProtocolOpSpec>(
        parentProtocol ? parentProtocol.requiredOps : []
    );

    for (const [name, value] of Object.entries(result)) {
        const entry = value as Record<string | symbol, unknown>;
        const kind = entry[op] as string | undefined;

        if (kind === 'fold') {
            assertCamelCase(name, 'Protocol fold operation');
            const rawSpec = (entry[specSym] ?? {}) as Record<string, unknown>;
            requiredOps.set(name, {
                kind: 'fold',
                spec: rawSpec,
                contracts: resolveContracts(rawSpec)
            });
        } else if (kind === 'unfold') {
            assertPascalCase(name, 'Protocol unfold operation');
            const rawSpec = (entry[specSym] ?? {}) as Record<string, unknown>;
            requiredOps.set(name, {
                kind: 'unfold',
                spec: rawSpec,
                contracts: resolveContracts(rawSpec)
            });
        } else if (kind === 'map') {
            assertCamelCase(name, 'Protocol map operation');
            const rawSpec = (entry[specSym] ?? {}) as Record<string, unknown>;
            requiredOps.set(name, {
                kind: 'map',
                spec: rawSpec,
                contracts: null
            });
        } else if (kind === 'merge') {
            requiredOps.set(name, {
                kind: 'merge',
                spec: {},
                contracts: null
            });
        }
        // string keys that are neither op defs nor symbol keys are ignored
        // (e.g. if user mistakenly puts a plain string key)
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

    Object.defineProperties(thisProtocol, {
        [ProtocolSymbol]: { value: true, writable: false, enumerable: false, configurable: false },
        [LapisTypeSymbol]: { value: true, writable: false, enumerable: false, configurable: false },
        requiredOps: { value: requiredOps, writable: false, enumerable: true, configurable: false },
        requiredTypeParams: {
            value: new Set(typeParamNames),
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

/**
 * Validate that `adtOpNames` contains all operations required by `proto`
 * and all of its ancestors. Throws a descriptive TypeError on failure.
 *
 * @param adtOpNames  - set of operation names provided by the ADT's `.ops()`
 * @param proto       - protocol whose requirements must be satisfied
 * @param adtLabel    - human-readable name / description for error messages
 */
export function validateProtocolConformance(
    adtOpNames: Set<string>,
    proto: ProtocolLike,
    adtLabel: string,
    type?: unknown
): void {
    for (const [opName] of proto.requiredOps) {
        if (!adtOpNames.has(opName)) {
            throw new TypeError(
                `${adtLabel} declares [satisfies] for protocol but is missing ` +
                `required operation '${opName}'`
            );
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
    // Walk ancestor chain first (parent invariant checked before child)
    if (proto.parentProtocol)
        validateProtocolInvariant(proto.parentProtocol, type, label);

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
        validateProtocolConformance(opNames, entry.protocol, label, type);
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
