/**
 * Tests for behavioral LSP enforcement with [extend] hierarchies.
 *
 * patterns:
 * - Demands cannot be strengthened (OR → weaken only)
 * - Postconditions cannot be weakened (AND → strengthen only)
 * - Subclass invariant AND composition with ancestors
 * - Combined demands+ensures+rescue+invariant error pathways
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, extend, fold, invariant, DemandsError, EnsuresError } from '../index.mjs';

describe('Contracts: Extend + LSP', () => {
    describe('Demands range weakening (OR semantics)', () => {
        // From decorator-contracts demands.test.mts:
        // Parent demands: 10 <= value <= 30
        // Weaker child: 1 <= value <= 50 (accepts more — valid)
        // Stronger child: 15 <= value <= 20 (combined via OR still accepts parent range)

        it('should accept values in parent range', () => {
            const Base = data(() => ({
                Val: { x: Number },
                check: fold({
                    in: Number,
                    out: Number,
                    demands: (_self, value) => 10 <= value && value <= 30
                })({
                    Val(_ctx, value) { return value; }
                })
            }));

            const v = Base.Val({ x: 1 });
            assert.equal(v.check(15), 15);
            assert.throws(() => v.check(5), (err) => err instanceof DemandsError);
            assert.throws(() => v.check(35), (err) => err instanceof DemandsError);
        });

        it('weaker child demands should accept wider range via OR', () => {
            const Base = data(() => ({
                Val: { x: Number },
                check: fold({
                    in: Number,
                    out: Number,
                    demands: (_self, value) => 10 <= value && value <= 30
                })({
                    Val(_ctx, value) { return value; }
                })
            }));

            const Weaker = data(() => ({
                [extend]: Base,
                check: fold({
                    in: Number,
                    demands: (_self, value) => 1 <= value && value <= 50
                })({
                    Val(_ctx, value) { return value; }
                })
            }));

            const v = Weaker.Val({ x: 1 });
            // In-range of parent
            assert.equal(v.check(15), 15);
            // Outside parent range but inside child range (OR: either passes)
            assert.equal(v.check(5), 5);
            assert.equal(v.check(35), 35);
            // Outside both ranges
            assert.throws(() => v.check(0), (err) => err instanceof DemandsError);
            assert.throws(() => v.check(60), (err) => err instanceof DemandsError);
        });

        it('stronger child demands should still accept parent range via OR', () => {
            const Base = data(() => ({
                Val: { x: Number },
                check: fold({
                    in: Number,
                    out: Number,
                    demands: (_self, value) => 10 <= value && value <= 30
                })({
                    Val(_ctx, value) { return value; }
                })
            }));

            const Stronger = data(() => ({
                [extend]: Base,
                check: fold({
                    in: Number,
                    demands: (_self, value) => 15 <= value && value <= 20
                })({
                    Val(_ctx, value) { return value; }
                })
            }));

            const v = Stronger.Val({ x: 1 });
            // In both ranges
            assert.equal(v.check(15), 15);
            // In parent range only (OR: parent passes)
            assert.equal(v.check(25), 25);
            // Outside both ranges
            assert.throws(() => v.check(5), (err) => err instanceof DemandsError);
            assert.throws(() => v.check(35), (err) => err instanceof DemandsError);
        });
    });

    describe('Ensures range strengthening (AND semantics)', () => {
        // From decorator-contracts ensures.test.mts:
        // Parent ensures: 10 <= result <= 30
        // Weaker child: 1 <= result <= 50 (AND with parent = still parent range)
        // Stronger child: 15 <= result <= 20 (AND = narrower)

        it('should enforce parent ensures range', () => {
            const Base = data(() => ({
                Val: { x: Number },
                check: fold({
                    in: Number,
                    out: Number,
                    ensures: (_self, _old, result) => 10 <= result && result <= 30
                })({
                    Val(_ctx, value) { return value; }
                })
            }));

            const v = Base.Val({ x: 1 });
            assert.equal(v.check(15), 15);
            assert.equal(v.check(25), 25);
            assert.throws(() => v.check(5), (err) => err instanceof EnsuresError);
            assert.throws(() => v.check(35), (err) => err instanceof EnsuresError);
        });

        it('weaker child ensures should not weaken parent (AND)', () => {
            const Base = data(() => ({
                Val: { x: Number },
                check: fold({
                    in: Number,
                    out: Number,
                    ensures: (_self, _old, result) => 10 <= result && result <= 30
                })({
                    Val(_ctx, value) { return value; }
                })
            }));

            const Weaker = data(() => ({
                [extend]: Base,
                check: fold({
                    in: Number,
                    ensures: (_self, _old, result) => 1 <= result && result <= 50
                })({
                    Val(_ctx, value) { return value; }
                })
            }));

            const v = Weaker.Val({ x: 1 });
            // In both ranges
            assert.equal(v.check(15), 15);
            assert.equal(v.check(25), 25);
            // In child range but NOT in parent range (AND: parent fails)
            assert.throws(() => v.check(5), (err) => err instanceof EnsuresError);
            assert.throws(() => v.check(35), (err) => err instanceof EnsuresError);
        });

        it('stronger child ensures should narrow the valid range (AND)', () => {
            const Base = data(() => ({
                Val: { x: Number },
                check: fold({
                    in: Number,
                    out: Number,
                    ensures: (_self, _old, result) => 10 <= result && result <= 30
                })({
                    Val(_ctx, value) { return value; }
                })
            }));

            const Stronger = data(() => ({
                [extend]: Base,
                check: fold({
                    in: Number,
                    ensures: (_self, _old, result) => 15 <= result && result <= 20
                })({
                    Val(_ctx, value) { return value; }
                })
            }));

            const v = Stronger.Val({ x: 1 });
            // In both ranges
            assert.equal(v.check(15), 15);
            assert.equal(v.check(20), 20);
            // In parent range but NOT in child range (AND: child fails)
            assert.throws(() => v.check(25), (err) => err instanceof EnsuresError);
            // Outside both
            assert.throws(() => v.check(5), (err) => err instanceof EnsuresError);
            assert.throws(() => v.check(35), (err) => err instanceof EnsuresError);
        });
    });

    describe('Overridden features inherit parent contracts', () => {
        // From decorator-contracts demands/ensures.test.mts:
        // Overridden features are still subject to the parent's contracts
        it('should enforce parent demands on overridden child operation', () => {
            const Base = data(() => ({
                Val: { x: Number },
                check: fold({
                    in: Number,
                    out: Number,
                    demands: (_self, n) => n >= 0
                })({
                    Val(_ctx, n) { return n; }
                })
            }));

            const Sub = data(() => ({
                [extend]: Base,
                // Override handler but no new demands — inherits parent demands
                check: fold({
                    in: Number
                })({
                    Val(_ctx, n) { return n * 2; }
                })
            }));

            const v = Sub.Val({ x: 1 });
            // Positive: parent demand passes
            assert.equal(v.check(5), 10);
            // Negative: parent demand fails (inherited via OR, but only parent exists)
            assert.throws(() => v.check(-1), (err) => err instanceof DemandsError);
        });
    });

    describe('Combined contracts error pathway', () => {
        // From decorator-contracts rescue.test.mts:
        // demands fail → error raised (no rescue)
        // ensures fail → rescue invoked
        // body throws → rescue invoked
        // invariant violated after rescue → InvariantError
        it('should follow correct error pathway: demands → body → ensures → rescue', () => {
            const results: string[] = [];

            const Base = data(() => ({
                Val: { x: Number },
                op: fold({
                    in: Number,
                    out: Number,
                    demands: (_self, n) => n >= 0,
                    ensures: (_self, _old, result) => result >= 0,
                    rescue: (_self, error, _args) => {
                        results.push(`rescue:${error.name}`);
                        return 0;
                    }
                })({
                    Val({ x }, n) {
                        results.push('body');
                        if (n === 999) throw new Error('body error');
                        return x + n;
                    }
                })
            }));

            const v = Base.Val({ x: 5 });

            // Path 1: demands pass, body succeeds, ensures passes
            results.length = 0;
            assert.equal(v.op(10), 15);
            assert.deepEqual(results, ['body']);

            // Path 2: demands fails → DemandsError, body never runs
            results.length = 0;
            assert.throws(() => v.op(-1), (err) => err instanceof DemandsError);
            assert.deepEqual(results, [], 'body should not run when demands fails');

            // Path 3: body throws → rescue invoked
            results.length = 0;
            assert.equal(v.op(999), 0);
            assert.deepEqual(results, ['body', 'rescue:Error']);

            // Path 4: body returns negative (ensures fails) → rescue invoked
            const v2 = Base.Val({ x: -100 });
            results.length = 0;
            assert.equal(v2.op(1), 0); // -100 + 1 = -99, ensures fails, rescue returns 0
            assert.deepEqual(results, ['body', 'rescue:EnsuresError']);
        });
    });

    describe('Integrated Stack with demands + ensures', () => {
        // From decorator-contracts Stack.test.mts
        it('should enforce demands on pop (non-empty) and ensures on append (size+1)', () => {
            const Stack = data(({ Family }) => ({
                Empty: {},
                Push: { value: Number, rest: Family },
                size: fold({ out: Number })({
                    Empty() { return 0; },
                    Push({ rest }) { return 1 + rest; }
                }),
                // pop uses demands to prevent calling on Empty
                // Since fold traverses recursively, demands is checked per-node.
                // We only set demands on a parameterized fold to test top-level demand.
                pop: fold({
                    out: Array
                })({
                    Empty() { return [null, null]; },
                    Push() { return [this.value, this.rest]; }
                }),
                // safePop: parameterized to demonstrate demands at call-site
                safePop: fold({
                    in: Boolean,
                    out: Array,
                    demands: (self) => self.size > 0
                })({
                    Empty(_ctx, _flag) { throw new TypeError('Cannot pop empty'); },
                    Push(_ctx, _flag) { return [this.value, this.rest]; }
                }),
                append: fold({
                    in: Number,
                    demands: (_self, val) => typeof val === 'number',
                    ensures: (_self, old, result) => result.size === old.size + 1
                })({
                    Empty({}, val) {
                        return Stack.Push({ value: val, rest: Stack.Empty });
                    },
                    Push({ rest }, val) {
                        return Stack.Push({ value: this.value, rest: rest(val) });
                    }
                })
            }));

            // Build stack via append: results in [1, 2, 3] (head-to-tail order)
            let s = Stack.Empty;
            s = s.append(1);
            assert.equal(s.size, 1);
            s = s.append(2);
            assert.equal(s.size, 2);
            s = s.append(3);
            assert.equal(s.size, 3);

            // Pop returns head element (1) and remaining [2, 3]
            const [val, rest] = s.pop;
            assert.equal(val, 1);
            assert.equal(rest.size, 2);

            // safePop demands on empty: fails
            assert.throws(
                () => Stack.Empty.safePop(true),
                (err) => err instanceof DemandsError
            );

            // safePop on non-empty: works (returns head)
            const [val2, rest2] = s.safePop(true);
            assert.equal(val2, 1);
            assert.equal(rest2.size, 2);
        });
    });
});
