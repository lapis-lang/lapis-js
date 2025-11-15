import { data } from '@lapis-lang/lapis-js'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Structured Data', () => {
    test('supports structured data with Number fields', () => {
        const Point = data({
            Point2D: { x: Number, y: Number }
        });

        const p = Point.Point2D({ x: 10, y: 20 });

        assert.strictEqual(p.x, 10);
        assert.strictEqual(p.y, 20);
        assert.ok(p instanceof Point.Point2D);
        assert.ok(Object.isFrozen(p), 'Instance should be frozen');
    });

    test('supports structured data with multiple field types', () => {
        const Person = data({
            Employee: { name: String, age: Number, active: Boolean }
        });

        const employee = Person.Employee({ name: 'Alice', age: 30, active: true });

        assert.strictEqual(employee.name, 'Alice');
        assert.strictEqual(employee.age, 30);
        assert.strictEqual(employee.active, true);
    });

    test('supports nested ADTs', () => {
        const Color = data({ Red: {}, Green: {}, Blue: {} });

        const ColorPoint = data({
            Point2: { x: Number, y: Number, color: Color },
        });

        const point = ColorPoint.Point2({ x: 5, y: 10, color: Color.Red });

        assert.strictEqual(point.x, 5);
        assert.strictEqual(point.y, 10);
        assert.strictEqual(point.color, Color.Red);
    });

    test('supports multiple structured variants', () => {
        const Color = data({ Red: {}, Green: {}, Blue: {} });

        const ColorPoint = data({
            Point2: { x: Number, y: Number, color: Color },
            Point3: { x: Number, y: Number, z: Number, color: Color }
        });

        const p2 = ColorPoint.Point2({ x: 1, y: 2, color: Color.Blue });
        const p3 = ColorPoint.Point3({ x: 1, y: 2, z: 3, color: Color.Green });

        assert.strictEqual(p2.x, 1);
        assert.strictEqual(p2.y, 2);
        assert.strictEqual(p2.constructor.name, 'Point2');

        assert.strictEqual(p3.x, 1);
        assert.strictEqual(p3.y, 2);
        assert.strictEqual(p3.z, 3);
        assert.strictEqual(p3.constructor.name, 'Point3');
    });

    test('throws error for wrong field type', () => {
        const Point = data({
            Point2D: { x: Number, y: Number }
        });

        assert.throws(
            () => Point.Point2D({ x: 'hello', y: 20 } as any),
            /Field 'x' must be a number/
        );
    });

    test('validates String fields', () => {
        const Person = data({
            User: { name: String, email: String }
        });

        const user = Person.User({ name: 'Bob', email: 'bob@example.com' });
        assert.strictEqual(user.name, 'Bob');

        assert.throws(
            () => Person.User({ name: 123, email: 'test@test.com' } as any),
            /Field 'name' must be a string/
        );
    });

    test('validates Boolean fields', () => {
        const Config = data({
            Settings: { enabled: Boolean, debug: Boolean }
        });

        const settings = Config.Settings({ enabled: true, debug: false });
        assert.strictEqual(settings.enabled, true);

        assert.throws(
            () => Config.Settings({ enabled: 'yes', debug: false } as any),
            /Field 'enabled' must be a boolean/
        );
    });

    test('validates nested ADT fields', () => {
        const Color = data({ Red: {}, Green: {}, Blue: {} });

        const ColorPoint = data({
            Point: { x: Number, color: Color }
        });

        assert.throws(
            () => ColorPoint.Point({ x: 10, color: {} } as any),
            /Field 'color' must be an instance of/
        );
    });

    test('supports mixing simple and structured variants', () => {
        const Color = data({ Red: {}, Green: {}, Blue: {} });

        const Shape = data({
            Circle: { radius: Number, color: Color },
            Square: { side: Number, color: Color },
            Unknown: {}
        });

        const circle = Shape.Circle({ radius: 5, color: Color.Red });
        assert.strictEqual(circle.radius, 5);
        assert.strictEqual(circle.color, Color.Red);

        assert.ok(Shape.Unknown instanceof Shape);
    });
});
