import { data } from '@lapis-lang/lapis-js'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Color Declaration', () => {
    test('ADT properties are immutable', () => {
        const Color = data(() => ({ Red: {}, Green: {} }));

        // Properties are non-writable (strict mode)
        assert.throws(() => {
            // @ts-expect-error - intentionally trying to mutate
            Color.Red = {};
        }, 'Should not allow mutation of variants');

        // Verify property descriptors
        const redDescriptor = Object.getOwnPropertyDescriptor(Color, 'Red');
        assert.strictEqual(redDescriptor?.writable, false, 'Red property should be non-writable');
        assert.strictEqual(redDescriptor?.configurable, true, 'Red property should be configurable for fold extension');
    });

    test('variant objects are deeply frozen', () => {
        const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));

        assert.ok(Object.isFrozen(Color.Red), 'Red variant should be frozen');
        assert.ok(Object.isFrozen(Color.Green), 'Green variant should be frozen');
        assert.ok(Object.isFrozen(Color.Blue), 'Blue variant should be frozen');
    });

    test('supports single variant', () => {
        const Single = data(() => ({ Only: {} }));

        assert.ok(Single.Only instanceof Single);
    });

    test('supports many variants', () => {
        const Days = data(() => ({
            Monday: {},
            Tuesday: {},
            Wednesday: {},
            Thursday: {},
            Friday: {},
            Saturday: {},
            Sunday: {}
        }));

        assert.ok(Days.Monday);
        assert.ok(Days.Friday);
        assert.ok(Days.Sunday);
    });

    test('variant names can use PascalCase with multiple words', () => {
        const Status = data(() => ({
            NotStarted: {},
            InProgress: {},
            CompletedSuccessfully: {}
        }));

        assert.ok(Status.NotStarted);
        assert.ok(Status.InProgress);
        assert.ok(Status.CompletedSuccessfully);
    });
});