/**
 * Codata Infinite Structures Tests
 * 
 * Comprehensive test suite covering lazy evaluation, memoization, and infinite
 * codata structures.
 * 
 * Issue #64: Core Codata Infrastructure - Tests for Infinite Structures
 * 
 * Acceptance Criteria:
 * - Test 1: Infinite Stream - lazy evaluation and continuation memoization
 * - Test 2: Constant Stream (ones) - infinite repetition via corecursion
 * - Test 3: Rose Tree - lazy children generation on demand
 * - Test 4: Codata Set - interface-defined infinite sets (e.g., all evens)
 * - Verify lazy evaluation (observers computed on access)
 * - Verify memoization (same Self reference === same instance)
 * - Test parametric observers (functions with inputs)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { codata } from '../index.mjs';

describe('Codata - Infinite Structures', () => {
    describe('Test 1: Infinite Stream', () => {
        it('should create infinite streams with lazy evaluation', () => {
            const Stream = codata(({ Self, T }) => ({
                head: T,
                tail: Self(T)
            }))
                .unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
                    head: (n) => n,
                    tail: (n) => n + 1
                });

            const nums = Stream.From(0);

            // Should be able to access arbitrarily deep into the stream
            assert.equal(nums.head, 0);
            assert.equal(nums.tail.head, 1);
            assert.equal(nums.tail.tail.head, 2);
            assert.equal(nums.tail.tail.tail.head, 3);

            // Go deep to verify it's truly infinite
            let current = nums;
            for (let i = 0; i < 100; i++) {
                assert.equal(current.head, i);
                current = current.tail;
            }
            assert.equal(current.head, 100);
        });

        it('should memoize continuation instances', () => {
            const Stream = codata(({ Self, T }) => ({
                head: T,
                tail: Self(T)
            }))
                .unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
                    head: (n) => n,
                    tail: (n) => n + 1
                });

            const nums = Stream.From(0);

            // Access tail multiple times - should return same instance
            const tail1 = nums.tail;
            const tail2 = nums.tail;

            assert.strictEqual(tail1, tail2, 'tail should be memoized');
            assert.equal(tail1.head, 1);
            assert.equal(tail2.head, 1);
        });

        it('should not memoize simple observers', () => {
            let headCallCount = 0;

            const Stream = codata(({ Self, T }) => ({
                head: T,
                tail: Self(T)
            }))
                .unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
                    head: (n) => {
                        headCallCount++;
                        return n;
                    },
                    tail: (n) => n + 1
                });

            const nums = Stream.From(0);

            // Each access to head should recompute
            assert.equal(nums.head, 0);
            assert.equal(headCallCount, 1);

            assert.equal(nums.head, 0);
            assert.equal(headCallCount, 2, 'head should be recomputed (not memoized)');

            assert.equal(nums.head, 0);
            assert.equal(headCallCount, 3, 'head should be recomputed again');
        });

        it('should memoize continuation but not observers within it', () => {
            let headCallCount = 0;
            let tailCallCount = 0;

            const Stream = codata(({ Self, T }) => ({
                head: T,
                tail: Self(T)
            }))
                .unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
                    head: (n) => {
                        headCallCount++;
                        return n;
                    },
                    tail: (n) => {
                        tailCallCount++;
                        return n + 1;
                    }
                });

            const nums = Stream.From(0);

            // First access to tail - creates instance
            const tail1 = nums.tail;
            assert.equal(tailCallCount, 1);

            // Second access to tail - returns memoized instance
            const tail2 = nums.tail;
            assert.strictEqual(tail1, tail2);
            assert.equal(tailCallCount, 1, 'tail handler should not be called again');

            // But accessing head on the tail should recompute each time
            assert.equal(tail1.head, 1);
            assert.equal(headCallCount, 1);

            assert.equal(tail1.head, 1);
            assert.equal(headCallCount, 2, 'head should be recomputed on tail instance');
        });
    });

    describe('Test 2: Constant Stream (ones)', () => {
        it('should create infinite constant streams via corecursion', () => {
            const Stream = codata(({ Self, T }) => ({
                head: T,
                tail: Self(T)
            }))
                .unfold('Repeat', (Stream) => ({ in: Number, out: Stream(Number) }), {
                    head: (n) => n,
                    tail: (n) => n  // Same seed = constant stream
                });

            const ones = Stream.Repeat(1);

            // Should repeat the same value infinitely
            assert.equal(ones.head, 1);
            assert.equal(ones.tail.head, 1);
            assert.equal(ones.tail.tail.head, 1);
            assert.equal(ones.tail.tail.tail.head, 1);

            // Verify deep into the stream
            let current = ones;
            for (let i = 0; i < 100; i++) {
                assert.equal(current.head, 1);
                current = current.tail;
            }
        });

        it('should work with different constant values', () => {
            const Stream = codata(({ Self, T }) => ({
                head: T,
                tail: Self(T)
            }))
                .unfold('Repeat', (Stream) => ({ in: Number, out: Stream(Number) }), {
                    head: (n) => n,
                    tail: (n) => n
                });

            const zeros = Stream.Repeat(0);
            const fives = Stream.Repeat(5);
            const negatives = Stream.Repeat(-42);

            assert.equal(zeros.head, 0);
            assert.equal(zeros.tail.head, 0);

            assert.equal(fives.head, 5);
            assert.equal(fives.tail.tail.head, 5);

            assert.equal(negatives.head, -42);
            assert.equal(negatives.tail.tail.tail.head, -42);
        });

        it('should memoize constant stream continuations', () => {
            const Stream = codata(({ Self, T }) => ({
                head: T,
                tail: Self(T)
            }))
                .unfold('Repeat', (Stream) => ({ in: Number, out: Stream(Number) }), {
                    head: (n) => n,
                    tail: (n) => n
                });

            const ones = Stream.Repeat(1);

            const tail1 = ones.tail;
            const tail2 = ones.tail;

            assert.strictEqual(tail1, tail2, 'constant stream tail should be memoized');

            // Since seed is always the same, deeper tails should also be memoized
            const deepTail1 = ones.tail.tail.tail;
            const deepTail2 = ones.tail.tail.tail;
            assert.strictEqual(deepTail1, deepTail2, 'deep tails should be memoized');
        });
    });

    describe('Test 3: Rose Tree', () => {
        it('should create lazy rose trees with on-demand children generation', () => {
            const RoseTree = codata(({ Self, T }) => ({
                value: T,
                children: Array  // Array of children (could be lazy generators)
            }))
                .unfold('Node', (RoseTree) => ({ in: { value: Number, childGen: Function }, out: RoseTree(Number) }), {
                    value: ({ value }) => value,
                    children: ({ value, childGen }) => childGen(value)
                });

            // Create a tree where each node generates children lazily
            const tree = RoseTree.Node({
                value: 1,
                childGen: (n) => [n * 2, n * 2 + 1]
            });

            // Value is accessible
            assert.equal(tree.value, 1);

            // Children should be generated when accessed
            assert.ok(Array.isArray(tree.children));
            assert.equal(tree.children.length, 2);
            assert.equal(tree.children[0], 2);
            assert.equal(tree.children[1], 3);
        });

        it('should support nested rose tree structures', () => {
            // For a more complex example, we can create nested codata
            const RoseTree = codata(({ Self, T }) => ({
                value: T,
                left: Self(T),
                right: Self(T)
            }))
                .unfold('Create', (RoseTree) => ({ in: Number, out: RoseTree(Number) }), {
                    value: (n) => n,
                    left: (n) => n * 2,
                    right: (n) => n * 2 + 1
                });

            const tree = RoseTree.Create(1);

            // Root value
            assert.equal(tree.value, 1);

            // First level
            assert.equal(tree.left.value, 2);
            assert.equal(tree.right.value, 3);

            // Second level
            assert.equal(tree.left.left.value, 4);
            assert.equal(tree.left.right.value, 5);
            assert.equal(tree.right.left.value, 6);
            assert.equal(tree.right.right.value, 7);

            // Third level
            assert.equal(tree.left.left.left.value, 8);
            assert.equal(tree.left.left.right.value, 9);
        });

        it('should memoize tree continuations (left/right)', () => {
            const RoseTree = codata(({ Self, T }) => ({
                value: T,
                left: Self(T),
                right: Self(T)
            }))
                .unfold('Create', (RoseTree) => ({ in: Number, out: RoseTree(Number) }), {
                    value: (n) => n,
                    left: (n) => n * 2,
                    right: (n) => n * 2 + 1
                });

            const tree = RoseTree.Create(1);

            // Access left multiple times
            const left1 = tree.left;
            const left2 = tree.left;
            assert.strictEqual(left1, left2, 'left child should be memoized');

            // Access right multiple times
            const right1 = tree.right;
            const right2 = tree.right;
            assert.strictEqual(right1, right2, 'right child should be memoized');
        });
    });

    describe('Test 4: Codata Set', () => {
        it('should represent infinite sets via interface', () => {
            const CodataSet = codata(({ Self }) => ({
                isEmpty: Boolean,
                lookup: { in: Number, out: Boolean },
                insert: { in: Number, out: Self },
                remove: { in: Number, out: Self }
            }))
                .unfold('Evens', (CodataSet) => ({ out: CodataSet }), {
                    isEmpty: () => false,  // Infinite set is never empty
                    lookup: () => (n) => n % 2 === 0,
                    insert: () => (n) => {
                        // Inserting into evens doesn't change the infinite set
                        // In a real implementation, might track finite additions
                        return undefined; // For now, just return undefined
                    },
                    remove: () => (n) => {
                        // Removing from evens doesn't change the infinite set
                        return undefined;
                    }
                });

            const evens = CodataSet.Evens();

            // Infinite set is never empty
            assert.equal(evens.isEmpty, false);

            // Lookup should work for membership testing
            assert.equal(typeof evens.lookup, 'function');
            assert.equal(evens.lookup(4), true, '4 should be in evens');
            assert.equal(evens.lookup(6), true, '6 should be in evens');
            assert.equal(evens.lookup(3), false, '3 should not be in evens');
            assert.equal(evens.lookup(5), false, '5 should not be in evens');
            assert.equal(evens.lookup(0), true, '0 should be in evens');
        });

        it('should support multiple infinite set types', () => {
            const CodataSet = codata(({ Self }) => ({
                isEmpty: Boolean,
                lookup: { in: Number, out: Boolean }
            }))
                .unfold('Evens', (CodataSet) => ({ out: CodataSet }), {
                    isEmpty: () => false,
                    lookup: () => (n) => n % 2 === 0
                })
                .unfold('Odds', (CodataSet) => ({ out: CodataSet }), {
                    isEmpty: () => false,
                    lookup: () => (n) => n % 2 !== 0
                })
                .unfold('Primes', (CodataSet) => ({ out: CodataSet }), {
                    isEmpty: () => false,
                    lookup: () => (n) => {
                        // Simple primality test (not efficient, just for demo)
                        if (n < 2) return false;
                        if (n === 2) return true;
                        if (n % 2 === 0) return false;
                        for (let i = 3; i <= Math.sqrt(n); i += 2) {
                            if (n % i === 0) return false;
                        }
                        return true;
                    }
                });

            const evens = CodataSet.Evens();
            const odds = CodataSet.Odds();
            const primes = CodataSet.Primes();

            // Test evens
            assert.equal(evens.lookup(4), true);
            assert.equal(evens.lookup(5), false);

            // Test odds
            assert.equal(odds.lookup(4), false);
            assert.equal(odds.lookup(5), true);

            // Test primes
            assert.equal(primes.lookup(2), true);
            assert.equal(primes.lookup(3), true);
            assert.equal(primes.lookup(4), false);
            assert.equal(primes.lookup(5), true);
            assert.equal(primes.lookup(17), true);
            assert.equal(primes.lookup(18), false);
        });

        it('should memoize parametric observer functions', () => {
            const CodataSet = codata(({ Self }) => ({
                isEmpty: Boolean,
                lookup: { in: Number, out: Boolean }
            }))
                .unfold('Evens', (CodataSet) => ({ out: CodataSet }), {
                    isEmpty: () => false,
                    lookup: () => (n) => n % 2 === 0
                });

            const evens = CodataSet.Evens();

            // Access lookup multiple times - should return same function
            const lookup1 = evens.lookup;
            const lookup2 = evens.lookup;

            assert.strictEqual(lookup1, lookup2, 'parametric observer function should be memoized');

            // But calling the function with different args should compute fresh results
            assert.equal(lookup1(4), true);
            assert.equal(lookup1(3), false);
        });
    });

    describe('Parametric Observers in Infinite Structures', () => {
        it('should support parametric observers on infinite streams', () => {
            const Stream = codata(({ Self, T }) => ({
                head: T,
                tail: Self(T),
                nth: { in: Number, out: T }
            }))
                .unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
                    head: (n) => n,
                    tail: (n) => n + 1,
                    nth: (n) => (index) => n + index
                });

            const nums = Stream.From(0);

            // nth should allow random access
            assert.equal(typeof nums.nth, 'function');
            assert.equal(nums.nth(0), 0);
            assert.equal(nums.nth(5), 5);
            assert.equal(nums.nth(100), 100);

            // Should work on any stream instance
            const tail = nums.tail;
            assert.equal(tail.nth(0), 1);
            assert.equal(tail.nth(5), 6);
        });

        it('should support multiple parametric observers', () => {
            const Stream = codata(({ Self, T }) => ({
                head: T,
                tail: Self(T),
                nth: { in: Number, out: T },
                take: { in: Number, out: Array }
            }))
                .unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
                    head: (n) => n,
                    tail: (n) => n + 1,
                    nth: (n) => (index) => n + index,
                    take: (n) => (count) => {
                        const result = [];
                        for (let i = 0; i < count; i++) {
                            result.push(n + i);
                        }
                        return result;
                    }
                });

            const nums = Stream.From(0);

            // nth
            assert.equal(nums.nth(5), 5);

            // take
            assert.deepEqual(nums.take(5), [0, 1, 2, 3, 4]);
            assert.deepEqual(nums.tail.take(3), [1, 2, 3]);
        });

        it('should memoize parametric observer functions but not their results', () => {
            const Stream = codata(({ Self, T }) => ({
                head: T,
                tail: Self(T),
                nth: { in: Number, out: T }
            }))
                .unfold('From', (Stream) => ({ in: Number, out: Stream(Number) }), {
                    head: (n) => n,
                    tail: (n) => n + 1,
                    nth: (n) => (index) => n + index
                });

            const nums = Stream.From(0);

            // Access nth multiple times - should return same function (memoized)
            const nth1 = nums.nth;
            const nth2 = nums.nth;
            
            assert.strictEqual(nth1, nth2, 'parametric observer function should be memoized');

            // But calling the function with different args computes fresh results
            assert.equal(nth1(5), 5);
            assert.equal(nth1(10), 10);
            assert.equal(nth2(3), 3);
            
            // Verify results are computed correctly
            assert.equal(nums.nth(0), 0);
            assert.equal(nums.tail.nth(0), 1);
            assert.equal(nums.tail.nth(5), 6);
        });
    });

    describe('Complex Infinite Structures', () => {
        it('should support Fibonacci sequence as infinite stream', () => {
            const Stream = codata(({ Self }) => ({
                current: Number,
                next: Self
            }))
                .unfold('Fibonacci', (Stream) => ({ in: { a: Number, b: Number }, out: Stream }), {
                    current: ({ a }) => a,
                    next: ({ a, b }) => ({ a: b, b: a + b })
                });

            const fib = Stream.Fibonacci({ a: 0, b: 1 });

            // Verify Fibonacci sequence: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34...
            const sequence = [];
            let current = fib;
            for (let i = 0; i < 10; i++) {
                sequence.push(current.current);
                current = current.next;
            }

            assert.deepEqual(sequence, [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]);
        });

        it('should support prime number stream', () => {
            const Stream = codata(({ Self }) => ({
                head: Number,
                tail: Self
            }))
                .unfold('Primes', (Stream) => ({ in: Number, out: Stream }), {
                    head: (n) => n,
                    tail: (n) => {
                        // Find next prime after n
                        let candidate = n + 1;
                        while (true) {
                            let isPrime = candidate > 1;
                            if (candidate === 2) return 2;
                            if (candidate % 2 === 0) {
                                candidate++;
                                continue;
                            }
                            for (let i = 3; i <= Math.sqrt(candidate); i += 2) {
                                if (candidate % i === 0) {
                                    isPrime = false;
                                    break;
                                }
                            }
                            if (isPrime) return candidate;
                            candidate++;
                        }
                    }
                });

            const primes = Stream.Primes(2);

            // Verify prime sequence: 2, 3, 5, 7, 11, 13, 17, 19, 23, 29...
            const sequence = [];
            let current = primes;
            for (let i = 0; i < 10; i++) {
                sequence.push(current.head);
                current = current.tail;
            }

            assert.deepEqual(sequence, [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
        });

        it('should support infinite binary tree', () => {
            const Tree = codata(({ Self }) => ({
                value: Number,
                left: Self,
                right: Self,
                depth: { in: Number, out: Array }  // Get all values at depth
            }))
                .unfold('Create', (Tree) => ({ in: Number, out: Tree }), {
                    value: (n) => n,
                    left: (n) => n * 2,
                    right: (n) => n * 2 + 1,
                    depth: (n) => (d) => {
                        if (d === 0) return [n];
                        // For depth > 0, would need to traverse children
                        // This is a simplified version
                        const level = Math.pow(2, d);
                        const start = n * level;
                        return Array.from({ length: level }, (_, i) => start + i);
                    }
                });

            const tree = Tree.Create(1);

            // Root
            assert.equal(tree.value, 1);

            // Level 1
            assert.equal(tree.left.value, 2);
            assert.equal(tree.right.value, 3);

            // Level 2
            assert.equal(tree.left.left.value, 4);
            assert.equal(tree.left.right.value, 5);
            assert.equal(tree.right.left.value, 6);
            assert.equal(tree.right.right.value, 7);

            // Memoization check
            assert.strictEqual(tree.left, tree.left);
            assert.strictEqual(tree.right, tree.right);
        });
    });

    describe('Performance and Deep Structures', () => {
        it('should handle deep continuation chains without stack overflow', () => {
            const Stream = codata(({ Self }) => ({
                head: Number,
                tail: Self
            }))
                .unfold('From', (Stream) => ({ in: Number, out: Stream }), {
                    head: (n) => n,
                    tail: (n) => n + 1
                });

            const nums = Stream.From(0);

            // Navigate deeply into the stream
            let current = nums;
            for (let i = 0; i < 1000; i++) {
                assert.equal(current.head, i);
                current = current.tail;
            }

            // Should not throw stack overflow
            assert.equal(current.head, 1000);
        });

        it('should efficiently memoize repeated accesses', () => {
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

            const nums = Stream.From(0);

            // Access the same tail multiple times
            for (let i = 0; i < 100; i++) {
                const tail = nums.tail;
            }

            // Should only call handler once (memoized)
            assert.equal(tailCallCount, 1, 'tail handler should be called only once');
        });

        it('should support wide tree structures', () => {
            const Tree = codata(({ Self }) => ({
                value: Number,
                children: Array  // Array of seeds for children
            }))
                .unfold('Create', (Tree) => ({ in: { value: Number, fanout: Number }, out: Tree }), {
                    value: ({ value }) => value,
                    children: ({ value, fanout }) => {
                        return Array.from({ length: fanout }, (_, i) => value * fanout + i);
                    }
                });

            // Create a tree with high fanout
            const wideTree = Tree.Create({ value: 1, fanout: 10 });

            assert.equal(wideTree.value, 1);
            assert.ok(Array.isArray(wideTree.children));
            assert.equal(wideTree.children.length, 10);
            
            // Verify children values
            for (let i = 0; i < 10; i++) {
                assert.equal(wideTree.children[i], 10 + i);
            }
        });
    });
});
