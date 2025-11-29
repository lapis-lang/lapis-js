import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { data } from '../index.mjs';

test('Positional arguments - basic 2-field variant', () => {
    const Point = data({
        Point2D: { x: Number, y: Number }
    });

    // Positional form
    const p1 = Point.Point2D(3, 2);
    assert.equal(p1.x, 3);
    assert.equal(p1.y, 2);
    assert.ok(p1 instanceof Point.Point2D);
    assert.ok(p1 instanceof Point);

    // Named form still works
    const p2 = Point.Point2D({ x: 10, y: 20 });
    assert.equal(p2.x, 10);
    assert.equal(p2.y, 20);
    assert.ok(p2 instanceof Point.Point2D);
    assert.ok(p2 instanceof Point);
});

test('Positional arguments - 3-field variant', () => {
    const Point = data({
        Point3D: { x: Number, y: Number, z: Number }
    });

    const p = Point.Point3D(12, 37, 54);
    assert.equal(p.x, 12);
    assert.equal(p.y, 37);
    assert.equal(p.z, 54);
    assert.ok(p instanceof Point.Point3D);
});

test('Positional arguments - single field with primitive', () => {
    const Wrapper = data({
        IntWrapper: { value: Number }
    });

    // Single non-object primitive should be treated
    const w = Wrapper.IntWrapper(42);
    assert.equal(w.value, 42);

    // Named form still works
    const w2 = Wrapper.IntWrapper({ value: 100 });
    assert.equal(w2.value, 100);
});

test('Positional arguments - single field with ADT instance', () => {
    const Color = data({ Red: {}, Green: {}, Blue: {} });
    const ColorWrapper = data({
        Wrap: { color: Color }
    });

    // ADT instance is not an object literal, so treated
    const wrapped = ColorWrapper.Wrap(Color.Red);
    assert.equal(wrapped.color, Color.Red);

    // Named form still works
    const wrapped2 = ColorWrapper.Wrap({ color: Color.Green });
    assert.equal(wrapped2.color, Color.Green);
});

test('Positional arguments - recursive ADT (Peano)', () => {
    const Peano = data(({ Family }) => ({
        Zero: {},
        Succ: { pred: Family }
    }));

    const zero = Peano.Zero;

    // Positional form - much more concise!
    const one = Peano.Succ(zero);
    const two = Peano.Succ(one);
    const three = Peano.Succ(two);

    assert.equal(one.pred, zero);
    assert.equal(two.pred, one);
    assert.equal(three.pred, two);
    assert.ok(one instanceof Peano.Succ);
    assert.ok(one instanceof Peano);

    // Named form still works
    const four = Peano.Succ({ pred: three });
    assert.equal(four.pred, three);
});

test('Positional arguments - recursive List', () => {
    const List = data(({ Family }) => ({
        Nil: {},
        Cons: { head: Number, tail: Family }
    }));

    const empty = List.Nil;

    // Positional form - much cleaner than named!
    const list = List.Cons(1, List.Cons(2, List.Cons(3, empty)));

    assert.equal(list.head, 1);
    assert.equal(list.tail.head, 2);
    assert.equal(list.tail.tail.head, 3);
    assert.equal(list.tail.tail.tail, empty);
    assert.ok(list instanceof List.Cons);
    assert.ok(list instanceof List);

    // Named form still works
    const namedList = List.Cons({ head: 10, tail: empty });
    assert.equal(namedList.head, 10);
    assert.equal(namedList.tail, empty);
});

test('Positional arguments - binary tree', () => {
    const Tree = data(({ Family }) => ({
        Leaf: { value: Number },
        Node: { left: Family, right: Family, value: Number }
    }));

    const leaf1 = Tree.Leaf(1);
    const leaf2 = Tree.Leaf(2);
    const leaf3 = Tree.Leaf(3);

    // Positional form for complex tree
    const tree = Tree.Node(
        Tree.Node(leaf1, leaf2, 10),
        leaf3,
        20
    );

    assert.equal(tree.value, 20);
    assert.equal(tree.left.value, 10);
    assert.equal(tree.left.left.value, 1);
    assert.equal(tree.left.right.value, 2);
    assert.equal(tree.right.value, 3);
});

test('Positional arguments - nested ADTs', () => {
    const Color = data({ Red: {}, Green: {}, Blue: {} });
    const Point = data({
        ColorPoint2D: { x: Number, y: Number, color: Color }
    });

    const p = Point.ColorPoint2D(5, 10, Color.Red);
    assert.equal(p.x, 5);
    assert.equal(p.y, 10);
    assert.equal(p.color, Color.Red);
    assert.ok(p instanceof Point.ColorPoint2D);
});

test('Positional arguments - with predicates', () => {
    const isEven = (x) =>
        typeof x === 'number' && x % 2 === 0;

    const EvenPoint = data({
        Point2D: { x: isEven , y: isEven }
    });

    // Valid even numbers
    const p = EvenPoint.Point2D(2, 4);
    assert.equal(p.x, 2);
    assert.equal(p.y, 4);

    // Invalid - odd number
    assert.throws(() => {
        EvenPoint.Point2D(3, 4);
    }, /Field 'x' failed predicate validation/);

    // Named form also validates
    assert.throws(() => {
        EvenPoint.Point2D({ x: 2, y: 3 });
    }, /Field 'y' failed predicate validation/);
});

test('Positional arguments - parameterized ADT', () => {
    const List = data(({ Family, T }) => ({
        Nil: {},
        Cons: { head: T, tail: Family }
    }));

    const NumList = List({ T: Number });
    const empty = NumList.Nil;

    // Positional form with type parameters
    const nums = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, empty)));
    assert.equal(nums.head, 1);
    assert.equal(nums.tail.head, 2);
    assert.equal(nums.tail.tail.head, 3);
});

test('Positional arguments - arity validation (too few args)', () => {
    const Point = data({
        Point2D: { x: Number, y: Number }
    });

    assert.throws(() => {
        (Point.Point2D)(3);
    }, /Wrong number of arguments/);
});

test('Positional arguments - arity validation (too many args)', () => {
    const Point = data({
        Point2D: { x: Number, y: Number }
    });

    assert.throws(() => {
        (Point.Point2D)(3, 2, 1);
    }, /Wrong number of arguments/);
});

test('Positional arguments - arity validation error message', () => {
    const Point = data({
        Point2D: { x: Number, y: Number }
    });

    try {
        (Point.Point2D)(3);
        assert.fail('Should have thrown');
    } catch (error) {
        assert.ok(error.message.includes('Point2D(x, y)'));
        assert.ok(error.message.includes('Point2D(arg0)'));
    }
});

test('Positional arguments - works with new keyword', () => {
    const Point = data({
        Point2D: { x: Number, y: Number }
    });

    // Positional with new
    const p1 = new Point.Point2D(3, 2);
    assert.equal(p1.x, 3);
    assert.equal(p1.y, 2);

    // Named with new (existing functionality)
    const p2 = new Point.Point2D({ x: 10, y: 20 });
    assert.equal(p2.x, 10);
    assert.equal(p2.y, 20);
});

test('Positional arguments - mixed usage in same codebase', () => {
    const Point = data({
        Point2D: { x: Number, y: Number },
        Point3D: { x: Number, y: Number, z: Number }
    });

    // Mix positional and named styles
    const p2 = Point.Point2D(3, 2);
    const p3 = Point.Point3D({ x: 12, y: 37, z: 54 });

    assert.equal(p2.x, 3);
    assert.equal(p2.y, 2);
    assert.equal(p3.x, 12);
    assert.equal(p3.y, 37);
    assert.equal(p3.z, 54);
});

test('Positional arguments - with extend', () => {
    const Point = data({
        Point2D: { x: Number, y: Number }
    });

    const Point3D = Point.extend(() => ({
        Point3D: { x: Number, y: Number, z: Number }
    }));

    // Positional works on base variant
    const p2 = Point3D.Point2D(10, 20);
    assert.equal(p2.x, 10);
    assert.equal(p2.y, 20);
    assert.ok(p2 instanceof Point3D.Point2D);
    assert.ok(p2 instanceof Point);
    assert.ok(p2 instanceof Point3D);

    // Positional works on extended variant
    const p3 = Point3D.Point3D(1, 2, 3);
    assert.equal(p3.x, 1);
    assert.equal(p3.y, 2);
    assert.equal(p3.z, 3);
    assert.ok(p3 instanceof Point3D.Point3D);
    assert.ok(p3 instanceof Point3D);
});

test('Positional arguments - recursive extend', () => {
    const IntExpr = data(({ Family }) => ({
        IntLit: { value: Number },
        Add: { left: Family, right: Family }
    }));

    const IntBoolExpr = IntExpr.extend(({ Family }) => ({
        BoolLit: { value: Boolean },
        LessThan: { left: Family, right: Family }
    }));

    // Positional form for cleaner construction
    const five = IntBoolExpr.IntLit(5);
    const ten = IntBoolExpr.IntLit(10);
    const add = IntBoolExpr.Add(five, ten);
    const lessThan = IntBoolExpr.LessThan(five, ten);

    assert.equal(five.value, 5);
    assert.equal(add.left, five);
    assert.equal(add.right, ten);
    assert.equal(lessThan.left, five);
    assert.equal(lessThan.right, ten);
});

test('Positional arguments - field order preserved', () => {
    const Record = data({
        Person: { name: String, age: Number, city: String }
    });

    const p = Record.Person('Alice', 30, 'NYC');
    assert.equal(p.name, 'Alice');
    assert.equal(p.age, 30);
    assert.equal(p.city, 'NYC');
});

test('Positional arguments - different types', () => {
    const Mixed = data({
        MixedData: { str: String, num: Number, bool: Boolean, bigint: BigInt }
    });

    const m = Mixed.MixedData('hello', 42, true, BigInt(999));
    assert.equal(m.str, 'hello');
    assert.equal(m.num, 42);
    assert.equal(m.bool, true);
    assert.equal(m.bigint, BigInt(999));
});
