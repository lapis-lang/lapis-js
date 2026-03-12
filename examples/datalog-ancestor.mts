#!/usr/bin/env node

/**
 * Datalog Ancestor — relation() as Datalog (μ-side LP)
 *
 * Demonstrates relation() implementing Datalog-style bottom-up evaluation:
 *
 *   Datalog rules:
 *     ancestor(X,Y) :- parent(X,Y).
 *     ancestor(X,Y) :- parent(X,Z), ancestor(Z,Y).
 *
 *   relation() form:
 *     ancestor = μA. parent ∪ (parent ∘ A)
 *     closure() computes the least fixpoint via semi-naive iteration.
 *
 * Allegory operations used:
 *   - origin / destination — fold instances to endpoints (catamorphism)
 *   - closure()   — transitive closure (least fixpoint, hylomorphism)
 *   - reachableFrom() — relational forward projection  R(S)
 *   - reachingTo()    — relational backward projection R°(T)
 *
 * This is the μ-side of the LP duality.  For the ν-side (Prolog-like
 * top-down search), see sudoku-bmf.mts and the observer() construct.
 */
import { relation, fold, origin, destination } from '@lapis-lang/lapis-js';

// ---- Relation Definition ----

const Ancestor = relation(({ Family }: { Family: any }) => ({
    Direct: { from: String, to: String },
    Transitive: { hop: Family, rest: Family },

    // Endpoint projections (span legs)
    [origin]: fold({ out: String })({
        Direct({ from }: { from: string }) { return from; },
        Transitive({ hop }: { hop: string }) { return hop; }
    }),
    [destination]: fold({ out: String })({
        Direct({ to }: { to: string }) { return to; },
        Transitive({ rest }: { rest: string }) { return rest; }
    }),

    // Additional fold: count the number of hops
    depth: fold({ out: Number })({
        Direct() { return 1; },
        Transitive({ hop, rest }: { hop: number; rest: number }) {
            return hop + rest;
        }
    })
}));

// ---- Base facts (parent relationships) ----
// Construct leaf instances directly via the variant constructor.

const baseFacts = [
    Ancestor.Direct('alice', 'bob'),
    Ancestor.Direct('bob', 'carol'),
    Ancestor.Direct('carol', 'dave'),
    Ancestor.Direct('dave', 'eve')
];

console.log('=== Datalog-style Ancestor Closure ===\n');

console.log('Base facts:');
baseFacts.forEach((f: any) => console.log(`  ${f.origin} → ${f.destination}`));

// ---- Compute closure ----

const allAncestors = Ancestor.closure(baseFacts);

console.log(`\nClosure computed: ${allAncestors.length} total facts`);

console.log('\nAll ancestor relationships:');
allAncestors.forEach((a: any) => {
    console.log(`  ${a.origin} → ${a.destination}  (depth: ${a.depth})`);
});

// ---- Queries via reachableFrom / reachingTo ----

console.log('\nQuery: Who are all ancestors of eve?  (reachingTo)');
const evePredecessors = Ancestor.reachingTo(allAncestors, ['eve']);
evePredecessors.forEach((name: any) =>
    console.log(`  ${name}`)
);

console.log('\nQuery: Who are all descendants of alice?  (reachableFrom)');
const aliceSuccessors = Ancestor.reachableFrom(allAncestors, ['alice']);
aliceSuccessors.forEach((name: any) =>
    console.log(`  ${name}`)
);

// ---- Multi-step reachableFrom (two-hop reachability from base facts) ----

console.log('\nTwo-hop reachableFrom from alice (base facts only):');
const oneHop = Ancestor.reachableFrom(baseFacts, ['alice']);       // ['bob']
const twoHop = Ancestor.reachableFrom(baseFacts, oneHop);         // ['carol']
console.log(`  1-hop: ${oneHop.join(', ')}`);
console.log(`  2-hop: ${twoHop.join(', ')}`);

// ---- Extend with new facts ----

console.log('\nExtending with new facts:');
const extraFacts = [Ancestor.Direct('eve', 'frank'), Ancestor.Direct('frank', 'grace')];
const extendedClosure = Ancestor.closure([...baseFacts, ...extraFacts]);
console.log(`  Extended closure: ${extendedClosure.length} total facts`);
const aliceReachAll = Ancestor.reachableFrom(extendedClosure, ['alice']);
console.log(`  alice can now reach: ${aliceReachAll.join(', ')}`);
