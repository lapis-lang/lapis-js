/**
 * Tests for relation() join invariant for cross-sort ADT fields.
 *
 * With the sorts-as-types architecture, variant fields may reference
 * another relation ADT directly (e.g. `first: Step`) instead of using the
 * `family` sentinel. This file verifies that `relation()` correctly classifies
 * such fields as "family-like" and auto-generates the join invariant
 * `first.destination === second.origin`.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { relation, origin, destination, extend } from '../index.mjs';

// ── Shared fixtures ──────────────────────────────────────────────────────────

// Base relation: single-hop step between string endpoints.
const Step = relation(family => ({
    Direct: { from: String, to: String }
})).ops(({ fold, origin, destination }) => ({
    [origin]: fold({ out: String })({
        Direct: ({ from }) => from
    }),
    [destination]: fold({ out: String })({
        Direct: ({ to }) => to
    })
}));

// Extended relation: composes two Step instances into a multi-hop chain.
// Multi has two fields typed by Step (a peer relation ADT — not the family
// sentinel). The join invariant `first[destination] === second[origin]`
// should be auto-generated.
const Chain = relation(family => ({
    [extend]: Step,
    Multi: { first: Step, second: Step }
})).ops(({ fold, origin, destination }) => ({
    [origin]: fold({ out: String })({
        Direct: ({ from }) => from,
        // Cross-sort fields are not auto-folded; access the fold result explicitly.
        Multi:  ({ first }) => (first as Record<symbol, string>)[origin]
    }),
    [destination]: fold({ out: String })({
        Direct: ({ to }) => to,
        Multi:  ({ second }) => (second as Record<symbol, string>)[destination]
    })
}));

// ── AC1 — join invariant enforced: matching endpoints succeed ─────────────────

describe('relation cross-sort — AC1: matching endpoints construct successfully', () => {
    test('Multi with matching endpoints (first[dest] === second[origin]) constructs without error', () => {
        const ab = Step.Direct('a', 'b');
        const bc = Step.Direct('b', 'c');
        // first[destination] = 'b', second[origin] = 'b' — valid composition
        assert.doesNotThrow(() => Chain.Multi({ first: ab, second: bc }));
    });

    test('constructed Multi instance has correct endpoints via origin/destination', () => {
        const ab = Step.Direct('a', 'b');
        const bc = Step.Direct('b', 'c');
        const multi = Chain.Multi({ first: ab, second: bc });
        assert.strictEqual(multi[origin], 'a');
        assert.strictEqual(multi[destination], 'c');
    });
});

// ── AC2 — join invariant enforced: mismatched endpoints throw TypeError ────────

describe('relation cross-sort — AC2: mismatched endpoints throw TypeError', () => {
    test('Multi with mismatched endpoints (first[dest] !== second[origin]) throws TypeError', () => {
        const ab = Step.Direct('a', 'b');
        const cd = Step.Direct('c', 'd');
        // first[destination] = 'b', second[origin] = 'c' — invalid composition
        assert.throws(
            () => Chain.Multi({ first: ab, second: cd }),
            TypeError
        );
    });
});

// ── AC3 — closure(), reachableFrom(), reachingTo() work on cross-sort relation ─

describe('relation cross-sort — AC3a: closure() produces correct transitive pairs', () => {
    test('closure over Direct base facts derives Multi chain facts', () => {
        // Must use Chain.Direct (not Step.Direct): closure() validates instanceof Chain.
        const baseFacts = [
            Chain.Direct({ from: 'a', to: 'b' }),
            Chain.Direct({ from: 'b', to: 'c' }),
            Chain.Direct({ from: 'c', to: 'd' })
        ];

        const closed = Chain.closure(baseFacts);

        const pairs = closed.map((f: unknown) => {
            const o = (f as Record<symbol, unknown>)[origin] as string;
            const d = (f as Record<symbol, unknown>)[destination] as string;
            return `${o}->${d}`;
        });

        // All direct edges preserved
        assert.ok(pairs.includes('a->b'), 'missing a->b');
        assert.ok(pairs.includes('b->c'), 'missing b->c');
        assert.ok(pairs.includes('c->d'), 'missing c->d');
        // Transitive composition should be derived
        assert.ok(pairs.includes('a->c'), 'missing a->c');
        assert.ok(pairs.includes('b->d'), 'missing b->d');
        assert.ok(pairs.includes('a->d'), 'missing a->d');
    });
});

describe('relation cross-sort — AC3b: reachableFrom() returns correct destinations', () => {
    test('reachableFrom over closure returns all reachable destinations from origin', () => {
        const baseFacts = [
            Chain.Direct({ from: 'a', to: 'b' }),
            Chain.Direct({ from: 'b', to: 'c' })
        ];
        const closed = Chain.closure(baseFacts);
        const result = Chain.reachableFrom(closed, ['a']);
        assert.deepStrictEqual((result as string[]).sort(), ['b', 'c']);
    });
});

describe('relation cross-sort — AC3c: reachingTo() returns correct origins', () => {
    test('reachingTo over closure returns all origins that reach a destination', () => {
        const baseFacts = [
            Chain.Direct({ from: 'a', to: 'b' }),
            Chain.Direct({ from: 'b', to: 'c' })
        ];
        const closed = Chain.closure(baseFacts);
        const result = Chain.reachingTo(closed, ['c']);
        assert.deepStrictEqual((result as string[]).sort(), ['a', 'b']);
    });
});

// ── Regression: unrelated relation ADT as metadata field must not be classified
// as a composition (family-like) field, and must not trigger join invariant
// generation or affect closure() behaviour.

describe('relation cross-sort — unrelated relation field treated as leaf metadata', () => {
    // A completely unrelated relation used only as metadata — e.g. provenance.
    const Provenance = relation(family => ({
        Source: { label: String }
    })).ops(({ fold, origin, destination }) => ({
        [origin]:      fold({ out: String })({ Source: ({ label }) => label }),
        [destination]: fold({ out: String })({ Source: ({ label }) => label })
    }));

    // Annotated: Direct carries a Provenance instance as metadata.
    // Annotated does NOT extend Provenance, so Provenance must NOT be treated
    // as a family field — no join invariant should be generated for it.
    const Annotated = relation(family => ({
        Direct: { from: String, to: String, prov: Provenance }
    })).ops(({ fold, origin, destination }) => ({
        [origin]:      fold({ out: String })({ Direct: ({ from }) => from }),
        [destination]: fold({ out: String })({ Direct: ({ to }) => to })
    }));

    test('Direct with prov field constructs without any join invariant restriction', () => {
        const p = Provenance.Source({ label: 'test' });
        assert.doesNotThrow(() => Annotated.Direct({ from: 'a', to: 'b', prov: p }));
    });

    test('Direct is classified as a leaf variant (no composition attempted in closure)', () => {
        const p = Provenance.Source({ label: 'src' });
        const baseFacts = [
            Annotated.Direct({ from: 'a', to: 'b', prov: p }),
            Annotated.Direct({ from: 'b', to: 'c', prov: p })
        ];
        // closure() should return exactly the two base facts — no recursive
        // variant exists, so no new derivations are attempted.
        const closed = Annotated.closure(baseFacts);
        assert.strictEqual(closed.length, 2);
    });
});
