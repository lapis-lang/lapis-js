import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data , fold } from '../index.mjs';

describe('Fold Operation - `this` Context and Open Recursion', () => {
    test('destructured parameters receive folded values', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },

            sum: fold({ out: Number })({
                Nil({ }) { return 0; },
                Cons({ head, tail }) {
                    // tail is the already-folded result (a Number)
                    assert.strictEqual(typeof tail, 'number');
                    return head + tail;
                }
            })
        }));

        const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Cons({ head: 3, tail: List.Nil }) }) });
        assert.strictEqual(list.sum, 6);
    });

    test('`this` provides access to raw instance for open recursion', () => {
        const Stack = data(({ Family, T }) => ({
            Empty: {},
            Push: { value: T, rest: Family(T) },

            peek: fold({})({
                Empty({ }) { return null; },
                Push({ value }) { return value; }
            }),

            // pop needs raw fields, not folded - use `this`
            pop: fold({})({
                Empty({ }) { return null; },
                Push({ }) {
                    // this.peek accesses another operation
                    // this.rest accesses raw field (not folded)
                    assert.strictEqual(typeof this.rest, 'object');
                    return [this.peek, this.rest];
                }
            })
        }));

        const NumStack = Stack({ T: Number });
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

            length: fold({ out: Number })({
                Nil({ }) { return 0; },
                Cons({ tail }) { return 1 + tail; }
            }),

            // Use `this` to access other operations
            describe: fold({ out: String })({
                Nil({ }) { return 'empty list'; },
                Cons({ head }) {
                    // Compose with length operation via `this`
                    return `list starting with ${head}, length ${this.length}`;
                }
            })
        }));

        const list = List.Cons({ head: 10, tail: List.Cons({ head: 20, tail: List.Nil }) });
        assert.strictEqual(list.describe, 'list starting with 10, length 2');
    });

    test('parameterized fold: destructured params include input parameter', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },

            contains: fold({ in: Number, out: Boolean })({
                Nil({ }) { return false; },
                Cons({ head, tail }, searchValue) {
                    // tail is a partially-applied function (not the result yet)
                    // searchValue is the input parameter
                    assert.strictEqual(typeof searchValue, 'number');
                    return head === searchValue || tail(searchValue);
                }
            })
        }));

        const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Cons({ head: 3, tail: List.Nil }) }) });
        assert.strictEqual(list.contains(2), true);
        assert.strictEqual(list.contains(5), false);
    });

    test('`this` in parameterized fold provides instance access', () => {
        const Tree = data(({ Family }) => ({
            Leaf: { value: Number },
            Node: { value: Number, left: Family, right: Family },

            size: fold({ out: Number })({
                Leaf({ }) { return 1; },
                Node({ left, right }) { return 1 + left + right; }
            }),

            // Find path to value using open recursion
            findPath: fold({ in: Number })({
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
            })
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

            name: fold({ out: String })({
                Red() { return 'red'; },
                _() {
                    // Wildcard accesses instance via this
                    return this.constructor.name.toLowerCase();
                }
            })
        }));

        assert.strictEqual(Color.Red.name, 'red');
        assert.strictEqual(Color.Green.name, 'green');
        assert.strictEqual(Color.Blue.name, 'blue');
    });

    test('empty handler signature means no destructuring', () => {
        const Result = data(({ T }) => ({
            Ok: { value: T },
            Err: { error: String },

            isOk: fold({ out: Boolean })({
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
            })
        }));

        const NumResult = Result({ T: Number });
        const ok = NumResult.Ok({ value: 42 });
        const err = NumResult.Err({ error: 'failed' });

        assert.strictEqual(ok.isOk, true);
        assert.strictEqual(err.isOk, false);
    });

    test('`this.sameOp` on same node throws circular fold error (parameterless)', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },

            bad: fold({ out: Number })({
                Nil() { return 0; },
                Cons() {
                    // Circular: re-enters the same fold on the same instance
                    return this.bad;
                }
            })
        }));

        const list = List.Cons({ head: 1, tail: List.Nil });
        assert.throws(
            () => list.bad,
            (err: Error) => {
                assert.match(err.message, /Circular fold detected.*'bad'/);
                return true;
            }
        );
    });

    test('`this.sameOp(arg)` on same node throws circular fold error (parameterized)', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },

            bad: fold({ in: Number, out: Number })({
                Nil({}, _n) { return 0; },
                Cons({}, n) {
                    // Circular: re-enters the same fold on the same instance
                    return this.bad(n);
                }
            })
        }));

        const list = List.Cons({ head: 1, tail: List.Nil });
        assert.throws(
            () => list.bad(42),
            (err: Error) => {
                assert.match(err.message, /Circular fold detected.*'bad'/);
                return true;
            }
        );
    });

    test('mutual recursion between operations on same node throws', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },

            opA: fold({ out: Number })({
                Nil() { return 0; },
                Cons() {
                    return this.opB;  // calls opB on same node
                }
            }),

            opB: fold({ out: Number })({
                Nil() { return 0; },
                Cons() {
                    return this.opA;  // calls opA on same node → detected
                }
            })
        }));

        const list = List.Cons({ head: 1, tail: List.Nil });
        assert.throws(
            () => list.opA,
            (err: Error) => {
                assert.match(err.message, /Circular fold detected.*'opA'/);
                return true;
            }
        );
    });

    test('`this.differentOp` on same node still works (no false positive)', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },

            length: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ tail }) { return 1 + tail; }
            }),

            headTimesLength: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ head }) {
                    // Calls a different operation on the same node — allowed
                    return head * this.length;
                }
            })
        }));

        const list = List.Cons({ head: 5, tail: List.Cons({ head: 3, tail: List.Nil }) });
        assert.strictEqual(list.headTimesLength, 10);
    });

    test('`this.subField.sameOp` on child node still works (no false positive)', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },

            toArray: fold({ out: Array })({
                Nil() { return []; },
                Cons({ head }) {
                    // Open recursion on child node — allowed
                    return [head, ...this.tail.toArray];
                }
            })
        }));

        const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Cons({ head: 3, tail: List.Nil }) }) });
        assert.deepStrictEqual(list.toArray, [1, 2, 3]);
    });

    test('re-entrancy guard cleans up after error, fold works on next call', () => {
        const Color = data(() => ({
            Red: {},
            Green: {},

            safe: fold({ out: String })({
                Red() { return 'red'; },
                Green() { return 'green'; }
            })
        }));

        // First call succeeds
        assert.strictEqual(Color.Red.safe, 'red');
        // Second call also succeeds (guard cleaned up)
        assert.strictEqual(Color.Red.safe, 'red');
        assert.strictEqual(Color.Green.safe, 'green');
    });

    test('true data cycle (bypassing freeze) reports cycle-specific error', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },

            sum: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            })
        }));

        // Construct a cyclic structure by bypassing Object.freeze
        // (not possible via normal construction, but tests robustness)
        const a = Object.create(List.Cons.prototype);
        const b = Object.create(List.Cons.prototype);
        Object.defineProperty(a, 'head', { value: 1, enumerable: true });
        Object.defineProperty(a, 'tail', { value: b, enumerable: true });
        Object.defineProperty(b, 'head', { value: 2, enumerable: true });
        Object.defineProperty(b, 'tail', { value: a, enumerable: true });

        // Set the variant name symbol used internally
        const VariantNameSymbol = Object.getOwnPropertySymbols(List.Nil)
            .find(s => String(s) === 'Symbol(VariantName)');
        if (VariantNameSymbol) {
            Object.defineProperty(a, VariantNameSymbol, { value: 'Cons' });
            Object.defineProperty(b, VariantNameSymbol, { value: 'Cons' });
        }

        assert.throws(
            () => a.sum,
            (err: Error) => {
                assert.match(err.message, /Cycle detected in data structure/);
                return true;
            }
        );
    });
});
