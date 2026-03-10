import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, fold, unfold, invariant, DemandsError } from '../index.mjs';

describe('Contracts: Demands (Preconditions)', () => {
    describe('Fold demands', () => {
        it('should pass when demand is satisfied', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                sum: fold({
                    out: Number,
                    demands: (self) => self !== null && self !== undefined
                })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                })
            }));

            const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) });
            assert.equal(list.sum, 3);
        });

        it('should throw DemandsError when demand fails', () => {
            const Stack = data(({ Family }) => ({
                Empty: {},
                Push: { value: Number, rest: Family },
                size: fold({ out: Number })({
                    Empty() { return 0; },
                    Push({ rest }) { return 1 + rest; }
                }),
                pop: fold({
                    out: Array,
                    demands: (self) => self.size > 0
                })({
                    Empty() { throw new TypeError('Cannot pop empty stack'); },
                    Push() { return [this.value, this.rest]; }
                })
            }));

            assert.throws(
                () => Stack.Empty.pop,
                (err) => err instanceof DemandsError && err.message.includes("Precondition failed for operation 'pop'")
            );
        });

        it('should include the demand function in error message', () => {
            const MyData = data(() => ({
                Val: { x: Number },
                check: fold({
                    demands: (self) => self.x > 0,
                    out: Boolean
                })({
                    Val() { return true; }
                })
            }));

            const v = MyData.Val({ x: -1 });
            assert.throws(
                () => v.check,
                (err) => err instanceof DemandsError && err.message.includes('Demand:')
            );
        });

        it('should pass args to demands in parameterized fold', () => {
            const Container = data(() => ({
                Box: { value: Number },
                add: fold({
                    in: Number,
                    out: Number,
                    demands: (_self, val) => val >= 0
                })({
                    Box({ value }, val) { return value + val; }
                })
            }));

            const box = Container.Box({ value: 10 });
            assert.equal(box.add(5), 15);

            assert.throws(
                () => box.add(-1),
                (err) => err instanceof DemandsError
            );
        });
    });

    describe('Unfold demands', () => {
        it('should check demands on unfold seed', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Range: unfold({
                    in: Number,
                    out: Family,
                    demands: (_self, n) => typeof n === 'number' && n >= 0
                })({
                    Nil: (n) => n <= 0 ? {} : null,
                    Cons: (n) => n > 0 ? { head: n, tail: n - 1 } : null
                })
            }));

            // Valid
            const list = List.Range(3);
            assert.equal(list.head, 3);

            // Invalid
            assert.throws(
                () => List.Range(-1),
                (err) => err instanceof DemandsError
            );
        });
    });

    describe('Demands prevents body execution', () => {
        it('should never execute the handler body when demands fails', () => {
            let bodyCalled = false;

            const MyData = data(() => ({
                Val: { x: Number },
                check: fold({
                    demands: () => false,
                    out: Number
                })({
                    Val() { bodyCalled = true; return 42; }
                })
            }));

            const v = MyData.Val({ x: 5 });
            assert.throws(() => v.check, (err) => err instanceof DemandsError);
            assert.equal(bodyCalled, false, 'body should not execute when demands fails');
        });

        it('should execute handler when demands is satisfied', () => {
            let bodyCalled = false;

            const MyData = data(() => ({
                Val: { x: Number },
                check: fold({
                    demands: () => true,
                    out: Number
                })({
                    Val() { bodyCalled = true; return 42; }
                })
            }));

            const v = MyData.Val({ x: 5 });
            assert.equal(v.check, 42);
            assert.equal(bodyCalled, true, 'body should execute when demands passes');
        });
    });

    describe('Caller blame', () => {
        it('should throw DemandsError (not caught by rescue)', () => {
            let rescueCalled = false;

            const MyData = data(() => ({
                Val: { x: Number },
                check: fold({
                    demands: (self) => self.x > 0,
                    rescue: () => { rescueCalled = true; return false; },
                    out: Boolean
                })({
                    Val() { return true; }
                })
            }));

            const v = MyData.Val({ x: -1 });
            assert.throws(
                () => v.check,
                (err) => err instanceof DemandsError
            );
            assert.equal(rescueCalled, false, 'rescue should not be called on demand failure');
        });
    });
});
