import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

describe('Fold Operation (Catamorphism)', () => {
    describe('Simple Recursive ADTs', () => {
        test('Peano.toValue - should fold Peano numbers to their numeric value', () => {
            const Peano = data(({ Family }) => ({
                Zero: [],
                Succ: [{ pred: Family }]
            }))
                .fold('toValue', { out: Number }, {
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                });

            const zero = Peano.Zero;
            const one = Peano.Succ({ pred: zero });
            const two = Peano.Succ({ pred: one });
            const three = Peano.Succ({ pred: two });

            assert.strictEqual(zero.toValue(), 0);
            assert.strictEqual(one.toValue(), 1);
            assert.strictEqual(two.toValue(), 2);
            assert.strictEqual(three.toValue(), 3);
        });

        test('Peano with callback form - should support Family parameter', () => {
            const Peano = data(({ Family }) => ({
                Zero: [],
                Succ: [{ pred: Family }]
            }))
                .fold('toValue', { out: Number }, (_Family) => ({
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                }));

            const two = Peano.Succ({ pred: Peano.Succ({ pred: Peano.Zero }) });
            assert.strictEqual(two.toValue(), 2);
        });

        test('List.length - should count elements in a list', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
                .fold('length', { out: Number }, {
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                });

            const empty = List.Nil;
            const list1 = List.Cons({ head: 1, tail: empty });
            const list2 = List.Cons({ head: 2, tail: list1 });
            const list3 = List.Cons({ head: 3, tail: list2 });

            assert.strictEqual(empty.length(), 0);
            assert.strictEqual(list1.length(), 1);
            assert.strictEqual(list2.length(), 2);
            assert.strictEqual(list3.length(), 3);
        });

        test('List.sum - should sum all elements', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
                .fold('sum', { out: Number }, {
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                });

            const list = List.Cons({
                head: 1,
                tail: List.Cons({
                    head: 2,
                    tail: List.Cons({ head: 3, tail: List.Nil })
                })
            });

            assert.strictEqual(list.sum(), 6);
            assert.strictEqual(List.Nil.sum(), 0);
        });

        test('List.product - should multiply all elements', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
                .fold('product', { out: Number }, {
                    Nil() { return 1; },
                    Cons({ head, tail }) { return head * tail; }
                });

            const list = List.Cons({
                head: 2,
                tail: List.Cons({
                    head: 3,
                    tail: List.Cons({ head: 4, tail: List.Nil })
                })
            });

            assert.strictEqual(list.product(), 24);
            assert.strictEqual(List.Nil.product(), 1);
        });
    });

    describe('Multiple Recursive Fields', () => {
        test('Binary tree height - should compute tree height', () => {
            const Tree = data(({ Family }) => ({
                Leaf: [{ value: Number }],
                Node: [{ left: Family }, { right: Family }, { value: Number }]
            }))
                .fold('height', { out: Number }, {
                    Leaf() { return 1; },
                    Node({ left, right }) { return 1 + Math.max(left, right); }
                });

            const leaf1 = Tree.Leaf({ value: 1 });
            const leaf2 = Tree.Leaf({ value: 2 });
            const leaf3 = Tree.Leaf({ value: 3 });

            const tree = Tree.Node({
                left: Tree.Node({ left: leaf1, right: leaf2, value: 10 }),
                right: leaf3,
                value: 20
            });

            assert.strictEqual(leaf1.height(), 1);
            assert.strictEqual(tree.height(), 3);
        });

        test('Binary tree sum - should sum all node values', () => {
            const Tree = data(({ Family }) => ({
                Leaf: [{ value: Number }],
                Node: [{ left: Family }, { right: Family }, { value: Number }]
            }))
                .fold('sum', { out: Number }, {
                    Leaf({ value }) { return value; },
                    Node({ left, right, value }) { return left + right + value; }
                });

            const tree = Tree.Node({
                left: Tree.Leaf({ value: 1 }),
                right: Tree.Leaf({ value: 2 }),
                value: 10
            });

            assert.strictEqual(tree.sum(), 13);
        });
    });

    describe('Wildcard Handlers', () => {
        test('should use wildcard handler for unspecified variants', () => {
            const Peano = data(({ Family }) => ({
                Zero: [],
                Succ: [{ pred: Family }],
                NegSucc: [{ pred: Family }]
            }))
                .fold('toValue', { out: Number }, {
                    Zero() { return 0; },
                    _(_instance) { return -999; } // Wildcard for unknown variants
                });

            assert.strictEqual(Peano.Zero.toValue(), 0);
            assert.strictEqual(Peano.Succ({ pred: Peano.Zero }).toValue(), -999);
            assert.strictEqual(Peano.NegSucc({ pred: Peano.Zero }).toValue(), -999);
        });

        test('wildcard should receive full instance', () => {
            const Tree = data(({ Family }) => ({
                Leaf: [{ value: Number }],
                Node: [{ left: Family }, { right: Family }]
            }))
                .fold('getType', { out: String }, {
                    Leaf() { return 'leaf'; },
                    _(instance) {
                        assert.ok(instance instanceof Tree);
                        return 'unknown';
                    }
                });

            assert.strictEqual(Tree.Leaf({ value: 1 }).getType(), 'leaf');
            assert.strictEqual(Tree.Node({ left: Tree.Leaf({ value: 1 }), right: Tree.Leaf({ value: 2 }) }).getType(), 'unknown');
        });
    });

    describe('Multiple Operations', () => {
        test('should support multiple fold operations on same ADT', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
                .fold('length', { out: Number }, {
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                })
                .fold('sum', { out: Number }, {
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                })
                .fold('product', { out: Number }, {
                    Nil() { return 1; },
                    Cons({ head, tail }) { return head * tail; }
                });

            const list = List.Cons({
                head: 2,
                tail: List.Cons({
                    head: 3,
                    tail: List.Cons({ head: 4, tail: List.Nil })
                })
            });

            assert.strictEqual(list.length(), 3);
            assert.strictEqual(list.sum(), 9);
            assert.strictEqual(list.product(), 24);
        });
    });

    describe('Parameterized ADTs', () => {
        test('should work with parameterized lists', () => {
            const List = data(({ Family, T }) => ({
                Nil: [],
                Cons: [{ head: T }, { tail: Family }]
            }))
                .fold('length', { out: Number }, {
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                });

            const numList = List.Cons({
                head: 1,
                tail: List.Cons({ head: 2, tail: List.Nil })
            });

            const strList = List.Cons({
                head: 'a',
                tail: List.Cons({ head: 'b', tail: List.Nil })
            });

            assert.strictEqual(numList.length(), 2);
            assert.strictEqual(strList.length(), 2);
        });
    });

    describe('Name Collision Detection', () => {
        test('should detect collision with variant field names', () => {
            assert.throws(() => {
                data(({ Family }) => ({
                    Node: [{ value: Number }, { left: Family }]
                }))
                    .fold('value', { out: Number }, {
                        Node({ value }) { return value; }
                    });
            }, /Operation name 'value' conflicts with field 'value'/);
        });

        test('should detect duplicate operation names', () => {
            assert.throws(() => {
                data(({ Family }) => ({
                    Nil: [],
                    Cons: [{ head: Number }, { tail: Family }]
                }))
                    .fold('count', { out: Number }, {
                        Nil() { return 0; },
                        Cons({ tail }) { return 1 + tail; }
                    })
                    .fold('count', { out: Number }, {
                        Nil() { return 0; },
                        Cons({ tail }) { return 1 + tail; }
                    });
            }, /Operation 'count' is already defined/);
        });
    });

    describe('Complex Structures', () => {
        test('Expression tree with multiple recursive fields', () => {
            const Expr = data(({ Family }) => ({
                Lit: [{ value: Number }],
                Add: [{ left: Family }, { right: Family }],
                Mul: [{ left: Family }, { right: Family }]
            }))
                .fold('eval', { out: Number }, {
                    Lit({ value }) { return value; },
                    Add({ left, right }) { return left + right; },
                    Mul({ left, right }) { return left * right; }
                });

            // ((2 + 3) * 4) = 20
            const expr = Expr.Mul({
                left: Expr.Add({ left: Expr.Lit({ value: 2 }), right: Expr.Lit({ value: 3 }) }),
                right: Expr.Lit({ value: 4 })
            });

            assert.strictEqual(expr.eval(), 20);
        });
    });

    describe('Positional and Named Construction', () => {
        test('fold should work regardless of how variant was constructed', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
                .fold('sum', { out: Number }, {
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                });

            // Positional construction
            const list1 = List.Cons(1, List.Cons(2, List.Nil));

            // Named construction
            const list2 = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) });

            assert.strictEqual(list1.sum(), 3);
            assert.strictEqual(list2.sum(), 3);
        });
    });

    describe('Error Handling', () => {
        test('should throw error for missing handler when no wildcard', () => {
            const Peano = data(({ Family }) => ({
                Zero: [],
                Succ: [{ pred: Family }]
            }))
                .fold('partial', { out: Number }, {
                    Zero() { return 0; },
                    // Missing Succ handler, use wildcard to avoid exhaustiveness error
                    _(instance) {
                        if (instance.constructor.name === 'Succ') {
                            throw new Error(`No handler for variant 'Succ' in fold operation 'partial'`);
                        }
                        return -1;
                    }
                });

            assert.throws(() => {
                Peano.Succ({ pred: Peano.Zero }).partial();
            }, /No handler for variant 'Succ'/);
        });
    });

    describe('Integration with Match', () => {
        test('should work alongside match operations', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
                .match('isEmpty', { out: Boolean }, {
                    Nil() { return true; },
                    Cons() { return false; }
                })
                .fold('length', { out: Number }, {
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                });

            const list = List.Cons({ head: 1, tail: List.Nil });

            assert.strictEqual(list.isEmpty(), false);
            assert.strictEqual(list.length(), 1);
            assert.strictEqual(List.Nil.isEmpty(), true);
            assert.strictEqual(List.Nil.length(), 0);
        });
    });

    describe('Type Safety', () => {
        test('handlers receive properly typed fields', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
                .fold('sum', { out: Number }, {
                    Nil() { return 0; },
                    Cons({ head, tail }) {
                        // TypeScript should infer: head is number, tail is already folded result (number)
                        assert.strictEqual(typeof head, 'number');
                        assert.strictEqual(typeof tail, 'number');
                        return head + tail;
                    }
                });

            const list = List.Cons({ head: 5, tail: List.Cons({ head: 3, tail: List.Nil }) });
            assert.strictEqual(list.sum(), 8);
        });
    });

    describe('Deeply Nested Structures', () => {
        test('should handle deeply nested recursive structures', () => {
            const Peano = data(({ Family }) => ({
                Zero: [],
                Succ: [{ pred: Family }]
            }))
                .fold('toValue', { out: Number }, {
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                });

            // Build number 10
            let ten: typeof Peano.Zero | ReturnType<typeof Peano.Succ> = Peano.Zero;
            for (let i = 0; i < 10; i++) {
                ten = Peano.Succ({ pred: ten });
            }

            assert.strictEqual(ten.toValue(), 10);
        });

        test('should handle large lists', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
                .fold('length', { out: Number }, {
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                });

            // Build list of 100 elements
            let list: typeof List.Nil | ReturnType<typeof List.Cons> = List.Nil;
            for (let i = 0; i < 100; i++) {
                list = List.Cons({ head: i, tail: list });
            }

            assert.strictEqual(list.length(), 100);
        });
    });
});
