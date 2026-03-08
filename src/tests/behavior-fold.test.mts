/**
 * Behavior Fold Tests
 *
 * Tests for the bounded coalgebraic catamorphism (fold) operation on behavior types.
 * Behavior fold is the dual of data fold:
 * - Data fold: bottom-up, multiple handlers (one per variant — sum type)
 * - Behavior fold: top-down, single `_` handler for the observation product (product type)
 *
 * Key design: the `_` handler receives destructured observations.
 * Continuations (Self) are wrapped as fold-functions (...params) => result.
 * Not calling a continuation IS the base case (dual to the Nil handler in data fold).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior, fold, unfold } from '../index.mjs';

describe('Behavior Fold - Basic', () => {
    it('should take N elements from an infinite stream', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T),
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            }),
            take: fold({ in: Number, out: Array })({
                _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
            })
        }));

        const nums = Stream.From(0);
        assert.deepEqual(nums.take(0), []);
        assert.deepEqual(nums.take(1), [0]);
        assert.deepEqual(nums.take(5), [0, 1, 2, 3, 4]);
        assert.deepEqual(nums.take(10), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should sum N elements of an infinite stream', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T),
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            }),
            sum: fold({ in: Number, out: Number })({
                _: ({ head, tail }, n) => n > 0 ? head + tail(n - 1) : 0
            })
        }));

        const nums = Stream.From(0);
        assert.equal(nums.sum(0), 0);
        assert.equal(nums.sum(1), 0);         // 0
        assert.equal(nums.sum(5), 10);        // 0+1+2+3+4 = 10
        assert.equal(nums.sum(3), 3);         // 0+1+2 = 3
    });

    it('should extract the nth element', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T),
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            }),
            nth: fold({ in: Number, out: Number })({
                _: ({ head, tail }, n) => n === 0 ? head : tail(n - 1)
            })
        }));

        const nums = Stream.From(0);
        assert.equal(nums.nth(0), 0);
        assert.equal(nums.nth(3), 3);
        assert.equal(nums.nth(9), 9);
    });
});

describe('Behavior Fold - Parameterless (Getter)', () => {
    it('should install a parameterless fold as a getter', () => {
        const Countdown = behavior(({ Self }) => ({
            value: Number,
            next: Self,
            done: Boolean,
            Create: unfold({ in: Number, out: Self })({
                value: (n) => n,
                next: (n) => n - 1,
                done: (n) => n <= 0
            }),
            collect: fold({ out: Array })({
                _: ({ value, next, done }) => done ? [] : [value, ...next()]
            })
        }));

        const cd = Countdown.Create(5);
        // UAP: parameterless fold is a getter
        assert.deepEqual(cd.collect, [5, 4, 3, 2, 1]);
    });

    it('collects an empty countdown', () => {
        const Countdown = behavior(({ Self }) => ({
            value: Number,
            next: Self,
            done: Boolean,
            Create: unfold({ in: Number, out: Self })({
                value: (n) => n,
                next: (n) => n - 1,
                done: (n) => n <= 0
            }),
            collect: fold({ out: Array })({
                _: ({ value, next, done }) => done ? [] : [value, ...next()]
            })
        }));

        assert.deepEqual(Countdown.Create(0).collect, []);
    });
});

describe('Behavior Fold - Multiple Operations', () => {
    it('should support multiple fold operations on the same type', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T),
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            }),
            take: fold({ in: Number, out: Array })({
                _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
            }),
            sum: fold({ in: Number, out: Number })({
                _: ({ head, tail }, n) => n > 0 ? head + tail(n - 1) : 0
            }),
            product: fold({ in: Number, out: Number })({
                _: ({ head, tail }, n) => n > 0 ? head * tail(n - 1) : 1
            })
        }));

        const nums = Stream.From(1);    // 1, 2, 3, 4, 5, ...
        assert.deepEqual(nums.take(4), [1, 2, 3, 4]);
        assert.equal(nums.sum(4), 10);       // 1+2+3+4
        assert.equal(nums.product(4), 24);   // 1*2*3*4
    });
});

describe('Behavior Fold - Duality with Data Fold', () => {
    it('base case: not calling continuation returns the base value', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T),
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            }),
            sum: fold({ in: Number, out: Number })({
                _: ({ head, tail }, n) => n > 0 ? head + tail(n - 1) : 0
            })
        }));

        const nums = Stream.From(5);
        // When n === 0, tail is NOT called → base case → returns 0
        assert.equal(nums.sum(0), 0);
    });

    it('fold from a non-zero seed', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T),
            From: unfold({ in: Number, out: Self })({
                head: (n) => n * 2,
                tail: (n) => n + 1
            }),
            take: fold({ in: Number, out: Array })({
                _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
            })
        }));

        // From(3): head=6, tail→From(4): head=8, tail→From(5): head=10, ...
        const evens = Stream.From(3);
        assert.deepEqual(evens.take(3), [6, 8, 10]);
    });
});

describe('Behavior Fold - Fibonacci Stream', () => {
    it('should fold over a fibonacci stream correctly', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T),
            Fib: unfold({ in: Object, out: Self })({
                // @ts-expect-error -- intentional type violation for test
                head: ({ a }) => a,
                // @ts-expect-error -- intentional type violation for test
                tail: ({ a, b }) => ({ a: b, b: a + b })
            }),
            take: fold({ in: Number, out: Array })({
                _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
            })
        }));

        const fibs = Stream.Fib({ a: 0, b: 1 });
        assert.deepEqual(fibs.take(8), [0, 1, 1, 2, 3, 5, 8, 13]);
    });
});

describe('Behavior Fold - Tail-call accumulator style', () => {
    it('supports accumulator-passing style for deep folds', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T),
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            }),
            // Tail-call style: fold passes accumulator in params
            sumAcc: fold({ in: Array, out: Number })({
                // @ts-expect-error -- intentional type violation for test
                _: ({ head, tail }, [n, acc]) => n > 0 ? tail([n - 1, acc + head]) : acc
            })
        }));

        const nums = Stream.From(0);
        assert.equal(nums.sumAcc([5, 0]), 10);  // [count, accumulator]
    });
});

describe('Behavior Fold - Validation', () => {
    it('should throw if fold handler is not a function', () => {
        assert.throws(() => {
            behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                bad: fold({ in: Number, out: Number })({})
            }));
        }, /handler/);
    });

    it('should throw if fold name is not camelCase', () => {
        assert.throws(() => {
            behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                BadFold: fold({ in: Number, out: Number })({
                    _: ({ head, tail }, n) => n > 0 ? head + tail(n - 1) : 0
                })
            }));
        }, /camelCase/);
    });
});
