/**
 * Tests for shared utility functions
 * Validates utility functions used across the codebase
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { composeFunctions } from '../utils.mjs';

describe('Utils', () => {
    describe('composeFunctions', () => {
        it('should compose two functions (both defined)', () => {
            const f = (x) => x + 1;
            const g = (x) => x * 2;
            const composed = composeFunctions(f, g);

            // Should apply f then g: g(f(x)) = g(x + 1) = (x + 1) * 2
            assert.strictEqual(composed(5), 12); // (5 + 1) * 2 = 12
            assert.strictEqual(composed(0), 2);  // (0 + 1) * 2 = 2
            assert.strictEqual(composed(-1), 0); // (-1 + 1) * 2 = 0
        });

        it('should return first function when second is undefined', () => {
            const f = (x) => x + 10;
            const composed = composeFunctions(f, undefined);

            assert.strictEqual(composed(5), 15);
            assert.strictEqual(composed(0), 10);
        });

        it('should return second function when first is undefined', () => {
            const g = (x) => x * 3;
            const composed = composeFunctions(undefined, g);

            assert.strictEqual(composed(5), 15);
            assert.strictEqual(composed(2), 6);
        });

        it('should return identity function when both are undefined', () => {
            const composed = composeFunctions(undefined, undefined);

            assert.strictEqual(composed(5), 5);
            assert.strictEqual(composed(0), 0);
            assert.strictEqual(composed('test'), 'test');
            assert.strictEqual(composed(null), null);
        });

        it('should handle composition with complex transformations', () => {
            const toUpper = (s) => s.toUpperCase();
            const addPrefix = (s) => `PREFIX_${s}`;
            const composed = composeFunctions(toUpper, addPrefix);

            assert.strictEqual(composed('hello'), 'PREFIX_HELLO');
            assert.strictEqual(composed('world'), 'PREFIX_WORLD');
        });

        it('should handle composition with objects', () => {
            const addField = (obj) => ({ ...obj, added: true });
            const doubleValue = (obj) => ({ ...obj, value: obj.value * 2 });
            const composed = composeFunctions(addField, doubleValue);

            const result = composed({ value: 5 });
            assert.strictEqual(result.value, 10);
            assert.strictEqual(result.added, true);
        });

        it('should return first function when second is null', () => {
            const f = (x) => x + 5;
            const composed = composeFunctions(f, null);

            assert.strictEqual(composed(10), 15);
        });

        it('should return second function when first is null', () => {
            const g = (x) => x - 3;
            const composed = composeFunctions(null, g);

            assert.strictEqual(composed(10), 7);
        });

        it('should return identity when both are null', () => {
            const composed = composeFunctions(null, null);

            assert.strictEqual(composed(42), 42);
        });

        it('should compose functions with different arities', () => {
            // f takes x, returns x + 1
            const f = (x) => x + 1;
            // g takes y, returns array
            const g = (y) => [y, y];
            const composed = composeFunctions(f, g);

            const result = composed(5);
            assert.deepStrictEqual(result, [6, 6]);
        });

        it('should handle falsy but defined values correctly', () => {
            // Functions that return falsy values should still be composed
            const returnZero = () => 0;
            const returnFalse = () => false;
            const composed = composeFunctions(returnZero, returnFalse);

            // Should call both: returnFalse(returnZero(x))
            assert.strictEqual(composed('anything'), false);
        });

        it('should be left-to-right composition (f then g)', () => {
            // Verify order: g(f(x)) not f(g(x))
            const subtract2 = (x) => x - 2;
            const divide2 = (x) => x / 2;
            const composed = composeFunctions(subtract2, divide2);

            // Should be: (10 - 2) / 2 = 4, not (10 / 2) - 2 = 3
            assert.strictEqual(composed(10), 4);
        });
    });
});
