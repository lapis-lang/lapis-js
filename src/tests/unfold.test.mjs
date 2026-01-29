import { data } from '../index.mjs';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';

describe('Unfold Operations', () => {
    describe('Basic unfold', () => {
        it('should create a countdown list from a number', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Counter: {
                    op: 'unfold',
                    spec: { in: Number, out: Family },
                    Nil: n => (n <= 0 ? {} : null),
                    Cons: n => (n > 0 ? { head: n, tail: n - 1 } : null)
                }
            }));

            // Test it
            const result = List.Counter(5);

            assert.ok(result !== undefined);
            assert.strictEqual(result.head, 5);
            assert.strictEqual(result.tail.head, 4);
            assert.strictEqual(result.tail.tail.head, 3);
            assert.strictEqual(result.tail.tail.tail.head, 2);
            assert.strictEqual(result.tail.tail.tail.tail.head, 1);
            assert.ok(result.tail.tail.tail.tail.tail instanceof List);
            assert.strictEqual(result.tail.tail.tail.tail.tail.constructor.name, 'Nil');
        });

        it('should create an empty list when seed is 0', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Counter: {
                    op: 'unfold',
                    spec: { in: Number, out: Family },
                    Nil: n => (n <= 0 ? {} : null),
                    Cons: n => (n > 0 ? { head: n, tail: n - 1 } : null)
                }
            }));

            const result = List.Counter(0);
            assert.ok(result instanceof List);
            assert.strictEqual(result.constructor.name, 'Nil');
        });
    });

    describe('Multiple unfolds', () => {
        it('should support defining multiple unfold constructors', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Counter: {
                    op: 'unfold',
                    spec: { in: Number, out: Family },
                    Nil: n => (n <= 0 ? {} : null),
                    Cons: n => (n > 0 ? { head: n, tail: n - 1 } : null)
                },
                Range: {
                    op: 'unfold',
                    spec: { in: Number, out: Family },
                    Nil: n => (n <= 0 ? {} : null),
                    Cons: n => (n > 0 ? { head: 1, tail: n - 1 } : null)
                }
            }));

            const countdown = List.Counter(3);
            assert.strictEqual(countdown.head, 3);
            assert.strictEqual(countdown.tail.head, 2);
            assert.strictEqual(countdown.tail.tail.head, 1);

            const range = List.Range(3);
            assert.strictEqual(range.head, 1);
            assert.strictEqual(range.tail.head, 1);
            assert.strictEqual(range.tail.tail.head, 1);
        });
    });

    describe('Error cases', () => {
        it('should reject lowercase unfold names', () => {
            assert.throws(
                () => {
                    data(({ Family }) => ({
                        Nil: {},
                        Cons: { head: Number, tail: Family },
                        counter: {
                            op: 'unfold',
                            spec: { in: Number, out: Family },
                            Nil: n => (n <= 0 ? {} : null),
                            Cons: n => (n > 0 ? { head: n, tail: n - 1 } : null)
                        }
                    }));
                },
                /must be PascalCase/
            );
        });

    });

    describe('Case evaluation order', () => {
        it('should evaluate cases in declaration order and use first non-null', () => {
            const Num = data(({ Family }) => ({
                Zero: {},
                Positive: { value: Number },
                Negative: { value: Number },
                FromInt: {
                    op: 'unfold',
                    spec: { in: Number, out: Family },
                    Zero: n => (n === 0 ? {} : null),
                    Positive: n => (n > 0 ? { value: n } : null),
                    Negative: n => (n < 0 ? { value: n } : null)
                }
            }));

            const zero = Num.FromInt(0);
            assert.ok(zero instanceof Num);
            assert.strictEqual(zero.constructor.name, 'Zero');

            const pos = Num.FromInt(5);
            assert.ok(pos instanceof Num);
            assert.strictEqual(pos.constructor.name, 'Positive');
            assert.strictEqual(pos.value, 5);

            const neg = Num.FromInt(-3);
            assert.ok(neg instanceof Num);
            assert.strictEqual(neg.constructor.name, 'Negative');
            assert.strictEqual(neg.value, -3);
        });
    });
});
