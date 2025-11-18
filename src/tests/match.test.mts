import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

describe('Match Operation', () => {
    describe('Simple Enumerations', () => {
        test('should match on simple enumerated variants', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            assert.strictEqual(Color.Red.toHex(), '#FF0000');
            assert.strictEqual(Color.Green.toHex(), '#00FF00');
            assert.strictEqual(Color.Blue.toHex(), '#0000FF');
        });

        test('should match on simple variants with callback form', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, (_Family) => ({
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                }));

            assert.strictEqual(Color.Red.toHex(), '#FF0000');
            assert.strictEqual(Color.Green.toHex(), '#00FF00');
            assert.strictEqual(Color.Blue.toHex(), '#0000FF');
        });

        test('should support multiple match operations on same ADT', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                })
                .match('toRGB', { out: String }, {
                    Red() { return 'rgb(255, 0, 0)'; },
                    Green() { return 'rgb(0, 255, 0)'; },
                    Blue() { return 'rgb(0, 0, 255)'; }
                });

            assert.strictEqual(Color.Red.toHex(), '#FF0000');
            assert.strictEqual(Color.Red.toRGB(), 'rgb(255, 0, 0)');
        });
    });

    describe('Structured Variants', () => {
        test('should match on structured variants with named destructuring', () => {
            const Point = data({
                Point2D: [{ x: Number }, { y: Number }]
            }).match('quadrant', { out: String }, {
                Point2D({ x, y }) {
                    if (x >= 0 && y >= 0) return 'Q1';
                    if (x < 0 && y >= 0) return 'Q2';
                    if (x < 0 && y < 0) return 'Q3';
                    return 'Q4';
                }
            });

            const p1 = Point.Point2D({ x: 5, y: 10 });
            const p2 = Point.Point2D({ x: -5, y: 10 });
            const p3 = Point.Point2D({ x: -5, y: -10 });
            const p4 = Point.Point2D({ x: 5, y: -10 });

            assert.strictEqual(p1.quadrant(), 'Q1');
            assert.strictEqual(p2.quadrant(), 'Q2');
            assert.strictEqual(p3.quadrant(), 'Q3');
            assert.strictEqual(p4.quadrant(), 'Q4');
        });

        test('should work with positional construction', () => {
            const Point = data({
                Point2D: [{ x: Number }, { y: Number }]
            }).match('toString', { out: String }, {
                Point2D({ x, y }) {
                    return `(${x}, ${y})`;
                }
            });

            // Positional construction
            const p1 = Point.Point2D(3, 4);
            assert.strictEqual(p1.toString(), '(3, 4)');

            // Named construction
            const p2 = Point.Point2D({ x: 5, y: 6 });
            assert.strictEqual(p2.toString(), '(5, 6)');
        });

        test('should support partial field destructuring', () => {
            const Point3D = data({
                Point3D: [{ x: Number }, { y: Number }, { z: Number }]
            }).match('sumXY', { out: Number }, {
                Point3D({ x, y }) { // Ignore z
                    return x + y;
                }
            });

            const p = Point3D.Point3D({ x: 1, y: 2, z: 3 });
            assert.strictEqual(p.sumXY(), 3);
        });

        test('should work with mixed simple and structured variants', () => {
            const Shape = data({
                Circle: [{ radius: Number }],
                Square: [{ side: Number }],
                Unknown: []
            }).match('area', { out: Number }, {
                Circle({ radius }) { return Math.PI * radius * radius; },
                Square({ side }) { return side * side; },
                Unknown() { return 0; }
            });

            const circle = Shape.Circle({ radius: 5 });
            const square = Shape.Square({ side: 4 });
            const unknown = Shape.Unknown;

            assert.strictEqual(circle.area(), Math.PI * 25);
            assert.strictEqual(square.area(), 16);
            assert.strictEqual(unknown.area(), 0);
        });
    });

    describe('Wildcard Handler', () => {
        test('should use wildcard handler for unhandled variants', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    _() { return '#UNKNOWN'; }
                });

            assert.strictEqual(Color.Red.toHex(), '#FF0000');
            assert.strictEqual(Color.Green.toHex(), '#UNKNOWN');
            assert.strictEqual(Color.Blue.toHex(), '#UNKNOWN');
        });

        test('wildcard handler should receive instance', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('getName', { out: String }, {
                    Red() { return 'Red'; },
                    _(instance) { return instance.constructor.name; }
                });

            assert.strictEqual(Color.Red.getName(), 'Red');
            assert.strictEqual(Color.Green.getName(), 'Green');
            assert.strictEqual(Color.Blue.getName(), 'Blue');
        });

        test('specific handlers should take precedence over wildcard', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    _() { return '#UNKNOWN'; }
                });

            assert.strictEqual(Color.Red.toHex(), '#FF0000');
            assert.strictEqual(Color.Green.toHex(), '#00FF00');
            assert.strictEqual(Color.Blue.toHex(), '#UNKNOWN');
        });

        test('wildcard with structured variants', () => {
            const Shape = data({
                Circle: [{ radius: Number }],
                Square: [{ side: Number }],
                Triangle: [{ base: Number }, { height: Number }]
            }).match('describe', { out: String }, {
                Circle({ radius }) { return `Circle with radius ${radius}`; },
                _(instance) { return `Unknown shape: ${instance.constructor.name}`; }
            });

            const circle = Shape.Circle({ radius: 5 });
            const square = Shape.Square({ side: 4 });
            const triangle = Shape.Triangle({ base: 3, height: 4 });

            assert.strictEqual(circle.describe(), 'Circle with radius 5');
            assert.strictEqual(square.describe(), 'Unknown shape: Square');
            assert.strictEqual(triangle.describe(), 'Unknown shape: Triangle');
        });
    });

    describe('Error Handling', () => {
        test('should throw error when no handler matches and no wildcard', () => {
            // TypeScript prevents this at compile-time, but testing runtime behavior when bypassed
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; }
                } as any);

            assert.strictEqual(Color.Red.toHex(), '#FF0000');

            assert.throws(
                () => Color.Green.toHex(),
                /No handler for variant 'Green' in match operation 'toHex'/
            );
        });

        test('should detect name collision with variant fields', () => {
            const Point = data({
                Point2D: [{ x: Number }, { y: Number }]
            });

            assert.throws(
                () => Point.match('x', { out: String }, {
                    Point2D({ x, y }) { return `${x},${y}`; }
                }),
                /Operation name 'x' conflicts with field 'x' in variant 'Point2D'/
            );
        });

        test('should detect name collision with singleton variant properties', () => {
            const Color = data({ Red: [], Green: [], Blue: [] });

            // 'constructor' is a property that exists on all instances
            assert.throws(
                () => Color.match('constructor', { out: String }, {
                    Red() { return 'red'; },
                    Green() { return 'green'; },
                    Blue() { return 'blue'; }
                }),
                /Operation name 'constructor' conflicts/
            );
        });
    });

    describe('Recursive ADTs (non-recursive match)', () => {
        test('should match on recursive ADT without recursing into structure', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            })).match('isEmpty', { out: Boolean }, {
                Nil() { return true; },
                Cons({ head: _head, tail: _tail }) { return false; } // Does NOT recurse into tail
            });

            const empty = List.Nil;
            const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) });

            assert.strictEqual(empty.isEmpty(), true);
            assert.strictEqual(list.isEmpty(), false);
        });

        test('should match on Peano numbers', () => {
            const Peano = data(({ Family }) => ({
                Zero: [],
                Succ: [{ pred: Family }]
            })).match('isZero', { out: Boolean }, {
                Zero() { return true; },
                Succ({ pred: _pred }) { return false; } // Does NOT recurse
            });

            const zero = Peano.Zero;
            const one = Peano.Succ({ pred: zero });
            const two = Peano.Succ({ pred: one });

            assert.strictEqual(zero.isZero(), true);
            assert.strictEqual(one.isZero(), false);
            assert.strictEqual(two.isZero(), false);
        });

        test('callback form should receive Family reference', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            })).match('type', { out: String }, (_Family) => ({
                Nil() { return 'nil'; },
                Cons({ head: _head, tail: _tail }) { return 'cons'; }
            }));

            assert.strictEqual(List.Nil.type(), 'nil');
            assert.strictEqual(List.Cons({ head: 1, tail: List.Nil }).type(), 'cons');
        });
    });

    describe('Type Safety', () => {
        test('should preserve type information through match', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            const hex: string = Color.Red.toHex();
            assert.strictEqual(typeof hex, 'string');
        });

        test('handler return types should be inferred', () => {
            const Point = data({
                Point2D: [{ x: Number }, { y: Number }]
            }).match('magnitude', { out: Number }, {
                Point2D({ x, y }) {
                    return Math.sqrt(x * x + y * y);
                }
            });

            const p = Point.Point2D({ x: 3, y: 4 });
            const mag: number = p.magnitude();
            assert.strictEqual(mag, 5);
        });
    });

    describe('Integration with extend()', () => {
        test('extended ADT should inherit match operations', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            const ExtendedColor = Color.extend({ Yellow: [], Orange: [] });

            // Inherited variants should have the operation
            assert.strictEqual(ExtendedColor.Red.toHex(), '#FF0000');
            assert.strictEqual(ExtendedColor.Green.toHex(), '#00FF00');

            // New variants without handlers should throw
            assert.throws(
                () => (ExtendedColor.Yellow as any).toHex(),
                /No handler for variant 'Yellow'/
            );
        });

        test('extended ADT with wildcard should handle new variants', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    _(_instance) { return '#UNKNOWN'; }
                });

            const ExtendedColor = Color.extend({ Yellow: [], Orange: [] });

            assert.strictEqual(ExtendedColor.Red.toHex(), '#FF0000');
            assert.strictEqual((ExtendedColor.Yellow as any).toHex(), '#UNKNOWN');
            assert.strictEqual((ExtendedColor.Orange as any).toHex(), '#UNKNOWN');
        });

        test('extended ADT can add new match operations', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
                .match('isWarm', { out: Boolean }, {
                    Red() { return true; },
                    Green() { return false; },
                    Blue() { return false; },
                    Yellow() { return true; },
                    Orange() { return true; }
                });

            // Old operation still works
            assert.strictEqual(ExtendedColor.Red.toHex(), '#FF0000');

            // New operation works on all variants
            assert.strictEqual(ExtendedColor.Red.isWarm(), true);
            assert.strictEqual(ExtendedColor.Green.isWarm(), false);
            assert.strictEqual(ExtendedColor.Yellow.isWarm(), true);
        });
    });

    describe('Chaining and Fluent API', () => {
        test('match should return ADT for chaining', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                })
                .match('toName', { out: String }, {
                    Red() { return 'Red'; },
                    Green() { return 'Green'; },
                    Blue() { return 'Blue'; }
                });

            assert.strictEqual(Color.Red.toHex(), '#FF0000');
            assert.strictEqual(Color.Red.toName(), 'Red');
        });

        test('match can be called after extend', () => {
            const BaseColor = data({ Red: [], Green: [], Blue: [] });
            const ExtendedColor = BaseColor.extend({ Yellow: [], Orange: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; },
                    Yellow() { return '#FFFF00'; },
                    Orange() { return '#FFA500'; }
                });

            assert.strictEqual(ExtendedColor.Yellow.toHex(), '#FFFF00');
        });
    });
});
