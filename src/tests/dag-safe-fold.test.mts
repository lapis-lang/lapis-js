import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, fold } from '../index.mjs';

describe('DAG-safe fold (shared substructure)', () => {
    describe('Binary tree with shared subtrees', () => {
        test('should produce correct result when two fields reference the same node', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                sum: fold({ out: Number })({
                    Leaf({ value }) { return value; },
                    Node({ left, right }) { return left + right; }
                })
            }));

            const shared = Tree.Node({
                left: Tree.Leaf({ value: 10 }),
                right: Tree.Leaf({ value: 20 })
            });

            // Both children point to the same `shared` node
            const dag = Tree.Node({ left: shared, right: shared });

            // sum should be 10 + 20 + 10 + 20 = 60
            assert.strictEqual(dag.sum, 60);
        });

        test('should fold shared leaf only once per invocation', () => {
            let callCount = 0;

            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                sum: fold({ out: Number })({
                    Leaf({ value }) {
                        callCount++;
                        return value;
                    },
                    Node({ left, right }) { return left + right; }
                })
            }));

            const sharedLeaf = Tree.Leaf({ value: 42 });
            const dag = Tree.Node({ left: sharedLeaf, right: sharedLeaf });

            callCount = 0;
            const result = dag.sum;

            assert.strictEqual(result, 84);
            // sharedLeaf should be folded exactly once, not twice
            assert.strictEqual(callCount, 1, 'shared leaf should be folded only once');
        });

        test('should handle deeply shared DAG structure', () => {
            let leafCalls = 0;

            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                sum: fold({ out: Number })({
                    Leaf({ value }) {
                        leafCalls++;
                        return value;
                    },
                    Node({ left, right }) { return left + right; }
                })
            }));

            // Build a diamond DAG:
            //        top
            //       /   \
            //     mid1  mid2
            //       \   /
            //       base
            //       / \
            //      L1  L2
            const base = Tree.Node({
                left: Tree.Leaf({ value: 1 }),
                right: Tree.Leaf({ value: 2 })
            });
            const mid1 = Tree.Node({
                left: Tree.Leaf({ value: 3 }),
                right: base
            });
            const mid2 = Tree.Node({
                left: base,
                right: Tree.Leaf({ value: 4 })
            });
            const top = Tree.Node({ left: mid1, right: mid2 });

            leafCalls = 0;
            const result = top.sum;

            // Total sum: 3 + (1 + 2) + (1 + 2) + 4 = 13
            assert.strictEqual(result, 13);

            // base's two leaves (value: 1, value: 2) should each be called once,
            // not once per path through the DAG.
            // Leaf calls: L(3) + L(1) + L(2) + L(4) = 4 (not 6 without caching)
            assert.strictEqual(leafCalls, 4, 'each leaf should be folded exactly once');
        });

        test('should produce correct results for multiple fold operations on same DAG', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                sum: fold({ out: Number })({
                    Leaf({ value }) { return value; },
                    Node({ left, right }) { return left + right; }
                }),
                height: fold({ out: Number })({
                    Leaf() { return 1; },
                    Node({ left, right }) { return 1 + Math.max(left, right); }
                })
            }));

            const shared = Tree.Leaf({ value: 5 });
            const dag = Tree.Node({ left: shared, right: shared });

            assert.strictEqual(dag.sum, 10);
            assert.strictEqual(dag.height, 2);
        });

        test('should not interfere with independent fold invocations', () => {
            let callCount = 0;

            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                sum: fold({ out: Number })({
                    Leaf({ value }) {
                        callCount++;
                        return value;
                    },
                    Node({ left, right }) { return left + right; }
                })
            }));

            const sharedLeaf = Tree.Leaf({ value: 7 });
            const dag = Tree.Node({ left: sharedLeaf, right: sharedLeaf });

            // First invocation
            callCount = 0;
            assert.strictEqual(dag.sum, 14);
            assert.strictEqual(callCount, 1);

            // Second invocation — cache should not persist across calls
            callCount = 0;
            assert.strictEqual(dag.sum, 14);
            assert.strictEqual(callCount, 1);
        });
    });

    describe('List with shared tail', () => {
        test('should handle shared tail in list-like structure', () => {
            let nilCalls = 0;

            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                length: fold({ out: Number })({
                    Nil() {
                        nilCalls++;
                        return 0;
                    },
                    Cons({ tail }) { return 1 + tail; }
                })
            }));

            const sharedTail = List.Cons({ head: 99, tail: List.Nil });

            // Two separate lists sharing the same tail
            const list1 = List.Cons({ head: 1, tail: sharedTail });
            const list2 = List.Cons({ head: 2, tail: sharedTail });

            // These are independent fold invocations (different top-level nodes)
            assert.strictEqual(list1.length, 2);
            assert.strictEqual(list2.length, 2);
        });
    });

    describe('Tree-shaped data (no sharing)', () => {
        test('should not degrade performance for pure trees', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                sum: fold({ out: Number })({
                    Leaf({ value }) { return value; },
                    Node({ left, right }) { return left + right; }
                })
            }));

            // Pure tree — no shared nodes
            const tree = Tree.Node({
                left: Tree.Node({
                    left: Tree.Leaf({ value: 1 }),
                    right: Tree.Leaf({ value: 2 })
                }),
                right: Tree.Node({
                    left: Tree.Leaf({ value: 3 }),
                    right: Tree.Leaf({ value: 4 })
                })
            });

            assert.strictEqual(tree.sum, 10);
        });
    });

    describe('Parameterized folds (no caching)', () => {
        test('should not cache parameterized folds since results depend on arguments', () => {
            let callCount = 0;

            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                scale: fold({ in: Number, out: Number })({
                    Leaf({ value }, factor) {
                        callCount++;
                        return value * factor;
                    },
                    Node({ left, right }, factor) {
                        return left(factor) + right(factor);
                    }
                })
            }));

            const sharedLeaf = Tree.Leaf({ value: 5 });
            const dag = Tree.Node({ left: sharedLeaf, right: sharedLeaf });

            callCount = 0;
            // Parameterized fold — each path must call the handler
            // because different arguments could produce different results
            assert.strictEqual(dag.scale(2), 20);
            assert.strictEqual(callCount, 2, 'parameterized folds should not be cached');

            callCount = 0;
            assert.strictEqual(dag.scale(3), 30);
            assert.strictEqual(callCount, 2);
        });
    });

    describe('Re-entrancy safety', () => {
        test('cross-ADT folds with the same operation name should not interfere', () => {
            // Two independent ADTs both define 'sum'.
            // ADT_A's fold handler evaluates ADT_B's fold during execution.
            const TreeB = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                sum: fold({ out: Number })({
                    Leaf({ value }) { return value; },
                    Node({ left, right }) { return left + right; }
                })
            }));

            const sharedB = TreeB.Leaf({ value: 100 });
            const dagB = TreeB.Node({ left: sharedB, right: sharedB });

            let bSumCallCount = 0;

            const TreeA = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                sum: fold({ out: Number })({
                    Leaf({ value }) {
                        // Trigger TreeB's 'sum' fold from within TreeA's 'sum' handler
                        bSumCallCount++;
                        const bResult = dagB.sum;
                        return value + bResult;
                    },
                    Node({ left, right }) { return left + right; }
                })
            }));

            const sharedA = TreeA.Leaf({ value: 1 });
            const dagA = TreeA.Node({ left: sharedA, right: sharedA });

            bSumCallCount = 0;
            const result = dagA.sum;

            // TreeA: Node(left=Leaf(1), right=Leaf(1))
            // Each Leaf adds dagB.sum (200) to its value
            // sharedA is folded once (DAG cache), so bSumCallCount = 1
            // result = (1 + 200) + (1 + 200) = 402? No — sharedA cached,
            // so Leaf handler runs once → 1 + 200 = 201
            // Node handler: left(201) + right(201) = 402
            // But right is cached → Node gets 201 + 201 = 402
            // Wait — the cache returns the RESULT (201) for the second reference
            // to sharedA, so Node({left: 201, right: 201}) = 402
            assert.strictEqual(result, 402);
            assert.strictEqual(bSumCallCount, 1,
                'sharedA Leaf should be folded once; TreeB fold should not interfere with TreeA cache');
        });

        test('same-ADT fold operations with different names should not interfere', () => {
            let sumCalls = 0;
            let productCalls = 0;

            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                sum: fold({ out: Number })({
                    Leaf({ value }) {
                        sumCalls++;
                        return value;
                    },
                    Node({ left, right }) { return left + right; }
                }),
                product: fold({ out: Number })({
                    Leaf({ value }) {
                        productCalls++;
                        return value;
                    },
                    Node({ left, right }) { return left * right; }
                })
            }));

            const shared = Tree.Leaf({ value: 3 });
            const dag = Tree.Node({ left: shared, right: shared });

            sumCalls = 0;
            productCalls = 0;

            // Each fold has its own cache — they don't interfere
            assert.strictEqual(dag.sum, 6);
            assert.strictEqual(dag.product, 9);
            assert.strictEqual(sumCalls, 1, 'sum should fold shared leaf once');
            assert.strictEqual(productCalls, 1, 'product should fold shared leaf once');
        });
    });
});
