import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, invariant } from '../index.mjs';

describe('Invariant Support', () => {
    describe('Basic Invariant Validation', () => {
        it('should pass when invariant is satisfied', () => {
            const Point = data({
                Point2D: {
                    [invariant]: ({ x, y }) => x >= 0 && y >= 0,
                    x: Number,
                    y: Number
                }
            });

            const p = Point.Point2D({ x: 5, y: 10 });
            assert.equal(p.x, 5);
            assert.equal(p.y, 10);
        });

        it('should throw TypeError when invariant is violated', () => {
            const Point = data({
                Point2D: {
                    [invariant]: ({ x, y }) => x >= 0 && y >= 0,
                    x: Number,
                    y: Number
                }
            });

            assert.throws(
                () => Point.Point2D({ x: -5, y: 10 }),
                {
                    name: 'TypeError',
                    message: /Invariant violation in variant 'Point2D'/
                }
            );
        });

        it('should include function name in error message when available', () => {
            const positiveCoordinates = ({ x, y }) => x >= 0 && y >= 0;
            
            const Point = data({
                Point2D: {
                    [invariant]: positiveCoordinates,
                    x: Number,
                    y: Number
                }
            });

            assert.throws(
                () => Point.Point2D({ x: -5, y: 10 }),
                {
                    name: 'TypeError',
                    message: /Invariant violation in variant 'Point2D': positiveCoordinates/
                }
            );
        });

        it('should work with positional arguments', () => {
            const Point = data({
                Point2D: {
                    [invariant]: ({ x, y }) => x >= 0 && y >= 0,
                    x: Number,
                    y: Number
                }
            });

            const p = Point.Point2D(5, 10);
            assert.equal(p.x, 5);

            assert.throws(
                () => Point.Point2D(-5, 10),
                /Invariant violation in variant 'Point2D'/
            );
        });
    });

    describe('Complex Invariants', () => {
        it('should validate relationships between multiple fields', () => {
            const isChar = (s) => typeof s === 'string' && s.length === 1;
            
            const Range = data({
                CharRange: {
                    [invariant]: ({ start, end }) => start <= end,
                    start: isChar,
                    end: isChar
                }
            });

            const r = Range.CharRange({ start: 'a', end: 'z' });
            assert.equal(r.start, 'a');

            assert.throws(
                () => Range.CharRange({ start: 'z', end: 'a' }),
                /Invariant violation in variant 'CharRange'/
            );
        });

        it('should validate multi-field constraints', () => {
            const Rectangle = data({
                Rect: {
                    [invariant]: ({ width, height, area }) => width * height === area,
                    width: Number,
                    height: Number,
                    area: Number
                }
            });

            const rect = Rectangle.Rect({ width: 5, height: 10, area: 50 });
            assert.equal(rect.area, 50);

            assert.throws(
                () => Rectangle.Rect({ width: 5, height: 10, area: 100 }),
                /Invariant violation in variant 'Rect'/
            );
        });

        it('should apply different invariants to different variants', () => {
            const Shape = data({
                Circle: {
                    [invariant]: ({ radius }) => radius > 0,
                    radius: Number
                },
                Triangle: {
                    [invariant]: ({ a, b, c }) => a + b > c && b + c > a && c + a > b,
                    a: Number,
                    b: Number,
                    c: Number
                }
            });

            const circle = Shape.Circle({ radius: 5 });
            assert.equal(circle.radius, 5);

            assert.throws(
                () => Shape.Circle({ radius: -5 }),
                /Invariant violation in variant 'Circle'/
            );

            const triangle = Shape.Triangle({ a: 3, b: 4, c: 5 });
            assert.equal(triangle.a, 3);

            assert.throws(
                () => Shape.Triangle({ a: 1, b: 2, c: 10 }),
                /Invariant violation in variant 'Triangle'/
            );
        });
    });

    describe('Invariants with Special ADT Types', () => {
        it('should work with parameterized ADTs', () => {
            const Pair = data(({ T, U }) => ({
                MakePair: {
                    [invariant]: ({ first, second }) => first !== second,
                    first: T,
                    second: U
                }
            }));

            const NumPair = Pair(Number, Number);
            const pair = NumPair.MakePair({ first: 1, second: 2 });
            assert.equal(pair.first, 1);

            assert.throws(
                () => NumPair.MakePair({ first: 5, second: 5 }),
                /Invariant violation in variant 'MakePair'/
            );
        });

        it('should work with recursive ADTs', () => {
            const BoundedList = data(({ Family }) => ({
                Nil: {},
                Cons: {
                    [invariant]: ({ head }) => head >= 0 && head <= 100,
                    head: Number,
                    tail: Family
                }
            }));

            const list = BoundedList.Cons({ head: 50, tail: BoundedList.Nil });
            assert.equal(list.head, 50);

            assert.throws(
                () => BoundedList.Cons({ head: 150, tail: BoundedList.Nil }),
                /Invariant violation in variant 'Cons'/
            );
        });

        it('should work with extended ADTs', () => {
            const Shape = data({
                Circle: {
                    [invariant]: ({ radius }) => radius > 0,
                    radius: Number
                }
            });

            const ExtendedShape = Shape.extend({
                Rectangle: {
                    [invariant]: ({ width, height }) => width > 0 && height > 0,
                    width: Number,
                    height: Number
                }
            });

            const circle = ExtendedShape.Circle({ radius: 5 });
            assert.equal(circle.radius, 5);

            const rect = ExtendedShape.Rectangle({ width: 10, height: 20 });
            assert.equal(rect.width, 10);

            // Parent invariant still enforced
            assert.throws(
                () => ExtendedShape.Circle({ radius: -5 }),
                /Invariant violation in variant 'Circle'/
            );

            // New variant invariant enforced
            assert.throws(
                () => ExtendedShape.Rectangle({ width: -10, height: 20 }),
                /Invariant violation in variant 'Rectangle'/
            );
        });
    });

    describe('Validation Order', () => {
        it('should validate fields before invariant', () => {
            const Point = data({
                Point2D: {
                    [invariant]: ({ x, y }) => x >= 0 && y >= 0,
                    x: Number,
                    y: Number
                }
            });

            // Field validation should fail first
            assert.throws(
                () => Point.Point2D({ x: 'not a number', y: 10 }),
                {
                    name: 'TypeError',
                    message: /Field 'x'/
                }
            );
        });

        it('should only call invariant after all fields pass', () => {
            let invariantCalled = false;
            
            const Point = data({
                Point2D: {
                    [invariant]: ({ x, y }) => {
                        invariantCalled = true;
                        return x >= 0 && y >= 0;
                    },
                    x: Number,
                    y: Number
                }
            });

            // Field validation fails, invariant never called
            try {
                Point.Point2D({ x: 'bad', y: 10 });
            } catch (e) {
                // Expected field validation error
            }
            assert.equal(invariantCalled, false);

            // Fields pass, invariant is called
            try {
                Point.Point2D({ x: -5, y: 10 });
            } catch (e) {
                // Expected invariant violation
            }
            assert.equal(invariantCalled, true);
        });
    });

    describe('Invariant Symbol Isolation', () => {
        it('should not be accessible via property access', () => {
            const Point = data({
                Point2D: {
                    [invariant]: ({ x, y }) => x >= 0 && y >= 0,
                    x: Number,
                    y: Number
                }
            });

            const p = Point.Point2D({ x: 5, y: 10 });

            assert.equal(invariant in p, false);
            assert.equal(p[invariant], undefined);
            assert.equal(Object.hasOwnProperty.call(p, invariant), false);
        });

        it('should not be included in property enumeration', () => {
            const Point = data({
                Point2D: {
                    [invariant]: ({ x, y }) => x >= 0 && y >= 0,
                    x: Number,
                    y: Number
                }
            });

            const p = Point.Point2D({ x: 5, y: 10 });
            
            assert.deepEqual(Object.keys(p), ['x', 'y']);
            assert.equal(Object.getOwnPropertySymbols(p).length, 0);
            
            const props = [];
            for (const prop in p) {
                props.push(prop);
            }
            assert.deepEqual(props, ['x', 'y']);
        });

        it('should not be copyable via destructuring or spread', () => {
            const Point = data({
                Point2D: {
                    [invariant]: ({ x, y }) => x >= 0 && y >= 0,
                    x: Number,
                    y: Number
                }
            });

            const p = Point.Point2D({ x: 5, y: 10 });
            
            // Destructuring
            const { x, y, ...rest } = p;
            assert.equal(x, 5);
            assert.equal(y, 10);
            assert.deepEqual(rest, {});
            
            // Spread
            const copy = { ...p };
            assert.deepEqual(copy, { x: 5, y: 10 });
            assert.equal(invariant in copy, false);
        });

        it('should be stored only on constructor, not instance', () => {
            const Point = data({
                Point2D: {
                    [invariant]: ({ x, y }) => x >= 0 && y >= 0,
                    x: Number,
                    y: Number
                }
            });

            const p = Point.Point2D({ x: 5, y: 10 });
            
            // On constructor
            assert.equal(typeof p.constructor._invariant, 'function');
            
            // Not on instance
            assert.equal(p[invariant], undefined);
        });
    });
});
