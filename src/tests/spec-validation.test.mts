import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data , unfold, fold } from '../index.mjs';

describe('Spec Validation - Runtime Type Checking', () => {
    describe('spec.out - Fold Return Type Validation', () => {
        test('should validate Number return type at runtime', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                length: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                })
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
                badLength: fold({ out: Number })({
                    // @ts-expect-error -- intentional type violation for test
                    Nil() { return 'zero'; },
                    Cons({ tail }) { return 1 + tail; }
                })
            }));

            const list = List.Nil;
            assert.throws(
                // @ts-expect-error -- intentional type violation for test
                () => list.badLength(),
                /Operation 'badLength' expected to return Number.*got string/
            );
        });

        test('should validate Boolean return type at runtime', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                isEmpty: fold({ out: Boolean })({
                    Nil() { return true; },
                    Cons() { return false; }
                })
            }));

            const result = List.Nil.isEmpty;
            assert.strictEqual(typeof result, 'boolean');
            assert.strictEqual(result, true);
        });

        test('should throw TypeError when Boolean handler returns wrong type', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                badIsEmpty: fold({ out: Boolean })({
                    // @ts-expect-error -- intentional type violation for test
                    Nil() { return 1; },
                    Cons() { return false; }
                })
            }));

            assert.throws(
                // @ts-expect-error -- intentional type violation for test
                () => List.Nil.badIsEmpty(),
                /Operation 'badIsEmpty' expected to return Boolean.*got number/
            );
        });

        test('should validate String return type at runtime', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                describe: fold({ out: String })({
                    Leaf({ value }) { return 'Leaf(' + value + ')'; },
                    Node() { return 'Node'; }
                })
            }));

            const result = Tree.Leaf({ value: 42 }).describe;
            assert.strictEqual(typeof result, 'string');
            assert.strictEqual(result, 'Leaf(42)');
        });

        test('should throw TypeError when String handler returns wrong type', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                badDescribe: fold({ out: String })({
                    Leaf({ value }) { return value; },
                    Node() { return 'Node'; }
                })
            }));

            assert.throws(
                // @ts-expect-error -- intentional type violation for test
                () => Tree.Leaf({ value: 42 }).badDescribe(),
                /Operation 'badDescribe' expected to return String.*got number/
            );
        });

        test('should validate custom class return type at runtime', () => {
            class Result {
                // @ts-expect-error -- intentional type violation for test
                constructor(value) { this.value = value; }
            }

            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family },
                toResult: fold({ out: Result })({
                    Zero() { return new Result(0); },
                    Succ({ pred }) { return new Result(pred.value + 1); }
                })
            }));

            const result = Peano.Zero.toResult;
            assert.ok(result instanceof Result);
            // @ts-expect-error -- intentional type violation for test
            assert.strictEqual(result.value, 0);
        });

        test('should throw TypeError when custom class handler returns wrong type', () => {
            class Result {
                // @ts-expect-error -- intentional type violation for test
                constructor(value) { this.value = value; }
            }

            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family },
                badToResult: fold({ out: Result })({
                    Zero() { return 0; },
                    Succ({ pred }) { return new Result(pred + 1); }
                })
            }));

            assert.throws(
                // @ts-expect-error -- intentional type violation for test
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
                isPrimary: fold({ out: Boolean })({
                    Red() { return true; },
                    Green() { return true; },
                    Blue() { return true; }
                })
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
                badIsPrimary: fold({ out: Boolean })({
                    // @ts-expect-error -- intentional type violation for test
                    Red() { return 'yes'; },
                    Green() { return true; },
                    Blue() { return true; }
                })
            }));

            assert.throws(
                // @ts-expect-error -- intentional type violation for test
                () => Color.Red.badIsPrimary(),
                /Operation 'badIsPrimary' expected to return Boolean.*got string/
            );
        });

        test('should validate String return type', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: fold({ out: String })({
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                })
            }));

            const result = Color.Red.toHex;
            assert.strictEqual(typeof result, 'string');
            assert.strictEqual(result, '#FF0000');
        });

        test('should validate Number return type', () => {
            const Point = data(() => ({
                Point2D: { x: Number, y: Number },
                magnitude: fold({ out: Number })({
                    Point2D({ x, y }) { return Math.sqrt(x * x + y * y); }
                })
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
                isEmpty: fold({ out: Boolean })({
                    Nil() { return true; },
                    Cons() { return false; }
                }),
                length: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                }),
                describe: fold({ out: String })({
                    Nil() { return 'empty list'; },
                    Cons({ head, tail }) { return head + ', ' + tail; }
                })
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
                goodOp: fold({ out: Boolean })({
                    Nil() { return true; },
                    Cons() { return false; }
                }),
                badOp: fold({ out: Number })({
                    // @ts-expect-error -- intentional type violation for test
                    Nil() { return 'wrong'; },
                    Cons({ tail }) { return 1 + tail; }
                })
            }));

            // Good operation works
            assert.strictEqual(List.Nil.goodOp, true);

            // Bad operation throws
            assert.throws(
                // @ts-expect-error -- intentional type violation for test
                () => List.Nil.badOp(),
                /Operation 'badOp' expected to return Number.*got string/
            );
        });
    });

    describe('Primitive Constructor Mapping', () => {
        test('Number spec validates primitive number', () => {
            const ADT = data(() => ({
                Value: {},
                getValue: fold({ out: Number })({
                    Value() { return 42; }
                })
            }));

            const result = ADT.Value.getValue;
            assert.strictEqual(typeof result, 'number');
            assert.strictEqual(result, 42);
        });

        test('String spec validates primitive string', () => {
            const ADT = data(() => ({
                Value: {},
                getValue: fold({ out: String })({
                    Value() { return 'hello'; }
                })
            }));

            const result = ADT.Value.getValue;
            assert.strictEqual(typeof result, 'string');
            assert.strictEqual(result, 'hello');
        });

        test('Boolean spec validates primitive boolean', () => {
            const ADT = data(() => ({
                Value: {},
                getValue: fold({ out: Boolean })({
                    Value() { return true; }
                })
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
                Countdown: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                })
            }));

            const list = List.Countdown(3);
            assert.ok(list);
            assert.strictEqual(list.head, 3);
        });

        test('should throw TypeError when input type is wrong', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Countdown: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                })
            }));

            assert.throws(
                // @ts-expect-error -- intentional type violation for test
                () => List.Countdown('not a number'),
                /Operation 'Countdown' expected input of type Number.*got string/
            );
        });

        test('should validate String input type at runtime', () => {
            const Result = data(({ Family }) => ({
                Success: { value: String },
                Error: { message: String },
                Parse: unfold({ in: String, out: Family })({
                    Success: (s) => (s.length > 0 ? { value: s } : null),
                    Error: (s) => (s.length === 0 ? { message: 'empty string' } : null)
                })
            }));

            const result = Result.Parse('hello');
            assert.strictEqual(result.value, 'hello');
        });

        test('should validate custom class input type', () => {
            class Seed {
                // @ts-expect-error -- intentional type violation for test
                constructor(value) { this.value = value; }
            }

            const Result = data(({ Family }) => ({
                Value: { num: Number },
                FromSeed: unfold({ in: Seed, out: Family })({
                    // @ts-expect-error -- intentional type violation for test
                    Value: (seed) => ({ num: seed.value })
                })
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
                anything: fold({})({
                    Nil() { return 'string'; },
                    Cons() { return 42; }
                })
            }));

            // Both return different types - should work fine without spec.out
            assert.strictEqual(List.Nil.anything, 'string');
            assert.strictEqual(List.Cons({ head: 1, tail: List.Nil }).anything, 42);
        });

        test('unfold without spec.in allows any input type', () => {
            const Result = data(({ Family }) => ({
                Value: { data: Number },
                FromAnything: unfold({ out: Family })({
                    // @ts-expect-error -- intentional type violation for test
                    Value: (x) => ({ data: typeof x === 'number' ? x : 0 })
                })
            }));

            // Should accept any type without spec.in
            // @ts-expect-error -- intentional type violation for test
            assert.strictEqual(Result.FromAnything(42).data, 42);
            // @ts-expect-error -- intentional type violation for test
            assert.strictEqual(Result.FromAnything('hello').data, 0);
        });
    });
});
