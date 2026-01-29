import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

describe('Spec Validation - Runtime Type Checking', () => {
    describe('spec.out - Fold Return Type Validation', () => {
        test('should validate Number return type at runtime', () => {
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

            const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) });
            const result = list.length;

            assert.strictEqual(typeof result, 'number');
            assert.strictEqual(result, 2);
        });

        test('should throw TypeError when Number handler returns wrong type', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                badLength: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 'zero'; }, // Wrong: returns string instead of number
                    Cons({ tail }) { return 1 + tail; }
                }
            }));

            const list = List.Nil;
            assert.throws(
                () => list.badLength(),
                /Operation 'badLength' expected to return Number.*got string/
            );
        });

        test('should validate Boolean return type at runtime', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                isEmpty: {
                    op: 'fold',
                    spec: { out: Boolean },
                    Nil() { return true; },
                    Cons() { return false; }
                }
            }));

            const result = List.Nil.isEmpty;
            assert.strictEqual(typeof result, 'boolean');
            assert.strictEqual(result, true);
        });

        test('should throw TypeError when Boolean handler returns wrong type', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                badIsEmpty: {
                    op: 'fold',
                    spec: { out: Boolean },
                    Nil() { return 1; }, // Wrong: returns number instead of boolean
                    Cons() { return false; }
                }
            }));

            assert.throws(
                () => List.Nil.badIsEmpty(),
                /Operation 'badIsEmpty' expected to return Boolean.*got number/
            );
        });

        test('should validate String return type at runtime', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                describe: {
                    op: 'fold',
                    spec: { out: String },
                    Leaf({ value }) { return 'Leaf(' + value + ')'; },
                    Node() { return 'Node'; }
                }
            }));

            const result = Tree.Leaf({ value: 42 }).describe;
            assert.strictEqual(typeof result, 'string');
            assert.strictEqual(result, 'Leaf(42)');
        });

        test('should throw TypeError when String handler returns wrong type', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                badDescribe: {
                    op: 'fold',
                    spec: { out: String },
                    Leaf({ value }) { return value; }, // Wrong: returns number instead of string
                    Node() { return 'Node'; }
                }
            }));

            assert.throws(
                () => Tree.Leaf({ value: 42 }).badDescribe(),
                /Operation 'badDescribe' expected to return String.*got number/
            );
        });

        test('should validate custom class return type at runtime', () => {
            class Result {
                constructor(value) { this.value = value; }
            }

            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family },
                toResult: {
                    op: 'fold',
                    spec: { out: Result },
                    Zero() { return new Result(0); },
                    Succ({ pred }) { return new Result(pred.value + 1); }
                }
            }));

            const result = Peano.Zero.toResult;
            assert.ok(result instanceof Result);
            assert.strictEqual(result.value, 0);
        });

        test('should throw TypeError when custom class handler returns wrong type', () => {
            class Result {
                constructor(value) { this.value = value; }
            }

            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family },
                badToResult: {
                    op: 'fold',
                    spec: { out: Result },
                    Zero() { return 0; }, // Wrong: returns number instead of Result instance
                    Succ({ pred }) { return new Result(pred + 1); }
                }
            }));

            assert.throws(
                () => Peano.Zero.badToResult(),
                /Operation 'badToResult' expected to return instance of Result.*got Number/
            );
        });
    });

    describe('spec.out - Non-Recursive ADTs', () => {
        test('should validate Boolean return type', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                isPrimary: {
                    op: 'fold',
                    spec: { out: Boolean },
                    Red() { return true; },
                    Green() { return true; },
                    Blue() { return true; }
                }
            }));

            const result = Color.Red.isPrimary;
            assert.strictEqual(typeof result, 'boolean');
            assert.strictEqual(result, true);
        });

        test('should throw TypeError when Boolean return is violated', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                badIsPrimary: {
                    op: 'fold',
                    spec: { out: Boolean },
                    Red() { return 'yes'; }, // Wrong: returns string instead of boolean
                    Green() { return true; },
                    Blue() { return true; }
                }
            }));

            assert.throws(
                () => Color.Red.badIsPrimary(),
                /Operation 'badIsPrimary' expected to return Boolean.*got string/
            );
        });

        test('should validate String return type', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                }
            }));

            const result = Color.Red.toHex;
            assert.strictEqual(typeof result, 'string');
            assert.strictEqual(result, '#FF0000');
        });

        test('should validate Number return type', () => {
            const Point = data(() => ({
                Point2D: { x: Number, y: Number },
                magnitude: {
                    op: 'fold',
                    spec: { out: Number },
                    Point2D({ x, y }) { return Math.sqrt(x * x + y * y); }
                }
            }));

            const result = Point.Point2D({ x: 3, y: 4 }).magnitude;
            assert.strictEqual(typeof result, 'number');
            assert.strictEqual(result, 5);
        });
    });

    describe('Multiple Operations with Different spec.out', () => {
        test('should validate each operation independently', () => {
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
                },
                describe: {
                    op: 'fold',
                    spec: { out: String },
                    Nil() { return 'empty list'; },
                    Cons({ head, tail }) { return head + ', ' + tail; }
                }
            }));

            const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) });

            const isEmpty = list.isEmpty;
            const length = list.length;
            const description = list.describe;

            assert.strictEqual(typeof isEmpty, 'boolean');
            assert.strictEqual(typeof length, 'number');
            assert.strictEqual(typeof description, 'string');

            assert.strictEqual(isEmpty, false);
            assert.strictEqual(length, 2);
            assert.strictEqual(description, '1, 2, empty list');
        });

        test('should throw errors for wrong return types in any operation', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                goodOp: {
                    op: 'fold',
                    spec: { out: Boolean },
                    Nil() { return true; },
                    Cons() { return false; }
                },
                badOp: {
                    op: 'fold',
                    spec: { out: Number },
                    Nil() { return 'wrong'; }, // Wrong type
                    Cons({ tail }) { return 1 + tail; }
                }
            }));

            // Good operation works
            assert.strictEqual(List.Nil.goodOp, true);

            // Bad operation throws
            assert.throws(
                () => List.Nil.badOp(),
                /Operation 'badOp' expected to return Number.*got string/
            );
        });
    });

    describe('Primitive Constructor Mapping', () => {
        test('Number spec validates primitive number', () => {
            const ADT = data(() => ({
                Value: {},
                getValue: {
                    op: 'fold',
                    spec: { out: Number },
                    Value() { return 42; }
                }
            }));

            const result = ADT.Value.getValue;
            assert.strictEqual(typeof result, 'number');
            assert.strictEqual(result, 42);
        });

        test('String spec validates primitive string', () => {
            const ADT = data(() => ({
                Value: {},
                getValue: {
                    op: 'fold',
                    spec: { out: String },
                    Value() { return 'hello'; }
                }
            }));

            const result = ADT.Value.getValue;
            assert.strictEqual(typeof result, 'string');
            assert.strictEqual(result, 'hello');
        });

        test('Boolean spec validates primitive boolean', () => {
            const ADT = data(() => ({
                Value: {},
                getValue: {
                    op: 'fold',
                    spec: { out: Boolean },
                    Value() { return true; }
                }
            }));

            const result = ADT.Value.getValue;
            assert.strictEqual(typeof result, 'boolean');
            assert.strictEqual(result, true);
        });
    });

    describe('spec.in - Unfold Input Type Validation', () => {
        test('should validate Number input type at runtime', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Countdown: {
                    op: 'unfold',
                    spec: { in: Number, out: Family },
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }
            }));

            const list = List.Countdown(3);
            assert.ok(list);
            assert.strictEqual(list.head, 3);
        });

        test('should throw TypeError when input type is wrong', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Countdown: {
                    op: 'unfold',
                    spec: { in: Number, out: Family },
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }
            }));

            assert.throws(
                () => List.Countdown('not a number'),
                /Operation 'Countdown' expected input of type Number.*got string/
            );
        });

        test('should validate String input type at runtime', () => {
            const Result = data(({ Family }) => ({
                Success: { value: String },
                Error: { message: String },
                Parse: {
                    op: 'unfold',
                    spec: { in: String, out: Family },
                    Success: (s) => (s.length > 0 ? { value: s } : null),
                    Error: (s) => (s.length === 0 ? { message: 'empty string' } : null)
                }
            }));

            const result = Result.Parse('hello');
            assert.strictEqual(result.value, 'hello');
        });

        test('should validate custom class input type', () => {
            class Seed {
                constructor(value) { this.value = value; }
            }

            const Result = data(({ Family }) => ({
                Value: { num: Number },
                FromSeed: {
                    op: 'unfold',
                    spec: { in: Seed, out: Family },
                    Value: (seed) => ({ num: seed.value })
                }
            }));

            const result = Result.FromSeed(new Seed(42));
            assert.strictEqual(result.num, 42);

            // Wrong type should throw
            assert.throws(
                () => Result.FromSeed(42),
                /Operation 'FromSeed' expected input of type Seed/
            );
        });
    });

    describe('No spec provided - no validation', () => {
        test('fold without spec.out allows any return type', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                anything: {
                    op: 'fold',
                    spec: {},
                    Nil() { return 'string'; },
                    Cons() { return 42; }
                }
            }));

            // Both return different types - should work fine without spec.out
            assert.strictEqual(List.Nil.anything, 'string');
            assert.strictEqual(List.Cons({ head: 1, tail: List.Nil }).anything, 42);
        });

        test('unfold without spec.in allows any input type', () => {
            const Result = data(({ Family }) => ({
                Value: { data: Number },
                FromAnything: {
                    op: 'unfold',
                    spec: { out: Family },
                    Value: (x) => ({ data: typeof x === 'number' ? x : 0 })
                }
            }));

            // Should accept any type without spec.in
            assert.strictEqual(Result.FromAnything(42).data, 42);
            assert.strictEqual(Result.FromAnything('hello').data, 0);
        });
    });
});
