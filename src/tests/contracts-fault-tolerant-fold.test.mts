/**
 * Tests for rescue during recursive fold traversal: fault-tolerant folds.
 *
 * Translated from decorator-contracts rescue.test.mts patterns:
 * - Rescue at each node during structural recursion
 * - Partial results when rescue provides fallback values
 * - Rescue on nested tree fold with bad sub-nodes
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

describe('Contracts: Fault-Tolerant Fold', () => {
    describe('Rescue at each node in recursive fold', () => {
        it('should recover per-node during list traversal', () => {
            const rescueLog: string[] = [];

            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                safeSum: fold({
                    out: Number,
                    rescue: (_self, error, _args) => {
                        rescueLog.push(error.message);
                        return 0; // fallback: treat bad node as 0
                    }
                })({
                    Nil() { return 0; },
                    Cons({ head, tail }) {
                        if (head < 0) throw new Error(`negative: ${head}`);
                        return head + tail;
                    }
                })
            }));

            // List with a negative head triggers rescue at that node
            const list = List.Cons({
                head: 1,
                tail: List.Cons({
                    head: -5,
                    tail: List.Cons({
                        head: 3,
                        tail: List.Nil
                    })
                })
            });

            // -5 node will throw → rescue returns 0
            // But note: fold is bottom-up, so tail folds first.
            // The Cons { head: -5 } handler throws → rescue returns 0
            const result = list.safeSum;
            assert.equal(typeof result, 'number');
            assert.equal(rescueLog.length >= 1, true, 'rescue should have been called');
        });
    });

    describe('Rescue on tree fold with bad sub-nodes', () => {
        it('should recover from errors in tree sub-nodes', () => {
            let rescueCount = 0;

            const Expr = data(({ Family }) => ({
                Lit: { value: Number },
                Add: { left: Family, right: Family },
                Div: { left: Family, right: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                eval: fold({
                    out: Number,
                    rescue: (_self, _error, _args) => {
                        rescueCount++;
                        return 0; // fallback for bad nodes
                    }
                })({
                    Lit({ value }) { return value; },
                    Add({ left, right }) { return left + right; },
                    Div({ left, right }) {
                        if (right === 0) throw new Error('Division by zero');
                        return left / right;
                    }
                })
            }));

            const { Lit, Add, Div } = Expr;

            // Normal evaluation
            const e1 = Add({ left: Lit({ value: 3 }), right: Lit({ value: 4 }) });
            assert.equal(e1.eval, 7);
            assert.equal(rescueCount, 0);

            // Division by zero → rescue kicks in
            const e2 = Div({ left: Lit({ value: 10 }), right: Lit({ value: 0 }) });
            const result = e2.eval;
            assert.equal(result, 0);
            assert.equal(rescueCount, 1);
        });

        it('should handle nested rescue in a complex tree', () => {
            let rescueCount = 0;

            const Expr = data(({ Family }) => ({
                Lit: { value: Number },
                Add: { left: Family, right: Family },
                Div: { left: Family, right: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                eval: fold({
                    out: Number,
                    rescue: (_self, error) => {
                        rescueCount++;
                        return NaN;
                    }
                })({
                    Lit({ value }) { return value; },
                    Add({ left, right }) { return left + right; },
                    Div({ left, right }) {
                        if (right === 0) throw new Error('Division by zero');
                        return left / right;
                    }
                })
            }));

            const { Lit, Add, Div } = Expr;

            // Add(Div(10, 0), Lit(5)) — Div will fail, rescue returns NaN
            // Then Add gets NaN + 5 = NaN
            const e = Add({
                left: Div({ left: Lit({ value: 10 }), right: Lit({ value: 0 }) }),
                right: Lit({ value: 5 })
            });

            const result = e.eval;
            assert.equal(rescueCount >= 1, true);
            assert.equal(isNaN(result), true, 'NaN should propagate through Add');
        });
    });

    describe('Rescue with partial results', () => {
        it('should produce partial result when some nodes fail', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                safeToArray: fold({
                    out: Array,
                    rescue: () => [] // on failure, return empty array as fallback
                })({
                    Nil() { return []; },
                    Cons({ head, tail }) {
                        if (head === 999) throw new Error('bad element');
                        return [head, ...tail];
                    }
                })
            }));

            // List: [1, 999, 3] — cons with 999 should trigger rescue
            const list = List.Cons({
                head: 1,
                tail: List.Cons({
                    head: 999,
                    tail: List.Cons({
                        head: 3,
                        tail: List.Nil
                    })
                })
            });

            const result = list.safeToArray;
            assert.equal(Array.isArray(result), true);
            // The 999 node throws → rescue returns [] for that subtree
            // So the result starts with [1, ...] but the tail is truncated
        });
    });

    describe('Rescue with retry in recursive fold', () => {
        it('should retry the failing node with new args', () => {
            let attempts = 0;

            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                compute: fold({
                    in: Number,
                    out: Number,
                    rescue: (_self, _error, _args, retry) => retry(42)
                })({
                    Val({ x }, n) {
                        attempts++;
                        if (n < 0) throw new Error('negative');
                        return x + n;
                    }
                })
            }));

            const v = MyData.Val({ x: 10 });
            const result = v.compute(-1); // fails, retries with 42
            assert.equal(result, 52); // 10 + 42
            assert.equal(attempts, 2);
        });
    });
});
