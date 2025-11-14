import { data } from '@lapis-lang/lapis-js'
import { describe, test } from 'node:test';

/**
 * This test file validates TypeScript type errors at compile time.
 * These tests are expected to have type errors and should not compile
 * if the type system is working correctly.
 */

describe('Data Type Errors', () => {
    test('lowercase variant names should cause type error', () => {
        // @ts-expect-error - 'yellow' should cause type error (not PascalCase)
        const Color = data({ Red: {}, Green: {}, yellow: {} });

        // Prevent unused variable warning
        void Color;
    });

    test('camelCase variant names should cause type error', () => {
        // @ts-expect-error - 'inProgress' should cause type error (not PascalCase)
        const Status = data({ NotStarted: {}, inProgress: {} });

        void Status;
    });

    test('non-empty object values should cause type error', () => {
        // @ts-expect-error - 'Red' value is not empty object literal
        const Color = data({ Red: { value: 1 }, Green: {}, Blue: {} });

        void Color;
    });

    test('object with properties should cause type error', () => {
        const Shape = data({
            // @ts-expect-error - 'Circle' value is not empty object literal
            Circle: { radius: 10 },
            // @ts-expect-error - 'Square' value is not empty object literal
            Square: { side: 5 }
        });

        void Shape;
    });

    test('multiple violations should cause multiple type errors', () => {
        const Color = data({
            Red: {},
            // @ts-expect-error - 'yellow' is lowercase
            yellow: {},
            // @ts-expect-error - 'Blue' has properties
            Blue: { hex: '#0000FF' }
        });

        void Color;
    });
});
