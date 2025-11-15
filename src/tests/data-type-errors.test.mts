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

    test('structured data with valid constructors is allowed', () => {
        // This should NOT cause type errors - structured data is now supported
        const Shape = data({
            Circle: { radius: Number },
            Square: { side: Number }
        });

        void Shape;
    });

    test('multiple PascalCase violations should cause type errors', () => {
        const Color = data({
            Red: {},
            // @ts-expect-error - 'yellow' is lowercase
            yellow: {},
            Blue: {}
        });

        void Color;
    });

    test('property names must be camelCase - PascalCase property should error', () => {
        const Point = data({
            // @ts-expect-error - 'X' property is PascalCase, should be camelCase
            Point2D: { X: Number, Y: Number }
        });

        void Point;
    });

    test('property names must be camelCase - underscore prefix should error', () => {
        const Point = data({
            // @ts-expect-error - '_x' has underscore prefix
            Point2D: { _x: Number, y: Number }
        });

        void Point;
    });

    test('property names must be camelCase - UPPERCASE should error', () => {
        const Config = data({
            // @ts-expect-error - 'HOST' is all uppercase
            Settings: { HOST: String, port: Number }
        });

        void Config;
    });

    test('valid camelCase property names are allowed', () => {
        // This should NOT cause type errors
        const Point = data({
            Point2D: { x: Number, y: Number },
            Point3D: { x: Number, y: Number, z: Number }
        });

        void Point;
    });

    test('function values should cause type error', () => {
        const Point = data({
            Point2D: { x: Number, y: Number }
        });

        // TypeScript already rejects this because () => number is not assignable to number
        // We verify the type error exists but don't execute (to avoid runtime error)
        if (false as boolean) {
            // @ts-expect-error - function type incompatible with number type
            Point.Point2D({ x: ((a: number) => a + 1), y: 20 });
        }

        void Point;
    });
});