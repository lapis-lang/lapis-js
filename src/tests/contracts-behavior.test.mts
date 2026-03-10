import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior, fold, unfold, DemandsError, EnsuresError } from '../index.mjs';

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
});
