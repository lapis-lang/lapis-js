/**
 * Codata Unfold Chaining Tests
 * 
 * Tests for chaining multiple unfold operations on the same codata type.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { codata } from '../index.mjs';

describe('Codata - Unfold Chaining', () => {
    it('should support chaining multiple unfold operations', () => {
        const Stream = codata(({ Self, T }) => ({
            head: T,
            tail: Self(T)
        }))
            .unfold('From', (Stream) => ({ in: Number, out: Stream }), {
                head: (n) => n,
                tail: (n) => n + 1
            })
            .unfold('Constant', (Stream) => ({ in: Number, out: Stream }), {
                head: (n) => n,
                tail: (n) => n  // Always the same value
            })
            .unfold('Range', (Stream) => ({ in: { start: Number, end: Number }, out: Stream }), {
                head: ({ start }) => start,
                tail: ({ start, end }) => ({ start: start + 1, end })
            });

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
        const Stream = codata(({ Self, T }) => ({
            head: T,
            nth: { in: Number, out: T },
            tail: Self(T)
        }))
            .unfold('From', (Stream) => ({ in: Number, out: Stream }), {
                head: (n) => n,
                nth: (n) => (index) => n + index,
                tail: (n) => n + 1
            });

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
        const Console = codata(({ Self }) => ({
            log: { in: String, out: undefined },
            read: { out: String },
            write: { in: { msg: String, level: Number }, out: Boolean }
        }))
            .unfold('Create', (Console) => ({ out: Console }), {
                log: () => (msg) => {
                    // Mock console.log
                    return undefined;
                },
                read: () => () => {
                    // Mock read
                    return 'mock input';
                },
                write: () => ({ msg, level }) => {
                    // Mock write with complex input
                    return level > 0;
                }
            });

        const console = Console.Create();

        assert.equal(typeof console.log, 'function');
        assert.equal(typeof console.read, 'function');
        assert.equal(typeof console.write, 'function');

        assert.equal(console.log('test'), undefined);
        assert.equal(console.read(), 'mock input');
        assert.equal(console.write({ msg: 'error', level: 1 }), true);
        assert.equal(console.write({ msg: 'debug', level: 0 }), false);
    });

    it('should maintain separate instances for different unfold operations', () => {
        const Stream = codata(({ Self }) => ({
            head: Number,
            tail: Self
        }))
            .unfold('From', (Stream) => ({ in: Number, out: Stream }), {
                head: (n) => n,
                tail: (n) => n + 1
            })
            .unfold('Constant', (Stream) => ({ in: Number, out: Stream }), {
                head: (n) => n,
                tail: (n) => n
            });

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
        const Fibonacci = codata(({ Self }) => ({
            current: Number,
            next: Self
        }))
            .unfold('From', (Fibonacci) => ({ in: { a: Number, b: Number }, out: Fibonacci }), {
                current: ({ a }) => a,
                next: ({ a, b }) => ({ a: b, b: a + b })
            });

        const fib = Fibonacci.From({ a: 0, b: 1 });

        assert.equal(fib.current, 0);
        assert.equal(fib.next.current, 1);
        assert.equal(fib.next.next.current, 1);
        assert.equal(fib.next.next.next.current, 2);
        assert.equal(fib.next.next.next.next.current, 3);
        assert.equal(fib.next.next.next.next.next.current, 5);
    });

    it('should return codata type for chaining after unfold', () => {
        const Stream = codata(({ Self }) => ({
            head: Number,
            tail: Self
        }))
            .unfold('From', (Stream) => ({ in: Number, out: Stream }), {
                head: (n) => n,
                tail: (n) => n + 1
            });

        // Should be able to chain more unfolds
        const StreamWithMore = Stream.unfold('Zeros', (Stream) => ({ out: Stream }), {
            head: () => 0,
            tail: () => undefined  // Would need proper seed, but demonstrates chainability
        });

        assert.ok(StreamWithMore);
        assert.ok(typeof StreamWithMore.From === 'function', 'Should still have From');
        assert.ok(typeof StreamWithMore.Zeros === 'function', 'Should have new Zeros');
    });
});
