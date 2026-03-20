import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { relation, origin, destination } from '../index.mjs';

// ---- Shared Ancestor relation for most tests ----

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
    }),
    depth: fold({ out: Number })({
        Direct: () => 1,
        Transitive: ({ hop, rest }) => hop + rest
    })
}));

const baseFacts = [
    Ancestor.Direct('alice', 'bob'),
    Ancestor.Direct('bob', 'carol'),
    Ancestor.Direct('carol', 'dave'),
    Ancestor.Direct('dave', 'eve')
];


const allFacts = Ancestor.closure(baseFacts);

// =============================================================================
// reachableFrom (formerly image)
// =============================================================================

describe('Relation — reachableFrom (relational forward projection)', () => {
    test('reachableFrom a single domain value returns its direct destinations', () => {
        const result = Ancestor.reachableFrom(baseFacts, ['alice']);
        assert.deepStrictEqual(result, ['bob']);
    });

    test('reachableFrom over closure returns all reachable destinations', () => {
        const result = Ancestor.reachableFrom(allFacts, ['alice']);
        assert.deepStrictEqual(result.sort(), ['bob', 'carol', 'dave', 'eve']);
    });

    test('reachableFrom multiple domain values unions the results', () => {
        const result = Ancestor.reachableFrom(baseFacts, ['alice', 'carol']);
        // alice → bob, carol → dave
        assert.deepStrictEqual(result.sort(), ['bob', 'dave']);
    });

    test('reachableFrom deduplicates codomain values', () => {
        // Two facts with the same destination
        const facts = [
            Ancestor.Direct('x', 'z'),
            Ancestor.Direct('y', 'z')
        ];
        const result = Ancestor.reachableFrom(facts, ['x', 'y']);
        assert.deepStrictEqual(result, ['z']);
    });

    test('reachableFrom with empty domain set returns empty', () => {
        const result = Ancestor.reachableFrom(allFacts, []);
        assert.deepStrictEqual(result, []);
    });

    test('reachableFrom with empty facts returns empty', () => {
        const result = Ancestor.reachableFrom([], ['alice']);
        assert.deepStrictEqual(result, []);
    });

    test('reachableFrom with non-matching domain value returns empty', () => {
        const result = Ancestor.reachableFrom(baseFacts, ['nobody']);
        assert.deepStrictEqual(result, []);
    });
});

// =============================================================================
// reachingTo (formerly preimage)
// =============================================================================

describe('Relation — reachingTo (relational backward projection)', () => {
    test('reachingTo a single codomain value returns its direct origins', () => {
        const result = Ancestor.reachingTo(baseFacts, ['bob']);
        assert.deepStrictEqual(result, ['alice']);
    });

    test('reachingTo over closure returns all origins that reach the target', () => {
        const result = Ancestor.reachingTo(allFacts, ['eve']);
        assert.deepStrictEqual(result.sort(), ['alice', 'bob', 'carol', 'dave']);
    });

    test('reachingTo multiple codomain values unions the results', () => {
        const result = Ancestor.reachingTo(baseFacts, ['bob', 'eve']);
        // bob ← alice, eve ← dave
        assert.deepStrictEqual(result.sort(), ['alice', 'dave']);
    });

    test('reachingTo deduplicates domain values', () => {
        const facts = [
            Ancestor.Direct('x', 'a'),
            Ancestor.Direct('x', 'b')
        ];
        const result = Ancestor.reachingTo(facts, ['a', 'b']);
        assert.deepStrictEqual(result, ['x']);
    });

    test('reachingTo with empty codomain set returns empty', () => {
        const result = Ancestor.reachingTo(allFacts, []);
        assert.deepStrictEqual(result, []);
    });

    test('reachingTo with empty facts returns empty', () => {
        const result = Ancestor.reachingTo([], ['eve']);
        assert.deepStrictEqual(result, []);
    });

    test('reachingTo with non-matching codomain value returns empty', () => {
        const result = Ancestor.reachingTo(baseFacts, ['nobody']);
        assert.deepStrictEqual(result, []);
    });
});

// =============================================================================
// reachableFrom / reachingTo duality
// =============================================================================

describe('Relation — reachableFrom/reachingTo duality', () => {
    test('reachingTo(reachableFrom(S)) ⊇ S  (round-trip widens)', () => {
        const img = Ancestor.reachableFrom(baseFacts, ['alice']);        // ['bob']
        const pre = Ancestor.reachingTo(baseFacts, img);                // ['alice']
        assert.ok(pre.includes('alice'), 'round-trip should contain the original');
    });

    test('reachableFrom and reachingTo are adjoint on the powerset lattice', () => {
        // For a chain A → B → C → D → E over base facts:
        // reachableFrom({A}) = {B}, reachableFrom({B}) = {C}, etc.
        // reachingTo({E}) = {D}, reachingTo({D}) = {C}, etc.
        // They step in opposite directions.
        const fwd = Ancestor.reachableFrom(baseFacts, ['bob']);       // ['carol']
        const bwd = Ancestor.reachingTo(baseFacts, ['carol']);        // ['bob']
        assert.deepStrictEqual(fwd, ['carol']);
        assert.deepStrictEqual(bwd, ['bob']);
    });
});

// =============================================================================
// direct construction (replaces former tabulate)
// =============================================================================

describe('Relation — direct construction of leaf instances', () => {
    test('direct construction produces valid relation members', () => {
        const fact = Ancestor.Direct('x', 'y');
        assert.ok(fact instanceof Ancestor.Direct, 'should be a Direct instance');
        assert.strictEqual(fact.from, 'x');
        assert.strictEqual(fact.to, 'y');
    });

    test('direct construction round-trips with origin/destination', () => {
        const pairs: [string, string][] = [['a', 'b'], ['c', 'd'], ['e', 'f']];
        const facts = pairs.map(([from, to]) => Ancestor.Direct({ from, to }));
        const recovered = facts.map(f => [f[origin], f[destination]]);
        assert.deepStrictEqual(recovered, pairs);
    });

    test('direct construction + closure composes correctly', () => {
        const facts = [
            Ancestor.Direct('alice', 'bob'),
            Ancestor.Direct('bob', 'carol')
        ];

        const closed = Ancestor.closure(facts);
        const pairs = closed.map(f => `${f[origin]}->${f[destination]}`);

        assert.ok(pairs.includes('alice->bob'));
        assert.ok(pairs.includes('bob->carol'));
        assert.ok(pairs.includes('alice->carol'), 'closure should derive transitive pair');
    });

    test('direct construction + reachableFrom composes correctly', () => {
        const facts = [
            Ancestor.Direct('alice', 'bob'),
            Ancestor.Direct('bob', 'carol'),
            Ancestor.Direct('carol', 'dave')
        ];

        const reachable = Ancestor.reachableFrom(facts, ['alice']);
        assert.deepStrictEqual(reachable, ['bob']);

        // Over closure, all are reachable
        const closed = Ancestor.closure(facts);
        const allReachable = Ancestor.reachableFrom(closed, ['alice']);
        assert.deepStrictEqual(allReachable.sort(), ['bob', 'carol', 'dave']);
    });
});

// =============================================================================
// Multiple leaf variant construction
// =============================================================================

describe('Relation — multiple leaf variant construction', () => {
    // Relation with two leaf variants (e.g. different edge types)
    const Graph = relation(({ Family }) => ({
        Edge: { src: String, dst: String },
        BiEdge: { a: String, b: String },
        Path: { first: Family, second: Family }
    })).ops(({ fold, unfold, map, merge, origin, destination, Family }) => ({
        [origin]: fold({ out: String })({
            Edge: ({ src }) => src,
            BiEdge: ({ a }) => a,
            Path: ({ first }) => first
        }),
        [destination]: fold({ out: String })({
            Edge: ({ dst }) => dst,
            BiEdge: ({ b }) => b,
            Path: ({ second }) => second
        })
    }));

    test('Edge variant construction', () => {
        const fact = Graph.Edge('x', 'y');
        assert.ok(fact instanceof Graph.Edge, 'should use Edge variant');
        assert.strictEqual(fact.src, 'x');
        assert.strictEqual(fact.dst, 'y');
    });

    test('BiEdge variant construction', () => {
        const fact = Graph.BiEdge('x', 'y');
        assert.ok(fact instanceof Graph.BiEdge, 'should use BiEdge variant');
        assert.strictEqual(fact.a, 'x');
        assert.strictEqual(fact.b, 'y');
    });

    test('direct construction preserves endpoint semantics', () => {
        const fact = Graph.BiEdge('x', 'y');
        assert.strictEqual(fact[origin], 'x');
        assert.strictEqual(fact[destination], 'y');
    });
});

// =============================================================================
// Full allegory pipeline
// =============================================================================

describe('Relation — full allegory pipeline', () => {
    test('construct → closure → reachableFrom → reachingTo pipeline', () => {
        const facts = [
            Ancestor.Direct('alice', 'bob'),
            Ancestor.Direct('bob', 'carol'),
            Ancestor.Direct('carol', 'dave')
        ];
        assert.strictEqual(facts.length, 3);

        // Closure: compute transitive closure
        const closed = Ancestor.closure(facts);
        assert.ok(closed.length > 3, 'closure should derive new facts');

        // reachableFrom: who can alice reach?
        const aliceReach = Ancestor.reachableFrom(closed, ['alice']);
        assert.deepStrictEqual(aliceReach.sort(), ['bob', 'carol', 'dave']);

        // reachingTo: who can reach dave?
        const daveSources = Ancestor.reachingTo(closed, ['dave']);
        assert.deepStrictEqual(daveSources.sort(), ['alice', 'bob', 'carol']);
    });

    test('reachableFrom(facts, reachingTo(facts, T)) ⊇ T  (Galois connection)', () => {
        // For base facts in a chain, going backward then forward recovers the target
        const T = ['carol'];
        const sources = Ancestor.reachingTo(baseFacts, T);           // ['bob']
        const roundTrip = Ancestor.reachableFrom(baseFacts, sources); // ['carol']
        for (const t of T) {
            assert.ok(roundTrip.includes(t),
                `round-trip should include ${t}, got ${roundTrip}`);
        }
    });
});

// =============================================================================
// Runtime type validation
// =============================================================================

describe('Relation — runtime type validation', () => {
    test('closure() rejects non-instance elements', () => {
        assert.throws(
            () => Ancestor.closure([{ from: 'a', to: 'b' }]),
            { name: 'TypeError', message: /baseFacts\[0\] is not an instance/ }
        );
    });

    test('closure() rejects non-array argument', () => {
        assert.throws(
            () => Ancestor.closure('not an array' as any),
            { name: 'TypeError', message: /baseFacts must be an array/ }
        );
    });

    test('reachableFrom() rejects non-instance elements', () => {
        assert.throws(
            () => Ancestor.reachableFrom([{ origin: 'a', destination: 'b' }], ['a']),
            { name: 'TypeError', message: /facts\[0\] is not an instance/ }
        );
    });

    test('reachingTo() rejects non-instance elements', () => {
        assert.throws(
            () => Ancestor.reachingTo([{ origin: 'a', destination: 'b' }], ['b']),
            { name: 'TypeError', message: /facts\[0\] is not an instance/ }
        );
    });

    test('closure() accepts valid instances', () => {
        const result = Ancestor.closure([Ancestor.Direct('a', 'b')]);
        assert.strictEqual(result.length, 1);
    });

    test('relation() rejects redefinition of reserved operation names', () => {
        for (const name of ['closure', 'reachableFrom', 'reachingTo']) {
            assert.throws(
                () => relation(({ Family }) => ({
                    Direct: { from: String, to: String },
                    Transitive: { hop: Family, rest: Family }
                })).ops(({ fold, unfold, map, merge, origin, destination, Family }) => ({
                    [origin]: fold({ out: String })({
                        Direct: ({ from }: any) => from,
                        Transitive: ({ hop }: any) => hop
                    }),
                    [destination]: fold({ out: String })({
                        Direct: ({ to }: any) => to,
                        Transitive: ({ rest }: any) => rest
                    }),
                    [name]: fold({ out: Number })({
                        Direct: () => 1,
                        Transitive: ({ hop, rest }: any) => hop + rest
                    })
                })),
                { message: new RegExp(`'${name}'.*reserved`) }
            );
        }
    });
});
