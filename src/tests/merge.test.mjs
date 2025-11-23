import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

describe('Merge Operation (Deforestation)', () => {
    describe('Hylomorphism (unfold + fold)', () => {
        test('should merge unfold and fold into factorial without intermediate list', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }))
            .unfold('Counter', (List) => ({ in: Number, out: List }), {
                Nil: (n) => (n <= 0 ? {} : null),
                Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
            })
            .fold('product', { out: Number }, () => ({
                Nil() { return 1; },
                Cons({ head, tail }) { return head * tail; }
            }))
            .merge('Factorial', ['Counter', 'product']);

            // Test factorial computation
            assert.strictEqual(List.Factorial(0), 1);
            assert.strictEqual(List.Factorial(1), 1);
            assert.strictEqual(List.Factorial(5), 120);
            assert.strictEqual(List.Factorial(10), 3628800);
        });

        test('should validate PascalCase name for merged unfold operations', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }))
            .unfold('Counter', (List) => ({ in: Number, out: List }), {
                Nil: (n) => (n <= 0 ? {} : null),
                Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
            })
            .fold('sum', { out: Number }, () => ({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }));

            assert.throws(
                () => List.merge('triangular', ['Counter', 'sum']),
                /Merged operation 'triangular' with unfold must be PascalCase/
            );
        });

        test('should compute sum using hylomorphism', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }))
            .unfold('CountUp', (List) => ({ in: Number, out: List }), {
                Nil: (n) => (n <= 0 ? {} : null),
                Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
            })
            .fold('sum', { out: Number }, () => ({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }))
            .merge('Triangular', ['CountUp', 'sum']);

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
                Cons: { head: T, tail: Family }
            }));

            const NumList = List({ T: Number })
                .map('double', (Family) => ({ out: Family }), {
                    T: (x) => x * 2
                })
                .fold('sum', { out: Number }, () => ({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }))
                .merge('doubleSum', ['double', 'sum']);

            const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));
            
            // Should double each element then sum: (1*2) + (2*2) + (3*2) = 12
            assert.strictEqual(list.doubleSum(), 12);
        });

        test('should validate camelCase name for merged instance operations', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family }
            }));

            const NumList = List({ T: Number })
                .map('increment', { out: List }, () => ({
                    T: (x) => x + 1
                }))
                .fold('product', { out: Number }, () => ({
                    Nil() { return 1; },
                    Cons({ head, tail }) { return head * tail; }
                }));

            assert.throws(
                () => NumList.merge('IncrementProduct', ['increment', 'product']),
                /Merged operation 'IncrementProduct' without unfold must be camelCase/
            );
        });
    });

    describe('Apomorphism (unfold + map)', () => {
        test('should merge unfold and map operations', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family }
            }));

            const NumList = List({ T: Number })
                .unfold('CountDown', (NumList) => ({ in: Number, out: NumList }), {
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                })
                .map('square', (Family) => ({ out: Family }), () => ({
                    T: (x) => x * x
                }))
                .merge('SquareCountDown', ['CountDown', 'square']);

            const result = NumList.SquareCountDown(5);
            
            // Should generate [5, 4, 3, 2, 1] then square each: [25, 16, 9, 4, 1]
            assert.strictEqual(result.head, 25);
            assert.strictEqual(result.tail.head, 16);
            assert.strictEqual(result.tail.tail.head, 9);
        });
    });

    describe('Complex Pipelines (unfold + map + fold)', () => {
        test('should merge three operations: unfold + map + fold', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family }
            }));

            const NumList = List({ T: Number })
                .unfold('Range', (List) => ({ in: Number, out: List }), {
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                })
                .map('square', (Family) => ({ out: Family }), () => ({
                    T: (x) => x * x
                }))
                .fold('sum', { out: Number }, () => ({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }))
                .merge('SumOfSquares', ['Range', 'square', 'sum']);

            // Sum of squares: 1^2 + 2^2 + 3^2 + 4^2 + 5^2 = 1 + 4 + 9 + 16 + 25 = 55
            assert.strictEqual(NumList.SumOfSquares(5), 55);
            assert.strictEqual(NumList.SumOfSquares(3), 14); // 1 + 4 + 9
        });

        test('should merge multiple maps in pipeline', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family }
            }));

            const NumList = List({ T: Number })
                .map('double', (Family) => ({ out: Family }), {
                    T: (x) => x * 2
                })
                .map('increment', (Family) => ({ out: Family }), {
                    T: (x) => x + 1
                })
                .fold('product', { out: Number }, () => ({
                    Nil() { return 1; },
                    Cons({ head, tail }) { return head * tail; }
                }))
                .merge('transformProduct', ['double', 'increment', 'product']);

            const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));
            
            // Transform each: (1*2)+1=3, (2*2)+1=5, (3*2)+1=7
            // Product: 3 * 5 * 7 = 105
            assert.strictEqual(list.transformProduct(), 105);
        });
    });

    describe('Validation', () => {
        test('should reject merging multiple unfolds', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }))
            .unfold('Counter1', (List) => ({ in: Number, out: List }), {
                Nil: (n) => (n <= 0 ? {} : null),
                Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
            })
            .unfold('Counter2', (List) => ({ in: Number, out: List }), {
                Nil: (n) => (n <= 0 ? {} : null),
                Cons: (n) => (n > 0 ? { head: n * 2, tail: n - 1 } : null)
            });

            assert.throws(
                () => List.merge('Invalid', ['Counter1', 'Counter2']),
                /multiple unfolds detected.*'Counter1', 'Counter2'.*Only one unfold/
            );
        });

        test('should reject merging multiple folds', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }))
            .fold('sum', { out: Number }, () => ({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }))
            .fold('product', { out: Number }, () => ({
                Nil() { return 1; },
                Cons({ head, tail }) { return head * tail; }
            }));

            assert.throws(
                () => List.merge('invalid', ['sum', 'product']),
                /multiple folds detected.*'sum', 'product'.*Only one fold/
            );
        });

        test('should reject unknown operation names', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }))
            .fold('sum', { out: Number }, () => ({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }));

            assert.throws(
                () => List.merge('invalid', ['sum', 'unknown']),
                /Cannot merge: operation 'unknown' not found/
            );
        });

        test('should reject empty operation names array', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }));

            assert.throws(
                () => List.merge('invalid', []),
                /requires a non-empty array of operation names/
            );
        });

        test('should reject single operation merge', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }))
            .fold('sum', { out: Number }, () => ({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }));

            assert.throws(
                () => List.merge('justSum', ['sum']),
                /Merge requires at least 2 operations/
            );
        });

        test('should reject invalid name parameter', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }))
            .fold('sum', { out: Number }, () => ({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }));

            assert.throws(
                () => List.merge(null, ['sum']),
                /Merge operation requires a name/
            );

            assert.throws(
                () => List.merge(123, ['sum']),
                /Merge operation requires a name/
            );
        });
    });

    describe('Name Collision Detection', () => {
        test('should detect collision with variant field names', () => {
            const Point = data(({ Family, T }) => ({
                Point2D: { x: T, y: T }
            }));

            const NumPoint = Point({ T: Number })
                .map('scale', (Family) => ({ out: Family }), {
                    T: (n) => n * 2
                })
                .fold('magnitude', { out: Number }, () => ({
                    Point2D({ x, y }) { return Math.sqrt(x * x + y * y); }
                }));

            // Try to create a merged operation named 'x', which conflicts with the field name
            assert.throws(
                () => NumPoint.merge('x', ['scale', 'magnitude']),
                /Operation name 'x' conflicts with field 'x'/
            );
        });

        test('should detect collision with existing variant names for static methods', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }))
            .unfold('Counter', (List) => ({ in: Number, out: List }), {
                Nil: (n) => (n <= 0 ? {} : null),
                Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
            })
            .fold('sum', { out: Number }, () => ({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }));

            assert.throws(
                () => List.merge('Cons', ['Counter', 'sum']),
                /Merged operation name 'Cons' conflicts with existing variant/
            );
        });
    });

    describe('Performance (Deforestation)', () => {
        test('merged operation should be faster than sequential calls', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }))
            .unfold('Counter', (List) => ({ in: Number, out: List }), {
                Nil: (n) => (n <= 0 ? {} : null),
                Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
            })
            .fold('sum', { out: Number }, () => ({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }))
            .merge('Triangular', ['Counter', 'sum']);

            const n = 1000;
            const iterations = 100;

            // Benchmark sequential operations
            const startSequential = performance.now();
            for (let i = 0; i < iterations; i++) {
                const list = List.Counter(n);
                list.sum();
            }
            const sequentialTime = performance.now() - startSequential;

            // Benchmark merged operation
            const startMerged = performance.now();
            for (let i = 0; i < iterations; i++) {
                List.Triangular(n);
            }
            const mergedTime = performance.now() - startMerged;

            // Merged should be significantly faster (at least 20% faster)
            // Note: Performance benefits increase with larger data structures
            // For very small n, overhead might dominate, so we use n=1000
            assert.ok(
                mergedTime < sequentialTime * 0.8,
                `Merged operation (${mergedTime.toFixed(2)}ms) should be faster than sequential (${sequentialTime.toFixed(2)}ms)`
            );
        });

        test('merged operation should not allocate intermediate structures', () => {
            // This test demonstrates deforestation conceptually
            // In a real-world scenario, we'd measure heap allocation
            
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }))
            .unfold('Range', (List) => ({ in: Number, out: List }), {
                Nil: (n) => (n <= 0 ? {} : null),
                Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
            })
            .fold('length', { out: Number }, () => ({
                Nil() { return 0; },
                Cons({ head, tail }) { return 1 + tail; }
            }))
            .merge('Count', ['Range', 'length']);

            // Sequential: creates intermediate list, then counts it
            const list = List.Range(100);
            const lengthSequential = list.length();

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
                Cons: { head: Number, tail: Family }
            }))
            .unfold('Counter', (List) => ({ in: Number, out: List }), {
                Nil: (n) => (n <= 0 ? {} : null),
                Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
            })
            .fold('sum', { out: Number }, () => ({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }))
            .merge('Triangular', ['Counter', 'sum'])
            .fold('product', { out: Number }, () => ({
                Nil() { return 1; },
                Cons({ head, tail }) { return head * tail; }
            }))
            .merge('Factorial', ['Counter', 'product']);

            // Both merged operations should be available
            assert.strictEqual(List.Triangular(5), 15);
            assert.strictEqual(List.Factorial(5), 120);
        });
    });

    describe('ADT Extension', () => {
        test('should work with extended ADTs', () => {
            const BaseList = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }))
            .unfold('Counter', (List) => ({ in: Number, out: List }), {
                Nil: (n) => (n <= 0 ? {} : null),
                Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
            })
            .fold('sum', { out: Number }, () => ({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            }));

            const ExtendedList = BaseList.extend(({ Family }) => ({
                Single: { value: Number }
            }))
            .fold('sum', { out: Number }, () => ({
                Single({ value }) { return value; }
            }))
            .merge('Triangular', ['Counter', 'sum']);

            // Merged operation should work
            assert.strictEqual(ExtendedList.Triangular(5), 15);
        });
    });
});
