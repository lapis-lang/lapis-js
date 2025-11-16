import { data } from '@lapis-lang/lapis-js'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Strict Equality (Object Pooling)', () => {
    test('singleton variants have strict equality', () => {
        const Color = data({ Red: [], Green: [], Blue: [] });

        const red = Color.Red;
        const red2 = Color.Red;

        assert.strictEqual(red, red2, 'Singleton variants should be strictly equal');
        assert.ok(red === red2, 'Singleton variants should use === equality');
    });

    test('structured variants with same values have strict equality - named args', () => {
        const Point = data({
            Point2D: [{ x: Number }, { y: Number }]
        });

        const p1 = Point.Point2D({ x: 1, y: 2 });
        const p2 = Point.Point2D({ x: 1, y: 2 });

        assert.strictEqual(p1, p2, 'Points with same values should be strictly equal');
        assert.ok(p1 === p2, 'Points with same values should use === equality');
    });

    test('structured variants with same values have strict equality - positional args', () => {
        const Point = data({
            Point2D: [{ x: Number }, { y: Number }]
        });

        const p1 = Point.Point2D(1, 2);
        const p2 = Point.Point2D(1, 2);

        assert.strictEqual(p1, p2);
        assert.ok(p1 === p2);
    });

    test('structured variants with different values are not equal', () => {
        const Point = data({
            Point2D: [{ x: Number }, { y: Number }]
        });

        const p1 = Point.Point2D({ x: 1, y: 2 });
        const p2 = Point.Point2D({ x: 3, y: 4 });

        assert.notStrictEqual(p1, p2);
        assert.ok(p1 !== p2);
    });

    test('mixing named and positional args produces same instance', () => {
        const Point = data({
            Point2D: [{ x: Number }, { y: Number }]
        });

        const p1 = Point.Point2D({ x: 1, y: 2 });
        const p2 = Point.Point2D(1, 2);

        assert.strictEqual(p1, p2);
    });

    test('strict equality works with 3D points', () => {
        const Point = data({
            Point3D: [{ x: Number }, { y: Number }, { z: Number }]
        });

        const p1 = Point.Point3D(1, 2, 3);
        const p2 = Point.Point3D(1, 2, 3);
        const p3 = Point.Point3D(1, 2, 4);

        assert.strictEqual(p1, p2);
        assert.notStrictEqual(p1, p3);
    });

    test('strict equality works with string fields', () => {
        const Person = data({
            User: [{ name: String }, { email: String }]
        });

        const u1 = Person.User({ name: 'Alice', email: 'alice@example.com' });
        const u2 = Person.User({ name: 'Alice', email: 'alice@example.com' });
        const u3 = Person.User({ name: 'Bob', email: 'alice@example.com' });

        assert.strictEqual(u1, u2);
        assert.notStrictEqual(u1, u3);
    });

    test('strict equality works with boolean fields', () => {
        const Config = data({
            Settings: [{ enabled: Boolean }, { debug: Boolean }]
        });

        const c1 = Config.Settings(true, false);
        const c2 = Config.Settings(true, false);
        const c3 = Config.Settings(false, false);

        assert.strictEqual(c1, c2);
        assert.notStrictEqual(c1, c3);
    });

    test('strict equality works with BigInt fields', () => {
        const BigNumber = data({
            Value: [{ amount: BigInt }]
        });

        const b1 = BigNumber.Value({ amount: 42n });
        const b2 = BigNumber.Value({ amount: 42n });
        const b3 = BigNumber.Value({ amount: 43n });

        assert.strictEqual(b1, b2);
        assert.notStrictEqual(b1, b3);
    });

    test('strict equality works with nested ADT fields', () => {
        const Color = data({ Red: [], Green: [], Blue: [] });
        const Point = data({
            ColorPoint: [{ x: Number }, { y: Number }, { color: Color }]
        });

        const p1 = Point.ColorPoint(1, 2, Color.Red);
        const p2 = Point.ColorPoint(1, 2, Color.Red);
        const p3 = Point.ColorPoint(1, 2, Color.Blue);

        assert.strictEqual(p1, p2);
        assert.notStrictEqual(p1, p3);
    });

    test('strict equality works in Array collections', () => {
        const Point = data({
            Point2D: [{ x: Number }, { y: Number }]
        });

        const points = [
            Point.Point2D(1, 2),
            Point.Point2D(3, 4),
            Point.Point2D(1, 2)  // Duplicate
        ];

        // Array.includes uses strict equality
        assert.ok(points.includes(Point.Point2D(1, 2)));
        assert.ok(points.includes(Point.Point2D(3, 4)));
        assert.ok(!points.includes(Point.Point2D(5, 6)));

        // indexOf uses strict equality
        assert.strictEqual(points.indexOf(Point.Point2D(1, 2)), 0);
        assert.strictEqual(points.indexOf(Point.Point2D(3, 4)), 1);
    });

    test('strict equality works in Set collections', () => {
        const Point = data({
            Point2D: [{ x: Number }, { y: Number }]
        });

        const pointSet = new Set();

        const p1 = Point.Point2D(1, 2);
        const p2 = Point.Point2D(3, 4);
        const p3 = Point.Point2D(1, 2);  // Same as p1

        pointSet.add(p1);
        pointSet.add(p2);
        pointSet.add(p3);  // Should not add duplicate

        assert.strictEqual(pointSet.size, 2);
        assert.ok(pointSet.has(Point.Point2D(1, 2)));
        assert.ok(pointSet.has(Point.Point2D(3, 4)));
        assert.ok(!pointSet.has(Point.Point2D(5, 6)));
    });

    test('strict equality works in Map collections', () => {
        const Point = data({
            Point2D: [{ x: Number }, { y: Number }]
        });

        const pointMap = new Map();

        const p1 = Point.Point2D(1, 2);
        const p2 = Point.Point2D(3, 4);

        pointMap.set(p1, 'origin');
        pointMap.set(p2, 'elsewhere');

        // Using newly created point with same values
        assert.strictEqual(pointMap.get(Point.Point2D(1, 2)), 'origin');
        assert.strictEqual(pointMap.get(Point.Point2D(3, 4)), 'elsewhere');
        assert.strictEqual(pointMap.get(Point.Point2D(5, 6)), undefined);
    });

    test('strict equality with recursive ADTs', () => {
        const Peano = data(({ Family }) => ({
            Zero: [],
            Succ: [{ pred: Family }]
        }));

        const zero = Peano.Zero;
        const one1 = Peano.Succ(zero);
        const one2 = Peano.Succ(zero);
        const two = Peano.Succ(one1);

        assert.strictEqual(one1, one2);
        assert.notStrictEqual(one1, two);
    });

    test('strict equality with parameterized ADTs', () => {
        const List = data(({ Family, T }) => ({
            Nil: [],
            Cons: [{ head: T }, { tail: Family }]
        }));

        const NumList = List({ T: Number });

        const nil = NumList.Nil;
        const list1 = NumList.Cons(1, nil);
        const list2 = NumList.Cons(1, nil);
        const list3 = NumList.Cons(2, nil);

        assert.strictEqual(list1, list2);
        assert.notStrictEqual(list1, list3);
    });

    test('strict equality with extended ADTs', () => {
        const Point2D = data({
            Point2D: [{ x: Number }, { y: Number }]
        });

        const Point3D = Point2D.extend({
            Point3D: [{ x: Number }, { y: Number }, { z: Number }]
        });

        const p1 = Point3D.Point3D(1, 2, 3);
        const p2 = Point3D.Point3D(1, 2, 3);
        const p3 = Point3D.Point3D(1, 2, 4);

        assert.strictEqual(p1, p2);
        assert.notStrictEqual(p1, p3);
    });

    test('strict equality works with single-field variants', () => {
        const Wrapper = data({
            Value: [{ val: Number }]
        });

        const v1 = Wrapper.Value(42);
        const v2 = Wrapper.Value(42);
        const v3 = Wrapper.Value(43);

        assert.strictEqual(v1, v2);
        assert.notStrictEqual(v1, v3);
    });

    test('strict equality with mixed field types', () => {
        const Record = data({
            Entry: [{ id: Number }, { name: String }, { active: Boolean }]
        });

        const r1 = Record.Entry(1, 'Alice', true);
        const r2 = Record.Entry(1, 'Alice', true);
        const r3 = Record.Entry(1, 'Alice', false);

        assert.strictEqual(r1, r2);
        assert.notStrictEqual(r1, r3);
    });

    test('strict equality with object field types', () => {
        const Container = data({
            Box: [{ contents: Object }]
        });

        const obj1 = { a: 1 };
        const obj2 = { a: 1 };  // Different object, same structure

        const b1 = Container.Box(obj1);
        const b2 = Container.Box(obj1);  // Same object reference
        const b3 = Container.Box(obj2);  // Different object

        assert.strictEqual(b1, b2);
        assert.notStrictEqual(b1, b3);  // Different object references
    });

    test('strict equality enables efficient filtering', () => {
        const Point = data({
            Point2D: [{ x: Number }, { y: Number }]
        });

        const points = [
            Point.Point2D(1, 2),
            Point.Point2D(3, 4),
            Point.Point2D(1, 2),
            Point.Point2D(5, 6),
            Point.Point2D(3, 4)
        ];

        // Remove duplicates using Set
        const uniquePoints = [...new Set(points)];

        assert.strictEqual(uniquePoints.length, 3);
        assert.ok(uniquePoints.includes(Point.Point2D(1, 2)));
        assert.ok(uniquePoints.includes(Point.Point2D(3, 4)));
        assert.ok(uniquePoints.includes(Point.Point2D(5, 6)));
    });

    test('strict equality with predicates', () => {
        const isEven = (x: unknown): x is number =>
            typeof x === 'number' && x % 2 === 0;

        const EvenPoint = data({
            Point2D: [{ x: isEven }, { y: isEven }]
        });

        const p1 = EvenPoint.Point2D(2, 4);
        const p2 = EvenPoint.Point2D(2, 4);
        const p3 = EvenPoint.Point2D(2, 6);

        assert.strictEqual(p1, p2);
        assert.notStrictEqual(p1, p3);
    });

    test('strict equality with Date fields', () => {
        const Event = data({
            Timestamp: [{ when: Date }]
        });

        const date1 = new Date('2024-01-01');
        const date2 = new Date('2024-01-01');

        const e1 = Event.Timestamp(date1);
        const e2 = Event.Timestamp(date1);  // Same date object
        const e3 = Event.Timestamp(date2);  // Different date object, same value

        assert.strictEqual(e1, e2);
        assert.notStrictEqual(e1, e3);  // Different object references
    });

    test('zero fields edge case - should work like singleton', () => {
        // This is technically an empty variant, but let's test the behavior
        const Color = data({ Red: [] });

        const red1 = Color.Red;
        const red2 = Color.Red;

        assert.strictEqual(red1, red2);
    });
});
