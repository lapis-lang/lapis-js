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
        TakeDoubledNegated: merge('From', 'doubled', 'negated', 'take'),
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

// ---------------------------------------------------------------------------
// Deforestation (pre-composed handlers eliminate intermediate instances)
// ---------------------------------------------------------------------------

describe('Behavior Merge - Deforestation', () => {
    it('multi-map static merge produces correct results (pre-composed)', () => {
        const Stream = makeStream();
        // doubled then negated: n → n*2 → -(n*2)
        // From(1): head values 1,2,3,4 → doubled 2,4,6,8 → negated -2,-4,-6,-8
        assert.deepEqual(Stream.TakeDoubledNegated(1, 4), [-2, -4, -6, -8]);
    });

    it('static merge equivalence holds after deforestation', () => {
        const Stream = makeStream();
        // Deforested merge should equal manual composition
        for (const seed of [0, 3, 7]) {
            for (const count of [0, 2, 5]) {
                assert.deepEqual(
                    Stream.TakeDoubled(seed, count),
                    Stream.From(seed).doubled.take(count),
                    `TakeDoubled: seed=${seed}, count=${count}`
                );
                assert.equal(
                    Stream.SumDoubled(seed, count),
                    Stream.From(seed).doubled.sum(count),
                    `SumDoubled: seed=${seed}, count=${count}`
                );
            }
        }
    });

    it('instance-level multi-map merge equivalence (doubledNegatedTake)', () => {
        const Stream = makeStream();
        const s = Stream.From(1);
        for (const n of [0, 1, 4, 6]) {
            assert.deepEqual(
                s.doubledNegatedTake(n),
                s.doubled.negated.take(n),
                `n=${n}`
            );
        }
    });

    it('instance merge does not affect original instance observations', () => {
        const Stream = makeStream();
        const s = Stream.From(0);
        // Access the merged operation
        s.doubledSum(5);
        // Original observations unaffected
        assert.equal(s.head, 0);
        assert.equal(s.tail.head, 1);
    });
});

// ---------------------------------------------------------------------------
// Metamorphism (fold → unfold, instance getter, camelCase)
// ---------------------------------------------------------------------------

function makeMetaStream() {
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
        // Getter fold: extract the first element (no extra parameters)
        first: fold({ out: Number })({
            _: ({ head }) => head
        }),
        doubled: map({})({
            T: (x) => x * 2
        }),
        negated: map({})({
            T: (x) => -x
        }),
        // Metamorphism: fold first element, unfold into new stream
        restart: merge('first', 'From'),
        // Metamorphism with pre-fold map
        doubledRestart: merge('doubled', 'first', 'From'),
        // Metamorphism with post-unfold map
        restartDoubled: merge('first', 'From', 'doubled'),
        // Metamorphism with both pre-fold and post-unfold maps
        doubledRestartNegated: merge('doubled', 'first', 'From', 'negated')
    }));
}

describe('Behavior Merge - Metamorphism (fold → unfold)', () => {
    it('basic fold→unfold produces a new behavior instance', () => {
        const Stream = makeMetaStream();
        const s = Stream.From(5);
        const restarted: any = s.restart;
        // first folds to head (5), From(5) unfolds: 5,6,7,8,...
        assert.deepEqual(restarted.take(4), [5, 6, 7, 8]);
    });

    it('metamorphism on a tail shifts the restart point', () => {
        const Stream = makeMetaStream();
        const s = Stream.From(5).tail; // head=6
        const restarted: any = s.restart;
        assert.deepEqual(restarted.take(4), [6, 7, 8, 9]);
    });

    it('metamorphism result is a valid behavior instance', () => {
        const Stream = makeMetaStream();
        const s = Stream.From(3);
        const restarted: any = s.restart;
        assert.equal(restarted.head, 3);
        assert.equal(restarted.tail.head, 4);
        assert.equal(restarted.tail.tail.head, 5);
    });

    it('metamorphism does not mutate the original instance', () => {
        const Stream = makeMetaStream();
        const s = Stream.From(10);
        s.restart;
        assert.equal(s.head, 10);
        assert.equal(s.tail.head, 11);
    });
});

describe('Behavior Merge - Metamorphism equivalence', () => {
    it('stream.restart ≡ Stream.From(stream.first)', () => {
        const Stream = makeMetaStream();
        for (const seed of [0, 5, 10]) {
            const s = Stream.From(seed);
            assert.deepEqual(
                (s.restart as any).take(5),
                Stream.From(s.first).take(5),
                `seed=${seed}`
            );
        }
    });

    it('stream.doubledRestart ≡ Stream.From(stream.doubled.first)', () => {
        const Stream = makeMetaStream();
        for (const seed of [0, 3, 7]) {
            const s = Stream.From(seed);
            assert.deepEqual(
                (s.doubledRestart as any).take(4),
                Stream.From(s.doubled.first).take(4),
                `seed=${seed}`
            );
        }
    });

    it('stream.restartDoubled ≡ Stream.From(stream.first).doubled', () => {
        const Stream = makeMetaStream();
        for (const seed of [1, 5, 10]) {
            const s = Stream.From(seed);
            assert.deepEqual(
                (s.restartDoubled as any).take(4),
                Stream.From(s.first).doubled.take(4),
                `seed=${seed}`
            );
        }
    });

    it('stream.doubledRestartNegated ≡ Stream.From(stream.doubled.first).negated', () => {
        const Stream = makeMetaStream();
        for (const seed of [1, 4, 8]) {
            const s = Stream.From(seed);
            assert.deepEqual(
                (s.doubledRestartNegated as any).take(4),
                Stream.From(s.doubled.first).negated.take(4),
                `seed=${seed}`
            );
        }
    });
});

describe('Behavior Merge - Metamorphism validation', () => {
    it('metamorphism must be camelCase (fold→unfold is instance getter)', () => {
        assert.throws(() => {
            behavior(({ Self, T }) => ({
                head: T,
                tail: Self(T),
                From: unfold({ in: Number, out: Self })({
                    head: (n) => n,
                    tail: (n) => n + 1
                }),
                first: fold({ out: Number })({
                    _: ({ head }) => head
                }),
                RestartBad: merge('first', 'From')
            }));
        }, /camelCase/);
    });
});
