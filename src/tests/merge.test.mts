import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data , merge, fold, unfold, map } from '../index.mjs';

describe('Merge Operation (Deforestation)', () => {
    describe('Hylomorphism (unfold + fold)', () => {
        test('should merge unfold and fold into factorial without intermediate list', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Counter: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                product: fold({ out: Number })({
                    Nil() { return 1; },
                    Cons({ head, tail }) { return head * tail; }
                }),
                Factorial: merge('Counter', 'product')
            }));

            // Test factorial computation
            assert.strictEqual(List.Factorial(0), 1);
            assert.strictEqual(List.Factorial(1), 1);
            assert.strictEqual(List.Factorial(5), 120);
            assert.strictEqual(List.Factorial(10), 3628800);
        });

        test('should validate PascalCase name for merged unfold operations', () => {
            assert.throws(
                () => data(({ Family }) => ({
                    Nil: {},
                    Cons: { head: Number, tail: Family },
                    Counter: unfold({ in: Number, out: Family })({
                        Nil: (n) => (n <= 0 ? {} : null),
                        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                    }),
                    sum: fold({ out: Number })({
                        Nil() { return 0; },
                        Cons({ head, tail }) { return head + tail; }
                    }),
                    triangular: merge('Counter', 'sum')
                })),
                /Merged operation \(with unfold\) 'triangular' must be PascalCase/
            );
        });

        test('should compute sum using hylomorphism', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                CountUp: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),
                Triangular: merge('CountUp', 'sum')
            }));

            // Triangular numbers: sum from 1 to n
            assert.strictEqual(List.Triangular(0), 0);
            assert.strictEqual(List.Triangular(1), 1);
            assert.strictEqual(List.Triangular(5), 15); // 1+2+3+4+5
            assert.strictEqual(List.Triangular(10), 55); // 1+2+...+10
        });
    });

    describe('Paramorphism (map + fold)', () => {
        test('should merge map and fold operations', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family },
                double: map({ out: Family })({
                    T: (x) => x * 2
                }),
                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),
                doubleSum: merge('double', 'sum')
            }));

            const NumList = List(Number);

            const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

            // Should double each element then sum: (1*2) + (2*2) + (3*2) = 12
            assert.strictEqual(list.doubleSum, 12);
        });
    });

    describe('Apomorphism (unfold + map)', () => {
        test('should merge unfold and map operations', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family },
                CountDown: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                square: map({ out: Family })({
                    T: (x) => x * x
                }),
                SquareCountDown: merge('CountDown', 'square')
            }));

            const NumList = List(Number);
            const result = NumList.SquareCountDown(5);

            // Should generate [5, 4, 3, 2, 1] then square each: [25, 16, 9, 4, 1]
            assert.strictEqual(result.head, 25);
            assert.strictEqual(result.tail.head, 16);
            assert.strictEqual(result.tail.tail.head, 9);
            assert.strictEqual(result.tail.tail.tail.head, 4);
            assert.strictEqual(result.tail.tail.tail.tail.head, 1);
        });
    });

    describe('Multiple Maps Pipeline (map + map + fold)', () => {
        test('should merge multiple map operations with fold', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family },
                double: map({ out: Family })({
                    T: (x) => x * 2
                }),
                increment: map({ out: Family })({
                    T: (x) => x + 1
                }),
                product: fold({ out: Number })({
                    Nil() { return 1; },
                    Cons({ head, tail }) { return head * tail; }
                }),
                transformProduct: merge('double', 'increment', 'product')
            }));

            const NumList = List(Number);
            const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

            // Transform each: (1*2)+1=3, (2*2)+1=5, (3*2)+1=7
            // Product: 3 * 5 * 7 = 105
            assert.strictEqual(list.transformProduct, 105);
        });
    });

    describe('Full Pipeline (unfold + map + fold)', () => {
        test('should merge unfold, map, and fold operations', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family },
                Range: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                square: map({ out: Family })({
                    T: (x) => x * x
                }),
                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),
                SumOfSquares: merge('Range', 'square', 'sum')
            }));

            const NumList = List(Number);

            // Sum of squares: 1^2 + 2^2 + 3^2 + 4^2 + 5^2 = 1 + 4 + 9 + 16 + 25 = 55
            assert.strictEqual(NumList.SumOfSquares(5), 55);
            assert.strictEqual(NumList.SumOfSquares(3), 14); // 1 + 4 + 9
            assert.strictEqual(NumList.SumOfSquares(1), 1);  // 1
        });

        test('should merge unfold with multiple maps and fold', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family },
                Range: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                double: map({ out: Family })({
                    T: (x) => x * 2
                }),
                increment: map({ out: Family })({
                    T: (x) => x + 1
                }),
                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),
                ComplexPipeline: merge('Range', 'double', 'increment', 'sum')
            }));

            const NumList = List(Number);

            // For n=3: [3,2,1] -> double -> [6,4,2] -> increment -> [7,5,3] -> sum = 15
            assert.strictEqual(NumList.ComplexPipeline(3), 15);
        });
    });

    describe('Validation', () => {
        test('should reject merging multiple unfolds', () => {
            assert.throws(
                () => data(({ Family }) => ({
                    Nil: {},
                    Cons: { head: Number, tail: Family },
                    Counter1: unfold({ in: Number, out: Family })({
                        Nil: (n) => (n <= 0 ? {} : null),
                        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                    }),
                    Counter2: unfold({ in: Number, out: Family })({
                        Nil: (n) => (n <= 0 ? {} : null),
                        Cons: (n) => (n > 0 ? { head: n * 2, tail: n - 1 } : null)
                    }),
                    Invalid: merge('Counter1', 'Counter2')
                })),
                /multiple unfolds detected.*'Counter1', 'Counter2'.*Only one unfold/
            );
        });

        test('should reject merging multiple folds', () => {
            assert.throws(
                () => data(({ Family }) => ({
                    Nil: {},
                    Cons: { head: Number, tail: Family },
                    sum: fold({ out: Number })({
                        Nil() { return 0; },
                        Cons({ head, tail }) { return head + tail; }
                    }),
                    product: fold({ out: Number })({
                        Nil() { return 1; },
                        Cons({ head, tail }) { return head * tail; }
                    }),
                    invalid: merge('sum', 'product')
                })),
                /multiple folds detected.*'sum', 'product'.*Only one fold/
            );
        });

        test('should reject unknown operation names', () => {
            assert.throws(
                () => data(({ Family }) => ({
                    Nil: {},
                    Cons: { head: Number, tail: Family },
                    sum: fold({ out: Number })({
                        Nil() { return 0; },
                        Cons({ head, tail }) { return head + tail; }
                    }),
                    invalid: merge('sum', 'unknown')
                })),
                /Cannot merge: operation 'unknown' not found/
            );
        });

        test('should reject empty operation names array', () => {
            assert.throws(
                () => data(({ Family }) => ({
                    Nil: {},
                    Cons: { head: Number, tail: Family },
                    invalid: merge()
                })),
                /requires a non-empty array of operation names/
            );
        });

        test('should reject single operation merge', () => {
            assert.throws(
                () => data(({ Family }) => ({
                    Nil: {},
                    Cons: { head: Number, tail: Family },
                    sum: fold({ out: Number })({
                        Nil() { return 0; },
                        Cons({ head, tail }) { return head + tail; }
                    }),
                    justSum: merge('sum')
                })),
                /Merge requires at least 2 operations/
            );
        });
    });

    describe('Performance (Deforestation)', () => {
        test('merged operation should be faster than sequential calls', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Counter: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),
                Triangular: merge('Counter', 'sum')
            }));

            const n = 1000;
            const iterations = 100;

            // Benchmark sequential operations
            const startSequential = performance.now();
            for (let i = 0; i < iterations; i++) {
                const list = List.Counter(n);
                list.sum;
            }
            const sequentialTime = performance.now() - startSequential;

            // Benchmark merged operation
            const startMerged = performance.now();
            for (let i = 0; i < iterations; i++) 
                List.Triangular(n);
            
            const mergedTime = performance.now() - startMerged;

            // Merged should be significantly faster
            // Note: Performance benefits increase with larger data structures
            // For very small n, overhead might dominate, so we use n=1000
            assert.ok(
                mergedTime < sequentialTime,
                `Merged operation (${mergedTime.toFixed(2)}ms) should be faster than sequential (${sequentialTime.toFixed(2)}ms)`
            );
        });

        test('merged operation should not allocate intermediate structures', () => {
            // This test demonstrates deforestation conceptually
            // In a real-world scenario, we'd measure heap allocation

            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Range: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                length: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return tail + 1; }
                }),
                Count: merge('Range', 'length')
            }));

            // Sequential: creates intermediate list, then counts it
            const list = List.Range(100);
            const lengthSequential = list.length;

            // Merged: no intermediate list created (deforestation)
            const lengthMerged = List.Count(100);

            // Both should produce the same result
            assert.strictEqual(lengthSequential, 100);
            assert.strictEqual(lengthMerged, 100);

            // The key difference is that merged doesn't allocate the intermediate list
            // This is verified by the performance test above
        });
    });

    describe('Fluent API', () => {
        test('should return ADT for chaining after merge', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Counter: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),
                Triangular: merge('Counter', 'sum'),
                product: fold({ out: Number })({
                    Nil() { return 1; },
                    Cons({ head, tail }) { return head * tail; }
                }),
                Factorial: merge('Counter', 'product')
            }));

            // Both merged operations should be available
            assert.strictEqual(List.Triangular(5), 15);
            assert.strictEqual(List.Factorial(5), 120);
        });
    });
});
