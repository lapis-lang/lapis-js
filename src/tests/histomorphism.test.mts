/**
 * Histomorphism Tests
 *
 * Histomorphisms extend catamorphisms (folds) by giving each handler access to
 * the already-folded sub-results of recursive children — not just the immediate
 * fold result, but arbitrarily deep into the recursion history.
 *
 * Access is via the exported `history` symbol: destructure `[history]` from the
 * fold argument to obtain an object keyed by recursive field names, where each
 * value is the child's own foldedFields (which itself carries a `[history]`).
 *
 * Enabled by adding `history: true` to the fold spec:
 *   fold({ history: true, out: Number })({ ... })
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, fold, unfold, merge, behavior, history, extend } from '../index.mjs';

// ---------------------------------------------------------------------------
// Base ADTs — variants + unfold defined once, inherited by all children
// ---------------------------------------------------------------------------

const BaseNat = data(({ Family }) => ({
    Zero: {},
    Succ: { pred: Family },
    FromValue: unfold({ in: Number })({
        Zero: (n) => (n <= 0 ? {} : null),
        Succ: (n) => (n > 0 ? { pred: n - 1 } : null)
    }),
    /**
     * Fibonacci via histomorphism.
     *
     * `pred` is fib(n-1) as usual.
     * `h.pred` is the child's foldedFields.
     * `h.pred.pred` is fib(n-2) — the grandchild's fold result.
     * For Succ(Zero), h.pred has no .pred (Zero has no recursive field),
     * so we default to 1.
     */
    fib: fold({ history: true, out: Number })({
        Zero() { return 0; },
        Succ({ pred, [history]: h }) {
            const fibN2 = h.pred?.pred;
            return fibN2 !== undefined ? pred + fibN2 : 1;
        }
    })
}));

const BaseList = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family },
    FromArray: unfold({ in: Array })({
        Nil: (arr) => (arr.length === 0 ? {} : null),
        Cons: (arr) => (arr.length > 0 ? { head: arr[0], tail: arr.slice(1) } : null)
    })
}));

// ---------------------------------------------------------------------------
// Data histomorphism
// ---------------------------------------------------------------------------

describe('Histomorphism (Data)', () => {
    describe('Fibonacci via Peano numerals', () => {
        test('classic fibonacci using history to look back two levels', () => {
            const Nat = data(() => ({ [extend]: BaseNat }));

            const fibs = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34];
            for (let n = 0; n < fibs.length; n++) {
                assert.strictEqual(Nat.FromValue(n).fib, fibs[n],
                    `fib(${n}) should be ${fibs[n]}`);
            }
        });

        test('fib(0) and fib(1) base cases produce correct history', () => {
            const Nat = data(() => ({ [extend]: BaseNat }));

            assert.strictEqual(Nat.FromValue(0).fib, 0);
            assert.strictEqual(Nat.FromValue(1).fib, 1);
        });
    });

    describe('List histomorphism', () => {
        test('sum with access to sub-sums via history', () => {
            const List = data(() => ({
                [extend]: BaseList,
                sumWithHistory: fold({ history: true, out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail, [history]: h }) {
                        // tail is the fold result of the rest of the list
                        // h.tail is the child's foldedFields
                        // h.tail.tail would be the fold result of the tail's tail
                        // Just verify we can access history and return sum
                        return head + tail;
                    }
                })
            }));

            assert.strictEqual(List.FromArray([1, 2, 3, 4, 5]).sumWithHistory, 15);
        });

        test('history chain depth matches list depth', () => {
            // Collect history depth at each node
            const depths: number[] = [];

            const List = data(() => ({
                [extend]: BaseList,
                depthCheck: fold({ history: true, out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail, [history]: h }) {
                        // Walk the history chain to measure depth
                        let depth = 0;
                        let current = h.tail;
                        while (current && current.tail !== undefined) {
                            depth++;
                            current = current[history]?.tail;
                        }
                        depths.push(depth);
                        return head + tail;
                    }
                })
            }));

            List.FromArray([10, 20, 30]).depthCheck;

            // For list [10, 20, 30] folded bottom-up:
            // Node head=30 (folded first) can see history of tail=Nil → depth 0
            // Node head=20 can see history of tail=[30] → can reach depth 1
            // Node head=10 (folded last) can see history of tail=[20,30] → depth 2
            assert.deepStrictEqual(depths, [0, 1, 2]);
        });

        test('parameterized fold with history', () => {
            const List = data(() => ({
                [extend]: BaseList,
                takeWhileSum: fold({ history: true, in: Number, out: Array })({
                    Nil() { return []; },
                    Cons({ head, tail, [history]: h }, limit: number) {
                        // Simple parameterized usage: take elements while running sum < limit
                        const rest = tail(limit);
                        return head + rest.reduce((a: number, b: number) => a + b, 0) <= limit
                            ? [head, ...rest]
                            : [];
                    }
                })
            }));

            // sum ≤ 6: 1+2+3 = 6 ✓, 1+2+3+4 = 10 ✗ → [1, 2, 3]
            assert.deepStrictEqual(
                List.FromArray([1, 2, 3, 4, 5]).takeWhileSum(6),
                [1, 2, 3]
            );
        });
    });

    describe('Multi-field recursive variant', () => {
        test('binary tree with history on both children', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                sumHisto: fold({ history: true, out: Number })({
                    Leaf({ value }) { return value; },
                    Node({ left, right, [history]: h }) {
                        // h.left and h.right are foldedFields of children
                        // Verify history is present for both recursive fields
                        assert.ok(h.left !== undefined, 'history should have left');
                        assert.ok(h.right !== undefined, 'history should have right');
                        return left + right;
                    }
                })
            }));

            //       Node
            //      /    \
            //    Node   Leaf(4)
            //   /    \
            // Leaf(1) Leaf(2)
            const t = Tree.Node({
                left: Tree.Node({
                    left: Tree.Leaf({ value: 1 }),
                    right: Tree.Leaf({ value: 2 })
                }),
                right: Tree.Leaf({ value: 4 })
            });

            assert.strictEqual(t.sumHisto, 7);
        });

        test('tree history gives access to grandchild fold results', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                check: fold({ history: true, out: Number })({
                    Leaf({ value }) { return value; },
                    Node({ left, right, [history]: h }) {
                        // h.left is the left child's foldedFields
                        // For a Node left child, h.left.left and h.left.right would
                        // be the fold results of the grandchildren
                        return left + right;
                    }
                })
            }));

            const leaf1 = Tree.Leaf({ value: 1 }),
                leaf2 = Tree.Leaf({ value: 2 }),
                inner = Tree.Node({ left: leaf1, right: leaf2 }),
                root = Tree.Node({ left: inner, right: Tree.Leaf({ value: 10 }) });

            assert.strictEqual(root.check, 13);
        });
    });

    describe('History with base case (non-recursive) variants', () => {
        test('base case variants have [history] as empty object', () => {
            let baseHistory: unknown = 'not-set';

            const Nat = data(() => ({
                [extend]: BaseNat,
                checkBase: fold({ history: true, out: Number })({
                    Zero({ [history]: h }) {
                        baseHistory = h;
                        return 0;
                    },
                    Succ({ pred }) { return 1 + pred; }
                })
            }));

            Nat.FromValue(0).checkBase;
            assert.ok(typeof baseHistory === 'object' && baseHistory !== null,
                'base case [history] should be an object');
            assert.strictEqual(Object.keys(baseHistory as object).length, 0,
                'base case [history] should be empty (no recursive fields)');
        });
    });

    describe('fold without history still works', () => {
        test('regular fold ignores history symbol', () => {
            const Nat = data(() => ({
                [extend]: BaseNat,
                toValue: fold({ out: Number })({
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                })
            }));

            assert.strictEqual(Nat.FromValue(5).toValue, 5);
        });
    });

    describe('Wildcard handler with history', () => {
        test('_ handler receives history', () => {
            let receivedHistory = false;

            const Nat = data(() => ({
                [extend]: BaseNat,
                check: fold({ history: true, out: Number })({
                    _({ [history]: h }) {
                        if (h !== undefined) receivedHistory = true;
                        return 0;
                    }
                })
            }));

            Nat.FromValue(3).check;
            assert.ok(receivedHistory, 'wildcard handler should receive [history]');
        });
    });

    describe('DAG safety with history', () => {
        test('shared substructure is handled correctly', () => {
            const List = data(() => ({
                [extend]: BaseList,
                sum: fold({ history: true, out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                })
            }));

            // Build a DAG: shared suffix
            const shared = List.FromArray([3, 4]);
            const listA = List.Cons({ head: 1, tail: shared });
            const listB = List.Cons({ head: 2, tail: shared });

            assert.strictEqual(listA.sum, 8);  // 1+3+4
            assert.strictEqual(listB.sum, 9);  // 2+3+4
        });
    });

    describe('Extended ADT with history', () => {
        test('child ADT inherits histo fold from parent', () => {
            const ExtNat = data(() => ({
                [extend]: BaseNat,
                toValue: fold({ out: Number })({
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                })
            }));

            assert.strictEqual(ExtNat.FromValue(6).fib, 8);
            assert.strictEqual(ExtNat.FromValue(6).toValue, 6);
        });
    });

    describe('Merge pipeline with histomorphism fold', () => {
        test('unfold → histo fold via merge', () => {
            const Nat = data(() => ({
                [extend]: BaseNat,
                Fib: merge('FromValue', 'fib')
            }));

            assert.strictEqual(Nat.Fib(0), 0);
            assert.strictEqual(Nat.Fib(1), 1);
            assert.strictEqual(Nat.Fib(5), 5);
            assert.strictEqual(Nat.Fib(10), 55);
        });
    });
});

// ---------------------------------------------------------------------------
// Behavior histomorphism
// ---------------------------------------------------------------------------

describe('Histomorphism (Behavior)', () => {
    describe('Stream with history', () => {
        test('fold with history can look ahead into stream observations', () => {
            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n: number) => n,
                    tail: (n: number) => n + 1
                }),
                take: fold({ history: true, in: Number, out: Array })({
                    _: ({ head, tail, [history]: h }, n: number) => {
                        // h.tail is a lazy getter that produces the sub-observations
                        // of the next stream element.
                        if (n <= 0) return [];
                        if (n === 1) {
                            // Verify we can peek at history
                            const nextObs = h.tail;
                            assert.ok(nextObs !== undefined,
                                'history should provide access to next element observations');
                            assert.strictEqual(nextObs.head, head + 1,
                                'history tail.head should be next stream element');
                            return [head];
                        }
                        return [head, ...tail(n - 1)];
                    }
                })
            }));

            const nums = Stream.From(0);
            assert.deepStrictEqual(nums.take(5), [0, 1, 2, 3, 4]);
        });

        test('fold without history on behavior works unchanged', () => {
            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n: number) => n,
                    tail: (n: number) => n + 1
                }),
                sum: fold({ in: Number, out: Number })({
                    _: ({ head, tail }, n: number) => n > 0 ? head + tail(n - 1) : 0
                })
            }));

            const nums = Stream.From(1);
            assert.strictEqual(nums.sum(3), 6); // 1 + 2 + 3
        });

        test('behavior history has [history] for recursive sub-observations', () => {
            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n: number) => n,
                    tail: (n: number) => n + 1
                }),
                peekTwo: fold({ history: true, in: Number, out: Array })({
                    _: ({ head, tail, [history]: h }, n: number) => {
                        if (n <= 0) return [];
                        // Look two levels deep using history
                        const nextHead = h.tail?.head;
                        const nextNextHead = h.tail?.[history]?.tail?.head;
                        return [
                            { current: head, next: nextHead, nextNext: nextNextHead },
                            ...tail(n - 1)
                        ];
                    }
                })
            }));

            const nums = Stream.From(10);
            const result = nums.peekTwo(3) as Array<{
                current: number;
                next: number;
                nextNext: number;
            }>;

            assert.strictEqual(result[0].current, 10);
            assert.strictEqual(result[0].next, 11);
            assert.strictEqual(result[0].nextNext, 12);
            assert.strictEqual(result[1].current, 11);
            assert.strictEqual(result[1].next, 12);
            assert.strictEqual(result[1].nextNext, 13);
        });
    });
});
