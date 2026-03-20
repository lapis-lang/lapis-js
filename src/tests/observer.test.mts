/**
 * Tests for observer() — the coalgebraic dual of relation().
 *
 * observer() wraps behavior() with cospan structure (output/done/accept fold ops)
 * and provides .explore() as the canonical coinductive operation
 * (dual of relation().closure()).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { observer, behavior } from '../index.mjs';

// =============================================================================
// Test Helpers
// =============================================================================

/** Simple counter behavior for testing exploration. */
function makeCounter() {
    return observer(({ Self }) => ({
        value: Number,
        isDone: Boolean,
        isActive: Boolean,
        next: Self
    })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
        [output]: 'value',
        [done]:   'isDone',
        [accept]: 'isActive',
        CountUp: unfold({ in: Number, out: Self })({
            value: (n: number) => n,
            isDone: (n: number) => n >= 5,
            isActive: (n: number) => !(n >= 5),
            next: (n: number) => n + 1
        })
    }));
}

/** Graph reachability as observer (dual perspective of relation closure). */
function makeReachability() {
    // A simple graph: 0→1→2→3→4 (linear chain)
    const graph: Record<number, number[]> = {
        0: [1], 1: [2], 2: [3], 3: [4], 4: []
    };

    return observer(({ Self }) => ({
        current: Number,
        isExhausted: Boolean,
        isAccepted: Boolean,
        next: Self
    })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
        [output]: 'current',
        [done]:   'isExhausted',
        [accept]: 'isAccepted',
        Walk: unfold({ in: Number, out: Self })({
            current: (n: number) => n,
            isExhausted: (n: number) => (graph[n] ?? []).length === 0,
            isAccepted: () => true,
            next: (n: number) => (graph[n] ?? [])[0] ?? n
        })
    }));
}

// =============================================================================
// Tests
// =============================================================================

describe('observer()', () => {
    describe('basic construction', () => {
        it('should create a behavior with standard observers', () => {
            const Counter = makeCounter();
            assert.ok(Counter);
            assert.ok(typeof Counter.CountUp === 'function');
        });

        it('should throw if output is not a string field reference', () => {
            assert.throws(() => {
                observer(({ Self }) => ({
                    value: Number,
                    next: Self
                })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                    [output]: (obs: any) => obs.value,
                    [done]: 'value',
                    [accept]: 'value',
                    Step: unfold({ in: Number, out: Self })({
                        value: (n: number) => n,
                        next: (n: number) => n + 1
                    })
                }));
            }, /output/);
        });

        it('should throw if done is not a string field reference', () => {
            assert.throws(() => {
                observer(({ Self }) => ({
                    value: Number,
                    next: Self
                })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                    [output]: 'value',
                    [done]: () => true,
                    [accept]: 'value',
                    Step: unfold({ in: Number, out: Self })({
                        value: (n: number) => n,
                        next: (n: number) => n + 1
                    })
                }));
            }, /done/);
        });

        it('should throw if accept is not a string field reference', () => {
            assert.throws(() => {
                observer(({ Self }) => ({
                    value: Number,
                    next: Self
                })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                    [output]: 'value',
                    [done]: 'value',
                    [accept]: () => true,
                    Step: unfold({ in: Number, out: Self })({
                        value: (n: number) => n,
                        next: (n: number) => n + 1
                    })
                }));
            }, /accept/);
        });

        it('should work as a regular behavior (unfold + observe)', () => {
            const Counter = makeCounter();
            const instance = Counter.CountUp(0);

            assert.strictEqual(instance.value, 0);
            assert.strictEqual(instance.isDone, false);
            assert.strictEqual(instance.next.value, 1);
            assert.strictEqual(instance.next.next.value, 2);
        });
    });

    describe('explore()', () => {
        it('should exist on the observer ADT', () => {
            const Counter = makeCounter();
            assert.ok(typeof Counter.explore === 'function');
        });

        it('should explore a counter and collect accepted values', () => {
            const Counter = makeCounter();
            const results = Counter.explore(0);

            // Counter: 0,1,2,3,4 are accepted (done=false), 5 is done=true
            assert.deepStrictEqual(results, [0, 1, 2, 3, 4]);
        });

        it('should respect maxResults option', () => {
            const Counter = makeCounter();
            const results = Counter.explore(0, { maxResults: 2 });

            assert.deepStrictEqual(results, [0, 1]);
        });

        it('should respect maxSteps option', () => {
            const Counter = makeCounter();
            const results = Counter.explore(0, { maxSteps: 3 });

            // 3 steps: observe 0, observe 1, observe 2
            assert.deepStrictEqual(results, [0, 1, 2]);
        });

        it('should explore graph reachability', () => {
            const Graph = makeReachability();
            const reached = Graph.explore(0);

            // Walk: 0→1→2→3→4, then 4 has no neighbors (done)
            // All nodes accepted, collect all
            assert.deepStrictEqual(reached, [0, 1, 2, 3, 4]);
        });

        it('should explore from any starting node', () => {
            const Graph = makeReachability();
            const reached = Graph.explore(2);

            assert.deepStrictEqual(reached, [2, 3, 4]);
        });

        it('should handle immediate termination', () => {
            // Start at a node with no successors
            const Graph = makeReachability();
            const reached = Graph.explore(4);

            // Node 4 is accepted (accept: () => true), then done (no neighbors)
            assert.deepStrictEqual(reached, [4]);
        });

        it('should use named unfold when specified', () => {
            const Counter = makeCounter();
            const results = Counter.explore(0, { unfold: 'CountUp' });

            assert.deepStrictEqual(results, [0, 1, 2, 3, 4]);
        });

        it('should throw when no unfold is available', () => {
            const NoUnfold = observer(({ Self }) => ({
                value: Number,
                isDone: Boolean,
                isAccepted: Boolean,
                next: Self
            })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                [output]: 'value',
                [done]: 'isDone',
                [accept]: 'isAccepted'
            }));

            assert.throws(() => {
                NoUnfold.explore(42);
            }, /unfold/);
        });
    });

    describe('explore() with output projection', () => {
        it('should apply output function to transform results', () => {
            const Doubler = observer(({ Self }) => ({
                value: Number,
                doubled: Number,
                isFinished: Boolean,
                isAccepted: Boolean,
                next: Self
            })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                [output]: 'doubled',
                [done]:   'isFinished',
                [accept]: 'isAccepted',
                Gen: unfold({ in: Number, out: Self })({
                    value: (n: number) => n,
                    doubled: (n: number) => n * 2,
                    isFinished: (n: number) => n >= 3,
                    isAccepted: () => true,
                    next: (n: number) => n + 1
                })
            }));

            const results = Doubler.explore(0);
            // Values: 0,1,2 → output doubles: 0,2,4. Then 3 is done AND accepted → 6.
            assert.deepStrictEqual(results, [0, 2, 4, 6]);
        });
    });

    describe('explore() with accept/done separation', () => {
        it('should only collect accepted states', () => {
            // Only accept even numbers
            const EvenFilter = observer(({ Self }) => ({
                value: Number,
                isExhausted: Boolean,
                isEven: Boolean,
                next: Self
            })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                [output]: 'value',
                [done]:   'isExhausted',
                [accept]: 'isEven',
                Count: unfold({ in: Number, out: Self })({
                    value: (n: number) => n,
                    isExhausted: (n: number) => n >= 10,
                    isEven: (n: number) => n % 2 === 0,
                    next: (n: number) => n + 1
                })
            }));

            const results = EvenFilter.explore(0);
            // Even values collected: 0,2,4,6,8. Then 10 is done AND even → also collected.
            assert.deepStrictEqual(results, [0, 2, 4, 6, 8, 10]);
        });

        it('should accept the final done state if accept returns true', () => {
            // Accept ALL values including the done state
            const AllStates = observer(({ Self }) => ({
                value: Number,
                isFinished: Boolean,
                isAccepted: Boolean,
                next: Self
            })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                [output]: 'value',
                [done]:   'isFinished',
                [accept]: 'isAccepted',
                Gen: unfold({ in: Number, out: Self })({
                    value: (n: number) => n,
                    isFinished: (n: number) => n >= 3,
                    isAccepted: () => true,
                    next: (n: number) => n + 1
                })
            }));

            const results = AllStates.explore(0);
            // 0,1,2 are accepted (not done), then 3 is done AND accepted
            assert.deepStrictEqual(results, [0, 1, 2, 3]);
        });
    });

    describe('cospan structure', () => {
        it('output fold defines the codomain (result type)', () => {
            const Counter = makeCounter();
            const results = Counter.explore(0);
            // output fold projects to Number
            assert.ok(results.every(r => typeof r === 'number'));
        });

        it('unfold in spec defines the domain (seed type)', () => {
            // unfold({ in: Number, out: Self }) defines the domain as Number
            const Counter = makeCounter();
            const results = Counter.explore(0);
            assert.ok(results.length > 0);
        });
    });

    describe('duality with relation', () => {
        it('explore is dual to closure: both compute reachability', () => {
            // observer().explore() computes reachability top-down (lazy, first path)
            // relation().closure() computes reachability bottom-up (eager, all facts)
            const Graph = makeReachability();
            const reached = Graph.explore(0);

            // Explore finds path 0→1→2→3→4 (lazy, follows first edge)
            assert.deepStrictEqual(reached, [0, 1, 2, 3, 4]);
        });
    });

    describe('behavior compatibility', () => {
        it('observer() returns a behavior with all standard operations', () => {
            const B = observer(({ Self }) => ({
                value: Number,
                isDone: Boolean,
                isAccepted: Boolean,
                next: Self
            })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                [output]: 'value',
                [done]:   'isDone',
                [accept]: 'isAccepted',
                Gen: unfold({ in: Number, out: Self })({
                    value: (n: number) => n,
                    isDone: (n: number) => n >= 3,
                    isAccepted: () => true,
                    next: (n: number) => n + 1
                }),
                sum: fold({ in: Number, out: Number })({
                    _: ({ value, next }: { value: number; next: (n: number) => number }, n: number) =>
                        n <= 0 ? 0 : value + next(n - 1)
                })
            }));

            // Standard unfold works
            const instance = B.Gen(0);
            assert.strictEqual(instance.value, 0);
            assert.strictEqual(instance.next.value, 1);

            // Standard fold works
            const total = instance.sum(3);
            assert.strictEqual(total, 0 + 1 + 2);
        });

        it('plain behavior() should NOT have explore()', () => {
            const B = behavior(({ Self }) => ({
                value: Number,
                next: Self
            })).ops(({ fold, unfold, map, merge, Self }) => ({
                Gen: unfold({ in: Number, out: Self })({
                    value: (n: number) => n,
                    next: (n: number) => n + 1
                })
            }));

            assert.strictEqual((B as any).explore, undefined);
        });
    });

    describe('reserved name validation', () => {
        it("rejects 'explore' as a user-defined key", () => {
            assert.throws(
                () => observer(({ Self }) => ({
                    value: Number,
                    isDone: Boolean,
                    isAccepted: Boolean,
                    next: Self
                })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                    [output]: 'value',
                    [done]: 'isDone',
                    [accept]: 'isAccepted',
                    explore: fold({ out: Number })({ _: ({ value }: any) => value }),
                    Gen: unfold({ in: Number, out: Self })({
                        value: (n: number) => n,
                        isDone: () => false,
                        isAccepted: () => true,
                        next: (n: number) => n + 1
                    })
                })),
                { message: /explore.*reserved/ }
            );
        });
    });

    describe('string field references for cospan projections', () => {
        it('string references auto-generate fold from field', () => {
            const Counter = observer(({ Self }) => ({
                value: Number,
                isDone: Boolean,
                isAccepted: Boolean,
                next: Self
            })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                [output]: 'value',
                [done]:   'isDone',
                [accept]: 'isAccepted',
                Gen: unfold({ in: Number, out: Self })({
                    value: (n: number) => n,
                    isDone: (n: number) => n >= 3,
                    isAccepted: () => true,
                    next: (n: number) => n + 1
                })
            }));

            const results = Counter.explore(0);
            // 0,1,2 accepted (done=false), 3 is done=true AND accepted → collected
            assert.deepStrictEqual(results, [0, 1, 2, 3]);
        });

        it('all three cospan keys reference distinct fields', () => {
            const Counter = observer(({ Self }) => ({
                value: Number,
                isDone: Boolean,
                isAccepted: Boolean,
                next: Self
            })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                [output]: 'value',
                [done]:   'isDone',
                [accept]: 'isAccepted',
                Gen: unfold({ in: Number, out: Self })({
                    value: (n: number) => n,
                    isDone: (n: number) => n >= 3,
                    isAccepted: (n: number) => n % 2 === 0,
                    next: (n: number) => n + 1
                })
            }));

            const results = Counter.explore(0);
            // 0 accepted, 1 not, 2 accepted, 3 done AND not accepted
            assert.deepStrictEqual(results, [0, 2]);
        });

        it('string reference throws for unknown field', () => {
            assert.throws(
                () => observer(({ Self }) => ({
                    value: Number,
                    isDone: Boolean,
                    isAccepted: Boolean,
                    next: Self
                })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                    [output]: 'nonExistent',
                    [done]: 'isDone',
                    [accept]: 'isAccepted',
                    Gen: unfold({ in: Number, out: Self })({
                        value: (n: number) => n,
                        isDone: () => false,
                        isAccepted: () => true,
                        next: (n: number) => n + 1
                    })
                })),
                { message: /nonExistent/ }
            );
        });

        it('rejects explicit fold defs for cospan projections', () => {
            assert.throws(
                () => observer(({ Self }) => ({
                    value: Number,
                    isDone: Boolean,
                    next: Self
                })).ops(({ fold, unfold, map, merge, output, done, accept, Self }) => ({
                    [output]: fold({ out: Number })({ _: ({ value }: any) => value }),
                    [done]: 'isDone',
                    [accept]: 'isDone',
                    Gen: unfold({ in: Number, out: Self })({
                        value: (n: number) => n,
                        isDone: () => false,
                        next: (n: number) => n + 1
                    })
                })),
                { message: /output/ }
            );
        });
    });
});
