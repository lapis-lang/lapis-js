/**
 * Behavior Scan Tests
 *
 * Tests for the scan operation on behavior types — the coalgebraic dual of
 * data scan.
 *
 * A behavior scan steps through a linear (stream-like) behavior N times,
 * applying a fold at each successive position, and returns the collected
 * fold results as an array of length N.
 *
 * Formally, for behavior `b` with continuation observer `c` and fold `f`:
 *   b.scanName(N, ...args) ≡ [f(b, ...args), f(c(b), ...args), ..., f(c^{N-1}(b), ...args)]
 *
 * Scan Lemma (co-variant):
 *   scan_F(φ) ≡ [φ(b₀), φ(b₁), ..., φ(bₙ)]  where bᵢ = cᵢ(b)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior } from '../index.mjs';

// ---------------------------------------------------------------------------
// Helpers: a standard natural-number stream
// ---------------------------------------------------------------------------

const makeNumStream = () => behavior(self => ({
    head: Object,
    tail: self
})).ops(({ fold, unfold, scan, self }) => ({
    From: unfold({ in: Number, out: self })({
        head: (n: number) => n,
        tail: (n: number) => n + 1
    }),
    // Getter fold: returns the head value at the current position
    value: fold({ out: Number })({
        _: ({ head }: { head: unknown }) => head as number
    }),
    // Parameterized fold: sums the next n elements starting from this position
    sum: fold({ in: Number, out: Number })({
        _: ({ head, tail }: { head: unknown; tail: (...args: unknown[]) => unknown }, n: number) =>
            n > 0 ? (head as number) + (tail(n - 1) as number) : 0
    }),
    // Scan: value at each of N successive positions
    scanValue: scan('value'),
    // Scan: sum(k) at each of N successive positions (sliding-window)
    scanSum: scan('sum')
}));

// ---------------------------------------------------------------------------
// Basic scan: getter fold
// ---------------------------------------------------------------------------

describe('Behavior Scan - getter fold', () => {
    it('scanValue(0) returns empty array', () => {
        const s: any = makeNumStream().From(0);
        assert.deepEqual(s.scanValue(0), []);
    });

    it('scanValue(1) returns [head]', () => {
        const s: any = makeNumStream().From(0);
        assert.deepEqual(s.scanValue(1), [0]);
    });

    it('scanValue(5) returns first 5 values', () => {
        const s: any = makeNumStream().From(0);
        assert.deepEqual(s.scanValue(5), [0, 1, 2, 3, 4]);
    });

    it('scanValue(5) on From(10) returns [10, 11, 12, 13, 14]', () => {
        const s: any = makeNumStream().From(10);
        assert.deepEqual(s.scanValue(5), [10, 11, 12, 13, 14]);
    });

    it('scan is equivalent to take on the head observer', () => {
        const Stream = makeNumStream();
        const s: any = Stream.From(0);
        // take grabs N heads starting at position 0
        const take5 = s.scanValue(5);
        // they should match the first 5 heads
        for (let i = 0; i < 5; i++)
            assert.equal(take5[i], i);
    });
});

// ---------------------------------------------------------------------------
// Parameterized fold: sliding-window sums
// ---------------------------------------------------------------------------

describe('Behavior Scan - parameterized fold', () => {
    it('scanSum(0, 3) returns empty array', () => {
        const s: any = makeNumStream().From(0);
        assert.deepEqual(s.scanSum(0, 3), []);
    });

    it('scanSum(1, 3) returns [sum(From(0), 3)]', () => {
        const s: any = makeNumStream().From(0);
        // sum(From(0), 3) = 0 + 1 + 2 = 3
        assert.deepEqual(s.scanSum(1, 3), [3]);
    });

    it('scanSum(3, 3) returns three sliding-window sums of width 3', () => {
        const s: any = makeNumStream().From(0);
        // position 0: sum(0..2) = 0+1+2 = 3
        // position 1: sum(1..3) = 1+2+3 = 6
        // position 2: sum(2..4) = 2+3+4 = 9
        assert.deepEqual(s.scanSum(3, 3), [3, 6, 9]);
    });

    it('scanSum(5, 1) returns each head (width-1 window)', () => {
        const s: any = makeNumStream().From(0);
        // sum(pos, 1) = head at pos
        assert.deepEqual(s.scanSum(5, 1), [0, 1, 2, 3, 4]);
    });

    it('scanSum(5, 0) returns all zeros (empty sum)', () => {
        const s: any = makeNumStream().From(0);
        // sum(pos, 0) = 0 for every position
        assert.deepEqual(s.scanSum(5, 0), [0, 0, 0, 0, 0]);
    });
});

// ---------------------------------------------------------------------------
// Co-Horner behavior merge: fold(⊗) ∘ fold(⊕) where ⊗ distributes over ⊕
// ---------------------------------------------------------------------------

describe('Behavior Co-Horner merge', () => {
    /**
     * Co-Horner composition: an inner fold that returns a new behavior instance
     * (created by passing the current head to the unfold constructor) followed by
     * an outer fold that reduces it.  When the inner fold is annotated with
     * `distributive:outerFoldName`, the pipeline is accepted and executed as two
     * sequential observations in a single registered operation.
     */
    it('co-Horner merge executes inner fold then outer fold on the result', () => {
        // We capture a reference so the inner fold handler can call From() at runtime.
        let StreamRef: any = null;

        const Stream = behavior(self => ({
            head: Number,
            tail: self
        })).ops(({ fold, unfold, merge, self }) => ({
            From: unfold({ in: Number, out: self })({
                head: (n: number) => n,
                tail: (n: number) => n + 1
            }),
            // inner fold: takes n steps forward from the NEXT position,
            // returning a new Stream seeded from (head + n) via From.
            // out: self; distributive:headVal so it can be composed via co-Horner.
            skipToN: fold({
                in: Number,
                out: self,
                properties: ['distributive:headVal']
            })({
                // @ts-expect-error — fold returning a behavior instance (out: self)
                _: ({ head }: any, n: number): unknown =>
                    // Create a fresh stream whose first element is (head + n)
                    (StreamRef as any).From((head as number) + n)
            }),
            // outer fold: extracts the head (first element) of any stream
            headVal: fold({ out: Number })({
                _: ({ head }: any) => head as number
            }),
            // co-Horner merge: skipToN(b, k) → From(b.head + k) → headVal = b.head + k
            skipNThenHead: merge('skipToN', 'headVal')
        }));

        StreamRef = Stream;

        const s: any = Stream.From(0);
        // skipNThenHead(b, 3): From(0 + 3) = From(3) → headVal = 3
        assert.equal(s.skipNThenHead(3), 3);
        // skipNThenHead(From(10), 5) = 10 + 5 = 15
        assert.equal((Stream.From(10) as any).skipNThenHead(5), 15);
    });

    it('merge of two folds without distributive annotation throws TypeError', () => {
        assert.throws(() => {
            behavior(self => ({
                head: Number,
                tail: self
            })).ops(({ fold, unfold, merge, self }) => ({
                From: unfold({ in: Number, out: self })({
                    head: (n: number) => n,
                    tail: (n: number) => n + 1
                }),
                sumN: fold({ in: Number, out: Number })({
                    _: ({ head, tail }: any, n: number) => n > 0 ? (head as number) + (tail(n - 1) as number) : 0
                }),
                productN: fold({ in: Number, out: Number })({
                    _: ({ head, tail }: any, n: number) => n > 0 ? (head as number) * (tail(n - 1) as number) : 1
                }),
                // Two scalar folds without distributive annotation → must throw
                badMerge: merge('sumN', 'productN')
            }));
        }, /distributive/i);
    });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('Behavior Scan - validation', () => {
    it('scan on a non-linear behavior (2 continuations) throws TypeError', () => {
        assert.throws(() => {
            behavior(self => ({
                value: Number,
                left: self,
                right: self
            })).ops(({ fold, scan }) => ({
                nodeVal: fold({ out: Number })({ _: ({ value }: any) => value as number }),
                // Tree behavior has 2 continuations — scan must reject this
                badScan: scan('nodeVal')
            }));
        }, /exactly one continuation/i);
    });

    it('scan results have correct length', () => {
        const s: any = makeNumStream().From(0);
        for (const n of [0, 1, 3, 10]) {
            const result = s.scanValue(n);
            assert.equal(result.length, n, `Expected length ${n}, got ${result.length}`);
        }
    });
});
