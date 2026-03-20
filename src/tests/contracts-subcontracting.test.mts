import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, extend, DemandsError, EnsuresError } from '../index.mjs';

describe('Contracts: Subcontracting (LSP)', () => {
    describe('Demands OR (weaken)', () => {
        it('should accept input if either parent or child demands pass', () => {
            const Base = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                check: fold({
                    in: Number,
                    out: Boolean,
                    demands: (_self, n) => n >= 0
                })({
                    Val(_ctx, n) { return n >= 0; }
                })
            }));

            const Extended = data(() => ({
                [extend]: Base
            })).ops(({ fold, unfold, map, merge }) => ({
                check: fold({
                    in: Number,
                    demands: (_self, n) => n === -42 // accept the special -42 too
                })({
                    Val(_ctx, n) { return n >= 0 || n === -42; }
                })
            }));

            const v = Extended.Val({ x: 1 });

            // Parent demand passes (n >= 0)
            assert.equal(v.check(5), true);

            // Child demand passes (n === -42)
            assert.equal(v.check(-42), true);

            // Neither passes
            assert.throws(
                () => v.check(-1),
                (err) => err instanceof DemandsError
            );
        });
    });

    describe('Ensures AND (strengthen)', () => {
        it('should require both parent and child ensures to pass', () => {
            const Base = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                value: fold({
                    out: Number,
                    ensures: (_self, _old, result) => result >= 0
                })({
                    Val({ x }) { return x; }
                })
            }));

            const Extended = data(() => ({
                [extend]: Base
            })).ops(({ fold, unfold, map, merge }) => ({
                value: fold({
                    ensures: (_self, _old, result) => result <= 100
                })({
                    Val({ x }) { return x; }
                })
            }));

            // Both pass
            const v1 = Extended.Val({ x: 50 });
            assert.equal(v1.value, 50);

            // Parent ensures fails (result < 0)
            const v2 = Extended.Val({ x: -1 });
            assert.throws(
                () => v2.value,
                (err) => err instanceof EnsuresError
            );

            // Child ensures fails (result > 100)
            const v3 = Extended.Val({ x: 200 });
            assert.throws(
                () => v3.value,
                (err) => err instanceof EnsuresError
            );
        });
    });

    describe('Rescue inheritance', () => {
        it('should inherit parent rescue when child does not define one', () => {
            let parentRescueCalled = false;

            const Base = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                risky: fold({
                    out: Number,
                    rescue: () => {
                        parentRescueCalled = true;
                        return -1;
                    }
                })({
                    Val() { throw new Error('boom'); }
                })
            }));

            const Extended = data(() => ({
                [extend]: Base,
                Ext: { y: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                risky: fold({})({
                    Ext() { throw new Error('extended boom'); }
                })
            }));

            const v = Extended.Ext({ y: 5 });
            const result = v.risky;
            assert.equal(parentRescueCalled, true);
            assert.equal(result, -1);
        });

        it('should use child rescue when child defines one', () => {
            let parentRescueCalled = false;
            let childRescueCalled = false;

            const Base = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                risky: fold({
                    out: Number,
                    rescue: () => {
                        parentRescueCalled = true;
                        return -1;
                    }
                })({
                    Val() { throw new Error('boom'); }
                })
            }));

            const Extended = data(() => ({
                [extend]: Base,
                Ext: { y: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                risky: fold({
                    rescue: () => {
                        childRescueCalled = true;
                        return -2;
                    }
                })({
                    Ext() { throw new Error('extended boom'); }
                })
            }));

            const v = Extended.Ext({ y: 5 });
            const result = v.risky;
            assert.equal(childRescueCalled, true);
            assert.equal(parentRescueCalled, false);
            assert.equal(result, -2);
        });
    });

    // ---- Unfold subcontracting ------------------------------------------------

    describe('Unfold demands OR (weaken)', () => {
        it('should accept seed if either parent or child unfold demands pass', () => {
            const Base = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                Range: unfold({
                    in: Number,
                    demands: (_self, n) => n >= 0
                })({
                    Nil: (n) => n <= 0 ? {} : null,
                    Cons: (n) => n > 0 ? { head: n, tail: n - 1 } : null
                })
            }));

            const Extended = data(({ Family }) => ({
                [extend]: Base
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                Range: unfold({
                    in: Number,
                    demands: (_self, n) => n === -1
                })({
                    Nil: (n) => n <= 0 ? {} : null,
                    Cons: (n) => n > 0 ? { head: n, tail: n - 1 } : null
                })
            }));

            // Parent demand passes (n >= 0)
            const list1 = Extended.Range(2);
            assert.equal(list1.head, 2);

            // Child demand passes (n === -1)
            const list2 = Extended.Range(-1);
            assert.ok(list2); // Nil

            // Neither passes
            assert.throws(
                () => Extended.Range(-5),
                (err) => err instanceof DemandsError
            );
        });
    });

    describe('Unfold ensures AND (strengthen)', () => {
        it('should require both parent and child unfold ensures to pass', () => {
            const Base = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                Range: unfold({
                    in: Number,
                    ensures: (_self, _old, result) =>
                        result !== null && result !== undefined
                })({
                    Nil: (n) => n <= 0 ? {} : null,
                    Cons: (n) => n > 0 ? { head: n, tail: n - 1 } : null
                })
            }));

            const Extended = data(({ Family }) => ({
                [extend]: Base
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                Range: unfold({
                    in: Number,
                    ensures: (_self, _old, result) =>
                        !('head' in result) || result.head <= 5
                })({
                    Nil: (n) => n <= 0 ? {} : null,
                    Cons: (n) => n > 0 ? { head: n, tail: n - 1 } : null
                })
            }));

            // Both pass — head is 3 (≤ 5) and result is defined
            const list1 = Extended.Range(3);
            assert.equal(list1.head, 3);

            // Child ensures fails — head is 10 (> 5)
            assert.throws(
                () => Extended.Range(10),
                (err) => err instanceof EnsuresError
            );
        });
    });

    describe('Unfold rescue inheritance', () => {
        it('should inherit parent rescue when child does not define one', () => {
            let parentRescueCalled = false;

            const Base = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                Build: unfold({
                    in: Number,
                    rescue: () => {
                        parentRescueCalled = true;
                        return Base.Nil;
                    }
                })({
                    Nil: () => null,
                    Cons: () => { throw new Error('boom'); }
                })
            }));

            const Extended = data(({ Family }) => ({
                [extend]: Base
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                Build: unfold({
                    in: Number
                })({
                    Nil: () => null,
                    Cons: () => { throw new Error('extended boom'); }
                })
            }));

            const result = Extended.Build(5);
            assert.equal(parentRescueCalled, true);
            assert.ok(result); // Nil from rescue
        });

        it('should use child rescue when child defines one', () => {
            let parentRescueCalled = false;
            let childRescueCalled = false;

            const Base = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                Build: unfold({
                    in: Number,
                    rescue: () => {
                        parentRescueCalled = true;
                        return Base.Nil;
                    }
                })({
                    Nil: () => null,
                    Cons: () => { throw new Error('boom'); }
                })
            }));

            const Extended = data(({ Family }) => ({
                [extend]: Base
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                Build: unfold({
                    in: Number,
                    rescue: () => {
                        childRescueCalled = true;
                        return Extended.Nil;
                    }
                })({
                    Nil: () => null,
                    Cons: () => { throw new Error('extended boom'); }
                })
            }));

            const result = Extended.Build(5);
            assert.equal(childRescueCalled, true);
            assert.equal(parentRescueCalled, false);
            assert.ok(result);
        });
    });

    describe('Unfold inherits contracts without override', () => {
        it('should enforce parent demands on inherited unfold', () => {
            const Base = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                Range: unfold({
                    in: Number,
                    demands: (_self, n) => n >= 0
                })({
                    Nil: (n) => n <= 0 ? {} : null,
                    Cons: (n) => n > 0 ? { head: n, tail: n - 1 } : null
                })
            }));

            const Extended = data(() => ({
                [extend]: Base,
                Extra: { tag: String }
            }));

            // Parent demands should still fire on non-overridden unfold
            assert.throws(
                () => Extended.Range(-1),
                (err) => err instanceof DemandsError
            );

            // Valid seed works
            const list = Extended.Range(2);
            assert.equal(list.head, 2);
        });
    });
});
