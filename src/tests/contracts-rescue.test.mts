import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, invariant, DemandsError, InvariantError } from '../index.mjs';

describe('Contracts: Rescue + Retry', () => {
    describe('Basic rescue', () => {
        it('should invoke rescue when body throws', () => {
            let rescueCalled = false;

            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                risky: fold({
                    out: Number,
                    rescue: (_self, _error, _args) => {
                        rescueCalled = true;
                        return -1; // fallback value
                    }
                })({
                    Val() { throw new Error('boom'); }
                })
            }));

            const v = MyData.Val({ x: 5 });
            const result = v.risky;
            assert.equal(rescueCalled, true);
            assert.equal(result, -1);
        });

        it('should pass error and args to rescue', () => {
            let capturedError, capturedArgs;

            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                risky: fold({
                    in: Number,
                    out: Number,
                    rescue: (_self, error, args) => {
                        capturedError = error;
                        capturedArgs = args;
                        return 0;
                    }
                })({
                    Val(_ctx, n) { throw new Error(`fail-${n}`); }
                })
            }));

            const v = MyData.Val({ x: 5 });
            v.risky(42);
            assert.equal(capturedError.message, 'fail-42');
            assert.deepEqual(capturedArgs, [42]);
        });
    });

    describe('Rescue with retry', () => {
        it('should retry with new args on retry call', () => {
            let attempts = 0;

            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                compute: fold({
                    in: Number,
                    out: Number,
                    rescue: (_self, _error, _args, retry) => {
                        return retry(10); // retry with valid argument
                    }
                })({
                    Val({ x }, n) {
                        attempts++;
                        if (n <= 0) throw new Error('must be positive');
                        return x + n;
                    }
                })
            }));

            const v = MyData.Val({ x: 5 });
            const result = v.compute(0); // triggers error, then rescue retries with 10
            assert.equal(result, 15);
            assert.equal(attempts, 2); // first attempt failed, retry succeeded
        });
    });

    describe('Rescue does not catch DemandsError', () => {
        it('should throw DemandsError even with rescue defined', () => {
            let rescueCalled = false;

            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
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
            assert.equal(rescueCalled, false);
        });
    });

    describe('Rescue invoked on ensures failure', () => {
        it('should invoke rescue when ensures fails', () => {
            let rescueCalled = false;

            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                value: fold({
                    out: Number,
                    ensures: (_self, _old, result) => result > 100,
                    rescue: (_self, _error, _args) => {
                        rescueCalled = true;
                        return 999; // fallback
                    }
                })({
                    Val({ x }) { return x; } // returns x which may be < 100
                })
            }));

            const v = MyData.Val({ x: 5 });
            const result = v.value;
            assert.equal(rescueCalled, true);
            assert.equal(result, 999);
        });
    });

    describe('Max retry guard', () => {
        it('should throw when retry count exceeds maximum', () => {
            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                infinite: fold({
                    in: Number,
                    out: Number,
                    rescue: (_self, _error, _args, retry) => {
                        return retry(0); // always retries with same failing value
                    }
                })({
                    Val(_ctx, _n) { throw new Error('always fails'); }
                })
            }));

            const v = MyData.Val({ x: 5 });
            assert.throws(
                () => v.infinite(0),
                /Maximum retry count.*exceeded/
            );
        });
    });

    describe('Non-erroring operation with rescue', () => {
        it('should return normal result without invoking rescue', () => {
            let rescueCalled = false;

            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                value: fold({
                    out: Number,
                    rescue: () => { rescueCalled = true; return -1; }
                })({
                    Val({ x }) { return x; }
                })
            }));

            const v = MyData.Val({ x: 7 });
            assert.equal(v.value, 7);
            assert.equal(rescueCalled, false, 'rescue should not be called when body succeeds');
        });
    });

    describe('Rescue rethrow propagation', () => {
        it('should propagate rescue error to caller', () => {
            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                risky: fold({
                    out: Number,
                    rescue: () => { throw new Error('Rescue throw'); }
                })({
                    Val() { throw new Error('Method error'); }
                })
            }));

            const v = MyData.Val({ x: 5 });
            assert.throws(
                () => v.risky,
                { message: 'Rescue throw' }
            );
        });

        it('should propagate rescue error not the original error', () => {
            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                risky: fold({
                    out: Number,
                    rescue: () => { throw new TypeError('Different type'); }
                })({
                    Val() { throw new RangeError('Original error'); }
                })
            }));

            const v = MyData.Val({ x: 5 });
            assert.throws(
                () => v.risky,
                (err) => err instanceof TypeError && err.message === 'Different type'
            );
        });
    });

    describe('Rescue preserves invariant', () => {
        it('should check invariant after rescue completes', () => {
            // The rescue returns a value, and invariant post-check runs on self.
            // Since data is frozen, the invariant holds. This tests the success path.
            const MyData = data(() => ({
                Box: {
                    [invariant]: ({ x }) => x > 0,
                    x: Number
                }
            })).ops(({ fold, unfold, map, merge }) => ({
                value: fold({
                    out: Number,
                    rescue: (_self, _error) => 42
                })({
                    Box() { throw new Error('fail'); }
                })
            }));

            const v = MyData.Box({ x: 5 });
            assert.equal(v.value, 42);
        });
    });

    describe('Combined error pathways', () => {
        it('demands failure bypasses rescue entirely', () => {
            let rescueCalled = false;

            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                check: fold({
                    demands: () => false,
                    ensures: () => true,
                    rescue: () => { rescueCalled = true; return 0; },
                    out: Number
                })({
                    Val() { return 1; }
                })
            }));

            const v = MyData.Val({ x: 5 });
            assert.throws(() => v.check, (err) => err instanceof DemandsError);
            assert.equal(rescueCalled, false);
        });

        it('ensures failure triggers rescue which receives EnsuresError', () => {
            let capturedErrorName;

            const MyData = data(() => ({
                Val: { x: Number }
            })).ops(({ fold, unfold, map, merge }) => ({
                check: fold({
                    out: Number,
                    ensures: (_self, _old, result) => result > 100,
                    rescue: (_self, error) => {
                        capturedErrorName = error.name;
                        return 999;
                    }
                })({
                    Val({ x }) { return x; }
                })
            }));

            const v = MyData.Val({ x: 5 });
            const result = v.check;
            assert.equal(result, 999);
            assert.equal(capturedErrorName, 'EnsuresError');
        });
    });
});
