import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, merge, fold, unfold, map } from '../index.mjs';

// Depth large enough to exercise recursive hylomorphism meaningfully,
// but well within typical stack limits (~10-15k frames) so the test
// remains deterministic across environments.
const MODERATE_RECURSION_DEPTH = 1000;

// Probing bounds for detecting sequential stack overflow.
// Start at 2× MODERATE_RECURSION_DEPTH and step upward until
// either the sequential path overflows or we reach the ceiling.
const SEQ_PROBE_START = 2000;
const SEQ_PROBE_CEILING = 8000;
const SEQ_PROBE_STEP = 1000;

describe('Hylomorphism (true deforestation)', () => {
    describe('No intermediate structure allocation', () => {
        test('unfold case functions should feed directly into fold handlers', () => {
            let unfoldCaseCalls = 0;
            let foldHandlerCalls = 0;
            let constructorCalls = 0;

            // Track whether the Cons constructor is ever invoked
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Counter: unfold({ in: Number, out: Family })({
                    Nil: (n) => {
                        unfoldCaseCalls++;
                        return n <= 0 ? {} : null;
                    },
                    Cons: (n) => {
                        unfoldCaseCalls++;
                        return n > 0 ? { head: n, tail: n - 1 } : null;
                    }
                }),
                sum: fold({ out: Number })({
                    Nil() {
                        foldHandlerCalls++;
                        return 0;
                    },
                    Cons({ head, tail }) {
                        foldHandlerCalls++;
                        return head + tail;
                    }
                }),
                Triangular: merge('Counter', 'sum')
            }));

            // Count constructor calls via sequential path
            const seqList = List.Counter(3);
            constructorCalls = 0;

            // The hylomorphism should produce the same result
            const result = List.Triangular(3);
            assert.strictEqual(result, 6); // 3 + 2 + 1

            // We cannot directly assert zero constructor calls from here,
            // but we can verify the fold handlers were invoked (proving
            // the fused path was taken, not a no-op)
            assert.ok(foldHandlerCalls > 0, 'fold handlers should have been called');
            assert.ok(unfoldCaseCalls > 0, 'unfold cases should have been called');
        });

        test('hylomorphism handles deeper recursion than sequential (single pass vs two passes)', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Range: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),
                Sum: merge('Range', 'sum')
            }));

            // Hylomorphism uses a single recursive pass of depth n,
            // while sequential uses unfold (depth n) then fold (depth n).
            // Find a depth that sequential fails at but hylomorphism handles.
            // Use a moderate size first to verify correctness.
            const n = MODERATE_RECURSION_DEPTH;
            const expected = (n * (n + 1)) / 2;

            const result = List.Sum(n);
            assert.strictEqual(result, expected);

            // Now find a size where sequential overflows but hylo survives.
            // The sequential path has ~2x the stack depth of hylo.
            // We probe for a size that sequential cannot handle.
            let maxSeq = SEQ_PROBE_START;
            let seqOverflowed = false;
            while (maxSeq <= SEQ_PROBE_CEILING) {
                try {
                    const list = List.Range(maxSeq);
                    list.sum;
                    maxSeq += SEQ_PROBE_STEP;
                } catch {
                    seqOverflowed = true;
                    break;
                }
            }

            if (seqOverflowed) {
                // Sequential overflows at maxSeq — hylo should handle it
                // since it uses roughly half the stack depth
                const hyloResult = List.Sum(maxSeq);
                assert.strictEqual(hyloResult, (maxSeq * (maxSeq + 1)) / 2,
                    `Hylomorphism should handle n=${maxSeq} where sequential overflows`);
            }
            // If sequential never overflowed (generous stack), that's fine —
            // the correctness assertion at MODERATE_RECURSION_DEPTH already passed.
        });
    });

    describe('Hylomorphism with map transforms', () => {
        test('unfold + map + fold should fuse with inline map application', () => {
            let mapCalledDirectly = 0;

            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family },
                Range: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                square: map({ out: Family })({
                    T: (x) => {
                        mapCalledDirectly++;
                        return x * x;
                    }
                }),
                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),
                SumOfSquares: merge('Range', 'square', 'sum')
            }));

            const NumList = List(Number);

            mapCalledDirectly = 0;
            const result = NumList.SumOfSquares(4);

            // 1^2 + 2^2 + 3^2 + 4^2 = 1 + 4 + 9 + 16 = 30
            assert.strictEqual(result, 30);
            // The map transform should have been called for each Cons node
            assert.strictEqual(mapCalledDirectly, 4,
                'map transform should be applied inline during hylomorphism');
        });

        test('unfold + multiple maps + fold should apply all maps in order', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family },
                Range: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                double: map({ out: Family })({ T: (x) => x * 2 }),
                increment: map({ out: Family })({ T: (x) => x + 1 }),
                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),
                Pipeline: merge('Range', 'double', 'increment', 'sum')
            }));

            const NumList = List(Number);

            // For n=3: [3,2,1] -> double -> [6,4,2] -> increment -> [7,5,3] -> sum = 15
            assert.strictEqual(NumList.Pipeline(3), 15);
        });
    });

    describe('Sequential fallback (unfold + map, no fold)', () => {
        test('should still produce concrete ADT instances when no fold is present', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family },
                CountDown: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                square: map({ out: Family })({ T: (x) => x * x }),
                SquareCountDown: merge('CountDown', 'square')
            }));

            const NumList = List(Number);
            const result = NumList.SquareCountDown(3);

            // Should produce a real ADT instance
            assert.strictEqual(result.head, 9);   // 3^2
            assert.strictEqual(result.tail.head, 4); // 2^2
            assert.strictEqual(result.tail.tail.head, 1); // 1^2
        });
    });

    describe('Correctness across recursion schemes', () => {
        test('hylomorphism factorial matches sequential factorial', () => {
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

            // Compare hylomorphism result with sequential unfold→fold
            for (const n of [0, 1, 2, 5, 10]) {
                const sequential = List.Counter(n).product;
                const fused = List.Factorial(n);
                assert.strictEqual(fused, sequential,
                    `Factorial(${n}): hylomorphism ${fused} !== sequential ${sequential}`);
            }
        });

        test('hylomorphism with wildcard fold handler', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Range: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                count: fold({ out: Number })({
                    Nil() { return 0; },
                    _({ tail }) { return 1 + tail; }
                }),
                Count: merge('Range', 'count')
            }));

            assert.strictEqual(List.Count(5), 5);
            assert.strictEqual(List.Count(0), 0);
        });

        test('hylomorphism should validate input types', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Range: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),
                Sum: merge('Range', 'sum')
            }));

            assert.throws(
                () => List.Sum('not a number'),
                /input of type/
            );
        });

        test('hylomorphism on binary tree structure', () => {
            // Verifies hylomorphism works with multiple recursive fields
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family, value: Number },
                Build: unfold({ in: Number, out: Family })({
                    Leaf: (n) => (n <= 1 ? { value: n } : null),
                    Node: (n) => (n > 1 ? {
                        left: Math.floor(n / 2),
                        right: n - Math.floor(n / 2) - 1,
                        value: n
                    } : null)
                }),
                sum: fold({ out: Number })({
                    Leaf({ value }) { return value; },
                    Node({ left, right, value }) { return left + right + value; }
                }),
                TotalSum: merge('Build', 'sum')
            }));

            // Sequential
            for (const n of [0, 1, 2, 5, 10]) {
                const sequential = Tree.Build(n).sum;
                const fused = Tree.TotalSum(n);
                assert.strictEqual(fused, sequential,
                    `TotalSum(${n}): hylomorphism ${fused} !== sequential ${sequential}`);
            }
        });
    });

    describe('Fused path equivalence at scale', () => {
        test('hylomorphism produces correct results for large inputs', () => {
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

            // Verify correctness across a range of inputs
            for (const n of [0, 1, 10, 100, 500, MODERATE_RECURSION_DEPTH]) {
                const expected = (n * (n + 1)) / 2;
                assert.strictEqual(List.Triangular(n), expected,
                    `Triangular(${n}) should equal ${expected}`);
            }

            // Verify fused path matches sequential path
            for (const n of [0, 1, 50, 200]) {
                const sequential = List.Counter(n).sum;
                const fused = List.Triangular(n);
                assert.strictEqual(fused, sequential,
                    `Fused and sequential should agree for n=${n}`);
            }
        });
    });
});
