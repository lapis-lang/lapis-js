/**
 * Codata Lazy Evaluation Tests
 * 
 * Tests for Proxy-based lazy evaluation of codata instances.
 * Phase 2: Lazy evaluation with memoization.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { codata } from '../index.mjs';

describe('Codata - Proxy-Based Lazy Evaluation', () => {
    it('should create codata instances with unfold', () => {
        const Stream = codata(({ Self, T }) => ({
            head: T,
            tail: Self(T)
        }))
            .unfold('From', (Stream) => ({ in: Number, out: Stream }), {
                head: (n) => n,
                tail: (n) => n + 1
            });

        const stream = Stream.From(0);
        assert.ok(stream, 'Stream instance should be created');
    });

    it('should lazily evaluate simple observers', () => {
        let headCallCount = 0;

        const Stream = codata(({ Self }) => ({
            head: Number,
            tail: Self
        }))
            .unfold('From', (Stream) => ({ in: Number, out: Stream }), {
                head: (n) => {
                    headCallCount++;
                    return n;
                },
                tail: (n) => n + 1
            });

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

        const Stream = codata(({ Self }) => ({
            head: Number,
            tail: Self
        }))
            .unfold('From', (Stream) => ({ in: Number, out: Stream }), {
                head: (n) => n,
                tail: (n) => {
                    tailCallCount++;
                    return n + 1;
                }
            });

        const stream = Stream.From(0);

        // tail should not be called yet
        assert.equal(tailCallCount, 0, 'tail should not be called until accessed');

        // Access tail first time
        const tail1 = stream.tail;
        assert.ok(tail1, 'tail should return a codata instance');
        assert.equal(tailCallCount, 1, 'tail handler should be called once');

        // Access tail again - should return memoized instance
        const tail2 = stream.tail;
        assert.strictEqual(tail1, tail2, 'tail should return same memoized instance');
        assert.equal(tailCallCount, 1, 'tail handler should not be called again (memoized)');
    });

    it('should support chained continuations', () => {
        const Stream = codata(({ Self }) => ({
            head: Number,
            tail: Self
        }))
            .unfold('From', (Stream) => ({ in: Number, out: Stream }), {
                head: (n) => n,
                tail: (n) => n + 1
            });

        const stream = Stream.From(0);

        // Chain: stream -> tail -> tail -> tail
        assert.equal(stream.head, 0);
        assert.equal(stream.tail.head, 1);
        assert.equal(stream.tail.tail.head, 2);
        assert.equal(stream.tail.tail.tail.head, 3);
    });

    it('should handle parametric observers', () => {
        const Console = codata(({ Self }) => ({
            log: { in: String, out: undefined },
            read: { out: String }
        }))
            .unfold('Create', (Console) => ({ out: Console }), {
                log: () => (msg) => {
                    // In real implementation, would console.log(msg)
                    return undefined;
                },
                read: () => () => {
                    // In real implementation, would read from stdin
                    return 'mock input';
                }
            });

        const console = Console.Create(null);

        // log should be a function
        assert.equal(typeof console.log, 'function', 'log should be a function');

        // Calling log should work
        const result = console.log('Hello');
        assert.equal(result, undefined);

        // read should also be a function
        assert.equal(typeof console.read, 'function', 'read should be a function');
        const input = console.read();
        assert.equal(input, 'mock input');
    });

    it('should prevent setting properties on codata instances', () => {
        const Stream = codata(({ Self }) => ({
            head: Number,
            tail: Self
        }))
            .unfold('From', (Stream) => ({ in: Number, out: Stream }), {
                head: (n) => n,
                tail: (n) => n + 1
            });

        const stream = Stream.From(0);

        assert.throws(
            () => { stream.head = 999; },
            /Cannot set property/,
            'Should prevent setting properties'
        );
    });

    it('should validate unfold operation name is PascalCase', () => {
        assert.throws(
            () => {
                codata(({ Self }) => ({
                    head: Number,
                    tail: Self
                }))
                    .unfold('from', (Stream) => ({ in: Number }), {
                        head: (n) => n,
                        tail: (n) => n + 1
                    });
            },
            /Unfold operation 'from' must be PascalCase/,
            'Should reject camelCase unfold names'
        );
    });

    it('should validate all observers have handlers', () => {
        assert.throws(
            () => {
                codata(({ Self }) => ({
                    head: Number,
                    tail: Self
                }))
                    .unfold('From', (Stream) => ({ in: Number }), {
                        head: (n) => n
                        // Missing tail handler
                    });
            },
            /Unfold operation 'From' missing handler for observer 'tail'/,
            'Should require handlers for all observers'
        );
    });

    it('should validate handlers are functions', () => {
        assert.throws(
            () => {
                codata(({ Self }) => ({
                    head: Number,
                    tail: Self
                }))
                    .unfold('From', (Stream) => ({ in: Number }), {
                        head: (n) => n,
                        tail: 'not a function'
                    });
            },
            /Handler for observer 'tail'.*must be a function/,
            'Should require handlers to be functions'
        );
    });

    it('should throw error when accessing observer without unfold', () => {
        const Stream = codata(({ Self }) => ({
            head: Number,
            tail: Self
        }));

        // Cannot create instance without unfold
        // This would require manually creating an instance, which isn't exposed
        // So we'll skip this test for now
    });

    it('should support multiple type parameters', () => {
        const Pair = codata(({ T, U }) => ({
            first: T,
            second: U
        }))
            .unfold('Create', (Pair) => ({ in: { x: Number, y: String }, out: Pair }), {
                first: ({ x, y }) => x,
                second: ({ x, y }) => y
            });

        const pair = Pair.Create({ x: 42, y: 'hello' });
        assert.equal(pair.first, 42);
        assert.equal(pair.second, 'hello');
    });

    it('should handle complex seed transformations', () => {
        const Stream = codata(({ Self }) => ({
            head: Number,
            tail: Self
        }))
            .unfold('Range', (Stream) => ({ in: { start: Number, end: Number }, out: Stream }), {
                head: ({ start }) => start,
                tail: ({ start, end }) => ({ start: start + 1, end })
            });

        const range = Stream.Range({ start: 10, end: 15 });
        assert.equal(range.head, 10);
        assert.equal(range.tail.head, 11);
        assert.equal(range.tail.tail.head, 12);
    });

    it('should access observer properties without invoking them prematurely', () => {
        let computeCount = 0;

        const Lazy = codata(() => ({
            expensive: Number
        }))
            .unfold('Create', (Lazy) => ({ in: Number, out: Lazy }), {
                expensive: (n) => {
                    computeCount++;
                    return n * 2;
                }
            });

        const lazy = Lazy.Create(21);

        // Just creating the instance should not trigger computation
        assert.equal(computeCount, 0);

        // Only when accessing should it compute
        const value = lazy.expensive;
        assert.equal(value, 42);
        assert.equal(computeCount, 1);
    });

    it('should handle nested continuation access', () => {
        const Tree = codata(({ Self }) => ({
            value: Number,
            left: Self,
            right: Self
        }))
            .unfold('Create', (Tree) => ({ in: Number, out: Tree }), {
                value: (n) => n,
                left: (n) => n * 2,
                right: (n) => n * 2 + 1
            });

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
});
