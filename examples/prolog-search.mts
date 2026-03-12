/**
 * Prolog-Style Top-Down Search — observer() with Contracts
 *
 * Demonstrates Prolog-like search using observer() (ν-side LP):
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
    data, observer, fold, unfold,
    output, done, accept
} from '@lapis-lang/lapis-js';

// ---- Weighted Graph ADT (μ) -------------------------------------------------

interface Edge { to: string; weight: number }

const graph: Record<string, Edge[]> = {
    A: [{ to: 'B', weight: 1 }, { to: 'C', weight: 4 }],
    B: [{ to: 'C', weight: 2 }, { to: 'D', weight: 6 }],
    C: [{ to: 'D', weight: 3 }],
    D: [{ to: 'E', weight: 1 }],
    E: []
};

// ---- Search State ADT (μ) ---------------------------------------------------

interface SearchItem {
    node: string;
    path: string[];
    cost: number;
    visited: Set<string>;
}

const SearchState: any = data(() => ({
    Active: { target: String, adj: Object, maxCost: Number, workList: Array },
    Found: {
        target: String, adj: Object, maxCost: Number,
        foundPath: Array, foundCost: Number, workList: Array
    },
    Exhausted: {},

    path: fold({ out: Array })({
        Active() { return []; },
        Found({ foundPath }: { foundPath: string[] }) { return foundPath; },
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

    // step: advance the work list to the next search state.
    // Active and Found share the same transition logic (both carry a workList),
    // so a _ wildcard handler covers both; Exhausted is the absorbing state.
    step: fold({ out: Object })({
        Exhausted() { return SearchState.Exhausted; },
        _({ target, adj, maxCost, workList }: {
            target: string; adj: Record<string, Edge[]>;
            maxCost: number; workList: SearchItem[]
        }) {
            const wl = [...workList];
            while (wl.length > 0) {
                const item = wl.pop()!;
                if (item.node === target) {
                    return SearchState.Found({
                        target, adj, maxCost,
                        foundPath: item.path,
                        foundCost: item.cost,
                        workList: wl
                    });
                }
                // Expand neighbors — demands-like pruning:
                // only pursue edges where the total cost stays within bound
                // and the next node hasn't been visited (no cycles)
                for (const edge of (adj[item.node] ?? [])) {
                    const newCost = item.cost + edge.weight;
                    if (newCost > maxCost) continue;           // Cost bound (pruning)
                    if (item.visited.has(edge.to)) continue;   // Cycle prevention
                    const newVisited = new Set(item.visited);
                    newVisited.add(edge.to);
                    wl.push({
                        node: edge.to,
                        path: [...item.path, edge.to],
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
    Query: { adj: Object, start: String, target: String, maxCost: Number },

    toState: fold({ out: Object })({
        Query({ adj, start, target, maxCost }: {
            adj: Record<string, Edge[]>; start: string; target: string; maxCost: number
        }) {
            if (start === target) {
                return SearchState.Found({
                    target, adj, maxCost,
                    foundPath: [start], foundCost: 0, workList: []
                });
            }
            const visited = new Set([start]);
            const workList: SearchItem[] = (adj[start] ?? [])
                .filter(e => e.weight <= maxCost)
                .map(e => ({
                    node: e.to,
                    path: [start, e.to],
                    cost: e.weight,
                    visited: new Set([...visited, e.to])
                }));
            return workList.length === 0
                ? SearchState.Exhausted
                : SearchState.Active({ target, adj, maxCost, workList });
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

const PathFinder: any = observer(({ Self }: { Self: any }) => ({
    path: Array,
    cost: Number,
    found: Boolean,
    exhausted: Boolean,
    next: Self,

    [output]: 'path',
    [done]: 'exhausted',
    [accept]: 'found',

    Search: unfold({
        in: Object,
        out: Self,
        // Mode declaration: reject null/undefined seeds
        demands: (_self, s) => s != null && typeof s === 'object',
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
console.log('║  Prolog-Style Search — observer() with Contracts       ║');
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

const cyclic: Record<string, Edge[]> = {
    X: [{ to: 'Y', weight: 1 }],
    Y: [{ to: 'Z', weight: 1 }],
    Z: [{ to: 'X', weight: 1 }, { to: 'W', weight: 1 }],
    W: []
};

console.log('Edges: X →(1)→ Y →(1)→ Z →(1)→ X (cycle), Z →(1)→ W');

const cyclicPaths = PathFinder.explore(
    Query.Query(cyclic, 'X', 'W', 10).toState,
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
console.log('  data()     Query        adj|start|target|maxCost → toState');
console.log('             SearchState  Active|Found|Exhausted + cost pruning');
console.log('  observer() PathFinder   path|cost|found|exhausted|next');
console.log('  Contracts: demands (mode decl), rescue (backtrack fallback)');
console.log('  Cut:       maxResults: 1 → first solution only');
console.log('  Tabling:   auto-derived from [output] → cycle detection');
console.log('  explore()  = SLD resolution (ν-side Prolog search)');
