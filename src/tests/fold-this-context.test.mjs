import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

describe('Fold Operation - `this` Context and Open Recursion', () => {
    test('destructured parameters receive folded values', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },

            sum: {
                op: 'fold',
                spec: { out: Number },
                Nil({ }) { return 0; },
                Cons({ head, tail }) {
                    // tail is the already-folded result (a Number)
                    assert.strictEqual(typeof tail, 'number');
                    return head + tail;
                }
            }
        }));

        const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Cons({ head: 3, tail: List.Nil }) }) });
        assert.strictEqual(list.sum, 6);
    });

    test('`this` provides access to raw instance for open recursion', () => {
        const Stack = data(({ Family, T }) => ({
            Empty: {},
            Push: { value: T, rest: Family(T) },

            peek: {
                op: 'fold',
                Empty({ }) { return null; },
                Push({ value }) { return value; }
            },

            // pop needs raw fields, not folded - use `this`
            pop: {
                op: 'fold',
                Empty({ }) { return null; },
                Push({ }) {
                    // this.peek accesses another operation
                    // this.rest accesses raw field (not folded)
                    assert.strictEqual(typeof this.rest, 'object');
                    return [this.peek, this.rest];
                }
            }
        }));

        const NumStack = Stack(Number);
        const stack = NumStack.Push({ value: 3, rest: NumStack.Push({ value: 2, rest: NumStack.Empty }) });

        const [value, rest] = stack.pop;
        assert.strictEqual(value, 3);
        assert.strictEqual(rest.constructor.name, 'Push');
        assert.strictEqual(rest.peek, 2);
    });

    test('`this` allows composition with other operations', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },

            length: {
                op: 'fold',
                spec: { out: Number },
                Nil({ }) { return 0; },
                Cons({ tail }) { return 1 + tail; }
            },

            // Use `this` to access other operations
            describe: {
                op: 'fold',
                spec: { out: String },
                Nil({ }) { return 'empty list'; },
                Cons({ head }) {
                    // Compose with length operation via `this`
                    return `list starting with ${head}, length ${this.length}`;
                }
            }
        }));

        const list = List.Cons({ head: 10, tail: List.Cons({ head: 20, tail: List.Nil }) });
        assert.strictEqual(list.describe, 'list starting with 10, length 2');
    });

    test('parameterized fold: destructured params include input parameter', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },

            contains: {
                op: 'fold',
                spec: { in: Number, out: Boolean },
                Nil({ }) { return false; },
                Cons({ head, tail }, searchValue) {
                    // tail is a partially-applied function (not the result yet)
                    // searchValue is the input parameter
                    assert.strictEqual(typeof searchValue, 'number');
                    return head === searchValue || tail(searchValue);
                }
            }
        }));

        const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Cons({ head: 3, tail: List.Nil }) }) });
        assert.strictEqual(list.contains(2), true);
        assert.strictEqual(list.contains(5), false);
    });

    test('`this` in parameterized fold provides instance access', () => {
        const Tree = data(({ Family }) => ({
            Leaf: { value: Number },
            Node: { value: Number, left: Family, right: Family },

            size: {
                op: 'fold',
                spec: { out: Number },
                Leaf({ }) { return 1; },
                Node({ left, right }) { return 1 + left + right; }
            },

            // Find path to value using open recursion
            findPath: {
                op: 'fold',
                spec: { in: Number },
                Leaf({ value }, target) {
                    return value === target ? [value] : null;
                },
                Node({ value }, target) {
                    if (value === target) return [value];

                    // Use `this` to access raw subtrees for recursion
                    const leftPath = this.left.findPath(target);
                    if (leftPath) return [value, ...leftPath];

                    const rightPath = this.right.findPath(target);
                    if (rightPath) return [value, ...rightPath];

                    return null;
                }
            }
        }));

        const tree = Tree.Node({
            value: 10,
            left: Tree.Node({
                value: 5,
                left: Tree.Leaf({ value: 3 }),
                right: Tree.Leaf({ value: 7 })
            }),
            right: Tree.Leaf({ value: 15 })
        });

        assert.deepStrictEqual(tree.findPath(7), [10, 5, 7]);
        assert.deepStrictEqual(tree.findPath(15), [10, 15]);
        assert.strictEqual(tree.findPath(99), null);
    });

    test('wildcard handler receives instance parameter', () => {
        const Color = data(() => ({
            Red: {},
            Green: {},
            Blue: {},

            name: {
                op: 'fold',
                spec: { out: String },
                Red() { return 'red'; },
                _() {
                    // Wildcard accesses instance via this
                    return this.constructor.name.toLowerCase();
                }
            }
        }));

        assert.strictEqual(Color.Red.name, 'red');
        assert.strictEqual(Color.Green.name, 'green');
        assert.strictEqual(Color.Blue.name, 'blue');
    });

    test('empty handler signature means no destructuring', () => {
        const Result = data(({ T }) => ({
            Ok: { value: T },
            Err: { error: String },

            isOk: {
                op: 'fold',
                spec: { out: Boolean },
                Ok({ }) {
                    // No destructuring - use `this` to access fields
                    assert.strictEqual(typeof this.value, 'number');
                    return true;
                },
                Err({ }) {
                    // No destructuring - use `this` to access fields
                    assert.strictEqual(typeof this.error, 'string');
                    return false;
                }
            }
        }));

        const NumResult = Result(Number);
        const ok = NumResult.Ok({ value: 42 });
        const err = NumResult.Err({ error: 'failed' });

        assert.strictEqual(ok.isOk, true);
        assert.strictEqual(err.isOk, false);
    });
});
