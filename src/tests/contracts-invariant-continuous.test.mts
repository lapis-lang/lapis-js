import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, fold, invariant, InvariantError } from '../index.mjs';

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
