import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, EnsuresError } from '../index.mjs';

describe('Contracts: Ensures (Postconditions)', () => {
    describe('Fold ensures', () => {
        it('should pass when ensures is satisfied', () => {
            const Counter = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                value: fold({
                    out: Number,
                    ensures: (_self, _old, result) => typeof result === 'number'
                })({
                    Val({ x }) { return x; }
                })
            }));

            const c = Counter.Val({ x: 42 });
            assert.equal(c.value, 42);
        });

        it('should throw EnsuresError when ensures fails', () => {
            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                doubled: fold({
                    out: Number,
                    ensures: (_self, _old, result) => result > 100
                })({
                    Val({ x }) { return x * 2; }
                })
            }));

            const v = MyData.Val({ x: 5 });
            assert.throws(
                () => v.doubled,
                (err) => err instanceof EnsuresError && err.message.includes("Postcondition failed for operation 'doubled'")
            );
        });

        it('should include the ensures function in error message', () => {
            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                value: fold({
                    out: Number,
                    ensures: (_self, _old, result) => result > 100
                })({
                    Val({ x }) { return x; }
                })
            }));

            const v = MyData.Val({ x: 5 });
            assert.throws(
                () => v.value,
                (err) => err instanceof EnsuresError && err.message.includes('Ensures:')
            );
        });

        it('should pass self and old to ensures', () => {
            // For data types, old === self (immutable)
            let capturedSelf, capturedOld;

            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                value: fold({
                    out: Number,
                    ensures: (self, old, _result) => {
                        capturedSelf = self;
                        capturedOld = old;
                        return true;
                    }
                })({
                    Val({ x }) { return x; }
                })
            }));

            const v = MyData.Val({ x: 5 });
            void v.value;
            assert.equal(capturedSelf, capturedOld, 'For frozen data, old should be self');
        });

        it('should pass args to ensures in parameterized fold', () => {
            let capturedArgs;

            const Container = data(() => ({
                Box: { value: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                add: fold({
                    in: Number,
                    out: Number,
                    ensures: (_self, _old, result, val) => {
                        capturedArgs = val;
                        return result >= 0;
                    }
                })({
                    Box({ value }, val) { return value + val; }
                })
            }));

            const box = Container.Box({ value: 10 });
            box.add(5);
            assert.equal(capturedArgs, 5);
        });
    });

    describe('Unfold ensures', () => {
        it('should check ensures on unfold result', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                Range: unfold({
                    in: Number,
                    out: Family,
                    ensures: (_self, _old, result) => result !== null && result !== undefined
                })({
                    Nil: (n) => n <= 0 ? {} : null,
                    Cons: (n) => n > 0 ? { head: n, tail: n - 1 } : null
                })
            }));

            // Valid
            const list = List.Range(3);
            assert.equal(list.head, 3);
        });
    });

    describe('Implementer blame', () => {
        it('should throw EnsuresError for bad implementation', () => {
            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                broken: fold({
                    out: Number,
                    ensures: (_self, _old, result) => result !== -1
                })({
                    Val() { return -1; } // intentionally bad
                })
            }));

            const v = MyData.Val({ x: 5 });
            assert.throws(
                () => v.broken,
                (err) => err instanceof EnsuresError
            );
        });
    });

    describe('Old-state access with size tracking', () => {
        it('should verify size via old-state reference', () => {
            const Stack = data(({ Family }) => ({
                Empty: {},
                Push: { value: Number, rest: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                size: fold({ out: Number })({
                    Empty() { return 0; },
                    Push({ rest }) { return 1 + rest; }
                }),
                append: fold({
                    in: Number,
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

            const s = Stack.Push({ value: 1, rest: Stack.Empty });
            const s2 = s.append(2);
            assert.equal(s2.size, 2);
            assert.equal(s.size, 1);
        });

        it('should throw EnsuresError when size invariant is violated', () => {
            const Stack = data(({ Family }) => ({
                Empty: {},
                Push: { value: Number, rest: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                size: fold({ out: Number })({
                    Empty() { return 0; },
                    Push({ rest }) { return 1 + rest; }
                }),
                brokenAppend: fold({
                    in: Number,
                    ensures: (_self, old, result) => result.size === old.size + 1
                })({
                    Empty() { return Stack.Empty; }, // broken: doesn't actually append
                    Push() { return this; }
                })
            }));

            const s = Stack.Push({ value: 1, rest: Stack.Empty });
            assert.throws(
                () => s.brokenAppend(2),
                (err) => err instanceof EnsuresError
            );
        });
    });

    describe('Ensures evaluated after body', () => {
        it('should not prevent body execution even when ensures will fail', () => {
            let bodyExecuted = false;

            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                check: fold({
                    out: Number,
                    ensures: () => false
                })({
                    Val({ x }) { bodyExecuted = true; return x; }
                })
            }));

            const v = MyData.Val({ x: 5 });
            assert.throws(() => v.check, (err) => err instanceof EnsuresError);
            assert.equal(bodyExecuted, true, 'body should execute before ensures is checked');
        });
    });
});
