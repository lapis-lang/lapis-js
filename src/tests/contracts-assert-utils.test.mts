/**
 * Tests for contract assertion utilities: assert, implies, iff.
 */
import { describe, it } from 'node:test';
import nodeAssert from 'node:assert/strict';
import { assert, implies, iff, AssertionError } from '../index.mjs';

describe('assert', () => {
    it('should return undefined for truthy condition', () => {
        nodeAssert.strictEqual(assert(true), undefined);
        nodeAssert.strictEqual(assert(1), undefined);
        nodeAssert.strictEqual(assert('non-empty'), undefined);
        nodeAssert.strictEqual(assert({}), undefined);
    });

    it('should throw AssertionError for falsy condition', () => {
        nodeAssert.throws(() => assert(false), AssertionError);
        nodeAssert.throws(() => assert(0), AssertionError);
        nodeAssert.throws(() => assert(''), AssertionError);
        nodeAssert.throws(() => assert(null), AssertionError);
        nodeAssert.throws(() => assert(undefined), AssertionError);
    });

    it('should include the custom message in the error', () => {
        nodeAssert.throws(
            () => assert(false, 'x must be positive'),
            { message: 'x must be positive' }
        );
    });

    it('should use default message when none provided', () => {
        nodeAssert.throws(
            () => assert(false),
            { message: 'Assertion failed' }
        );
    });

    it('should support TypeScript assertion signatures (narrowing)', () => {
        const a: unknown = 'foo';

        // Before assert, a is unknown
        assert(typeof a === 'string');

        // After assert, TypeScript narrows a to string
        // (this is verified at compile time—runtime just checks no throw)
        nodeAssert.strictEqual(a.length, 3);
    });

    it('should have name AssertionError', () => {
        const err = new AssertionError('test');
        nodeAssert.strictEqual(err.name, 'AssertionError');
        nodeAssert.ok(err instanceof Error);
        nodeAssert.ok(err instanceof AssertionError);
    });
});

describe('implies (material implication: p → q)', () => {
    it('should return true when p is false (vacuous truth)', () => {
        nodeAssert.strictEqual(implies(false, false), true);
        nodeAssert.strictEqual(implies(false, true), true);
    });

    it('should return q when p is true', () => {
        nodeAssert.strictEqual(implies(true, true), true);
        nodeAssert.strictEqual(implies(true, false), false);
    });

    it('should match the truth table for material implication', () => {
        // p → q ≡ ¬p ∨ q
        const cases: [boolean, boolean, boolean][] = [
            [false, false, true],
            [false, true, true],
            [true, false, false],
            [true, true, true]
        ];

        for (const [p, q, expected] of cases) {
            nodeAssert.strictEqual(implies(p, q), expected,
                `implies(${p}, ${q}) should be ${expected}`);
        }
    });

    it('should be usable in contract expressions', () => {
        // "If the stack is non-empty, then size > 0"
        const isEmpty = false, size = 3;
        nodeAssert.strictEqual(implies(!isEmpty, size > 0), true);

        // Vacuously true when antecedent is false
        const isEmpty2 = true, size2 = 0;
        nodeAssert.strictEqual(implies(!isEmpty2, size2 > 0), true);
    });
});

describe('iff (biconditional: p ↔ q)', () => {
    it('should return true when both operands have the same truth value', () => {
        nodeAssert.strictEqual(iff(true, true), true);
        nodeAssert.strictEqual(iff(false, false), true);
    });

    it('should return false when operands differ', () => {
        nodeAssert.strictEqual(iff(true, false), false);
        nodeAssert.strictEqual(iff(false, true), false);
    });

    it('should match the truth table for biconditional', () => {
        // p ↔ q ≡ (p ∧ q) ∨ (¬p ∧ ¬q)
        const cases: [boolean, boolean, boolean][] = [
            [false, false, true],
            [false, true, false],
            [true, false, false],
            [true, true, true]
        ];

        for (const [p, q, expected] of cases) {
            nodeAssert.strictEqual(iff(p, q), expected,
                `iff(${p}, ${q}) should be ${expected}`);
        }
    });

    it('should be equivalent to implies(p,q) && implies(q,p)', () => {
        for (const p of [true, false]) {
            for (const q of [true, false]) {
                nodeAssert.strictEqual(
                    iff(p, q),
                    implies(p, q) && implies(q, p),
                    `iff(${p},${q}) should equal implies(${p},${q}) && implies(${q},${p})`
                );
            }
        }
    });

    it('should be usable in contract expressions', () => {
        // "The stack is empty iff its size is 0"
        nodeAssert.strictEqual(iff(true, true), true);   // isEmpty=true, size===0
        nodeAssert.strictEqual(iff(false, false), true);  // isEmpty=false, size!==0
        nodeAssert.strictEqual(iff(true, false), false);  // isEmpty=true but size!==0 — broken
        nodeAssert.strictEqual(iff(false, true), false);  // isEmpty=false but size===0 — broken
    });
});
