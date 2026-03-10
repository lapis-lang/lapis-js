import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, extend, fold, DemandsError, EnsuresError } from '../index.mjs';

describe('Contracts: Subcontracting (LSP)', () => {
    describe('Demands OR (weaken)', () => {
        it('should accept input if either parent or child demands pass', () => {
            const Base = data(() => ({
                Val: { x: Number },
                check: fold({
                    in: Number,
                    out: Boolean,
                    demands: (_self, n) => n >= 0
                })({
                    Val(_ctx, n) { return n >= 0; }
                })
            }));

            const Extended = data(() => ({
                [extend]: Base,
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
                Val: { x: Number },
                value: fold({
                    out: Number,
                    ensures: (_self, _old, result) => result >= 0
                })({
                    Val({ x }) { return x; }
                })
            }));

            const Extended = data(() => ({
                [extend]: Base,
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
                Val: { x: Number },
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
                Ext: { y: Number },
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
                Val: { x: Number },
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
                Ext: { y: Number },
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
});
