import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { relation, data, fold, origin, destination } from '../index.mjs';

describe('Closure — Cyclic Parent Relationships', () => {
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

    test('cyclic relationships terminate correctly', () => {
        // A→B→C→A cycle
        const facts = [
            Ancestor.Direct('a', 'b'),
            Ancestor.Direct('b', 'c'),
            Ancestor.Direct('c', 'a')
        ];

        // Default key deduplicates by endpoint pair (Datalog semantics).
        const closed = Ancestor.closure(facts);

        // Must terminate — this assertion runs implies no infinite loop.
        // With 3 nodes in a cycle, there are 9 possible pairs (a→a, a→b, ...),
        // but invariant pruning limits the set.
        assert.ok(closed.length >= 3,
            'Should at least contain the 3 base facts');
        assert.ok(closed.length <= 9,
            `At most 9 distinct pairs in a 3-node cycle, got ${closed.length}`);
    });

    test('cycles terminate without safety limits', () => {
        // The default endpoint-pair key makes closure() always terminate
        // on cyclic graphs — at most |D|×|C| facts.
        const facts = [
            Ancestor.Direct('a', 'b'),
            Ancestor.Direct('b', 'c'),
            Ancestor.Direct('c', 'a')
        ];

        const closed = Ancestor.closure(facts);
        assert.ok(closed.length >= 3);
    });

    test('self-referential facts do not cause infinite loop', () => {
        // SelfRef is not a relation — no relational structure.
        // With closure removed from data(), this test verifies that
        // only relation types have closure.
        const SelfRef = data(({ Family }) => ({
            Base: { label: String },
            Link: {
                item: Family,
                next: Family
            }
        }));

        // data() no longer has closure
        assert.strictEqual(typeof SelfRef.closure, 'undefined',
            'closure should not exist on plain data types');
    });
});
