import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior, fold, unfold, extend, DemandsError, EnsuresError } from '../index.mjs';

describe('Contracts: Behavior', () => {
    describe('Behavior unfold contracts', () => {
        it('should check demands on behavior unfold seed', () => {
            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({
                    in: Number,
                    out: Self,
                    demands: (_self, n) => typeof n === 'number' && n >= 0
                })({
                    head: (n) => n,
                    tail: (n) => n + 1
                })
            }));

            // Valid
            const s = Stream.From(0);
            assert.equal(s.head, 0);
            assert.equal(s.tail.head, 1);

            // Invalid
            assert.throws(
                () => Stream.From(-1),
                (err) => err instanceof DemandsError
            );
        });
    });

    describe('Behavior fold contracts', () => {
        it('should check demands on behavior fold', () => {
            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n) => n,
                    tail: (n) => n + 1
                }),
                take: fold({
                    in: Number,
                    out: Array,
                    demands: (self, n) => n >= 0
                })({
                    _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
                })
            }));

            const s = Stream.From(1);

            // Valid
            assert.deepEqual(s.take(3), [1, 2, 3]);

            // Invalid
            assert.throws(
                () => s.take(-1),
                (err) => err instanceof DemandsError
            );
        });

        it('should check ensures on behavior fold result', () => {
            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n) => n,
                    tail: (n) => n + 1
                }),
                take: fold({
                    in: Number,
                    out: Array,
                    ensures: (_self, _old, result, n) => result.length <= n
                })({
                    _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
                })
            }));

            const s = Stream.From(1);
            assert.deepEqual(s.take(3), [1, 2, 3]);
        });

        it('should invoke rescue on behavior fold failure', () => {
            let rescueCalled = false;

            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n) => n,
                    tail: (n) => n + 1
                }),
                risky: fold({
                    in: Number,
                    out: Array,
                    rescue: (_self, _error, _args) => {
                        rescueCalled = true;
                        return []; // fallback
                    }
                })({
                    _: (_ctx, n) => {
                        if (n < 0) throw new Error('negative');
                        return [];
                    }
                })
            }));

            const s = Stream.From(1);
            const result = s.risky(-1);
            assert.equal(rescueCalled, true);
            assert.deepEqual(result, []);
        });
    });

    describe('Behavior unfold rescue', () => {
        it('should invoke rescue when ensures fails on unfold result', () => {
            let rescueCalled = false;

            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({
                    in: Number,
                    out: Self,
                    ensures: (_self, _old, result) => result.head >= 0,
                    rescue: (_self, _error, _args) => {
                        rescueCalled = true;
                        return Stream.From(0); // fallback with valid seed
                    }
                })({
                    head: (n) => n,
                    tail: (n) => n + 1
                })
            }));

            // Valid seed — no rescue
            const s = Stream.From(1);
            assert.equal(s.head, 1);
            assert.equal(rescueCalled, false);

            // Invalid seed — ensures fails, rescue returns fallback
            const s2 = Stream.From(-1);
            assert.equal(rescueCalled, true);
            assert.equal(s2.head, 0);
        });

        it('should pass error and args to unfold rescue on ensures failure', () => {
            let capturedError, capturedArgs;

            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({
                    in: Number,
                    out: Self,
                    ensures: (_self, _old, result) => result.head >= 0,
                    rescue: (_self, error, args) => {
                        capturedError = error;
                        capturedArgs = args;
                        return Stream.From(0);
                    }
                })({
                    head: (n) => n,
                    tail: (n) => n + 1
                })
            }));

            Stream.From(-5);
            assert.ok(capturedError instanceof EnsuresError);
            assert.deepEqual(capturedArgs, [-5]);
        });

        it('should support retry in unfold rescue', () => {
            let retryCount = 0;

            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({
                    in: Number,
                    out: Self,
                    ensures: (_self, _old, result) => result.head >= 0,
                    rescue: (_self, _error, _args, retry) => {
                        retryCount++;
                        return retry(0); // retry with safe seed
                    }
                })({
                    head: (n) => n,
                    tail: (n) => n + 1
                })
            }));

            const s = Stream.From(-1);
            assert.equal(retryCount, 1);
            assert.equal(s.head, 0);
        });

        it('should not rescue DemandsError in unfold', () => {
            let rescueCalled = false;

            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({
                    in: Number,
                    out: Self,
                    demands: (_self, n) => n >= 0,
                    rescue: () => {
                        rescueCalled = true;
                        return Stream.From(0);
                    }
                })({
                    head: (n) => n,
                    tail: (n) => n + 1
                })
            }));

            assert.throws(
                () => Stream.From(-1),
                (err) => err instanceof DemandsError
            );
            assert.equal(rescueCalled, false);
        });

        it('should invoke rescue on ensures failure in unfold', () => {
            let rescueCalled = false;

            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({
                    in: Number,
                    out: Self,
                    ensures: (_self, _old, result) => result.head >= 0,
                    rescue: (_self, _error, _args) => {
                        rescueCalled = true;
                        return Stream.From(0);
                    }
                })({
                    head: (n) => n, // ensures fails when n < 0
                    tail: (n) => n + 1
                })
            }));

            const s = Stream.From(-1);
            assert.equal(rescueCalled, true);
            assert.equal(s.head, 0);
        });
    });

    describe('Behavior fold contract composition (subcontracting)', () => {
        it('should inherit parent demands when child has none', () => {
            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n) => n,
                    tail: (n) => n + 1
                }),
                take: fold({
                    in: Number,
                    out: Array,
                    demands: (_self, n) => n >= 0
                })({
                    _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
                })
            }));

            // Child overrides fold without own demands — should inherit parent's
            const ChildStream = behavior(({ Self }) => ({
                [extend]: Stream,
                head: Number,
                tail: Self,
                take: fold({ in: Number, out: Array })({
                    _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
                })
            }));

            const s = ChildStream.From(1);

            // Valid
            assert.deepEqual(s.take(2), [1, 2]);

            // Invalid — inherited demands should reject
            assert.throws(
                () => s.take(-1),
                (err) => err instanceof DemandsError
            );
        });

        it('should OR parent and child demands (weakening)', () => {
            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n) => n,
                    tail: (n) => n + 1
                }),
                take: fold({
                    in: Number,
                    out: Array,
                    demands: (_self, n) => n >= 0 && n <= 5
                })({
                    _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
                })
            }));

            // Child adds wider demands — composed result should accept if EITHER passes
            const ChildStream = behavior(({ Self }) => ({
                [extend]: Stream,
                head: Number,
                tail: Self,
                take: fold({
                    in: Number,
                    out: Array,
                    demands: (_self, n) => n >= 0 && n <= 10
                })({
                    _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
                })
            }));

            const s = ChildStream.From(1);

            // n=7 passes child demands but not parent — OR should accept
            assert.deepEqual(s.take(7), [1, 2, 3, 4, 5, 6, 7]);
        });

        it('should AND parent and child ensures (strengthening)', () => {
            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n) => n,
                    tail: (n) => n + 1
                }),
                take: fold({
                    in: Number,
                    out: Array,
                    ensures: (_self, _old, result) => Array.isArray(result)
                })({
                    _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
                })
            }));

            // Child adds stricter ensures — both must pass
            const ChildStream = behavior(({ Self }) => ({
                [extend]: Stream,
                head: Number,
                tail: Self,
                take: fold({
                    in: Number,
                    out: Array,
                    ensures: (_self, _old, result, n) => result.length === n
                })({
                    _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
                })
            }));

            const s = ChildStream.From(1);
            // Both ensures pass
            assert.deepEqual(s.take(3), [1, 2, 3]);
        });

        it('should inherit parent rescue when child has none', () => {
            let rescueCalled = false;

            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n) => n,
                    tail: (n) => n + 1
                }),
                risky: fold({
                    in: Number,
                    out: Array,
                    rescue: (_self, _error, _args) => {
                        rescueCalled = true;
                        return [];
                    }
                })({
                    _: (_ctx, n) => {
                        if (n < 0) throw new Error('negative');
                        return [];
                    }
                })
            }));

            // Child overrides fold without own rescue — should inherit parent's
            const ChildStream = behavior(({ Self }) => ({
                [extend]: Stream,
                head: Number,
                tail: Self,
                risky: fold({ in: Number, out: Array })({
                    _: (_ctx, n) => {
                        if (n < 0) throw new Error('still negative');
                        return [n];
                    }
                })
            }));

            const s = ChildStream.From(1);
            const result = s.risky(-1);
            assert.equal(rescueCalled, true);
            assert.deepEqual(result, []);
        });
    });
});
