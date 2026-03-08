/**
 * Behavior Lazy Evaluation Tests
 * 
 * Tests for Proxy-based lazy evaluation of behavior instances.
 * Lazy evaluation with memoization.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior, unfold } from '../index.mjs';

describe('Behavior - Proxy-Based Lazy Evaluation', () => {
    it('should create behavior instances with unfold', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T),
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            })
        }));

        const stream = Stream.From(0);
        assert.ok(stream, 'Stream instance should be created');
    });

    it('should lazily evaluate simple observers', () => {
        let headCallCount = 0;

        const Stream = behavior(({ Self }) => ({
            head: Number,
            tail: Self,
            From: unfold({ in: Number, out: Self })({
                head: (n) => {
                    headCallCount++;
                    return n;
                },
                tail: (n) => n + 1
            })
        }));

        const stream = Stream.From(5);

        // head should not be called yet
        assert.equal(headCallCount, 0, 'head should not be called until accessed');

        // Access head
        const value1 = stream.head;
        assert.equal(value1, 5, 'head should return seed value');
        assert.equal(headCallCount, 1, 'head should be called once');

        // Access head again - should recompute (no memoization for simple observers)
        const value2 = stream.head;
        assert.equal(value2, 5, 'head should return same value');
        assert.equal(headCallCount, 2, 'head should be called again (no memoization)');
    });

    it('should memoize Self continuations', () => {
        let tailCallCount = 0;

        const Stream = behavior(({ Self }) => ({
            head: Number,
            tail: Self,
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => {
                    tailCallCount++;
                    return n + 1;
                }
            })
        }));

        const stream = Stream.From(0);

        // tail should not be called yet
        assert.equal(tailCallCount, 0, 'tail should not be called until accessed');

        // Access tail first time
        const tail1 = stream.tail;
        assert.ok(tail1, 'tail should return a behavior instance');
        assert.equal(tailCallCount, 1, 'tail handler should be called once');

        // Access tail again - should return memoized instance
        const tail2 = stream.tail;
        assert.strictEqual(tail1, tail2, 'tail should return same memoized instance');
        assert.equal(tailCallCount, 1, 'tail handler should not be called again (memoized)');
    });

    it('should support chained continuations', () => {
        const Stream = behavior(({ Self }) => ({
            head: Number,
            tail: Self,
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            })
        }));

        const stream = Stream.From(0);

        // Chain: stream -> tail -> tail -> tail
        assert.equal(stream.head, 0);
        assert.equal(stream.tail.head, 1);
        assert.equal(stream.tail.tail.head, 2);
        assert.equal(stream.tail.tail.tail.head, 3);
    });

    it('should handle parametric observers', () => {
        const logs: string[] = [];
        const inputs = ['first line', 'second line'];

        const Console = behavior(({ Self }) => ({
            log: { in: String, out: undefined },
            read: { out: String },
            Create: unfold({ in: { sink: Array, source: Array }, out: Self })({
                log: ({ sink }) => (msg: string) => { sink.push(msg); },
                read: ({ source }) => () => source.shift() ?? ''
            })
        }));

        const con = Console.Create({ sink: logs, source: inputs });

        // log should be a function
        assert.equal(typeof con.log, 'function', 'log should be a function');

        // Calling log should actually record to the sink
        const result = con.log('Hello');
        assert.equal(result, undefined);
        assert.deepEqual(logs, ['Hello'], 'log should write to sink');

        // read should return from the source
        assert.equal(typeof con.read, 'function', 'read should be a function');
        // @ts-expect-error -- intentional type violation for test
        assert.equal(con.read(), 'first line');
        // @ts-expect-error -- intentional type violation for test
        assert.equal(con.read(), 'second line');
        // @ts-expect-error -- intentional type violation for test
        assert.equal(con.read(), '');  // exhausted

        // Verify that accessing the same parametric observer returns the same function (memoized)
        const logFn1 = con.log;
        const logFn2 = con.log;
        assert.strictEqual(logFn1, logFn2, 'Parametric observer function should be memoized');
    });

    it('should prevent setting properties on behavior instances', () => {
        const Stream = behavior(({ Self }) => ({
            head: Number,
            tail: Self,
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            })
        }));

        const stream = Stream.From(0);

        assert.throws(
            () => {
                // @ts-expect-error -- intentional type violation for test
                stream.head = 999;
            },
            /Cannot set property/,
            'Should prevent setting properties'
        );
    });

    it('should validate unfold operation name is PascalCase', () => {
        assert.throws(
            () => {
                behavior(({ Self }) => ({
                    head: Number,
                    tail: Self,
                    from: unfold({ in: Number, out: Self })({
                        head: (n) => n,
                        tail: (n) => n + 1
                    })
                }));
            },
            /Unfold operation 'from' must be PascalCase/,
            'Should reject camelCase unfold names'
        );
    });

    it('should validate all observers have handlers', () => {
        assert.throws(
            () => {
                behavior(({ Self }) => ({
                    head: Number,
                    tail: Self,
                    From: unfold({ in: Number, out: Self })({
                        head: (n) => n
                    })
                }));
            },
            /Unfold operation 'From' missing handler for observer 'tail'/,
            'Should require handlers for all observers'
        );
    });

    it('should validate handlers are functions', () => {
        assert.throws(
            () => {
                behavior(({ Self }) => ({
                    head: Number,
                    tail: Self,
                    From: unfold({ in: Number, out: Self })({
                        head: (n) => n,
                        // @ts-expect-error -- intentional type violation for test
                        tail: 42  // Not a function
                    })
                }));
            },
            /Handler for observer 'tail'.*must be a function/,
            'Should require handlers to be functions'
        );
    });

    it('should validate no extra handlers are provided', () => {
        assert.throws(
            () => {
                behavior(({ Self }) => ({
                    head: Number,
                    tail: Self,
                    From: unfold({ in: Number, out: Self })({
                        head: (n) => n,
                        tail: (n) => n + 1,
                        taill: (n) => n + 1
                    })
                }));
            },
            /Unfold operation 'From' has handler 'taill' which does not correspond to any observer/,
            'Should detect extra handlers that do not match observers'
        );
    });

    it('should support multiple type parameters', () => {
        const Pair = behavior(({ Self, T, U }) => ({
            first: T,
            second: U,
            Create: unfold({ in: { x: Number, y: String }, out: Self })({
                first: ({ x, y }) => x,
                second: ({ x, y }) => y
            })
        }));

        const pair = Pair.Create({ x: 42, y: 'hello' });
        assert.equal(pair.first, 42);
        assert.equal(pair.second, 'hello');
    });

    it('should handle complex seed transformations', () => {
        const Stream = behavior(({ Self }) => ({
            head: Number,
            tail: Self,
            Range: unfold({ in: { start: Number, end: Number }, out: Self })({
                head: ({ start }) => start,
                tail: ({ start, end }) => ({ start: start + 1, end })
            })
        }));

        const range = Stream.Range({ start: 10, end: 15 });
        assert.equal(range.head, 10);
        assert.equal(range.tail.head, 11);
        assert.equal(range.tail.tail.head, 12);
    });

    it('should access observer properties without invoking them prematurely', () => {
        let computeCount = 0;

        const Lazy = behavior(({ Self }) => ({
            expensive: Number,
            Create: unfold({ in: Number, out: Self })({
                expensive: (n) => {
                    computeCount++;
                    return n * 2;
                }
            })
        }));

        const lazy = Lazy.Create(21);

        // Just creating the instance should not trigger computation
        assert.equal(computeCount, 0);

        // Only when accessing should it compute
        const value = lazy.expensive;
        assert.equal(value, 42);
        assert.equal(computeCount, 1);
    });

    it('should handle nested continuation access', () => {
        const Tree = behavior(({ Self }) => ({
            value: Number,
            left: Self,
            right: Self,
            Create: unfold({ in: Number, out: Self })({
                value: (n) => n,
                left: (n) => n * 2,
                right: (n) => n * 2 + 1
            })
        }));

        const tree = Tree.Create(1);
        assert.equal(tree.value, 1);
        assert.equal(tree.left.value, 2);
        assert.equal(tree.right.value, 3);
        assert.equal(tree.left.left.value, 4);
        assert.equal(tree.left.right.value, 5);
        assert.equal(tree.right.left.value, 6);
        assert.equal(tree.right.right.value, 7);

        // Verify memoization: accessing left twice returns same instance
        assert.strictEqual(tree.left, tree.left);
    });

    it('should support property existence checks with in operator', () => {
        const Stream = behavior(({ Self }) => ({
            head: Number,
            tail: Self,
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            })
        }));

        const stream = Stream.From(0);

        // Observer properties should be reported as existing
        assert.ok('head' in stream, 'head should exist in stream');
        assert.ok('tail' in stream, 'tail should exist in stream');

        // Non-observer properties should return false
        assert.ok(!('nonExistent' in stream), 'nonExistent should not exist in stream');
    });
});
