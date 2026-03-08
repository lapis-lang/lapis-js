import { data } from '../index.mjs'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * This test file validates runtime validation for ADT definitions.
 * JavaScript runtime checks enforce naming conventions and structure.
 */

describe('Data Type Errors - Runtime Validation', () => {
    test('lowercase variant names should throw runtime error', () => {
        assert.throws(
            () => data(() => ({ Red: {}, Green: {}, yellow: {} })),
            /Variant 'yellow' must be PascalCase/
        );
    });

    test('camelCase variant names should throw runtime error', () => {
        assert.throws(
            () => data(() => ({ NotStarted: {}, inProgress: {} })),
            /Variant 'inProgress' must be PascalCase/
        );
    });

    test('structured data with valid constructors is allowed', () => {
        // This should NOT throw runtime errors - structured data is supported
        const Shape = data(() => ({
            Circle: { radius: Number },
            Square: { side: Number }
        }));

        assert.ok(Shape);
    });

    test('multiple PascalCase violations should throw runtime error', () => {
        assert.throws(
            () => data(() => ({
                Red: {},
                yellow: {},
                Blue: {}
            })),
            /Variant 'yellow' must be PascalCase/
        );
    });

    test('property names must be camelCase - PascalCase property should error', () => {
        assert.throws(
            () => data(() => ({
                Point2D: { X: Number, Y: Number }
            })),
            /Field 'X' .* must be camelCase/
        );
    });

    test('property names must be camelCase - underscore prefix should error', () => {
        assert.throws(
            () => data(() => ({
                Point2D: { _x: Number, y: Number }
            })),
            /Field '_x' .* must be camelCase/
        );
    });

    test('property names must be camelCase - UPPERCASE should error', () => {
        assert.throws(
            () => data(() => ({
                Settings: { HOST: String, port: Number }
            })),
            /Field 'HOST' .* must be camelCase/
        );
    });

    test('valid camelCase property names are allowed', () => {
        // This should NOT throw runtime errors
        const Point = data(() => ({
            Point2D: { x: Number, y: Number },
            Point3D: { x: Number, y: Number, z: Number }
        }));

        assert.ok(Point);
    });

    test('structured variants with multiple fields work correctly', () => {
        // Object literal syntax allows multiple fields
        const Point = data(() => ({
            Point2D: { x: Number, y: Number }
        }));

        const p = Point.Point2D({ x: 3, y: 4 });
        assert.strictEqual(p.x, 3);
        assert.strictEqual(p.y, 4);
    });
});