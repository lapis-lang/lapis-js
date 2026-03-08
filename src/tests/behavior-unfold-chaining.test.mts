/**
 * Behavior Unfold Chaining Tests
 * 
 * Tests for chaining multiple unfold operations on the same behavior type.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior, unfold } from '../index.mjs';

describe('Behavior - Unfold Chaining', () => {
    it('should support chaining multiple unfold operations', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T),
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            }),
            Constant: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n
            }),
            Range: unfold({ in: { start: Number, end: Number }, out: Self })({
                head: ({ start }) => start,
                tail: ({ start, end }) => ({ start: start + 1, end })
            })
        }));

        // Test From
        const nums = Stream.From(0);
        assert.equal(nums.head, 0);
        assert.equal(nums.tail.head, 1);
        assert.equal(nums.tail.tail.head, 2);

        // Test Constant
        const ones = Stream.Constant(1);
        assert.equal(ones.head, 1);
        assert.equal(ones.tail.head, 1);
        assert.equal(ones.tail.tail.head, 1);

        // Test Range
        const range = Stream.Range({ start: 10, end: 15 });
        assert.equal(range.head, 10);
        assert.equal(range.tail.head, 11);
        assert.equal(range.tail.tail.head, 12);
    });

    it('should support parametric observers in unfold', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            nth: { in: Number, out: T },
            tail: Self(T),
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                nth: (n) => (index) => n + index,
                tail: (n) => n + 1
            })
        }));

        const stream = Stream.From(0);

        // Simple observer
        assert.equal(stream.head, 0);

        // Parametric observer
        assert.equal(typeof stream.nth, 'function', 'nth should be a function');
        assert.equal(stream.nth(0), 0, 'nth(0) should return 0');
        assert.equal(stream.nth(5), 5, 'nth(5) should return 5');
        assert.equal(stream.nth(10), 10, 'nth(10) should return 10');

        // Continuation
        assert.equal(stream.tail.head, 1);
        assert.equal(stream.tail.nth(0), 1);
        assert.equal(stream.tail.nth(5), 6);
    });

    it('should support multiple parametric observers', () => {
        const logs = [];
        const inputs = ['mock input'];

        const Console = behavior(({ Self }) => ({
            log: { in: String, out: undefined },
            read: { out: String },
            write: { in: { msg: String, level: Number }, out: Boolean },
            Create: unfold({ in: { sink: Array, source: Array }, out: Self })({
                log: ({ sink }) => (msg) => { sink.push(msg); },
                read: ({ source }) => () => source.shift() ?? '',
                write: ({ sink }) => ({ msg, level }) => {
                    if (level > 0) { sink.push(msg); return true; }
                    return false;
                }
            })
        }));

        const con = Console.Create({ sink: logs, source: inputs });

        assert.equal(typeof con.log, 'function');
        assert.equal(typeof con.read, 'function');
        assert.equal(typeof con.write, 'function');

        assert.equal(con.log('test'), undefined);
        assert.deepEqual(logs, ['test'], 'log should append to sink');

        // @ts-expect-error -- intentional type violation for test
        assert.equal(con.read(), 'mock input');
        // @ts-expect-error -- intentional type violation for test
        assert.equal(con.read(), '', 'exhausted source returns empty string');

        assert.equal(con.write({ msg: 'error', level: 1 }), true);
        assert.deepEqual(logs, ['test', 'error'], 'write at level>0 appends to sink');
        assert.equal(con.write({ msg: 'debug', level: 0 }), false);
        assert.deepEqual(logs, ['test', 'error'], 'write at level=0 does not append');
    });

    it('should maintain separate instances for different unfold operations', () => {
        const Stream = behavior(({ Self }) => ({
            head: Number,
            tail: Self,
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            }),
            Constant: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n
            })
        }));

        const nums = Stream.From(0);
        const ones = Stream.Constant(1);

        // Different instances should be independent
        assert.equal(nums.head, 0);
        assert.equal(ones.head, 1);

        assert.equal(nums.tail.head, 1);
        assert.equal(ones.tail.head, 1);  // Still constant

        assert.equal(nums.tail.tail.head, 2);
        assert.equal(ones.tail.tail.head, 1);  // Still constant
    });

    it('should support unfold with complex seed transformations', () => {
        const Fibonacci = behavior(({ Self }) => ({
            current: Number,
            next: Self,
            From: unfold({ in: { a: Number, b: Number }, out: Self })({
                current: ({ a }) => a,
                next: ({ a, b }) => ({ a: b, b: a + b })
            })
        }));

        const fib = Fibonacci.From({ a: 0, b: 1 });

        assert.equal(fib.current, 0);
        assert.equal(fib.next.current, 1);
        assert.equal(fib.next.next.current, 1);
        assert.equal(fib.next.next.next.current, 2);
        assert.equal(fib.next.next.next.next.current, 3);
        assert.equal(fib.next.next.next.next.next.current, 5);
    });

    it('should return behavior type for chaining after unfold', () => {
        const Stream = behavior(({ Self }) => ({
            head: Number,
            tail: Self,
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            }),
            Zeros: unfold({ out: Self })({
                head: () => 0,
                tail: () => 0
            })
        }));

        const zeros = Stream.Zeros;
        assert.equal(zeros.head, 0);
        assert.equal(zeros.tail.head, 0);
        assert.equal(zeros.tail.tail.head, 0);
    });
});
