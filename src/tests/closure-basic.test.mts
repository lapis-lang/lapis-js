import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { relation, origin, destination } from '../index.mjs';

describe('Closure — Basic Ancestor Example', () => {
    // Datalog rule:
    //   ancestor(X,Y) :- parent(X,Y).
    //   ancestor(X,Y) :- parent(X,Z), ancestor(Z,Y).
    //
    // relation() form: ancestor = μ a . parent ∪ (parent ∘ a)
    //   Direct     = base fact (no Family)
    //   Transitive = composition rule (both fields are Family)
    //   Join invariant auto-generated: hop[destination] === rest[origin]

    const Ancestor = relation(({ Family }) => ({
        Direct: { from: String, to: String },
        Transitive: { hop: Family, rest: Family }
    })).ops(({ fold, unfold, map, merge, origin, destination, Family }) => ({
        [origin]: fold({ out: String })({
            Direct: ({ from }) => from,
            Transitive: ({ hop }) => hop
        }),
        [destination]: fold({ out: String })({
            Direct: ({ to }) => to,
            Transitive: ({ rest }) => rest
        })
    }));

    test('closure derives all transitive ancestor pairs from parent facts', () => {
        const facts = [
            Ancestor.Direct('alice', 'bob'),
            Ancestor.Direct('bob', 'charlie')
        ];

        const closed = Ancestor.closure(facts);

        assert.ok(closed.length >= 3,
            `Expected at least 3 facts, got ${closed.length}`);

        const pairs = closed.map(f => `${f[origin]}->${f[destination]}`);

        assert.ok(pairs.includes('alice->bob'), 'should include alice->bob');
        assert.ok(pairs.includes('bob->charlie'), 'should include bob->charlie');
        assert.ok(pairs.includes('alice->charlie'), 'should include alice->charlie');
    });

    test('closure with longer chain derives all transitive pairs', () => {
        const facts = [
            Ancestor.Direct('alice', 'bob'),
            Ancestor.Direct('bob', 'charlie'),
            Ancestor.Direct('charlie', 'diana')
        ];

        const closed = Ancestor.closure(facts);
        const pairs = closed.map(f => `${f[origin]}->${f[destination]}`);

        assert.ok(pairs.includes('alice->bob'));
        assert.ok(pairs.includes('bob->charlie'));
        assert.ok(pairs.includes('charlie->diana'));

        assert.ok(pairs.includes('alice->charlie'),
            `alice->charlie missing, got: ${pairs.join(', ')}`);
        assert.ok(pairs.includes('bob->diana'),
            `bob->diana missing, got: ${pairs.join(', ')}`);

        assert.ok(pairs.includes('alice->diana'),
            `alice->diana missing, got: ${pairs.join(', ')}`);
    });

    test('closure with single fact returns only base fact', () => {
        const facts = [Ancestor.Direct('alice', 'bob')];
        const closed = Ancestor.closure(facts);
        assert.strictEqual(closed.length, 1);
    });

    test('depth fold works on closure results', () => {
        const AncestorD = relation(({ Family }) => ({
            Direct: { from: String, to: String },
            Transitive: { hop: Family, rest: Family }
        })).ops(({ fold, unfold, map, merge, origin, destination, Family }) => ({
            [origin]: fold({ out: String })({
                Direct: ({ from }) => from,
                Transitive: ({ hop }) => hop
            }),
            [destination]: fold({ out: String })({
                Direct: ({ to }) => to,
                Transitive: ({ rest }) => rest
            }),
            depth: fold({ out: Number })({
                Direct: () => 1,
                Transitive: ({ hop, rest }) => hop + rest
            })
        }));

        const facts = [
            AncestorD.Direct('a', 'b'),
            AncestorD.Direct('b', 'c')
        ];

        const closed = AncestorD.closure(facts);
        const depths = closed.map(f => f.depth);

        assert.ok(depths.includes(1));
        assert.ok(depths.some(d => d > 1));
    });
});
