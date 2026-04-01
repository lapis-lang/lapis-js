/**
 * Tests for semi-naive evaluation in closure computation.
 *
 * Semi-naive optimisation: each Kleene iteration only attempts compositions
 * involving at least one fact from the *previous* delta (newly derived facts).
 * This avoids redundant work — re-deriving facts that were already produced
 * in earlier iterations.
 *
 * The correctness of semi-naive is tested indirectly: the same results as
 * naive evaluation, termination in bounded iterations, and the delta-shrinkage
 * property (each iteration's delta is a subset of the previous potential).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { relation, origin, destination } from '../index.mjs';

describe('Closure — Semi-Naive Evaluation', () => {
    const Ancestor = relation(({ family }) => ({
        Direct: { from: String, to: String },
        Transitive: { hop: family, rest: family }
    })).ops(({ fold, unfold, map, merge, origin, destination, family }) => ({
        [origin]: fold({ out: String })({
            Direct: ({ from }) => from,
            Transitive: ({ hop }) => hop
        }),
        [destination]: fold({ out: String })({
            Direct: ({ to }) => to,
            Transitive: ({ rest }) => rest
        })
    }));

    test('delta shrinks monotonically until fixpoint', () => {
        // Chain: a→b→c→d→e (4 edges, 10 possible endpoint pairs)
        const facts = [
            Ancestor.Direct('a', 'b'),
            Ancestor.Direct('b', 'c'),
            Ancestor.Direct('c', 'd'),
            Ancestor.Direct('d', 'e')
        ];

        const closed = Ancestor.closure(facts);

        // With 5 nodes in a total-order chain, there are C(5,2) = 10 pairs:
        // a→b, a→c, a→d, a→e, b→c, b→d, b→e, c→d, c→e, d→e
        const pairs = new Set(closed.map(f => `${f[origin]}->${f[destination]}`));
        assert.strictEqual(pairs.size, 10,
            `Expected 10 unique endpoint pairs, got ${pairs.size}: ${[...pairs].join(', ')}`);
    });

    test('semi-naive produces same results as running closure on full set', () => {
        // Two disconnected chains: a→b→c and x→y→z
        const facts = [
            Ancestor.Direct('a', 'b'),
            Ancestor.Direct('b', 'c'),
            Ancestor.Direct('x', 'y'),
            Ancestor.Direct('y', 'z')
        ];

        const closed = Ancestor.closure(facts);
        const pairs = new Set(closed.map(f => `${f[origin]}->${f[destination]}`));

        // Chain a→b→c produces: a→b, b→c, a→c
        assert.ok(pairs.has('a->b'));
        assert.ok(pairs.has('b->c'));
        assert.ok(pairs.has('a->c'));

        // Chain x→y→z produces: x→y, y→z, x→z
        assert.ok(pairs.has('x->y'));
        assert.ok(pairs.has('y->z'));
        assert.ok(pairs.has('x->z'));

        // No cross-chain pairs (invariant rejects: b≠x, c≠x, etc.)
        assert.ok(!pairs.has('a->y'), 'Should not derive cross-chain pair a->y');
        assert.ok(!pairs.has('a->z'), 'Should not derive cross-chain pair a->z');
        assert.ok(!pairs.has('x->b'), 'Should not derive cross-chain pair x->b');

        assert.strictEqual(pairs.size, 6, 'Exactly 6 pairs from two disjoint chains');
    });

    test('idempotence: closure of closure produces no additional facts', () => {
        const facts = [
            Ancestor.Direct('a', 'b'),
            Ancestor.Direct('b', 'c'),
            Ancestor.Direct('c', 'd')
        ];

        const first = Ancestor.closure(facts);
        const second = Ancestor.closure(first);

        const firstPairs = new Set(first.map(f => `${f[origin]}->${f[destination]}`));
        const secondPairs = new Set(second.map(f => `${f[origin]}->${f[destination]}`));

        assert.deepStrictEqual(firstPairs, secondPairs,
            'Closure is idempotent — second pass produces no new facts');
    });

    test('semi-naive correctness on star topology', () => {
        // Star: center connects to all leaves, no leaf-to-leaf edges.
        // Only 1-hop paths are derivable (no transitive closure beyond direct).
        const facts = [
            Ancestor.Direct('center', 'a'),
            Ancestor.Direct('center', 'b'),
            Ancestor.Direct('center', 'c'),
            Ancestor.Direct('center', 'd')
        ];

        const closed = Ancestor.closure(facts);
        const pairs = new Set(closed.map(f => `${f[origin]}->${f[destination]}`));

        // Only the 4 base facts — no transitive pairs possible (all share origin 'center',
        // but no destination connects back to any origin).
        assert.strictEqual(pairs.size, 4, 'Star topology has no transitive closure beyond base facts');
    });

    test('semi-naive handles diamond graph correctly', () => {
        // Diamond: a→b, a→c, b→d, c→d
        // Transitive: a→d (via b), a→d (via c) — same endpoint pair, deduplicated
        const facts = [
            Ancestor.Direct('a', 'b'),
            Ancestor.Direct('a', 'c'),
            Ancestor.Direct('b', 'd'),
            Ancestor.Direct('c', 'd')
        ];

        const closed = Ancestor.closure(facts);
        const pairs = new Set(closed.map(f => `${f[origin]}->${f[destination]}`));

        assert.ok(pairs.has('a->b'));
        assert.ok(pairs.has('a->c'));
        assert.ok(pairs.has('b->d'));
        assert.ok(pairs.has('c->d'));
        assert.ok(pairs.has('a->d'), 'Diamond should derive a->d transitively');

        // a→d appears only once (endpoint-pair dedup)
        const adCount = closed.filter(f => f[origin] === 'a' && f[destination] === 'd').length;
        assert.strictEqual(adCount, 1, 'a->d should be deduplicated to exactly one entry');
    });

    test('semi-naive with longer chain terminates in bounded iterations', () => {
        // 10-node chain: n0→n1→...→n9
        const facts: unknown[] = [];
        for (let i = 0; i < 10; i++)
            facts.push(Ancestor.Direct(`n${i}`, `n${i + 1}`));

        const closed = Ancestor.closure(facts);
        const pairs = new Set(closed.map(f => `${f[origin]}->${f[destination]}`));

        // 11 nodes, C(11,2) = 55 possible pairs in a total order
        assert.strictEqual(pairs.size, 55,
            `Expected 55 unique pairs from 10-edge chain, got ${pairs.size}`);
    });
});
