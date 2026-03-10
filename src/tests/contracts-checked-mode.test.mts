import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, fold, checkedMode, DemandsError, EnsuresError } from '../index.mjs';

describe('Contracts: Checked Mode', () => {
    it('should return current checked mode state', () => {
        const original = checkedMode();
        assert.equal(typeof original, 'boolean');
        checkedMode(original); // restore
    });

    it('should toggle checked mode on and off', () => {
        const original = checkedMode();

        checkedMode(false);
        assert.equal(checkedMode(), false);

        checkedMode(true);
        assert.equal(checkedMode(), true);

        checkedMode(original); // restore
    });

    describe('Contracts skipped when disabled', () => {
        it('should skip demands when checked mode is off', () => {
            const MyData = data(() => ({
                Val: { x: Number },
                check: fold({
                    demands: (self) => self.x > 0,
                    out: Number
                })({
                    Val({ x }) { return x; }
                })
            }));

            const v = MyData.Val({ x: -1 });

            // Enable — should throw
            checkedMode(true);
            assert.throws(
                () => v.check,
                (err) => err instanceof DemandsError
            );

            // Disable — should NOT throw
            checkedMode(false);
            assert.doesNotThrow(() => v.check);
            assert.equal(v.check, -1);

            // Restore
            checkedMode(true);
        });

        it('should skip ensures when checked mode is off', () => {
            const MyData = data(() => ({
                Val: { x: Number },
                value: fold({
                    out: Number,
                    ensures: (_self, _old, result) => result > 100
                })({
                    Val({ x }) { return x; }
                })
            }));

            const v = MyData.Val({ x: 5 });

            // Enable — should throw
            checkedMode(true);
            assert.throws(
                () => v.value,
                (err) => err instanceof EnsuresError
            );

            // Disable — should NOT throw
            checkedMode(false);
            assert.doesNotThrow(() => v.value);
            assert.equal(v.value, 5);

            // Restore
            checkedMode(true);
        });

        it('should skip rescue when checked mode is off', () => {
            let rescueCalled = false;

            const MyData = data(() => ({
                Val: { x: Number },
                risky: fold({
                    out: Number,
                    rescue: () => {
                        rescueCalled = true;
                        return 0;
                    }
                })({
                    Val() { throw new Error('boom'); }
                })
            }));

            const v = MyData.Val({ x: 5 });

            // Disable checked mode — rescue should not fire, error propagates
            checkedMode(false);
            assert.throws(() => v.risky, { message: 'boom' });
            assert.equal(rescueCalled, false);

            // Enable — rescue should fire
            checkedMode(true);
            rescueCalled = false;
            const result = v.risky;
            assert.equal(rescueCalled, true);
            assert.equal(result, 0);
        });
    });

    describe('Guards remain active when disabled', () => {
        it('should still enforce spec.out when checked mode is off', () => {
            const MyData = data(() => ({
                Val: { x: Number },
                value: fold({ out: Number })({
                    // @ts-expect-error -- intentional type violation for test
                    Val() { return 'not a number'; }
                })
            }));

            const v = MyData.Val({ x: 5 });

            checkedMode(false);
            assert.throws(() => v.value, /expected to return Number/);

            checkedMode(true);
        });
    });
});
