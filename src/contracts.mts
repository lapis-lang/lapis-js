/**
 * Design by Contract infrastructure for Lapis JS
 *
 * Provides demands (preconditions), ensures (postconditions), rescue (structured
 * recovery with retry), continuous invariant enforcement, checked mode toggle,
 * and subcontracting rules for `[extend]` hierarchies.
 *
 * Semantics:
 * - demands: caller-blame precondition — checked before the operation body
 * - ensures: implementer-blame postcondition — checked after the operation body
 * - rescue: structured recovery with optional retry — invoked when the body or ensures throws
 * - invariant: checked around every operation invocation (before and after)
 * - Subcontracting: demands OR (weaken), ensures AND (strengthen), invariant AND (strengthen)
 *
 * Note: The {@link assert}, {@link implies}, and {@link iff} utilities are **always active**
 * regardless of checked mode. They represent hard logical invariants (programmer errors)
 * rather than operational contract checks, and bypassing them could mask bugs that no
 * amount of performance justifies ignoring.
 *
 * @module contracts
 */

// ---- Checked Mode -----------------------------------------------------------

let _checkedMode = true;

/**
 * Toggle or query checked mode.
 *
 * When checked mode is disabled, all contract checks (demands, ensures, rescue,
 * and around-operation invariant checks) are skipped for maximum performance.
 * Guards (`spec.in` / `spec.out`) remain active regardless.
 *
 * @param enabled - If provided, sets checked mode. If omitted, returns current state.
 */
export function checkedMode(enabled?: boolean): boolean {
    if (enabled !== undefined)
        _checkedMode = enabled;

    return _checkedMode;
}

/**
 * Returns true if contract checking is currently enabled.
 */
export function isCheckedMode(): boolean {
    return _checkedMode;
}

// ---- Custom Error Types -----------------------------------------------------

/**
 * Thrown when a precondition (demands) fails.
 * Indicates caller blame: the caller invoked the operation with invalid state or arguments.
 */
export class DemandsError extends Error {
    override name = 'DemandsError';
    constructor(opName: string, context: string, demandFn?: ((...args: unknown[]) => boolean)) {
        const fnStr = demandFn ? `\n  Demand: ${demandFn.toString()}` : '';
        super(`Precondition failed for operation '${opName}' on ${context}${fnStr}`);
    }
}

/**
 * Thrown when a postcondition (ensures) fails.
 * Indicates implementer blame: the operation returned a result that violates its contract.
 */
export class EnsuresError extends Error {
    override name = 'EnsuresError';
    constructor(opName: string, context: string, ensuresFn?: ((...args: unknown[]) => boolean)) {
        const fnStr = ensuresFn ? `\n  Ensures: ${ensuresFn.toString()}` : '';
        super(`Postcondition failed for operation '${opName}' on ${context}${fnStr}`);
    }
}

/**
 * Thrown when an invariant is violated around an operation.
 * Indicates implementer blame: the operation left the instance in an invalid state.
 */
export class InvariantError extends Error {
    override name = 'InvariantError';
    constructor(opName: string, context: string, phase: 'pre' | 'post', invariantFn?: ((...args: unknown[]) => boolean)) {
        const phaseStr = phase === 'pre' ? 'before' : 'after';
        const fnStr = invariantFn ? `\n  Invariant: ${invariantFn.toString()}` : '';
        super(`Invariant violated ${phaseStr} operation '${opName}' on ${context}${fnStr}`);
    }
}

// ---- Contract Types ---------------------------------------------------------

export interface ContractSpec {
    demands?: (self: unknown, ...args: unknown[]) => boolean;
    ensures?: (self: unknown, old: unknown, result: unknown, ...args: unknown[]) => boolean;
    rescue?: (self: unknown, error: unknown, args: unknown[], retry: (...newArgs: unknown[]) => unknown) => unknown;
}

// ---- Contract Checking Helpers ----------------------------------------------

/**
 * Maximum number of retry attempts allowed per rescue handler invocation.
 * Prevents infinite retry loops.
 */
export const MAX_RETRIES = 100;

/**
 * Check a demands (precondition) predicate.
 * Throws {@link DemandsError} when the predicate returns false or throws.
 */
export function checkDemands(
    demandsFn: NonNullable<ContractSpec['demands']>,
    opName: string,
    context: string,
    self: unknown,
    args: unknown[]
): void {
    try {
        if (!demandsFn(self, ...args))
            throw new DemandsError(opName, context, demandsFn);
    } catch (e) {
        if (e instanceof DemandsError) throw e;
        throw new DemandsError(opName, context, demandsFn);
    }
}

/**
 * Check an ensures (postcondition) predicate.
 * Throws {@link EnsuresError} when the predicate returns false or throws.
 */
export function checkEnsures(
    ensuresFn: NonNullable<ContractSpec['ensures']>,
    opName: string,
    context: string,
    self: unknown,
    old: unknown,
    result: unknown,
    args: unknown[]
): void {
    try {
        if (!ensuresFn(self, old, result, ...args))
            throw new EnsuresError(opName, context, ensuresFn);
    } catch (e) {
        if (e instanceof EnsuresError) throw e;
        throw new EnsuresError(opName, context, ensuresFn);
    }
}

/**
 * Check an invariant predicate.
 * Throws {@link InvariantError} when the predicate returns false or throws.
 */
export function checkInvariant(
    invariantFn: (instance: unknown) => boolean,
    opName: string,
    context: string,
    phase: 'pre' | 'post',
    self: unknown
): void {
    try {
        if (!invariantFn(self))
            throw new InvariantError(opName, context, phase, invariantFn as unknown as (...args: unknown[]) => boolean);
    } catch (e) {
        if (e instanceof InvariantError) throw e;
        throw new InvariantError(opName, context, phase, invariantFn as unknown as (...args: unknown[]) => boolean);
    }
}

/**
 * Execute a rescue handler with retry support.
 *
 * @param rescue - The rescue function from ContractSpec
 * @param self - The instance (or null for unfold)
 * @param error - The caught error
 * @param args - The original operation arguments
 * @param retryBody - A callback that re-executes the operation with new args
 * @param opName - Operation name for error messages
 * @param context - Context string for error messages
 * @returns The rescue result (either from rescue's return value or from retry)
 */
export function executeRescue(
    rescue: NonNullable<ContractSpec['rescue']>,
    self: unknown,
    error: unknown,
    args: unknown[],
    retryBody: (...newArgs: unknown[]) => unknown,
    opName: string,
    context: string
): { result: unknown; didRetry: boolean } {
    let retryCount = 0;
    let retryResult: unknown;
    let didRetry = false;
    let currentError: unknown = error;
    // Accumulate every error encountered during the rescue/retry cycle
    // so that diagnostics are available when MAX_RETRIES is exceeded or
    // when an unexpected error propagates out.
    const errors: unknown[] = [error];

    const retryFn = (...newArgs: unknown[]): unknown => {
        retryCount++;
        if (retryCount > MAX_RETRIES) {
            throw new Error(
                `Maximum retry count (${MAX_RETRIES}) exceeded in rescue for operation '${opName}' on ${context}`,
                { cause: errors }
            );
        }
        didRetry = true;
        retryResult = retryBody(...newArgs);
        return retryResult;
    };

    while (true) {
        didRetry = false;

        try {
            const rescueResult = rescue(self, currentError, args, retryFn);

            return { result: didRetry ? retryResult : rescueResult, didRetry };
        } catch (e) {
            // Only re-rescue when retry was called but the body threw.
            // If rescue itself threw without calling retry, propagate.
            if (!didRetry || retryCount > MAX_RETRIES) throw e;
            // Body threw during retry — record and re-invoke rescue
            // with the new error so the full history is preserved.
            errors.push(e);
            currentError = e;
            continue;
        }
    }
}

/**
 * Extract contract properties from a spec object.
 * Returns only the contract-related properties, leaving the rest for type checking.
 * Returns `null` when no contracts are present (simplifies truthiness checks at call sites).
 */
function extractContracts(specObj: Record<string, unknown>): ContractSpec | null {
    const hasDemands = 'demands' in specObj && typeof specObj['demands'] === 'function',
        hasEnsures = 'ensures' in specObj && typeof specObj['ensures'] === 'function',
        hasRescue = 'rescue' in specObj && typeof specObj['rescue'] === 'function';

    if (!hasDemands && !hasEnsures && !hasRescue)
        return null;

    const contracts: ContractSpec = {};
    if (hasDemands) contracts.demands = specObj['demands'] as ContractSpec['demands'];
    if (hasEnsures) contracts.ensures = specObj['ensures'] as ContractSpec['ensures'];
    if (hasRescue) contracts.rescue = specObj['rescue'] as ContractSpec['rescue'];

    return contracts;
}

/**
 * Resolve contracts for a child operation with optional parent subcontracting.
 *
 * Extracts the child's contracts from `specObj`, then composes with
 * `parentContracts` (if any) using LSP subcontracting rules:
 * - If the child explicitly declares contracts → compose with parent
 * - If the child has no contracts → inherit parent's contracts unchanged
 * - If no parent contracts exist → use child's own (may be null)
 *
 * Replaces the repeated extract-then-compose-or-inherit pattern that
 * previously appeared at every fold/unfold registration site.
 */
export function resolveContracts(
    specObj: Record<string, unknown>,
    parentContracts?: ContractSpec | null
): ContractSpec | null {
    let contracts: ContractSpec | null = extractContracts(specObj);

    if (parentContracts) {
        if (contracts !== null)
            contracts = composeContracts(parentContracts, contracts);
        else
            contracts = parentContracts;
    }

    return contracts;
}

// ---- Subcontracting Composition ---------------------------------------------

/**
 * Compose contracts according to subcontracting rules (LSP):
 * - demands: OR (weaken) — child demand ∨ parent demand
 * - ensures: AND (strengthen) — child ensures ∧ parent ensures
 * - rescue: override or inherit — child rescue replaces parent, or parent inherited if absent
 */
function composeContracts(
    parentContracts: ContractSpec,
    childContracts: ContractSpec
): ContractSpec {
    const composed: ContractSpec = {};

    // Demands: OR (weaken) — accept if either parent or child demands pass.
    // Each predicate is evaluated independently; a throw is treated as false
    // so that one side throwing does not prevent the other from accepting.
    if (parentContracts.demands || childContracts.demands) {
        const parentDemands = parentContracts.demands;
        const childDemands = childContracts.demands;

        if (parentDemands && childDemands) {
            composed.demands = (self: unknown, ...args: unknown[]) => {
                let parentOk = false;
                try { parentOk = parentDemands(self, ...args); } catch { /* treat as false */ }
                if (parentOk) return true;
                let childOk = false;
                try { childOk = childDemands(self, ...args); } catch { /* treat as false */ }
                return childOk;
            };
        } else
            composed.demands = childDemands || parentDemands;
    }

    // Ensures: AND (strengthen) — both parent and child ensures must pass.
    // Each predicate is evaluated independently; a throw is treated as false
    // so that one side throwing does not mask the other's result.
    if (parentContracts.ensures || childContracts.ensures) {
        const parentEnsures = parentContracts.ensures;
        const childEnsures = childContracts.ensures;

        if (parentEnsures && childEnsures) {
            composed.ensures = (self: unknown, old: unknown, result: unknown, ...args: unknown[]) => {
                let parentOk = false;
                try { parentOk = parentEnsures(self, old, result, ...args); } catch { /* treat as false */ }
                if (!parentOk) return false;
                let childOk = false;
                try { childOk = childEnsures(self, old, result, ...args); } catch { /* treat as false */ }
                return childOk;
            };
        } else
            composed.ensures = childEnsures || parentEnsures;
    }

    // Rescue: override or inherit
    composed.rescue = childContracts.rescue || parentContracts.rescue;

    return composed;
}

// ---- Assertion Utilities ----------------------------------------------------

/**
 * Thrown when an assertion fails.
 * @see {@link assert}
 */
export class AssertionError extends Error {
    override name = 'AssertionError';
}

/**
 * Asserts that the given condition is truthy.
 *
 * If the condition is falsy, throws an {@link AssertionError} with the
 * provided message (or a default). Supports TypeScript assertion signatures
 * so that the type system narrows after a successful call.
 *
 * Unlike demands/ensures/rescue/invariant, `assert` is **not** gated by
 * {@link checkedMode}. It targets hard logical invariants (programmer errors)
 * that should never be silenced, as opposed to operational contract checks
 * whose overhead may be acceptable to skip in production.
 *
 * @param condition - The condition to test.
 * @param message - Optional message for the error if the assertion fails.
 * @throws {AssertionError} If the condition is falsy.
 *
 * @example
 * ```ts
 * import { assert } from '@lapis-lang/lapis-js';
 *
 * const x = 15;
 * assert(x > 5, `Expected x > 5, got ${x}`);
 * ```
 */
export function assert(condition: unknown, message: string = 'Assertion failed'): asserts condition {
    if (!condition)
        throw new AssertionError(message);
}

/**
 * Material implication: `p → q`.
 *
 * Returns `true` when the antecedent is false or both are true.
 * Logically equivalent to `!p || q`.
 *
 * Useful for encoding preconditions like
 * "sunny weather is a precondition of visiting the beach".
 *
 * @param p - The antecedent.
 * @param q - The consequent.
 * @returns The material implication of p and q.
 *
 * @example
 * ```ts
 * import { implies } from '@lapis-lang/lapis-js';
 *
 * // If the stack is non-empty, then size must be > 0
 * implies(!stack.isEmpty, stack.size > 0)
 * ```
 */
export function implies(p: boolean, q: boolean): boolean {
    return !p || q;
}

/**
 * Biconditional: `p ↔ q` ("P if and only if Q").
 *
 * Returns `true` when both operands have the same truth value.
 * Logically equivalent to `implies(p, q) && implies(q, p)`.
 *
 * Useful for encoding equivalences like
 * "the stack is empty if and only if its size is 0".
 *
 * @param p - The first operand.
 * @param q - The second operand.
 * @returns The biconditional of p and q.
 *
 * @example
 * ```ts
 * import { iff } from '@lapis-lang/lapis-js';
 *
 * // The stack is empty iff its size is 0
 * iff(stack.isEmpty, stack.size === 0)
 * ```
 */
export function iff(p: boolean, q: boolean): boolean {
    return (p && q) || (!p && !q);
}
