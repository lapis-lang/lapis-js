/**
 * Invertible Maps and Allegories
 *
 * Tests for the `inverse` property on map specs, establishing bijective
 * relationships between forward and reverse map operations.  When
 * consecutive inverse pairs appear in a merge pipeline, they are fused
 * to the identity at definition time.
 *
 * Allegory correspondence: every map with a declared inverse forms a
 * morphism in a dagger category where f° ∘ f = id.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, map, fold, merge } from '../index.mjs';

// Helper: a simple parameterized list used by most tests
function makeList() {
    return data(({ Family, T }) => ({
        Nil: {},
        Cons: { head: T, tail: Family(T) },

        double:    map({ out: Family })({ T: (x: number) => x * 2 }),
        halve:     map({ out: Family, inverse: 'double' })({ T: (x: number) => x / 2 }),

        increment: map({ out: Family })({ T: (x: number) => x + 1 }),
        decrement: map({ out: Family, inverse: 'increment' })({ T: (x: number) => x - 1 }),

        sum: fold({ out: Number })({
            Nil() { return 0; },
            Cons({ head, tail }) { return head + tail; }
        }),

        toArray: fold({ out: Array })({
            Nil() { return []; },
            Cons({ head, tail }) { return [head, ...tail]; }
        })
    }));
}

describe('Invertible Maps', () => {
    describe('Basic inverse declaration', () => {
        it('forward and inverse are independent named operations', () => {
            const List = makeList();
            const NumList = List({ T: Number });
            const list = NumList.Cons(2, NumList.Cons(4, NumList.Cons(6, NumList.Nil)));

            // Forward: double
            const doubled = list.double;
            assert.deepStrictEqual(doubled.toArray, [4, 8, 12]);

            // Inverse: halve
            const halved = list.halve;
            assert.deepStrictEqual(halved.toArray, [1, 2, 3]);
        });

        it('round-trip f⁻¹ ∘ f = id via chaining', () => {
            const List = makeList();
            const NumList = List({ T: Number });
            const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

            // double then halve = identity
            const roundTrip = list.double.halve;
            assert.deepStrictEqual(roundTrip.toArray, [1, 2, 3]);

            // halve then double = identity
            const roundTrip2 = list.halve.double;
            assert.deepStrictEqual(roundTrip2.toArray, [1, 2, 3]);
        });

        it('round-trip for increment/decrement', () => {
            const List = makeList();
            const NumList = List({ T: Number });
            const list = NumList.Cons(10, NumList.Cons(20, NumList.Nil));

            assert.deepStrictEqual(list.increment.decrement.toArray, [10, 20]);
            assert.deepStrictEqual(list.decrement.increment.toArray, [10, 20]);
        });
    });

    describe('1:1 enforcement', () => {
        it('rejects a second inverse declaration for the same operation', () => {
            assert.throws(
                () => data(({ Family, T }) => ({
                    Nil: {},
                    Cons: { head: T, tail: Family(T) },
                    double:    map({ out: Family })({ T: (x: number) => x * 2 }),
                    halve:     map({ out: Family, inverse: 'double' })({ T: (x: number) => x / 2 }),
                    divByTwo:  map({ out: Family, inverse: 'double' })({ T: (x: number) => x / 2 })
                })),
                /already has inverse 'halve'.*1:1/
            );
        });

        it('rejects inverse pointing to non-existent operation', () => {
            assert.throws(
                () => data(({ Family, T }) => ({
                    Nil: {},
                    Cons: { head: T, tail: Family(T) },
                    halve: map({ out: Family, inverse: 'nonexistent' })({ T: (x: number) => x / 2 })
                })),
                /operation 'nonexistent' not found/
            );
        });
    });

    describe('Round-trip contract verification', () => {
        it('passes silently when inverse is correct', () => {
            const List = makeList();
            const NumList = List({ T: Number });
            const list = NumList.Cons(4, NumList.Cons(8, NumList.Nil));

            // double and halve are exact inverses — no error
            assert.doesNotThrow(() => {
                const _d = list.double;
                const _h = list.halve;
            });
        });

        it('throws EnsuresError when inverse is inconsistent', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family(T) },

                encode: map({ out: Family })({ T: (x: number) => Math.round(x * 100) / 100 }),
                // Intentionally wrong inverse — adds 1 instead of reversing
                decode: map({ out: Family, inverse: 'encode' })({ T: (x: number) => x + 1 })
            }));

            const NumList = List({ T: Number });
            const list = NumList.Cons(3, NumList.Nil);

            // encode(3) = 3, then decode(3) = 4 ≠ 3 → round-trip fails
            assert.throws(
                () => { const _e = list.encode; },
                { name: 'EnsuresError' }
            );
        });

        it('throws EnsuresError on the inverse direction too', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family(T) },

                forward: map({ out: Family })({ T: (x: number) => x * 3 }),
                // Wrong: divides by 2 instead of 3
                backward: map({ out: Family, inverse: 'forward' })({ T: (x: number) => x / 2 })
            }));

            const NumList = List({ T: Number });
            const list = NumList.Cons(6, NumList.Nil);

            // backward(6) = 3, forward(3) = 9 ≠ 6 → round-trip fails
            assert.throws(
                () => { const _b = list.backward; },
                { name: 'EnsuresError' }
            );
        });

        it('verifies round-trip recursively through nested structures', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family(T) },

                triple: map({ out: Family })({ T: (x: number) => x * 3 }),
                third:  map({ out: Family, inverse: 'triple' })({ T: (x: number) => x / 3 })
            }));

            const NumList = List({ T: Number });
            const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

            // Each level verifies its own round-trip
            assert.doesNotThrow(() => {
                const _t = list.triple;
                const _th = list.third;
            });
        });
    });

    describe('Merge fusion — inverse pair elimination', () => {
        it('eliminates consecutive inverse pair in merge', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family(T) },

                double:    map({ out: Family })({ T: (x: number) => x * 2 }),
                halve:     map({ out: Family, inverse: 'double' })({ T: (x: number) => x / 2 }),
                increment: map({ out: Family })({ T: (x: number) => x + 1 }),

                // double then halve = identity, so pipeline = just increment
                pipeline: merge('double', 'halve', 'increment')
            }));

            const NumList = List({ T: Number });
            const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

            // Should be equivalent to just increment
            const result = list.pipeline;
            assert.strictEqual(result.head, 2);
            assert.strictEqual(result.tail.head, 3);
            assert.strictEqual(result.tail.tail.head, 4);
        });

        it('eliminates trailing inverse pair', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family(T) },

                double:    map({ out: Family })({ T: (x: number) => x * 2 }),
                halve:     map({ out: Family, inverse: 'double' })({ T: (x: number) => x / 2 }),
                increment: map({ out: Family })({ T: (x: number) => x + 1 }),

                // increment then double then halve — halve cancels double
                pipeline: merge('increment', 'double', 'halve')
            }));

            const NumList = List({ T: Number });
            const list = NumList.Cons(1, NumList.Cons(2, NumList.Nil));

            // Should be equivalent to just increment
            const result = list.pipeline;
            assert.strictEqual(result.head, 2);
            assert.strictEqual(result.tail.head, 3);
        });

        it('collapses entire pipeline to identity when all pairs cancel', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family(T) },

                double:  map({ out: Family })({ T: (x: number) => x * 2 }),
                halve:   map({ out: Family, inverse: 'double' })({ T: (x: number) => x / 2 }),

                // double then halve = identity
                roundTrip: merge('double', 'halve'),

                toArray: fold({ out: Array })({
                    Nil() { return []; },
                    Cons({ head, tail }) { return [head, ...tail]; }
                })
            }));

            const NumList = List({ T: Number });
            const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

            // roundTrip should be identity
            const result = list.roundTrip;
            assert.strictEqual(result.head, 1);
            assert.strictEqual(result.tail.head, 2);
            assert.strictEqual(result.tail.tail.head, 3);
        });

        it('eliminates nested inverse pairs after first pass', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family(T) },

                double:    map({ out: Family })({ T: (x: number) => x * 2 }),
                halve:     map({ out: Family, inverse: 'double' })({ T: (x: number) => x / 2 }),
                increment: map({ out: Family })({ T: (x: number) => x + 1 }),
                decrement: map({ out: Family, inverse: 'increment' })({ T: (x: number) => x - 1 }),

                // double, increment, decrement, halve
                // First pass eliminates increment/decrement → [double, halve]
                // Second pass eliminates double/halve → []  (identity)
                pipeline: merge('double', 'increment', 'decrement', 'halve'),

                toArray: fold({ out: Array })({
                    Nil() { return []; },
                    Cons({ head, tail }) { return [head, ...tail]; }
                })
            }));

            const NumList = List({ T: Number });
            const list = NumList.Cons(5, NumList.Cons(10, NumList.Nil));

            const result = list.pipeline;
            assert.strictEqual(result.head, 5);
            assert.strictEqual(result.tail.head, 10);
        });

        it('preserves non-inverse operations in pipeline', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family(T) },

                double:    map({ out: Family })({ T: (x: number) => x * 2 }),
                halve:     map({ out: Family, inverse: 'double' })({ T: (x: number) => x / 2 }),
                increment: map({ out: Family })({ T: (x: number) => x + 1 }),
                square:    map({ out: Family })({ T: (x: number) => x * x }),

                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),

                // double, halve cancel → [increment, square, sum]
                pipeline: merge('double', 'halve', 'increment', 'square', 'sum')
            }));

            const NumList = List({ T: Number });
            const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

            // After fusion: increment then square then sum
            // increment: [2, 3, 4], square: [4, 9, 16], sum: 29
            assert.strictEqual(list.pipeline, 29);
        });
    });

    describe('Non-parameterized ADT', () => {
        it('inverse works on non-parameterized data types', () => {
            const NumList = data(() => ({
                Nil: {},
                Cons: { head: Number, tail: Number },

                double: map({ out: Number })({
                    head: (x: number) => x * 2,
                    tail: (x: number) => x * 2
                }),
                halve: map({ out: Number, inverse: 'double' })({
                    head: (x: number) => x / 2,
                    tail: (x: number) => x / 2
                }),

                roundTrip: merge('double', 'halve')
            }));

            const item = NumList.Cons({ head: 10, tail: 20 });
            const result = item.roundTrip;
            assert.strictEqual(result.head, 10);
            assert.strictEqual(result.tail, 20);
        });
    });
});
