import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

// Moderate depth for exercising recursive merge pipelines.
// Well within typical stack limits (~10-15k frames) so the test
// remains deterministic across environments.
const MODERATE_RECURSION_DEPTH = 1000;

describe('Merge pipeline (unfold + fold)', () => {
    describe('Basic unfold → fold merge', () => {
        test('unfold + fold produces correct result', () => {
            let unfoldCaseCalls = 0;
            let foldHandlerCalls = 0;

            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
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

            const result = List.Triangular(3);
            assert.strictEqual(result, 6); // 3 + 2 + 1

            // n=3 produces Nil,Cons,Cons,Cons → 4 unfold case probes per seed
            // (each seed tries Nil then Cons, or vice versa, until one matches)
            // and 4 fold handler calls (one per constructed node: 3 Cons + 1 Nil)
            assert.strictEqual(foldHandlerCalls, 4,
                'fold should be called once per node (3 Cons + 1 Nil)');
            assert.ok(unfoldCaseCalls >= 4,
                'unfold cases should be probed for each seed value');
        });

        test('merge matches manual unfold → fold at moderate depth', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
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

            const n = MODERATE_RECURSION_DEPTH;
            const expected = (n * (n + 1)) / 2;

            assert.strictEqual(List.Sum(n), expected);
            assert.strictEqual(List.Sum(n), List.Range(n).sum,
                'merge result should match manual unfold → fold');
        });
    });

    describe('Unfold → map → fold merge', () => {
        test('unfold + map + fold applies map transforms correctly', () => {
            let mapCallCount = 0;

            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family, T }) => ({
                Range: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                square: map({ out: Family })({
                    T: (x) => {
                        mapCallCount++;
                        return x * x;
                    }
                }),
                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),
                SumOfSquares: merge('Range', 'square', 'sum')
            }));

            const NumList = List({ T: Number });

            mapCallCount = 0;
            const result = NumList.SumOfSquares(4);

            // 1² + 2² + 3² + 4² = 1 + 4 + 9 + 16 = 30
            assert.strictEqual(result, 30);
            assert.strictEqual(mapCallCount, 4,
                'map transform should be applied for each element');
        });

        test('unfold + multiple maps + fold applies maps in order', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family, T }) => ({
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

            const NumList = List({ T: Number });

            // n=3: [3,2,1] → double → [6,4,2] → increment → [7,5,3] → sum = 15
            assert.strictEqual(NumList.Pipeline(3), 15);
        });
    });

    describe('Unfold + map (no fold)', () => {
        test('produces concrete ADT instances when no fold is present', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family, T }) => ({
                CountDown: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                square: map({ out: Family })({ T: (x) => x * x }),
                SquareCountDown: merge('CountDown', 'square')
            }));

            const NumList = List({ T: Number });
            const result = NumList.SquareCountDown(3);

            assert.strictEqual(result.head, 9);        // 3²
            assert.strictEqual(result.tail.head, 4);    // 2²
            assert.strictEqual(result.tail.tail.head, 1); // 1²
        });
    });

    describe('Correctness across patterns', () => {
        test('merge factorial matches sequential factorial', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
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

            for (const n of [0, 1, 2, 5, 10]) {
                const sequential = List.Counter(n).product;
                const merged = List.Factorial(n);
                assert.strictEqual(merged, sequential,
                    `Factorial(${n}): merged ${merged} !== sequential ${sequential}`);
            }
        });

        test('wildcard fold handler works in merge', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
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

        test('merge validates unfold input types', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
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
                // @ts-expect-error -- intentional type error test
                () => List.Sum('not a number'),
                /input of type/
            );
        });

        test('merge on binary tree structure', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family, value: Number }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
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

            for (const n of [0, 1, 2, 5, 10]) {
                const sequential = Tree.Build(n).sum;
                const merged = Tree.TotalSum(n);
                assert.strictEqual(merged, sequential,
                    `TotalSum(${n}): merged ${merged} !== sequential ${sequential}`);
            }
        });
    });

    describe('Fold this-context preserved through merge', () => {
        test('fold handler can access this.constructor.name via merge', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {}
            })).ops(({ fold, unfold, map, merge }) => ({
                name: fold({ out: String })({
                    Red() { return 'red'; },
                    _() { return this.constructor.name.toLowerCase(); }
                })
            }));

            assert.strictEqual(Color.Green.name, 'green');
            assert.strictEqual(Color.Blue.name, 'blue');
        });

        test('fold handler can access other operations via this in merge', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                Range: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                length: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                }),
                describe: fold({ out: String })({
                    Nil() { return 'empty list'; },
                    Cons({ head }) {
                        return `list starting with ${head}, length ${this.length}`;
                    }
                }),
                Describe: merge('Range', 'describe')
            }));

            assert.strictEqual(
                List.Describe(2),
                'list starting with 2, length 2'
            );
        });

        test('fold handler has correct instanceof in merge', () => {
            // Store in a container to break the TS7022 circular reference
            // while the fold handlers capture `ref` by closure.
            const ref: { List: unknown } = { List: null };
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                Range: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                isListInstance: fold({ out: Boolean })({

                    Nil() { return this instanceof (ref.List as abstract new (...args: never) => unknown); },

                    Cons() { return this instanceof (ref.List as abstract new (...args: never) => unknown); }
                }),
                CheckInstance: merge('Range', 'isListInstance')
            }));
            ref.List = List;

            assert.strictEqual(List.CheckInstance(3), true);
            assert.strictEqual(List.CheckInstance(0), true);
        });
    });

    describe('Correctness at scale', () => {
        test('merge produces correct results for large inputs', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
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

            for (const n of [0, 1, 10, 100, 500, MODERATE_RECURSION_DEPTH]) {
                const expected = (n * (n + 1)) / 2;
                assert.strictEqual(List.Triangular(n), expected,
                    `Triangular(${n}) should equal ${expected}`);
            }

            for (const n of [0, 1, 50, 200]) {
                const sequential = List.Counter(n).sum;
                const merged = List.Triangular(n);
                assert.strictEqual(merged, sequential,
                    `Merged and sequential should agree for n=${n}`);
            }
        });
    });
});
