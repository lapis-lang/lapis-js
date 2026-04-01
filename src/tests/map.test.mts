import { data } from '@lapis-lang/lapis-js'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Map Operations', () => {
    describe('Basic Map', () => {
        test('List.increment transforms numbers', () => {
            const List = data(family => ({
                Nil: {},
                Cons: { head: Object, tail: family }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                increment: map({ out: family })({
                    head: (x) => x + 1
                })
            }));

            const list = List.Cons({
                head: 1,
                tail: List.Cons({
                    head: 2,
                    tail: List.Cons({ head: 3, tail: List.Nil })
                })
            });

            const incremented: any = list.increment;

            assert.strictEqual(incremented.head, 2);
            assert.strictEqual(incremented.tail.head, 3);
            assert.strictEqual(incremented.tail.tail.head, 4);
        });

        test('List.stringify changes type', () => {
            const List = data(family => ({
                Nil: {},
                Cons: { head: Object, tail: family }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                stringify: map({ out: family })({
                    head: (x) => String(x)
                })
            }));

            const list = List.Cons({
                head: 42,
                tail: List.Cons({
                    head: 100,
                    tail: List.Nil
                })
            });

            const stringified: any = list.stringify;

            assert.strictEqual(stringified.head, '42');
            assert.strictEqual(stringified.tail.head, '100');
            assert.strictEqual(typeof stringified.head, 'string');
            assert.strictEqual(typeof stringified.tail.head, 'string');
        });

        test('Maybe.double transforms Just value', () => {
            const Maybe = data(family => ({
                Nothing: {},
                Just: { value: Object }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                double: map({ out: family })({
                    value: (x) => x * 2
                })
            }));

            const just = Maybe.Just({ value: 5 });
            const doubled = just.double;

            assert.strictEqual(doubled.value, 10);

            const nothing = Maybe.Nothing;
            const stillNothing = nothing.double;

            assert.strictEqual(stillNothing, nothing); // Singleton unchanged
        });
    });

    describe('Recursive Structures', () => {
        test('Tree.increment recursively transforms', () => {
            const Tree = data(family => ({
                Leaf: { value: Object },
                Node: { left: family, right: family, value: Object }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                increment: map({ out: family })({
                    value: (x) => x + 1
                })
            }));

            const tree = Tree.Node({
                left: Tree.Leaf({ value: 1 }),
                right: Tree.Leaf({ value: 2 }),
                value: 10
            });

            const incremented: any = tree.increment;

            assert.strictEqual(incremented.value, 11);
            assert.strictEqual(incremented.left.value, 2);
            assert.strictEqual(incremented.right.value, 3);
        });

        test('Nested tree structure preserves shape', () => {
            const Tree = data(family => ({
                Leaf: { value: Object },
                Node: { left: family, right: family, value: Object }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                square: map({ out: family })({
                    value: (x) => x * x
                })
            }));

            const tree = Tree.Node({
                left: Tree.Node({
                    left: Tree.Leaf({ value: 2 }),
                    right: Tree.Leaf({ value: 3 }),
                    value: 5
                }),
                right: Tree.Leaf({ value: 7 }),
                value: 11
            });

            const squared: any = tree.square;

            assert.strictEqual(squared.value, 121);
            assert.strictEqual(squared.left.value, 25);
            assert.strictEqual(squared.left.left.value, 4);
            assert.strictEqual(squared.left.right.value, 9);
            assert.strictEqual(squared.right.value, 49);

            // Verify structure is preserved
            assert.ok(squared instanceof Tree.Node);
            assert.ok(squared.left instanceof Tree.Node);
            assert.ok(squared.left.left instanceof Tree.Leaf);
            assert.ok(squared.right instanceof Tree.Leaf);
        });
    });

    describe('Multiple Type Parameters', () => {
        test('Pair transforms both type parameters independently', () => {
            const Pair = data(family => ({
                MakePair: { first: Object, second: Object }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                transform: map({ out: family })({
                    first:  (x) => x * 2,
                    second: (s) => s.toUpperCase()
                })
            }));

            const pair = Pair.MakePair({ first: 5, second: 'hello' });
            const transformed = pair.transform;

            assert.strictEqual(transformed.first, 10);
            assert.strictEqual(transformed.second, 'HELLO');
        });

        test('Either transforms Left and Right with same type', () => {
            const Either = data(family => ({
                Left:  { value: Object },
                Right: { value: Object }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                negate: map({ out: family })({
                    value: (x) => -x
                })
            }));

            const left = Either.Left({ value: 5 });
            const right = Either.Right({ value: 10 });

            const negatedLeft = left.negate;
            const negatedRight = right.negate;

            assert.strictEqual(negatedLeft.value, -5);
            assert.strictEqual(negatedRight.value, -10);
        });

        test('Heterogeneous Either with different field-name transforms', () => {
            const Either = data(_ => ({
                Left:  { leftValue: Object },
                Right: { rightValue: Object }
            })).ops(({ map, family }) => ({
                convert: map({ out: family })({
                    leftValue:  (x) => String(x),
                    rightValue: (s) => (s as string).length
                })
            }));

            const left = Either.Left({ leftValue: 42 });
            const right = Either.Right({ rightValue: 'hello' });

            const convertedLeft = left.convert;
            const convertedRight = right.convert;


            assert.strictEqual((convertedLeft as any).leftValue, '42');

            assert.strictEqual(typeof (convertedLeft as any).leftValue, 'string');


            assert.strictEqual((convertedRight as any).rightValue, 5);

            assert.strictEqual(typeof (convertedRight as any).rightValue, 'number');
        });
    });

    describe('Callback Form', () => {
        test('supports callback form for transforms', () => {
            const List = data(family => ({
                Nil: {},
                Cons: { head: Object, tail: family }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                double: map({ out: family })({
                    head: (x) => x * 2
                })
            }));

            const list = List.Cons({
                head: 3,
                tail: List.Cons({ head: 4, tail: List.Nil })
            });

            const doubled: any = list.double;

            assert.strictEqual(doubled.head, 6);
            assert.strictEqual(doubled.tail.head, 8);
        });
    });

    describe('Error Handling', () => {
        test('throws on non-camelCase operation name', () => {
            assert.throws(
                () => data(family => ({
                    Nil: {},
                    Cons: { head: Object, tail: family }
                })).ops(({ fold, unfold, map, merge, family }) => ({
                    Increment: map({ out: family })({
                        head: (x) => x + 1
                    })
                })),
                /Map operation.*must be camelCase/
            );
        });

        test('detects name collision with variant fields', () => {
            assert.throws(
                () => data(family => ({
                    Point2D: { x: Object, y: Object }
                })).ops(({ fold, unfold, map, merge, family }) => ({
                    x: map({ out: family })({
                        x: (v) => v * 2
                    })
                })),
                /Operation name 'x' conflicts with field 'x' in variant 'Point2D'/
            );
        });

        test('handles missing transform gracefully', () => {
            const Pair = data(family => ({
                MakePair: { first: Object, second: Object }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                transformFirst: map({ out: family })({
                    first: (x) => x * 2
                })
            }));

            const pair = Pair.MakePair({ first: 5, second: 'hello' });
            const transformed = pair.transformFirst;

            // First is transformed, second passes through
            assert.strictEqual(transformed.first, 10);
            assert.strictEqual(transformed.second, 'hello');
        });

        test('works on non-parameterized ADTs with no-op', () => {
            const Color = data(family => ({
                Red: {},
                Green: {},
                Blue: {}
            })).ops(({ fold, unfold, map, merge, family }) => ({
                identity: map({ out: family })({})
            }));

            // Map on non-parameterized ADT returns same instances
            assert.strictEqual(Color.Red.identity, Color.Red);
            assert.strictEqual(Color.Green.identity, Color.Green);
        });

        test('supports arguments passed to transform functions', () => {
            const List = data(family => ({
                Nil: {},
                Cons: { head: Object, tail: family }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                scale: map({ in: Number, out: family })({
                    head: (x, factor) => x * factor
                })
            }));

            const list = List.Cons({
                head: 2,
                tail: List.Cons({ head: 3, tail: List.Nil })
            });

            const scaled: any = list.scale(10);

            assert.strictEqual(scaled.head, 20);
            assert.strictEqual(scaled.tail.head, 30);
        });

        test('supports multiple arguments in transform functions', () => {
            const List = data(family => ({
                Nil: {},
                Cons: { head: Object, tail: family }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                combine: map({ out: family })({
                    head: (x, a, b) => x + a + b
                })
            }));

            const list = List.Cons({
                head: 1,
                tail: List.Cons({ head: 2, tail: List.Nil })
            });

            // @ts-expect-error -- intentional type violation for test
            const combined = list.combine(10, 100);

            assert.strictEqual(combined.head, 111); // 1 + 10 + 100
            assert.strictEqual(combined.tail.head, 112); // 2 + 10 + 100
        });
    });

    describe('Structure Preservation', () => {
        test('preserves instanceof relationships', () => {
            const List = data(family => ({
                Nil: {},
                Cons: { head: Object, tail: family }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                increment: map({ out: family })({
                    head: (x) => x + 1
                })
            }));

            const original = List.Cons({ head: 1, tail: List.Nil });
            const transformed = original.increment;

            assert.ok(transformed instanceof List);
            assert.ok(transformed instanceof List.Cons);
            assert.ok(transformed.tail === List.Nil); // Singleton preserved
        });

        test('creates new instances (immutability)', () => {
            const Maybe = data(family => ({
                Nothing: {},
                Just: { value: Object }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                increment: map({ out: family })({
                    value: (x) => x + 1
                })
            }));

            const original = Maybe.Just({ value: 5 });
            const transformed = original.increment;

            assert.notStrictEqual(original, transformed);
            assert.strictEqual(original.value, 5); // Original unchanged
            assert.strictEqual(transformed.value, 6);
        });

        test('preserves non-type-parameter fields', () => {
            const Tagged = data(family => ({
                Value: { tag: String, value: Object }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                double: map({ out: family })({
                    value: (x) => x * 2
                })
            }));

            const tagged = Tagged.Value({ tag: 'number', value: 5 });
            const doubled = tagged.double;

            assert.strictEqual(doubled.tag, 'number'); // String field unchanged
            assert.strictEqual(doubled.value, 10); // T field transformed
        });
    });

    describe('Chaining Map Operations', () => {
        test('supports multiple map operations', () => {
            const List = data(family => ({
                Nil: {},
                Cons: { head: Object, tail: family }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                increment: map({ out: family })({
                    head: (x) => x + 1
                }),
                double: map({ out: family })({
                    head: (x) => x * 2
                }),
                stringify: map({ out: family })({
                    head: (x) => String(x)
                })
            }));

            const list = List.Cons({
                head: 5,
                tail: List.Cons({ head: 10, tail: List.Nil })
            });

            const result: any = list.increment.double.stringify;

            // ((5 + 1) * 2).toString() = "12"
            // ((10 + 1) * 2).toString() = "22"
            assert.strictEqual(result.head, '12');
            assert.strictEqual(result.tail.head, '22');
        });

        test('empty spec {} works without validation', () => {
            const List = data(family => ({
                Nil: {},
                Cons: { head: Object, tail: family }
            })).ops(({ fold, unfold, map, merge, family }) => ({
                double: map({})({
                    head: (x) => x * 2
                })
            }));

            const list = List.Cons({
                head: 5,
                tail: List.Cons({ head: 10, tail: List.Nil })
            });

            const doubled = list.double;

            assert.strictEqual(doubled.head, 10);
            assert.strictEqual(doubled.tail.head, 20);
        });
    });
});
