/**
 * Integration test: Contracts as Constraint Propagation for Logic Programming.
 *
 * Bridges (Design by Contract) and (Logic Programming):
 *
 *   | Contract mechanism       | LP interpretation                       |
 *   | demands on unfold steps  | Mode declarations / early pruning       |
 *   | ensures on closure       | Integrity constraints on derived facts  |
 *   | rescue/retry on unfold   | Backtracking on constraint failure      |
 *   | invariant on instances   | Consistency during search               |
 *
 * The tests below demonstrate each mapping with concrete examples.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    relation, query, data, invariant,
    origin, destination,
    DemandsError
} from '../index.mjs';

// =============================================================================
// 1. Demands on unfold steps — early pruning / mode declarations
// =============================================================================

describe('Contracts x LP: Demands on Unfold (Early Pruning)', () => {
    it('demands reject invalid seeds (mode declaration)', () => {
        // A search observer that requires the seed to be a valid starting state.
        // In LP terms: the demand is a mode declaration — the query must be ground.
        const Counter = query(({ Self }) => ({
            value: Number,
            isDone: Boolean,
            isAccepted: Boolean,
            next: Self
        })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
            [output]: 'value',
            [done]: 'isDone',
            [accept]: 'isAccepted',
            Search: unfold({
                in: Number,
                out: Self,
                demands: (_self, n) => typeof n === 'number' && n >= 0
            })({
                value: (n) => n,
                isDone: (n) => n >= 5,
                isAccepted: () => true,
                next: (n) => n + 1
            })
        }));

        // Valid seed — explore succeeds
        // Values 0..4 accepted (isDone=false), 5 is done=true AND accepted → collected
        const results = Counter.explore(0);
        assert.deepStrictEqual(results, [0, 1, 2, 3, 4, 5]);

        // Invalid seed (negative) — demands reject, explore returns empty
        // (explore wraps unfold in try/catch, demands failure = no results)
        assert.throws(
            () => Counter.Search(-1),
            (err) => err instanceof DemandsError
        );
    });

    it('demands on unfold prune invalid states during exploration', () => {
        // Observer where the unfold has demands that prune certain states.
        // This models constraint propagation: a demand at each step that
        // rejects partial solutions violating constraints.

        const Searcher = query(({ Self }) => ({
            value: Number,
            isDone: Boolean,
            isValid: Boolean,
            next: Self
        })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
            [output]: 'value',
            [done]: 'isDone',
            [accept]: 'isValid',
            Walk: unfold({
                in: Number,
                out: Self,
                demands: (_self, n) => typeof n === 'number' && n >= 0 && n <= 20
            })({
                value: (n) => n,
                isDone: (n) => n >= 10,
                isValid: (n) => n % 2 === 0,
                next: (n) => n + 1
            })
        }));

        // Valid range — collects even numbers 0..10
        const results = Searcher.explore(0);
        assert.deepStrictEqual(results, [0, 2, 4, 6, 8, 10]);

        // Seed out of valid range — demands reject
        assert.throws(
            () => Searcher.Walk(-5),
            (err) => err instanceof DemandsError
        );
    });
});

// =============================================================================
// 2. Ensures on closure — integrity constraints on derived relations
// =============================================================================

describe('Contracts x LP: Ensures on Closure Results (Integrity Constraints)', () => {
    it('ensures on fold verify properties of derivation results', () => {
        // Relation with a fold that has an ensures postcondition:
        // the depth of any derived fact must be positive.
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
            depth: fold({
                out: Number,
                ensures: (_self, _old, result) => result > 0
            })({
                Direct: () => 1,
                Transitive: ({ hop, rest }) => hop + rest
            })
        }));

        const facts = [
            Ancestor.Direct('a', 'b'),
            Ancestor.Direct('b', 'c')
        ];

        const closed = Ancestor.closure(facts);

        // All derived facts have positive depth (ensures guarantees this)
        for (const fact of closed)
            assert.ok(fact.depth > 0, `depth should be > 0, got ${fact.depth}`);
    });
});

// =============================================================================
// 3. Rescue as backtracking — recovery on constraint failure
// =============================================================================

describe('Contracts x LP: Rescue as Backtracking', () => {
    it('rescue on unfold provides fallback when ensures fails (backtrack)', () => {
        // An observer where the unfold has ensures + rescue.
        // When ensures fails (invalid state), rescue provides a fallback
        // (backtrack to a safe state). This models Prolog backtracking:
        // constraint violation → try next alternative.

        let rescueCount = 0;

        const Stream = query(({ Self }) => ({
            value: Number,
            isDone: Boolean,
            isAccepted: Boolean,
            next: Self
        })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
            [output]: 'value',
            [done]: 'isDone',
            [accept]: 'isAccepted',
            Gen: unfold({
                in: Number,
                out: Self,
                ensures: (_self, _old, result) => result.value >= 0,
                rescue: (_self, _error, _args) => {
                    rescueCount++;
                    // Backtrack to safe state (value = 0)
                    return Stream.Gen(0);
                }
            })({
                value: (n) => n,
                isDone: (n) => n >= 3,
                isAccepted: () => true,
                next: (n) => n + 1
            })
        }));

        // Invalid seed → ensures fails → rescue backtracks to 0
        const result = Stream.Gen(-5);
        assert.strictEqual(rescueCount, 1);
        assert.strictEqual(result.value, 0);

        // Explore from rescued state works normally
        const results = Stream.explore(0);
        assert.deepStrictEqual(results, [0, 1, 2, 3]);
    });

    it('rescue with retry models Prolog retry semantics', () => {
        let retryCount = 0;

        const Solver = query(({ Self }) => ({
            value: Number,
            isDone: Boolean,
            isValid: Boolean,
            next: Self
        })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
            [output]: 'value',
            [done]: 'isDone',
            [accept]: 'isValid',
            Solve: unfold({
                in: Number,
                out: Self,
                ensures: (_self, _old, result) => result.value >= 0,
                rescue: (_self, _error, _args, retry) => {
                    retryCount++;
                    return retry(0); // Retry with valid seed
                }
            })({
                value: (n) => n,
                isDone: (n) => n >= 3,
                isValid: (n) => n >= 0,
                next: (n) => n + 1
            })
        }));

        // Invalid seed → ensures fails → rescue retries with 0
        const instance = Solver.Solve(-10);
        assert.strictEqual(retryCount, 1);
        assert.strictEqual(instance.value, 0);
    });

    it('explore gracefully handles stepping errors (branch exhaustion)', () => {
        // Observer where stepping eventually throws (simulating a branch that
        // fails mid-exploration). Explore should collect accepted results
        // up to the failure point.

        let stepCount = 0;

        const Risky = query(({ Self }) => ({
            value: Number,
            isDone: Boolean,
            isAccepted: Boolean,
            next: Self
        })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
            [output]: 'value',
            [done]: 'isDone',
            [accept]: 'isAccepted',
            Walk: unfold({ in: Number, out: Self })({
                value: (n) => n,
                isDone: () => false,
                isAccepted: () => true,
                next: (n) => {
                    stepCount++;
                    if (n >= 3) throw new Error('Branch exhausted');
                    return n + 1;
                }
            })
        }));

        // Explore collects 0,1,2,3 — then stepping from 3 throws → branch exhausted
        const results = Risky.explore(0);

        // Should have collected values before the failure
        assert.ok(results.length > 0, 'Should collect at least some results');
        assert.ok(results.includes(0));
    });
});

// =============================================================================
// 4. Tabling / cycle detection in explore
// =============================================================================

describe('Contracts x LP: Tabling (Cycle Detection in Explore)', () => {
    it('auto-derived tabling detects cycles and terminates exploration', () => {
        // Cyclic state space: 0 → 1 → 2 → 0 → 1 → ...
        const Cyclic = query(({ Self }) => ({
            value: Number,
            isDone: Boolean,
            isAccepted: Boolean,
            next: Self
        })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
            [output]: 'value',
            [done]: 'isDone',
            [accept]: 'isAccepted',
            Walk: unfold({ in: Number, out: Self })({
                value: (n) => n,
                isDone: () => false,          // Never done naturally
                isAccepted: () => true,
                next: (n) => (n + 1) % 3     // Cycles: 0→1→2→0→...
            })
        }));

        // Tabling is always-on: auto-derived from [output] (dual of closure dedup).
        // Detects cycle when output 0 is revisited, terminates early.
        const results = Cyclic.explore(0);
        assert.deepStrictEqual(results, [0, 1, 2]);
    });

    it('tabling prevents infinite loops on self-referential states', () => {
        // State that always transitions to itself
        const Loop = query(({ Self }) => ({
            value: Number,
            isDone: Boolean,
            isAccepted: Boolean,
            next: Self
        })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
            [output]: 'value',
            [done]: 'isDone',
            [accept]: 'isAccepted',
            Walk: unfold({ in: Number, out: Self })({
                value: (n) => n,
                isDone: () => false,
                isAccepted: () => true,
                next: (n) => n  // Self-loop
            })
        }));

        // Always-on tabling: second step sees output 42 again → terminates.
        const results = Loop.explore(42);

        // Only one result — the initial state — then cycle detected
        assert.deepStrictEqual(results, [42]);
    });
});

// =============================================================================
// 5. Invariant during closure — consistency enforcement
// =============================================================================

describe('Contracts x LP: Invariant as Consistency During Derivation', () => {
    it('join invariant rejects inconsistent compositions during closure', () => {
        const Edge = relation(({ Family }) => ({
            Direct: { from: String, to: String },
            Path: { first: Family, second: Family }
        })).ops(({ fold, unfold, map, merge, origin, destination, Family }) => ({
            [origin]: fold({ out: String })({
                Direct: ({ from }) => from,
                Path: ({ first }) => first
            }),
            [destination]: fold({ out: String })({
                Direct: ({ to }) => to,
                Path: ({ second }) => second
            })
        }));

        // Disconnected edges: a→b, c→d (b ≠ c, so Path(a→b, c→d) violates join invariant)
        const facts = [
            Edge.Direct('a', 'b'),
            Edge.Direct('c', 'd')
        ];

        const closed = Edge.closure(facts);
        const pairs = closed.map(f => `${f[origin]}->${f[destination]}`);

        // Only base facts survive — no transitive facts derivable
        assert.strictEqual(closed.length, 2);
        assert.ok(pairs.includes('a->b'));
        assert.ok(pairs.includes('c->d'));
        assert.ok(!pairs.includes('a->d'), 'Invariant should reject a->d composition');
    });

    it('user-defined invariant on leaf constructor enforced during closure', () => {
        // Relation where base facts have a user invariant (no self-loops)
        const Edge = relation(({ Family }) => ({
            Direct: {
                [invariant]: ({ from, to }: { from: string; to: string }) => from !== to,
                from: String,
                to: String
            },
            Path: { first: Family, second: Family }
        })).ops(({ fold, unfold, map, merge, origin, destination, Family }) => ({
            [origin]: fold({ out: String })({
                Direct: ({ from }) => from,
                Path: ({ first }) => first
            }),
            [destination]: fold({ out: String })({
                Direct: ({ to }) => to,
                Path: ({ second }) => second
            })
        }));

        // Self-loop rejected at construction time
        assert.throws(() => Edge.Direct('x', 'x'), /Invariant violation/);

        // Valid edges work
        const facts = [
            Edge.Direct('a', 'b'),
            Edge.Direct('b', 'c')
        ];
        const closed = Edge.closure(facts);
        assert.ok(closed.length >= 3);
    });
});
