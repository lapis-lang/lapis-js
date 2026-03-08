/**
 * Behavior Merge Tests
 *
 * A merge composes a pipeline of operations (unfold → map* → fold) into a
 * single named callable. Two naming conventions:
 *
 *   - Static (PascalCase)  — if the pipeline includes an unfold step.
 *     Called on the type: `Stream.TakeDoubled(seed, ...foldParams)`
 *
 *   - Instance (camelCase) — if the pipeline is fold-only (possibly with maps).
 *     Called on an instance: `stream.doubledSum(...foldParams)`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior, merge, unfold, map, fold } from '../index.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStream() {
    return behavior(({ Self, T }) => ({
        head: T,
        tail: Self(T),
        From: unfold({ in: Number, out: Self })({
            head: (n) => n,
            tail: (n) => n + 1
        }),
        take: fold({ in: Number, out: Array })({
            _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
        }),
        sum: fold({ in: Number, out: Number })({
            _: ({ head, tail }, n) => n > 0 ? head + tail(n - 1) : 0
        }),
        doubled: map({})({
            T: (x) => x * 2
        }),
        negated: map({})({
            T: (x) => -x
        }),
        // Static merge: unfold + map + fold  → PascalCase
        TakeFrom: merge('From', 'take'),
        TakeDoubled: merge('From', 'doubled', 'take'),
        SumDoubled: merge('From', 'doubled', 'sum'),
        // Instance merge: map + fold only → camelCase
        doubledSum: merge('doubled', 'sum'),
        doubledTake: merge('doubled', 'take'),
        doubledNegatedTake: merge('doubled', 'negated', 'take')
    }));
}

// ---------------------------------------------------------------------------
// Static Merge (includes unfold → PascalCase on the type)
// ---------------------------------------------------------------------------

describe('Behavior Merge - Static (PascalCase, includes unfold)', () => {
    it('TakeFrom(seed, n) = take(n) on From(seed)', () => {
        const Stream = makeStream();
        assert.deepEqual(Stream.TakeFrom(0, 5), [0, 1, 2, 3, 4]);
    });

    it('TakeDoubled(seed, n) = doubled stream taken n times', () => {
        const Stream = makeStream();
        assert.deepEqual(Stream.TakeDoubled(0, 5), [0, 2, 4, 6, 8]);
    });

    it('SumDoubled(seed, n) = sum of doubled stream for n elements', () => {
        const Stream = makeStream();
        // From(0).doubled.sum(5) = 0+2+4+6+8 = 20
        assert.equal(Stream.SumDoubled(0, 5), 20);
    });

    it('static merge works with different seeds', () => {
        const Stream = makeStream();
        assert.deepEqual(Stream.TakeDoubled(3, 4), [6, 8, 10, 12]);
    });
});

// ---------------------------------------------------------------------------
// Instance Merge (fold/map only → camelCase on instances)
// ---------------------------------------------------------------------------

describe('Behavior Merge - Instance (camelCase, no unfold)', () => {
    it('doubledSum(n) on instance = sum of doubled elements', () => {
        const Stream = makeStream();
        const s = Stream.From(0);
        assert.equal(s.doubledSum(5), 20);   // 0+2+4+6+8
    });

    it('doubledTake(n) on instance = doubled stream taken n times', () => {
        const Stream = makeStream();
        const s = Stream.From(0);
        assert.deepEqual(s.doubledTake(5), [0, 2, 4, 6, 8]);
    });

    it('doubledNegatedTake(n) = negated(doubled) taken n times', () => {
        const Stream = makeStream();
        const s = Stream.From(1);
        // doubled: 2,4,6,8  then negated: -2,-4,-6,-8
        assert.deepEqual(s.doubledNegatedTake(4), [-2, -4, -6, -8]);
    });

    it('instance merge does not mutate the original stream', () => {
        const Stream = makeStream();
        const s = Stream.From(0);
        s.doubledTake(5);
        assert.deepEqual(s.take(5), [0, 1, 2, 3, 4]);   // unchanged
    });
});

// ---------------------------------------------------------------------------
// Merge equivalences (merge = manual composition)
// ---------------------------------------------------------------------------

describe('Behavior Merge - Equivalence with manual composition', () => {
    it('Stream.TakeDoubled(n, k) ≡ Stream.From(n).doubled.take(k)', () => {
        const Stream = makeStream();
        for (const seed of [0, 5, 10]) {
            for (const count of [0, 3, 7]) {
                assert.deepEqual(
                    Stream.TakeDoubled(seed, count),
                    Stream.From(seed).doubled.take(count),
                    `seed=${seed}, count=${count}`
                );
            }
        }
    });

    it('instance.doubledSum(n) ≡ instance.doubled.sum(n)', () => {
        const Stream = makeStream();
        const s = Stream.From(0);
        for (const n of [0, 1, 5]) 
            assert.equal(s.doubledSum(n), s.doubled.sum(n), `n=${n}`);
        
    });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('Behavior Merge - Validation', () => {
    it('static merge (includes unfold) must be PascalCase', () => {
        assert.throws(() => {
            behavior(({ Self, T }) => ({
                head: T,
                tail: Self(T),
                From: unfold({ in: Number, out: Self })({
                    head: (n) => n,
                    tail: (n) => n + 1
                }),
                take: fold({ in: Number, out: Array })({
                    _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
                }),
                takefrom: merge('From', 'take')
            }));
        }, /PascalCase/);
    });

    it('instance merge (no unfold) must be camelCase', () => {
        assert.throws(() => {
            behavior(({ Self, T }) => ({
                head: T,
                tail: Self(T),
                From: unfold({ in: Number, out: Self })({
                    head: (n) => n,
                    tail: (n) => n + 1
                }),
                take: fold({ in: Number, out: Array })({
                    _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
                }),
                doubled: map({})({
                    T: (x) => x * 2
                }),
                DoubledTake: merge('doubled', 'take')
            }));
        }, /camelCase/);
    });

    it('throws if a referenced operation does not exist', () => {
        assert.throws(() => {
            behavior(({ Self, T }) => ({
                head: T,
                tail: Self(T),
                From: unfold({ in: Number, out: Self })({
                    head: (n) => n,
                    tail: (n) => n + 1
                }),
                Bogus: merge('From', 'nonexistent')
            }));
        }, /nonexistent|not found|unknown/i);
    });
});
