/**
 * Prolog-Style Top-Down Search — query() with Contracts
 *
 * Demonstrates Prolog-like search using query() (ν-side LP):
 *
 *   - unfold    = goal expansion (generate search states)
 *   - demands   = mode declarations / early pruning
 *   - ensures   = postcondition on expanded state
 *   - rescue    = backtracking on constraint failure
 *   - explore() = SLD resolution with tabling
 *   - maxResults: 1 = cut (commit to first solution)
 *
 * Problem: Given a weighted directed graph, find paths from a start node
 * to a target node, with a maximum total cost constraint.
 *
 * LP reading:
 *   path(Start, Target, Path, Cost) :-
 *       Start = Target, Path = [Start], Cost = 0.
 *   path(Start, Target, Path, Cost) :-
 *       edge(Start, Next, W),
 *       not member(Next, Visited),     ← demands: no revisiting
 *       W + RestCost <= MaxCost,        ← demands: cost bound
 *       path(Next, Target, RestPath, RestCost),
 *       Path = [Start | RestPath],
 *       Cost = W + RestCost.
 */

import {
    data, query, relation, origin, destination
} from '@lapis-lang/lapis-js';

// ---- Weighted Edge Relation (μ) ---------------------------------------------
//
//   edge(Start, Next, W)  ←→  WEdge.Direct(Start, Next, W)
//
// Ground facts live in the initial algebra; the relation provides
// origin/destination/weight projections and transitive-closure machinery.

const WEdge: any = relation(({ Family }) => ({
    Direct: { from: String, to: String, weight: Number },
    Path:   { first: Family, second: Family }
})).ops(({ fold, origin, destination }) => ({
    [origin]: fold({ out: String })({
        Direct({ from }) { return from; },
        Path({ first }) { return first; }
    }),
    [destination]: fold({ out: String })({
        Direct({ to }) { return to; },
        Path({ second }) { return second; }
    }),
    cost: fold({ out: Number })({
        Direct({ weight }) { return weight; },
        Path({ first, second }) { return first + second; }
    })
}));

const graph = [
    WEdge.Direct('A', 'B', 1), WEdge.Direct('A', 'C', 4),
    WEdge.Direct('B', 'C', 2), WEdge.Direct('B', 'D', 6),
    WEdge.Direct('C', 'D', 3),
    WEdge.Direct('D', 'E', 1)
];

// ---- Search State ADT (μ) ---------------------------------------------------

interface SearchItem {
    node: string;
    path: string[];
    cost: number;
    visited: Set<string>;
}

const SearchState: any = data(() => ({
    Active: { target: String, edges: Array, maxCost: Number, workList: Array },
    Found: {
        target: String, edges: Array, maxCost: Number,
        foundPath: Array, foundCost: Number, workList: Array
    },
    Exhausted: {}
})).ops(({ fold }) => ({
    path: fold({ out: Array })({
        Active() { return []; },
        Found({ foundPath }) { return foundPath as string[]; },
        Exhausted() { return []; }
    }),
    cost: fold({ out: Number })({
        Active() { return Infinity; },
        Found({ foundCost }: { foundCost: number }) { return foundCost; },
        Exhausted() { return Infinity; }
    }),
    isFound: fold({ out: Boolean })({
        Active() { return false; },
        Found() { return true; },
        Exhausted() { return false; }
    }),
    isExhausted: fold({ out: Boolean })({
        Active() { return false; },
        Found() { return false; },
        Exhausted() { return true; }
    }),
    step: fold({ out: Object })({
        Exhausted() { return SearchState.Exhausted; },
        _({ target, edges, maxCost, workList }: {
            target: string; edges: any[];
            maxCost: number; workList: SearchItem[]
        }) {
            const wl = [...workList];
            while (wl.length > 0) {
                const item = wl.pop()!;
                if (item.node === target) {
                    return SearchState.Found({
                        target, edges, maxCost,
                        foundPath: item.path,
                        foundCost: item.cost,
                        workList: wl
                    });
                }
                // Query relation via origin/destination folds —
                // demands-like pruning: cost bound + cycle prevention
                const neighbors = edges.filter((e: any) => e[origin] === item.node);
                for (const edge of neighbors) {
                    const newCost = item.cost + edge.cost;
                    if (newCost > maxCost) continue;                 // Cost bound
                    if (item.visited.has(edge[destination])) continue; // Cycle prevention
                    const newVisited = new Set(item.visited);
                    newVisited.add(edge[destination]);
                    wl.push({
                        node: edge[destination],
                        path: [...item.path, edge[destination]],
                        cost: newCost,
                        visited: newVisited
                    });
                }
            }
            return SearchState.Exhausted;
        }
    })
}));

// ---- Query ADT (μ) ----------------------------------------------------------

const Query: any = data(() => ({
    Query: { edges: Array, start: String, target: String, maxCost: Number }
})).ops(({ fold }) => ({
    toState: fold({ out: Object })({
        Query({ edges, start, target, maxCost }) {
            const edgeList = edges as any[];
            if (start === target) {
                return SearchState.Found({
                    target, edges, maxCost,
                    foundPath: [start], foundCost: 0, workList: []
                });
            }
            const visited = new Set([start]);
            const startEdges = edgeList.filter((e: any) => e[origin] === start);
            const workList: SearchItem[] = startEdges
                .filter((e: any) => e.cost <= maxCost)
                .map((e: any) => ({
                    node: e[destination],
                    path: [start, e[destination]],
                    cost: e.cost,
                    visited: new Set([...visited, e[destination]])
                }));
            return workList.length === 0
                ? SearchState.Exhausted
                : SearchState.Active({ target, edges, maxCost, workList });
        }
    })
}));

// ---- Path Finder Observer (ν) -----------------------------------------------
//
// Cospan:  Query →input— PathFinder ←output— { path, cost }
//
// Contracts:
//   - demands on unfold: state must be a SearchState instance
//   - rescue on unfold:  if unfold fails, return Exhausted-like state

const PathFinder: any = query(({ Self }) => ({
    path: Array,
    cost: Number,
    found: Boolean,
    exhausted: Boolean,
    next: Self
})).ops(({ unfold, output, done, accept, Self }) => ({
    [output]: 'path',
    [done]: 'exhausted',
    [accept]: 'found',
    Search: unfold({
        in: Object,
        out: Self,
        // Mode declaration: reject null/undefined seeds
        demands: (_self: any, s: unknown) => s != null && typeof s === 'object',
        // Rescue: if something goes wrong during unfold, treat as exhausted
        rescue: () => {
            return PathFinder.Search(SearchState.Exhausted);
        }
    })({
        path: (s: any) => s.path,
        cost: (s: any) => s.cost,
        found: (s: any) => s.isFound,
        exhausted: (s: any) => s.isExhausted,
        next: (s: any) => s.step
    })
}));

// =============================================================================
// Demo
// =============================================================================

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║  Prolog-Style Search — query() with Contracts       ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

console.log('Weighted Graph:');
console.log('  A →(1)→ B →(2)→ C →(3)→ D →(1)→ E');
console.log('  A →(4)→ C        B →(6)→ D\n');

// ---- All paths with cost ≤ 10 ----

console.log('━━━ Query: All paths from A to E (maxCost ≤ 10) ━━━');

const allPaths = PathFinder.explore(
    Query.Query(graph, 'A', 'E', 10).toState,
    { maxResults: 100 }
);

console.log(`  Found ${allPaths.length} path(s):`);
allPaths.forEach((p: string[]) => console.log(`    ${p.join(' → ')}`));

// ---- First path only (cut semantics) ----

console.log('\n━━━ Query: First path from A to E (cut — maxResults: 1) ━━━');

const firstPath = PathFinder.explore(
    Query.Query(graph, 'A', 'E', 10).toState,
    { maxResults: 1 } // ← Prolog cut: commit to first solution
);

console.log(`  ${firstPath[0]?.join(' → ') ?? '(none)'}`);

// ---- Tight cost constraint (pruning) ----

console.log('\n━━━ Query: Paths from A to E (maxCost ≤ 5) ━━━');

const tightPaths = PathFinder.explore(
    Query.Query(graph, 'A', 'E', 5).toState,
    { maxResults: 100 }
);

if (tightPaths.length === 0)
    console.log('  No paths found (all pruned by cost constraint)');
else {
    console.log(`  Found ${tightPaths.length} path(s):`);
    tightPaths.forEach((p: string[]) => console.log(`    ${p.join(' → ')}`));
}

// ---- Unreachable target ----

console.log('\n━━━ Query: Paths from E to A (unreachable) ━━━');

const noPath = PathFinder.explore(
    Query.Query(graph, 'E', 'A', 100).toState,
    { maxResults: 10 }
);

console.log(`  Found ${noPath.length} path(s) — correctly empty`);

// ---- Tabling: cyclic graph ----

console.log('\n━━━ Cyclic Graph with Tabling ━━━');

const cyclicEdges = [
    WEdge.Direct('X', 'Y', 1),
    WEdge.Direct('Y', 'Z', 1),
    WEdge.Direct('Z', 'X', 1), WEdge.Direct('Z', 'W', 1)
];

console.log('Edges: X →(1)→ Y →(1)→ Z →(1)→ X (cycle), Z →(1)→ W');

const cyclicPaths = PathFinder.explore(
    Query.Query(cyclicEdges, 'X', 'W', 10).toState,
    { maxResults: 10 }
);

console.log(`  Paths from X to W: ${cyclicPaths.length} found`);
cyclicPaths.forEach((p: string[]) => console.log(`    ${p.join(' → ')}`));

// ---- Self-target (trivial) ----

console.log('\n━━━ Query: A to A (start = target) ━━━');

const selfPath = PathFinder.explore(
    Query.Query(graph, 'A', 'A', 0).toState,
    { maxResults: 1 }
);

console.log(`  ${selfPath[0]?.join(' → ') ?? '(none)'}`);

// ---- Structure summary ----

console.log('\n━━━ Structure ━━━');
console.log('  relation() WEdge        from|to|weight + Path composition');
console.log('  data()     Query        edges|start|target|maxCost → toState');
console.log('             SearchState  Active|Found|Exhausted + cost pruning');
console.log('  query() PathFinder   path|cost|found|exhausted|next');
console.log('  Contracts: demands (mode decl), rescue (backtrack fallback)');
console.log('  Cut:       maxResults: 1 → first solution only');
console.log('  Tabling:   auto-derived from [output] → cycle detection');
console.log('  explore()  = SLD resolution (ν-side Prolog search)');
