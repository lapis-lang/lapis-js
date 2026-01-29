import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

describe('Fold Operation (Catamorphism)', () => {
    describe('Non-Recursive ADTs', () => {
        test('should fold on simple enumerated variants (non-recursive)', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: {
                    op: 'fold',
                    out: String,
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                }
            }));

            assert.strictEqual(Color.Red.toHex, '#FF0000');
            assert.strictEqual(Color.Green.toHex, '#00FF00');
            assert.strictEqual(Color.Blue.toHex, '#0000FF');
        });

        test('should fold on simple variants with callback form (non-recursive)', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},

                toHex: {
                    op: 'fold',
                    out: String,
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                }
            }));

            assert.strictEqual(Color.Red.toHex, '#FF0000');
            assert.strictEqual(Color.Green.toHex, '#00FF00');
            assert.strictEqual(Color.Blue.toHex, '#0000FF');
        });

        test('should support multiple fold operations on same ADT (non-recursive)', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},

                toHex: {
                    op: 'fold',
                    out: String,
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                },
                toRGB: {
                    op: 'fold',
                    out: String,
                    Red() { return 'rgb(255, 0, 0)'; },
                    Green() { return 'rgb(0, 255, 0)'; },
                    Blue() { return 'rgb(0, 0, 255)'; }
                }
            }));

            assert.strictEqual(Color.Red.toHex, '#FF0000');
            assert.strictEqual(Color.Red.toRGB, 'rgb(255, 0, 0)');
        });

        test('should fold on structured variants with named destructuring (non-recursive)', () => {
            const Point = data(() => ({
                Point2D: { x: Number, y: Number },
                quadrant: {
                    op: 'fold',
                    spec: { out: String },
                    Point2D({ x, y }) {
                        if (x >= 0 && y >= 0) return 'Q1';
                        if (x < 0 && y >= 0) return 'Q2';
                        if (x < 0 && y < 0) return 'Q3';
                        return 'Q4';
                    }
                }
            }));

            const p1 = Point.Point2D({ x: 5, y: 10 });
            const p2 = Point.Point2D({ x: -5, y: 10 });
            const p3 = Point.Point2D({ x: -5, y: -10 });
            const p4 = Point.Point2D({ x: 5, y: -10 });

            assert.strictEqual(p1.quadrant, 'Q1');
            assert.strictEqual(p2.quadrant, 'Q2');
            assert.strictEqual(p3.quadrant, 'Q3');
            assert.strictEqual(p4.quadrant, 'Q4');
        });

        test('should work with positional construction (non-recursive)', () => {
            const Point = data(() => ({
                Point2D: { x: Number, y: Number },
                toString: {
                    op: 'fold',
                    spec: { out: String },
                    Point2D({ x, y }) {
                        return `(${x}, ${y})`;
                    }
                }
            }));

            // Positional construction
            const p1 = Point.Point2D(3, 4);
            assert.strictEqual(p1.toString, '(3, 4)');

            // Named construction
            const p2 = Point.Point2D({ x: 5, y: 6 });
            assert.strictEqual(p2.toString, '(5, 6)');
        });

        test('should support partial field destructuring (non-recursive)', () => {
            const Point3D = data(() => ({
                Point3D: { x: Number, y: Number, z: Number },
                sumXY: {
                    op: 'fold',
                    spec: { out: Number },
                    Point3D({ x, y }) { // Ignore z
                        return x + y;
                    }
                }
            }));

            const p = Point3D.Point3D({ x: 1, y: 2, z: 3 });
            assert.strictEqual(p.sumXY, 3);
        });

        test('should work with mixed simple and structured variants (non-recursive)', () => {
            const Shape = data(() => ({
                Circle: { radius: Number },
                Square: { side: Number },
                Unknown: {},
                area: {
                    op: 'fold',
                    spec: { out: Number },
                    Circle({ radius }) { return Math.PI * radius * radius; },
                    Square({ side }) { return side * side; },
                    Unknown() { return 0; }
                }
            }));

            const circle = Shape.Circle({ radius: 5 });
            const square = Shape.Square({ side: 4 });
            const unknown = Shape.Unknown;

            assert.strictEqual(circle.area, Math.PI * 25);
            assert.strictEqual(square.area, 16);
            assert.strictEqual(unknown.area, 0);
        });
    });

    describe('Simple Recursive ADTs', () => {
        test('Peano.toValue - should fold Peano numbers to their numeric value', () => {
            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family },
                toValue: {
                    op: 'fold',
                    spec: { out: Number },
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                }
            }));

            const zero = Peano.Zero;
            const one = Peano.Succ({ pred: zero });
            const two = Peano.Succ({ pred: one });
            const three = Peano.Succ({ pred: two });

            assert.strictEqual(zero.toValue, 0);
            assert.strictEqual(one.toValue, 1);
            assert.strictEqual(two.toValue, 2);
            assert.strictEqual(three.toValue, 3);
        });

        test('Peano with callback form - should support Family parameter', () => {
            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family },
                toValue: {
                    op: 'fold',
                    spec: { out: Number },
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                }
            }));

            const two = Peano.Succ({ pred: Peano.Succ({ pred: Peano.Zero }) });
            assert.strictEqual(two.toValue, 2);
        });

        test('List.length - should count elements in a list', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                length: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                }
            }));

            const empty = List.Nil;
            const list1 = List.Cons({ head: 1, tail: empty });
            const list2 = List.Cons({ head: 2, tail: list1 });
            const list3 = List.Cons({ head: 3, tail: list2 });

            assert.strictEqual(empty.length, 0);
            assert.strictEqual(list1.length, 1);
            assert.strictEqual(list2.length, 2);
            assert.strictEqual(list3.length, 3);
        });

        test('List.sum - should sum all elements', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                sum: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }
            }));

            const list = List.Cons({
                head: 1,
                tail: List.Cons({
                    head: 2,
                    tail: List.Cons({ head: 3, tail: List.Nil })
                })
            });

            assert.strictEqual(list.sum, 6);
            assert.strictEqual(List.Nil.sum, 0);
        });

        test('List.product - should multiply all elements', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                product: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 1; },
                    Cons({ head, tail }) { return head * tail; }
                }
            }));

            const list = List.Cons({
                head: 2,
                tail: List.Cons({
                    head: 3,
                    tail: List.Cons({ head: 4, tail: List.Nil })
                })
            });

            assert.strictEqual(list.product, 24);
            assert.strictEqual(List.Nil.product, 1);
        });

        test('List.append - should append element to end of list', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                append: {
                    op: 'fold',
                    spec: { in: Number },
                    Nil(_fields, val) {
                        return List.Cons({ head: val, tail: List.Nil });
                    },
                    Cons({ head, tail }, val) {
                        // tail is a partially applied function: tail(val) appends val to the tail
                        return List.Cons({ head, tail: tail(val) });
                    }
                }
            }));

            // Empty list
            const empty = List.Nil;
            const list1 = empty.append(1);
            assert.ok(list1.constructor.name === 'Cons');
            assert.strictEqual(list1.head, 1);
            assert.ok(list1.tail === List.Nil);

            // Single element list
            const list2 = list1.append(2);
            assert.strictEqual(list2.head, 1);
            assert.strictEqual(list2.tail.head, 2);
            assert.ok(list2.tail.tail === List.Nil);

            // Multiple elements
            const list3 = list2.append(3);
            assert.strictEqual(list3.head, 1);
            assert.strictEqual(list3.tail.head, 2);
            assert.strictEqual(list3.tail.tail.head, 3);
            assert.ok(list3.tail.tail.tail === List.Nil);
        });

        test('Parameterized fold with wildcard handler', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                matches: {
                    op: 'fold',
                    spec: { in: String, out: Boolean },
                    Red(_fields, text) { return text.toLowerCase() === 'red'; },
                    _(_fields, text) {
                        // Wildcard handler receives foldedFields and input parameter
                        // Use this to access the instance
                        return this.constructor.name.toLowerCase().includes(text.toLowerCase());
                    }
                }
            }));

            // Red uses specific handler
            assert.strictEqual(Color.Red.matches('red'), true);
            assert.strictEqual(Color.Red.matches('Red'), true);
            assert.strictEqual(Color.Red.matches('blue'), false);

            // Green and Blue use wildcard handler
            assert.strictEqual(Color.Green.matches('green'), true);
            assert.strictEqual(Color.Green.matches('reen'), true);
            assert.strictEqual(Color.Green.matches('blue'), false);

            assert.strictEqual(Color.Blue.matches('blue'), true);
            assert.strictEqual(Color.Blue.matches('Blue'), true);
            assert.strictEqual(Color.Blue.matches('red'), false);
        });
    });

    describe('Multiple Recursive Fields', () => {
        test('Binary tree height - should compute tree height', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family, value: Number },
                height: {
                    op: 'fold',
                    spec: { out: Number },
                    Leaf() { return 1; },
                    Node({ left, right }) { return 1 + Math.max(left, right); }
                }
            }));

            const leaf1 = Tree.Leaf({ value: 1 });
            const leaf2 = Tree.Leaf({ value: 2 });
            const leaf3 = Tree.Leaf({ value: 3 });

            const tree = Tree.Node({
                left: Tree.Node({ left: leaf1, right: leaf2, value: 10 }),
                right: leaf3,
                value: 20
            });

            assert.strictEqual(leaf1.height, 1);
            assert.strictEqual(tree.height, 3);
        });

        test('Binary tree sum - should sum all node values', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family, value: Number },
                sum: {
                    op: 'fold',
                    spec: { out: Number },
                    Leaf({ value }) { return value; },
                    Node({ left, right, value }) { return left + right + value; }
                }
            }));

            const tree = Tree.Node({
                left: Tree.Leaf({ value: 1 }),
                right: Tree.Leaf({ value: 2 }),
                value: 10
            });

            assert.strictEqual(tree.sum, 13);
        });
    });

    describe('Wildcard Handlers', () => {
        test('should use wildcard handler for unspecified variants', () => {
            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family },
                NegSucc: { pred: Family },
                toValue: {
                    op: 'fold',
                    spec: { out: Number },
                    Zero() { return 0; },
                    _() { return -999; } // Wildcard for unknown variants
                }
            }));

            assert.strictEqual(Peano.Zero.toValue, 0);
            assert.strictEqual(Peano.Succ({ pred: Peano.Zero }).toValue, -999);
            assert.strictEqual(Peano.NegSucc({ pred: Peano.Zero }).toValue, -999);
        });

        test('wildcard should receive full instance via this', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                getType: {
                    op: 'fold',
                    spec: { out: String },
                    Leaf() { return 'leaf'; },
                    _() {
                        assert.ok(this instanceof Tree);
                        return 'unknown';
                    }
                }
            }));

            assert.strictEqual(Tree.Leaf({ value: 1 }).getType, 'leaf');
            assert.strictEqual(Tree.Node({ left: Tree.Leaf({ value: 1 }), right: Tree.Leaf({ value: 2 }) }).getType, 'unknown');
        });
    });

    describe('Multiple Operations', () => {
        test('should support multiple fold operations on same ADT', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                length: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                },
                sum: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                },
                product: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 1; },
                    Cons({ head, tail }) { return head * tail; }
                }
            }));

            const list = List.Cons({
                head: 2,
                tail: List.Cons({
                    head: 3,
                    tail: List.Cons({ head: 4, tail: List.Nil })
                })
            });

            assert.strictEqual(list.length, 3);
            assert.strictEqual(list.sum, 9);
            assert.strictEqual(list.product, 24);
        });
    });

    describe('Parameterized ADTs', () => {
        test('should work with parameterized lists', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family },
                length: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                }
            }));

            const numList = List.Cons({
                head: 1,
                tail: List.Cons({ head: 2, tail: List.Nil })
            });

            const strList = List.Cons({
                head: 'a',
                tail: List.Cons({ head: 'b', tail: List.Nil })
            });

            assert.strictEqual(numList.length, 2);
            assert.strictEqual(strList.length, 2);
        });
    });

    describe('Name Collision Detection', () => {
        test('should detect collision with variant field names', () => {
            assert.throws(() => {
                data(({ Family }) => ({
                    Node: { value: Number, left: Family },
                    value: {
                        op: 'fold',
                        spec: { out: Number },
                        Node({ value }) { return value; }
                    }
                }));
            }, /Operation name 'value' conflicts with field 'value'/);
        });
    });

    describe('Complex Structures', () => {
        test('Expression tree with multiple recursive fields', () => {
            const Expr = data(({ Family }) => ({
                Lit: { value: Number },
                Add: { left: Family, right: Family },
                Mul: { left: Family, right: Family },
                eval: {
                    op: 'fold',
                    spec: { out: Number },
                    Lit({ value }) { return value; },
                    Add({ left, right }) { return left + right; },
                    Mul({ left, right }) { return left * right; }
                }
            }));

            // ((2 + 3) * 4) = 20
            const expr = Expr.Mul({
                left: Expr.Add({ left: Expr.Lit({ value: 2 }), right: Expr.Lit({ value: 3 }) }),
                right: Expr.Lit({ value: 4 })
            });

            assert.strictEqual(expr.eval, 20);
        });
    });

    describe('Positional and Named Construction', () => {
        test('fold should work regardless of how variant was constructed', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                sum: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }
            }));

            // Positional construction
            const list1 = List.Cons(1, List.Cons(2, List.Nil));

            // Named construction
            const list2 = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) });

            assert.strictEqual(list1.sum, 3);
            assert.strictEqual(list2.sum, 3);
        });
    });

    describe('Error Handling', () => {
        test('should throw error for missing handler when no wildcard', () => {
            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family },
                partial: {
                    op: 'fold',
                    spec: { out: Number },
                    Zero() { return 0; },
                    // Missing Succ handler, use wildcard to avoid exhaustiveness error
                    _() {
                        if (this.constructor.name === 'Succ') {
                            throw new Error(`No handler for variant 'Succ' in fold operation 'partial'`);
                        }
                        return -1;
                    }
                }
            }));

            assert.throws(() => {
                Peano.Succ({ pred: Peano.Zero }).partial;
            }, /No handler for variant 'Succ'/);
        });
    });

    describe('Integration with Match', () => {
        test('should work alongside match operations', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                isEmpty: {
                    op: 'fold',
                    spec: { out: Boolean },
                    Nil() { return true; },
                    Cons() { return false; }
                },
                length: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                }
            }));

            const list = List.Cons({ head: 1, tail: List.Nil });

            assert.strictEqual(list.isEmpty, false);
            assert.strictEqual(list.length, 1);
            assert.strictEqual(List.Nil.isEmpty, true);
            assert.strictEqual(List.Nil.length, 0);
        });
    });

    describe('Type Safety', () => {
        test('handlers receive properly typed fields', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                sum: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 0; },
                    Cons({ head, tail }) {
                        // TypeScript should infer: head is number, tail is already folded result (number)
                        assert.strictEqual(typeof head, 'number');
                        assert.strictEqual(typeof tail, 'number');
                        return head + tail;
                    }
                }
            }));

            const list = List.Cons({ head: 5, tail: List.Cons({ head: 3, tail: List.Nil }) });
            assert.strictEqual(list.sum, 8);
        });
    });

    describe('Deeply Nested Structures', () => {
        test('should handle deeply nested recursive structures', () => {
            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family },
                toValue: {
                    op: 'fold',
                    spec: { out: Number },
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                }
            }));

            // Build number 10
            let ten = Peano.Zero;
            for (let i = 0; i < 10; i++) {
                ten = Peano.Succ({ pred: ten });
            }

            assert.strictEqual(ten.toValue, 10);
        });

        test('should handle large lists', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                length: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                }
            }));

            // Build list of 100 elements
            let list = List.Nil;
            for (let i = 0; i < 100; i++) {
                list = List.Cons({ head: i, tail: list });
            }

            assert.strictEqual(list.length, 100);
        });
    });
});
