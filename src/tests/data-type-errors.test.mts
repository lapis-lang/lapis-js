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
        const Color = data({ Red: [], Green: [], yellow: [] });

        // Prevent unused variable warning
        void Color;
    });

    test('camelCase variant names should cause type error', () => {
        // @ts-expect-error - 'inProgress' should cause type error (not PascalCase)
        const Status = data({ NotStarted: [], inProgress: [] });

        void Status;
    });

    test('structured data with valid constructors is allowed', () => {
        // This should NOT cause type errors - structured data is now supported
        const Shape = data({
            Circle: [{ radius: Number }],
            Square: [{ side: Number }]
        });

        void Shape;
    });

    test('multiple PascalCase violations should cause type errors', () => {
        // @ts-expect-error - 'yellow' is lowercase
        const Color = data({
            Red: [],
            yellow: [],
            Blue: []
        });

        void Color;
    });

    test('property names must be camelCase - PascalCase property should error', () => {
        // @ts-expect-error - 'X' property is PascalCase, should be camelCase
        const Point = data({
            Point2D: [{ X: Number }, { Y: Number }]
        });

        void Point;
    });

    test('property names must be camelCase - underscore prefix should error', () => {
        // @ts-expect-error - '_x' has underscore prefix
        const Point = data({
            Point2D: [{ _x: Number }, { y: Number }]
        });

        void Point;
    });

    test('property names must be camelCase - UPPERCASE should error', () => {
        // @ts-expect-error - 'HOST' is all uppercase
        const Config = data({
            Settings: [{ HOST: String }, { port: Number }]
        });

        void Config;
    });

    test('valid camelCase property names are allowed', () => {
        // This should NOT cause type errors
        const Point = data({
            Point2D: [{ x: Number }, { y: Number }],
            Point3D: [{ x: Number }, { y: Number }, { z: Number }]
        });

        void Point;
    });

    test('field definitions must have exactly one key', () => {
        // @ts-expect-error - field def has multiple keys
        const Point = data({
            Point2D: [{ x: Number }, { y: Number, foo: Number }]
        });

        void Point;
    });

    test('function values should cause type error', () => {
        const Point = data({
            Point2D: [{ x: Number }, { y: Number }]
        });

        // TypeScript already rejects this because () => number is not assignable to number
        // We verify the type error exists but don't execute (to avoid runtime error)
        if (false as boolean) {
            // @ts-expect-error - function type incompatible with number type
            Point.Point2D({ x: ((a: number) => a + 1), y: 20 });
        }

        void Point;
    });

    test('missing required fields should cause type error', () => {
        const Point = data({
            Point2D: [{ x: Number }, { y: Number }]
        });

        // TypeScript should reject missing fields
        if (false as boolean) {
            // @ts-expect-error - missing required field 'y'
            Point.Point2D({ x: 10 });
        }

        void Point;
    });

    test('extra fields should cause type error', () => {
        const Point = data({
            Point2D: [{ x: Number }, { y: Number }]
        });

        // TypeScript should reject extra fields
        if (false as boolean) {
            // @ts-expect-error - object literal may only specify known properties
            Point.Point2D({ x: 10, y: 20, z: 30 });
        }

        void Point;
    });

    test('type parameters enforce compile-time type safety with instantiation', () => {
        const Pair = data(({ T }) => ({
            MakePair: [{ first: T }, { second: T }]
        }));

        // Instantiate with Number - both fields must be numbers
        const NumPair = Pair({ T: Number });

        // Valid: both are numbers
        const valid = NumPair.MakePair({ first: 1, second: 2 });
        void valid;

        if (false as boolean) {
            // @ts-expect-error - TypeScript catches this: string not assignable to number
            NumPair.MakePair({ first: 1, second: 'bad' });

            // @ts-expect-error - TypeScript catches this: string not assignable to number
            NumPair.MakePair({ first: 'bad', second: 2 });
        }

        void NumPair;
    });

    test('heterogeneous Pair with T and U enforces different types', () => {
        const Pair = data(({ T, U }) => ({
            MakePair: [{ first: T }, { second: U }]
        }));

        // Instantiate with Number and String - different types for each field
        const NumStrPair = Pair({ T: Number, U: String });

        // Valid: first is number, second is string
        const valid = NumStrPair.MakePair({ first: 42, second: 'hello' });
        // prevent unused variable warning
        void valid;

        if (false as boolean) {
            // @ts-expect-error - TypeScript catches this: string not assignable to number in first
            NumStrPair.MakePair({ first: 'bad', second: 'hello' });

            // @ts-expect-error - TypeScript catches this: number not assignable to string in second
            NumStrPair.MakePair({ first: 42, second: 123 });
        }

        // prevent unused variable warning
        void NumStrPair;
    });
});