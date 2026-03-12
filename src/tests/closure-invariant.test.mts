import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { relation, data, invariant, fold, origin, destination } from '../index.mjs';

describe('Closure — Invariant Enforcement', () => {
    test('invariant rejects invalid compositions during closure', () => {
        const Ancestor = relation(({ Family }) => ({
            Direct: { from: String, to: String },
            Transitive: { hop: Family, rest: Family },

            [origin]: fold({ out: String })({
                Direct: ({ from }) => from,
                Transitive: ({ hop }) => hop
            }),
            [destination]: fold({ out: String })({
                Direct: ({ to }) => to,
                Transitive: ({ rest }) => rest
            })
        }));

        // Disconnected pairs: a→b, c→d (no path from a to d, b≠c)
        const facts = [
            Ancestor.Direct('a', 'b'),
            Ancestor.Direct('c', 'd')
        ];

        const closed = Ancestor.closure(facts);

        assert.strictEqual(closed.length, 2,
            'Should not derive any transitive facts from disconnected pairs');
    });

    test('invariant on leaf constructor enforced in base facts', () => {
        // This test uses raw data() since it's about user-defined leaf invariants,
        // not relational join conditions.
        const Edge = data(() => ({
            Edge: {
                [invariant]: ({ from, to }) => from !== to,
                from: String,
                to: String
            }
        }));

        // Self-loop violates invariant
        assert.throws(() => Edge.Edge('a', 'a'), /Invariant violation/);

        // Valid edge
        const e = Edge.Edge('a', 'b');
        assert.equal(e.from, 'a');
        assert.equal(e.to, 'b');
    });

    test('closure with mixed valid/invalid compositions', () => {
        const Reach = relation(({ Family }) => ({
            Step: { from: String, to: String },
            Chain: { first: Family, rest: Family },

            [origin]: fold({ out: String })({
                Step: ({ from }) => from,
                Chain: ({ first }) => first
            }),
            [destination]: fold({ out: String })({
                Step: ({ to }) => to,
                Chain: ({ rest }) => rest
            })
        }));

        // a→b, b→c, d→e  (d→e is disconnected from a→b→c path)
        const facts = [
            Reach.Step('a', 'b'),
            Reach.Step('b', 'c'),
            Reach.Step('d', 'e')
        ];

        const closed = Reach.closure(facts);

        // Should derive Chain(Step(a,b), Step(b,c)) → a→c (valid: b===b)
        // Invalid compositions like (b→c, d→e) rejected by invariant (c ≠ d)
        assert.ok(closed.length >= 4,
            `Expected at least 4 facts, got ${closed.length}`);
    });
});
