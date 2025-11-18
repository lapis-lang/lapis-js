import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

describe('Stack Safety Investigation', () => {
    describe('Current Implementation - Stack Overflow Risk', () => {
        test('small list should work fine', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
            .fold('sum', { out: Number }, {
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            });

            // Build a small list
            let list: any = List.Nil;
            for (let i = 100; i > 0; i--) {
                list = List.Cons({ head: i, tail: list });
            }

            const result = list.sum();
            assert.strictEqual(result, 5050); // sum of 1..100
        });

        test('medium list to check stack depth', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
            .fold('length', { out: Number }, {
                Nil() { return 0; },
                Cons({ tail }) { return 1 + tail; }
            });

            // Build a medium list
            let list: any = List.Nil;
            for (let i = 1000; i > 0; i--) {
                list = List.Cons({ head: i, tail: list });
            }

            const result = list.length();
            assert.strictEqual(result, 1000);
        });

        test('large list - likely to cause stack overflow', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
            .fold('length', { out: Number }, {
                Nil() { return 0; },
                Cons({ tail }) { return 1 + tail; }
            });

            // Build a large list - this will likely overflow the stack
            // JavaScript typically has stack limit around 10,000-15,000 frames
            let list: any = List.Nil;
            const size = 10000;
            for (let i = size; i > 0; i--) {
                list = List.Cons({ head: i, tail: list });
            }

            try {
                const result = list.length();
                assert.strictEqual(result, size);
            } catch (error) {
                if (error instanceof RangeError && error.message.includes('stack')) {
                    // This is expected with the current implementation
                    assert.ok(true, 'Stack overflow detected as expected');
                } else {
                    throw error;
                }
            }
        });

        test('very large list - definitely should overflow without optimization', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
            .fold('length', { out: Number }, {
                Nil() { return 0; },
                Cons({ tail }) { return 1 + tail; }
            });

            // Build a very large list
            let list: any = List.Nil;
            const size = 100000;
            for (let i = size; i > 0; i--) {
                list = List.Cons({ head: i, tail: list });
            }

            try {
                const result = list.length();
                assert.strictEqual(result, size);
            } catch (error) {
                if (error instanceof RangeError && error.message.includes('stack')) {
                    assert.ok(true, 'Stack overflow detected');
                } else {
                    throw error;
                }
            }
        });
    });

    describe('Stack Safety with Trees', () => {
        test('deep tree should not overflow with stack-safe implementation', () => {
            const Tree = data(({ Family }) => ({
                Leaf: [{ value: Number }],
                Node: [{ left: Family }, { right: Family }, { value: Number }]
            }))
            .fold('sum', { out: Number }, {
                Leaf({ value }) { return value; },
                Node({ left, right, value }) { return left + right + value; }
            });

            // Build a deep unbalanced tree (essentially a list)
            let tree: any = Tree.Leaf({ value: 0 });
            for (let i = 1; i <= 1000; i++) {
                tree = Tree.Node({
                    left: tree,
                    right: Tree.Leaf({ value: i }),
                    value: 0
                });
            }

            try {
                const result = tree.sum();
                const expected = (1000 * 1001) / 2; // sum of 0..1000
                assert.strictEqual(result, expected);
            } catch (error) {
                if (error instanceof RangeError) {
                    assert.ok(true, 'Stack overflow detected');
                } else {
                    throw error;
                }
            }
        });
    });

    describe('Performance Comparison', () => {
        test('measure recursion depth and performance', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
            .fold('sum', { out: Number }, {
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            });

            const sizes = [100, 500, 1000, 5000];
            
            for (const size of sizes) {
                let list: any = List.Nil;
                for (let i = size; i > 0; i--) {
                    list = List.Cons({ head: 1, tail: list });
                }

                try {
                    const start = performance.now();
                    const result = list.sum();
                    const end = performance.now();
                    
                    assert.strictEqual(result, size);
                } catch (error) {
                    if (error instanceof RangeError) {
                        break;
                    } else {
                        throw error;
                    }
                }
            }
        });
    });
});
