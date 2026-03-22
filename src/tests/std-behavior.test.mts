/**
 * Standard Library — Behavior Type Tests
 *
 * Tests for Stream, LazyMap, LazySet.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Stream } from '../std/behavior/Stream.mjs';
import { LazyMap } from '../std/behavior/LazyMap.mjs';
import { LazySet } from '../std/behavior/LazySet.mjs';

import { Functor }  from '../std/protocols/Functor.mjs';
import { Foldable } from '../std/protocols/Foldable.mjs';

// ── Stream ───────────────────────────────────────────────────────────────────

describe('Stream', () => {
    it('Nats produces natural numbers', () => {
        const nats = Stream.Nats(0);
        assert.deepEqual(nats.take(5), [0, 1, 2, 3, 4]);
    });

    it('Constant produces infinite constant stream', () => {
        const cs = Stream.Constant({ value: 7 });
        assert.deepEqual(cs.take(4), [7, 7, 7, 7]);
    });

    it('From produces a custom stream', () => {
        const powers = Stream.From({ value: 1, next: (x: number) => x * 2 });
        assert.deepEqual(powers.take(5), [1, 2, 4, 8, 16]);
    });

    it('fmap lazily transforms elements', () => {
        const nats = Stream.Nats(1);
        const doubled = nats.fmap((x: number) => x * 2);
        assert.deepEqual(doubled.take(4), [2, 4, 6, 8]);
    });

    it('fmap composes via chaining', () => {
        const nats = Stream.Nats(0);
        const result = nats.fmap((x: number) => x + 1).fmap((x: number) => x * 10);
        assert.deepEqual(result.take(3), [10, 20, 30]);
    });

    it('Pure creates a constant stream', () => {
        const ps = Stream.Pure({ value: 42 });
        assert.deepEqual(ps.take(3), [42, 42, 42]);
    });

    it('Apply zips a function stream with a value stream', () => {
        const fns = Stream.From({ value: (x: number) => x * 2, next: () => (x: number) => x + 100 });
        const vals = Stream.Nats(1);
        const result = Stream.Apply({ fns, vals });
        // head: (x => x*2)(1) = 2
        // next fn: x => x+100, next val: 2 → head: (x => x+100)(2) = 102
        assert.strictEqual(result.head, 2);
        assert.strictEqual(result.tail.head, 102);
    });

    it('satisfies Functor', () => {
        const s = Stream.Nats(0);
        assert.ok(s instanceof Functor);
    });
});

// ── LazyMap ──────────────────────────────────────────────────────────────────

describe('LazyMap', () => {
    it('FromEntries supports lookup', () => {
        const m = LazyMap.FromEntries([['a', 1], ['b', 2], ['c', 3]]);
        assert.strictEqual(m.lookup('a'), 1);
        assert.strictEqual(m.lookup('b'), 2);
        assert.strictEqual(m.lookup('z'), undefined);
    });

    it('FromEntries supports has', () => {
        const m = LazyMap.FromEntries([['x', 10]]);
        assert.strictEqual(m.has('x'), true);
        assert.strictEqual(m.has('y'), false);
    });

    it('FromEntries reports size', () => {
        const m = LazyMap.FromEntries([['a', 1], ['b', 2]]);
        assert.strictEqual(m.size, 2);
    });

    it('FromObject supports lookup', () => {
        const m = LazyMap.FromObject({ name: 'Alice', age: 30 });
        assert.strictEqual(m.lookup('name'), 'Alice');
        assert.strictEqual(m.lookup('age'), 30);
        assert.strictEqual(m.lookup('missing'), undefined);
    });

    it('fmap transforms values lazily', () => {
        const m = LazyMap.FromEntries([['a', 1], ['b', 2]]);
        const doubled = m.fmap((v: number) => v * 2);
        assert.strictEqual(doubled.lookup('a'), 2);
        assert.strictEqual(doubled.lookup('b'), 4);
    });

    it('satisfies Functor and Foldable', () => {
        const m = LazyMap.FromEntries([['a', 1]]);
        assert.ok(m instanceof Functor);
        assert.ok(m instanceof Foldable);
    });
});

// ── LazySet ──────────────────────────────────────────────────────────────────

describe('LazySet', () => {
    it('FromArray supports has', () => {
        const s = LazySet.FromArray([1, 2, 3]);
        assert.strictEqual(s.has(1), true);
        assert.strictEqual(s.has(4), false);
    });

    it('FromArray reports size (deduplicates)', () => {
        const s = LazySet.FromArray([1, 1, 2, 2, 3]);
        assert.strictEqual(s.size, 3);
    });

    it('Empty set', () => {
        const s = LazySet.Empty({});
        assert.strictEqual(s.has('anything'), false);
        assert.strictEqual(s.size, 0);
    });

    it('Singleton', () => {
        const s = LazySet.Singleton({ value: 42 });
        assert.strictEqual(s.has(42), true);
        assert.strictEqual(s.has(99), false);
        assert.strictEqual(s.size, 1);
    });

    it('satisfies Foldable', () => {
        const s = LazySet.FromArray([1]);
        assert.ok(s instanceof Foldable);
    });
});
