#!/usr/bin/env node

/**
 * Graph Reachability — relation() as Datalog (μ-side LP)
 *
 * Demonstrates the full allegory API on directed graphs:
 *
 *   relation() provides:
 *     - origin / destination — project endpoints (fold / catamorphism)
 *     - closure()   — transitive closure (least fixpoint, hylomorphism)
 *     - reachableFrom() — forward reachability:  R(S) = {b | ∃a∈S. a→b}
 *     - reachingTo()    — backward reachability: R°(T) = {a | ∃b∈T. a→b}
 *
 *   Auto-generated:
 *     - Join invariant on Path: first.destination === second.origin
 *     - Semi-naive fixpoint iteration in closure()
 *     - Key-based dedup handles cycles
 *
 * This is the μ-side of the LP duality:
 *   Datalog:  bottom-up, enumerate ALL reachable pairs
 *   Prolog:   top-down, lazily explore (see sudoku-bmf.mts for the ν-side)
 */
import { relation, fold, origin, destination } from '@lapis-lang/lapis-js';

// ---- Relation Definition ----


const Edge = relation(({ Family }: { Family: any }) => ({
    Direct: { from: String, to: String },
    Path:   { first: Family, second: Family },

    [origin]: fold({ out: String })({
        Direct({ from }: { from: string }) { return from; },
        Path({ first }: { first: string }) { return first; }
    }),
    [destination]: fold({ out: String })({
        Direct({ to }: { to: string }) { return to; },
        Path({ second }: { second: string }) { return second; }
    }),

    length: fold({ out: Number })({
        Direct() { return 1; },
        Path({ first, second }: { first: number; second: number }) {
            return first + second;
        }
    })
}));

// =============================================================================
// DAG Example
// =============================================================================

console.log('=== Graph Reachability via relation() ===\n');

// Construct base facts directly via the variant constructor
const dagEdges = [
    Edge.Direct('A', 'B'), Edge.Direct('B', 'C'), Edge.Direct('A', 'D'),
    Edge.Direct('D', 'C'), Edge.Direct('C', 'E')
];

console.log('DAG edges:');

dagEdges.forEach((e: any) => console.log(`  ${e.origin} → ${e.destination}`));

// closure: compute transitive closure (Datalog fixpoint)

const dagAll = Edge.closure(dagEdges);

console.log(`\nTransitive closure (${dagAll.length} pairs):`);

dagAll.forEach((e: any) =>
    console.log(`  ${e.origin} → ${e.destination}  (length ${e.length})`)
);

// reachableFrom: forward reachability — who can A reach?
console.log('\nreachableFrom({A}):  ', Edge.reachableFrom(dagAll, ['A']).join(', '));
console.log('reachableFrom({D}):  ', Edge.reachableFrom(dagAll, ['D']).join(', '));

// reachingTo: backward reachability — who can reach E?
console.log('reachingTo({E}):', Edge.reachingTo(dagAll, ['E']).join(', '));
console.log('reachingTo({C}):', Edge.reachingTo(dagAll, ['C']).join(', '));

// multi-step reachableFrom (iterated forward projection)
console.log('\n1-hop from A:', Edge.reachableFrom(dagEdges, ['A']).join(', '));
console.log('2-hop from A:', Edge.reachableFrom(dagEdges, Edge.reachableFrom(dagEdges, ['A'])).join(', '));

// =============================================================================
// Cyclic Graph Example
// =============================================================================

console.log('\n--- Cyclic Graph ---\n');

const cyclicEdges = [Edge.Direct('X', 'Y'), Edge.Direct('Y', 'Z'), Edge.Direct('Z', 'X')];

console.log('Edges:');

cyclicEdges.forEach((e: any) => console.log(`  ${e.origin} → ${e.destination}`));

// Key-based dedup prevents infinite expansion on cycles

const cyclicAll = Edge.closure(cyclicEdges);

console.log(`\nClosure (${cyclicAll.length} pairs — cycles handled):`);

cyclicAll.forEach((e: any) =>
    console.log(`  ${e.origin} → ${e.destination}  (length ${e.length})`)
);

// Every node reaches every other node (full connectivity)
console.log('\nReachability check via reachableFrom:');
for (const node of ['X', 'Y', 'Z']) {
    const reaches = Edge.reachableFrom(cyclicAll, [node]);
    console.log(`  reachableFrom({${node}}): ${reaches.join(', ')}`);
}

// =============================================================================
// Summary
// =============================================================================

console.log('\n━━━ Allegory Operations ━━━');
console.log('  origin / destination   — fold:   instance → endpoints');
console.log('  closure(facts)         — fixpoint: base → transitive closure');
console.log('  reachableFrom(facts, S)    — R(S):  forward reachability');
console.log('  reachingTo(facts, T)       — R°(T): backward reachability');
console.log('  join invariant         — auto: first.dest === second.origin');
