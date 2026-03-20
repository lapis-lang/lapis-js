#!/usr/bin/env node

import { data, observer } from '@lapis-lang/lapis-js';

// SearchState ::= Active(target, adj, workList)
//               | Found(target, adj, foundPath, workList)
//               | Exhausted

const SearchState: any = data(() => ({
    Active:    { target: String, adj: Object, workList: Array },
    Found:     { target: String, adj: Object, foundPath: Array, workList: Array },
    Exhausted: {}
})).ops(({ fold }) => ({
    path: fold({ out: Array })({
        Active()             { return []; },
        Found({ foundPath }) { return foundPath as string[]; },
        Exhausted()          { return []; }
    }),

    isFound: fold({ out: Boolean })({
        Active()    { return false; },
        Found()     { return true; },
        Exhausted() { return false; }
    }),

    isExhausted: fold({ out: Boolean })({
        Active()    { return false; },
        Found()     { return false; },
        Exhausted() { return true; }
    }),

    /** One DFS step: pop one item, check, expand.  The observer loop drives iteration. */
    step: fold({ out: Object })({
        Active({ target, adj, workList }) {
            const wl = [...(workList as { node: string; path: string[] }[])];
            if (wl.length === 0) return SearchState.Exhausted;
            const item = wl.pop()!;
            if (item.node === (target as string))
                return SearchState.Found({ target, adj, foundPath: item.path, workList: wl });
            const visited = new Set(item.path as string[]);
            const adjMap = adj as Record<string, string[]>;
            for (const n of (adjMap[item.node] ?? []).filter((x: string) => !visited.has(x)))
                wl.push({ node: n, path: [...(item.path as string[]), n] });
            return SearchState.Active({ target, adj, workList: wl });
        },
        Found({ target, adj, workList }) {
            const wl = workList as { node: string; path: string[] }[];
            return wl.length === 0
                ? SearchState.Exhausted
                : SearchState.Active({ target, adj, workList: wl });
        },
        Exhausted() {
            return SearchState.Exhausted;
        }
    })
}));

// Query ::= Query(adj, start, target)

const Query: any = data(() => ({
    Query: { adj: Object, start: String, target: String }
})).ops(({ fold }) => ({
    toState: fold({ out: Object })({
        Query({ adj, start, target }) {
            const adjMap = adj as unknown as Record<string, string[]>;
            if (start === target) {
                return SearchState.Found({
                    target, adj, foundPath: [start], workList: []
                });
            }
            const neighbors = adjMap[start] ?? [];
            const workList = neighbors.map((n: string) => ({
                node: n, path: [start, n]
            }));
            return workList.length === 0
                ? SearchState.Exhausted
                : SearchState.Active({ target, adj, workList });
        }
    })
}));

// PathFinder — observer (cospan: Query →input— PathFinder ←output— Path[])

const PathFinder = observer(({ Self }) => ({
    path: Array,
    found: Boolean,
    exhausted: Boolean,
    next: Self
})).ops(({ unfold, output, done, accept, Self }) => ({
    [output]: 'path',
    [done]:   'exhausted',
    [accept]: 'found',
    Search: unfold({ in: { path: Array, isFound: Boolean, isExhausted: Boolean, step: Object }, out: Self })({
        path:      (s: any) => s.path,
        found:     (s: any) => s.isFound,
        exhausted: (s: any) => s.isExhausted,
        next:      (s: any) => s.step
    })
}));

// =============================================================================

console.log('╔════════════════════════════════════════════════╗');
console.log('║  Graph Path Finder — observer() (ν-side LP)    ║');
console.log('╚════════════════════════════════════════════════╝\n');

const dag: Record<string, string[]> = {
    A: ['B', 'D'],
    B: ['C'],
    D: ['C'],
    C: ['E']
};

console.log('Graph (DAG):');
console.log('  A → B, D');
console.log('  B → C');
console.log('  D → C');
console.log('  C → E\n');

console.log('━━━ Query: paths from A to E ━━━');

const paths_AE = PathFinder.explore(
    Query.Query(dag, 'A', 'E').toState,
    { maxResults: 10 }
);

console.log(`  Found ${paths_AE.length} path(s):`);
paths_AE.forEach((p: string[]) => console.log(`    ${p.join(' → ')}`));

console.log('\n━━━ Query: paths from A to C ━━━');

const paths_AC = PathFinder.explore(
    Query.Query(dag, 'A', 'C').toState,
    { maxResults: 10 }
);

console.log(`  Found ${paths_AC.length} path(s):`);
paths_AC.forEach((p: string[]) => console.log(`    ${p.join(' → ')}`));

console.log('\n━━━ Query: first path from A to E ━━━');

const first_AE = PathFinder.explore(
    Query.Query(dag, 'A', 'E').toState,
    { maxResults: 1 }
);

console.log(`  ${first_AE[0].join(' → ')}`);

console.log('\n━━━ Query: paths from E to A (unreachable) ━━━');

const paths_EA = PathFinder.explore(
    Query.Query(dag, 'E', 'A').toState,
    { maxResults: 10 }
);

console.log(`  Found ${paths_EA.length} path(s) — correctly empty`);

console.log('\n━━━ Cyclic Graph ━━━');

const cyclic: Record<string, string[]> = {
    X: ['Y'],
    Y: ['Z'],
    Z: ['X']
};

console.log('Edges: X → Y → Z → X (cycle)\n');

console.log('Query: paths from X to Z');
const paths_XZ = PathFinder.explore(
    Query.Query(cyclic, 'X', 'Z').toState,
    { maxResults: 10 }
);

console.log(`  Found ${paths_XZ.length} path(s):`);
paths_XZ.forEach((p: string[]) => console.log(`    ${p.join(' → ')}`));

console.log('\nQuery: paths from X to X (start = target)');
const paths_XX = PathFinder.explore(
    Query.Query(cyclic, 'X', 'X').toState,
    { maxResults: 10 }
);

console.log(`  Found ${paths_XX.length} path(s):`);
paths_XX.forEach((p: string[]) => console.log(`    ${p.join(' → ')}`));

console.log('\n━━━ Structure ━━━');
console.log('  data()     Query        adj|start|target → toState  — μ (cospan domain)');
console.log('             SearchState  Active|Found|Exhausted      — μ (DFS worklist)');
console.log('  observer() PathFinder   path|found|exhausted|next   — ν (cospan)');
console.log('  explore()  = coinductive observation (dual of closure)');
