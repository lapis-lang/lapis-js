import { data } from '@lapis-lang/lapis-js'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Class-based ADT', () => {
    test('simple enumerations are singleton instances', () => {
        const Color = data({ Red: {}, Green: {}, Blue: {} });

        assert.ok(Color.Red instanceof Color);
        assert.ok(Color.Green instanceof Color);
        assert.ok(Color.Blue instanceof Color);
    });

    test('structured variants are callable without new', () => {
        const Point = data({
            Point2D: { x: Number, y: Number }
        });

        const p = Point.Point2D({ x: 10, y: 20 });

        assert.strictEqual(p.x, 10);
        assert.strictEqual(p.y, 20);
        assert.ok(p instanceof Point.Point2D);
    });

    test('structured variants also work with new keyword', () => {
        const Point = data({
            Point2D: { x: Number, y: Number }
        });

        const p = new Point.Point2D({ x: 10, y: 20 });

        assert.strictEqual(p.x, 10);
        assert.strictEqual(p.y, 20);
        assert.ok(p instanceof Point.Point2D);
    });

    test('instanceof checks work across variants', () => {
        const Color = data({ Red: {}, Green: {}, Blue: {} });

        // All variants should be instances of the same base class
        assert.strictEqual(
            Object.getPrototypeOf(Color.Red.constructor).name,
            Object.getPrototypeOf(Color.Green.constructor).name
        );
    });

    test('nested ADT with proper type inference', () => {
        const Color = data({ Red: {}, Green: {}, Blue: {} });

        const ColorPoint = data({
            Point2: { x: Number, y: Number, color: Color },
        });

        const p = ColorPoint.Point2({ x: 5, y: 10, color: Color.Red });

        assert.strictEqual(p.x, 5);
        assert.strictEqual(p.y, 10);
        assert.strictEqual(p.color, Color.Red);
        assert.ok(p.color instanceof Color);
    });
});
