import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, fold, unfold, invariant, InvariantError } from '../index.mjs';

describe('Contracts: Continuous Invariant Enforcement', () => {
    describe('Invariant checked around fold operations', () => {
        it('should check invariant before fold on self (pre-check)', () => {
            // Since data instances are frozen, the only way the invariant can fail
            // is if the instance was constructed with an invariant that was satisfied
            // at construction but the invariant function is context-dependent.
            // For data types, pre-check mainly validates that construction was correct.
            const PositiveBox = data(() => ({
                Box: {
                    [invariant]: ({ x }) => x > 0,
                    x: Number
                },
                value: fold({ out: Number })({
                    Box({ x }) { return x; }
                })
            }));

            const box = PositiveBox.Box({ x: 5 });
            assert.equal(box.value, 5); // invariant holds, fold should succeed
        });

        it('should run invariant pre-check on fold even without demands/ensures/rescue', () => {
            // Use a context-dependent invariant that can be toggled externally.
            // The instance passes at construction time but fails at fold time.
            let externalValid = true;

            const Box = data(() => ({
                Box: {
                    [invariant]: () => externalValid,
                    x: Number
                },
                // Fold with NO demands, ensures, or rescue
                value: fold({ out: Number })({
                    Box({ x }) { return x; }
                })
            }));

            const box = Box.Box({ x: 42 });

            // Fold succeeds while invariant holds
            assert.equal(box.value, 42);

            // Toggle invariant to failing — fold should now throw InvariantError
            externalValid = false;
            assert.throws(
                () => box.value,
                (err) => err instanceof InvariantError
            );

            // Restore for cleanup
            externalValid = true;
        });

        it('invariant violation at construction still throws TypeError', () => {
            const PositiveBox = data(() => ({
                Box: {
                    [invariant]: ({ x }) => x > 0,
                    x: Number
                },
                value: fold({ out: Number })({
                    Box({ x }) { return x; }
                })
            }));

            assert.throws(
                () => PositiveBox.Box({ x: -1 }),
                { name: 'TypeError' }
            );
        });

        it('should post-check invariant on fold result when result is a variant', () => {
            // Toggle the flag INSIDE the handler after constructing the result
            // so pre-check passes, construction passes, then post-check fails.
            let externalValid = true;
            let shouldInvalidate = false;

            const Box = data(() => ({
                Box: {
                    [invariant]: () => externalValid,
                    x: Number
                },
                identity: fold({})({
                    Box({ x }) {
                        const result = Box.Box({ x });
                        if (shouldInvalidate) externalValid = false;
                        return result;
                    }
                })
            }));

            const box = Box.Box({ x: 5 });

            // Normal case — invariant holds, post-check passes
            const result = box.identity;
            assert.equal(result.x, 5);

            // Enable invalidation — handler will toggle flag after construction
            shouldInvalidate = true;
            assert.throws(
                () => box.identity,
                (err) => {
                    const ok = err instanceof InvariantError
                        && /after/.test(err.message);
                    externalValid = true;
                    shouldInvalidate = false;
                    return ok;
                }
            );
        });

        it('should post-check invariant on result after successful rescue', () => {
            let externalValid = true;
            let attempt = 0;

            const Box = data(() => ({
                Box: {
                    [invariant]: () => externalValid,
                    x: Number
                },
                risky: fold({
                    rescue: (_self, _error, _args, retry) => retry(5)
                })({
                    Box(_ctx, n) {
                        attempt++;
                        if (attempt === 1) throw new Error('first try fails');
                        const result = Box.Box({ x: n });
                        externalValid = false; // toggle after construction
                        return result;
                    }
                })
            }));

            const box = Box.Box({ x: 1 });

            assert.throws(
                () => box.risky(10),
                (err) => {
                    const ok = err instanceof InvariantError
                        && /after/.test(err.message);
                    externalValid = true;
                    attempt = 0;
                    return ok;
                }
            );
        });

        it('should not post-check when result is not a variant instance', () => {
            // Fold returns a plain number — no invariant to check on result
            const Box = data(() => ({
                Box: {
                    [invariant]: ({ x }) => x > 0,
                    x: Number
                },
                value: fold({ out: Number })({
                    Box({ x }) { return x; }
                })
            }));

            const box = Box.Box({ x: 5 });
            // Pre-check on self passes, result is a number (no post-check applies)
            assert.equal(box.value, 5);
        });
    });

    describe('InvariantError type', () => {
        it('should have the correct name and message structure', () => {
            const err = new InvariantError('op', 'Context', 'pre');
            assert.equal(err.name, 'InvariantError');
            assert.match(err.message, /Invariant violated before operation 'op' on Context/);
        });

        it('should show "after" for post-check', () => {
            const err = new InvariantError('op', 'Context', 'post');
            assert.match(err.message, /Invariant violated after operation 'op' on Context/);
        });
    });
});
