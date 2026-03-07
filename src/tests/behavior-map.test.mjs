/**
 * Behavior Map Tests
 *
 * Tests for the lazy natural transformation (map) operation on behavior types.
 * Behavior map is the dual of data map:
 * - Data map: eagerly reconstructs the structure O(n)
 * - Behavior map: lazily wraps, O(1) creation, transform applied on observation
 *
 * Map propagates through continuations: accessing .tail on a mapped instance
 * yields another mapped instance (same transform applied throughout).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior, op, spec, operations } from '../index.mjs';

// Shared Stream fixture
function makeStream() {
    return behavior(({ Self, T }) => ({
        head: T,
        tail: Self(T),
        From: {
            [op]: 'unfold',
            [spec]: { in: Number, out: Self },
            head: (n) => n,
            tail: (n) => n + 1
        },
        take: {
            [op]: 'fold',
            [spec]: { in: Number, out: Array },
            _: ({ head, tail }, n) => n > 0 ? [head, ...tail(n - 1)] : []
        },
        doubled: {
            [op]: 'map',
            T: (x) => x * 2
        },
        negated: {
            [op]: 'map',
            T: (x) => -x
        },
        apply: {
            [op]: 'map',
            T: (x, f) => f(x)   // extra param → method
        }
    }));
}

describe('Behavior Map - Getter (no extra args)', () => {
    it('should double all stream elements via map getter', () => {
        const Stream = makeStream();
        const nums = Stream.From(0);

        assert.deepEqual(nums.doubled.take(5), [0, 2, 4, 6, 8]);
    });

    it('should negate all stream elements', () => {
        const Stream = makeStream();
        const nums = Stream.From(1);

        assert.deepEqual(nums.negated.take(4), [-1, -2, -3, -4]);
    });

    it('original stream is unaffected by map', () => {
        const Stream = makeStream();
        const nums = Stream.From(0);

        nums.doubled.take(5);         // trigger map
        assert.deepEqual(nums.take(5), [0, 1, 2, 3, 4]);   // unchanged
    });
});

describe('Behavior Map - Method (extra args)', () => {
    it('should support map with extra user-supplied function', () => {
        const Stream = makeStream();
        const nums = Stream.From(0);

        assert.deepEqual(nums.apply(x => x * 3).take(5), [0, 3, 6, 9, 12]);
    });

    it('different extra args create independent mapped instances', () => {
        const Stream = makeStream();
        const nums = Stream.From(1);

        assert.deepEqual(nums.apply(x => x * 2).take(3), [2, 4, 6]);
        assert.deepEqual(nums.apply(x => x + 10).take(3), [11, 12, 13]);
    });
});

describe('Behavior Map - Chain Composition', () => {
    it('should support chained maps', () => {
        const Stream = makeStream();
        const nums = Stream.From(0);

        // doubled.doubled = quadrupled
        assert.deepEqual(nums.doubled.doubled.take(4), [0, 4, 8, 12]);
    });

    it('chained map + fold compose correctly', () => {
        const Stream = makeStream();
        const nums = Stream.From(0);

        // sum(5) of doubled stream = 0+2+4+6+8 = 20
        const Stream2 = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T),
            From: {
                [op]: 'unfold',
                [spec]: { in: Number, out: Self },
                head: (n) => n,
                tail: (n) => n + 1
            },
            doubled: { [op]: 'map', T: (x) => x * 2 },
            sum: {
                [op]: 'fold',
                [spec]: { in: Number, out: Number },
                _: ({ head, tail }, n) => n > 0 ? head + tail(n - 1) : 0
            }
        }));

        const s = Stream2.From(0);
        assert.equal(s.doubled.sum(5), 20);   // 0+2+4+6+8
    });
});

describe('Behavior Map - Propagates through continuations', () => {
    it('map propagates to all continuation instances', () => {
        const Stream = makeStream();
        const nums = Stream.From(0);
        const doubled = nums.doubled;

        // Each .tail access on the mapped instance should also be doubled
        assert.equal(doubled.head, 0 * 2);
        assert.equal(doubled.tail.head, 1 * 2);
        assert.equal(doubled.tail.tail.head, 2 * 2);
        assert.equal(doubled.tail.tail.tail.head, 3 * 2);
    });

    it('map on tail produces a mapped tail', () => {
        const Stream = makeStream();
        const nums = Stream.From(5);

        // From(5): head=5, tail→From(6): head=6, ...
        assert.deepEqual(nums.doubled.take(3), [10, 12, 14]);
    });
});

describe('Behavior Map - Lazy (transformed only on access)', () => {
    it('map creation is O(1) — no observation happens at map time', () => {
        let accessCount = 0;

        const Stream = behavior(({ Self }) => ({
            head: Number,
            tail: Self,
            From: {
                [op]: 'unfold',
                [spec]: { in: Number, out: Self },
                head: (n) => { accessCount++; return n; },
                tail: (n) => n + 1
            },
            doubled: { [op]: 'map', T: (x) => x * 2 }
        }));

        const nums = Stream.From(0);
        accessCount = 0;

        // Creating the map should NOT trigger any observation
        const mapped = nums.doubled;
        assert.equal(accessCount, 0, 'no observations at map creation time');

        // Accessing head SHOULD trigger one observation
        void mapped.head;
        assert.equal(accessCount, 1, 'one observation after accessing head');
    });
});

describe('Behavior Map - Validation', () => {
    it('throws if map name is PascalCase', () => {
        assert.throws(() => {
            behavior(({ Self, T }) => ({
                head: T,
                tail: Self(T),
                Doubled: { [op]: 'map', T: (x) => x * 2 }  // PascalCase
            }));
        }, /camelCase/);
    });

    it('throws if transform is not a function', () => {
        assert.throws(() => {
            behavior(({ Self, T }) => ({
                head: T,
                tail: Self(T),
                doubled: { [op]: 'map', T: 42 }  // not a function
            }));
        }, /function/);
    });
});
