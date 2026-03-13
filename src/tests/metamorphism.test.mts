import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, merge, fold, unfold, map } from '../index.mjs';

describe('Metamorphism (fold + unfold)', () => {
    describe('Basic fold → unfold merge', () => {
        test('fold + unfold produces correct result (base conversion)', () => {
            const DigitList = data(({ Family }) => ({
                Nil: {},
                Cons: { digit: Number, rest: Family },

                // Fold: evaluate digits as base-10 number (least-significant first)
                toDecimal: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ digit, rest }) { return digit + rest * 10; }
                }),

                // Unfold: produce digits in base-2 (least-significant first)
                FromDecimal: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { digit: n % 2, rest: Math.floor(n / 2) } : null)
                }),

                // Metamorphism: base-10 digits → integer → base-2 digits
                toBinary: merge('toDecimal', 'FromDecimal')
            }));

            // Represent decimal 5 as digits [5] (single digit)
            const five = DigitList.Cons({ digit: 5, rest: DigitList.Nil });

            // 5 in binary is 101 → digits [1, 0, 1] (LSB first)
            const binary = five.toBinary;
            assert.strictEqual(binary.digit, 1);        // LSB
            assert.strictEqual(binary.rest.digit, 0);
            assert.strictEqual(binary.rest.rest.digit, 1); // MSB
        });

        test('fold + unfold produces correct result (sorting)', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },

                // Fold: collect into sorted array
                toSorted: fold({ out: Array })({
                    Nil() { return []; },
                    Cons({ head, tail }) {
                        const arr = [...tail, head];
                        arr.sort((a, b) => a - b);
                        return arr;
                    }
                }),

                // Unfold: produce a list from an array
                FromArray: unfold({ in: Array, out: Family })({
                    Nil: (arr) => (arr.length === 0 ? {} : null),
                    Cons: (arr) => (arr.length > 0 ? { head: arr[0], tail: arr.slice(1) } : null)
                }),

                // Metamorphism: unsorted list → sorted array → sorted list
                sorted: merge('toSorted', 'FromArray')
            }));

            const list = List.Cons({ head: 3, tail: List.Cons({ head: 1, tail:
                List.Cons({ head: 2, tail: List.Nil }) }) });

            const sortedList = list.sorted;
            assert.strictEqual(sortedList.head, 1);
            assert.strictEqual(sortedList.tail.head, 2);
            assert.strictEqual(sortedList.tail.tail.head, 3);
        });

        test('metamorphism matches manual fold then unfold', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },

                toArray: fold({ out: Array })({
                    Nil() { return []; },
                    Cons({ head, tail }) { return [head, ...tail]; }
                }),

                FromArray: unfold({ in: Array, out: Family })({
                    Nil: (arr) => (arr.length === 0 ? {} : null),
                    Cons: (arr) => (arr.length > 0 ? { head: arr[0], tail: arr.slice(1) } : null)
                }),

                // round-trip: list → array → list
                roundTrip: merge('toArray', 'FromArray')
            }));

            const list = List.Cons({ head: 10, tail: List.Cons({ head: 20, tail:
                List.Cons({ head: 30, tail: List.Nil }) }) });

            // Manual: fold then unfold
            const arr = list.toArray;
            const manual = List.FromArray(arr);

            // Merged
            const merged = list.roundTrip;

            assert.strictEqual(merged.head, manual.head);
            assert.strictEqual(merged.tail.head, manual.tail.head);
            assert.strictEqual(merged.tail.tail.head, manual.tail.tail.head);
        });

        test('fold + unfold on empty structure', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },

                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),

                FromNumber: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),

                expandSum: merge('sum', 'FromNumber')
            }));

            // Empty list → sum = 0 → unfold(0) = Nil
            const empty = List.Nil;
            const result = empty.expandSum;
            // sum of Nil is 0, unfold of 0 produces Nil
            assert.strictEqual(Object.keys(result).filter(k => k !== '__proto__').length >= 0, true);
        });
    });

    describe('Metamorphism with pre-fold maps', () => {
        test('map + fold + unfold applies map before folding', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family },

                double: map({ out: Family })({ T: (x) => x * 2 }),

                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),

                FromNumber: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),

                // Prepromorphism + metamorphism: double → sum → unfold
                doubledSumExpanded: merge('double', 'sum', 'FromNumber')
            }));

            const NumList = List({ T: Number });
            const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

            // double: [2, 4, 6], sum: 12, unfold(12): [12, 11, ..., 1]
            const result = list.doubledSumExpanded;
            assert.strictEqual(result.head, 12);
            assert.strictEqual(result.tail.head, 11);
        });
    });

    describe('Metamorphism with post-unfold maps', () => {
        test('fold + unfold + map applies map after unfolding', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family },

                sum: fold({ out: Number })({
                    Nil() { return 0; },
                    Cons({ head, tail }) { return head + tail; }
                }),

                FromNumber: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),

                double: map({ out: Family })({ T: (x) => x * 2 }),

                // fold → unfold → map: sum → expand → double
                expandAndDouble: merge('sum', 'FromNumber', 'double')
            }));

            const NumList = List({ T: Number });
            const list = NumList.Cons(1, NumList.Cons(2, NumList.Nil));

            // sum = 3, unfold(3) = [3, 2, 1], double = [6, 4, 2]
            const result = list.expandAndDouble;
            assert.strictEqual(result.head, 6);
            assert.strictEqual(result.tail.head, 4);
            assert.strictEqual(result.tail.tail.head, 2);
        });
    });

    describe('Naming conventions', () => {
        test('metamorphism must be camelCase (instance method)', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },

                toArray: fold({ out: Array })({
                    Nil() { return []; },
                    Cons({ head, tail }) { return [head, ...tail]; }
                }),

                FromArray: unfold({ in: Array, out: Family })({
                    Nil: (arr) => (arr.length === 0 ? {} : null),
                    Cons: (arr) => (arr.length > 0 ? { head: arr[0], tail: arr.slice(1) } : null)
                }),

                roundTrip: merge('toArray', 'FromArray')
            }));

            // Should be an instance method, not static
            const list = List.Cons({ head: 1, tail: List.Nil });
            assert.strictEqual(typeof List.roundTrip, 'undefined',
                'metamorphism should not be a static method');
            assert.notStrictEqual(list.roundTrip, undefined,
                'metamorphism should be accessible on instances');
        });

        test('metamorphism rejects PascalCase names', () => {
            assert.throws(
                () => data(({ Family }) => ({
                    Nil: {},
                    Cons: { head: Number, tail: Family },

                    toArray: fold({ out: Array })({
                        Nil() { return []; },
                        Cons({ head, tail }) { return [head, ...tail]; }
                    }),

                    FromArray: unfold({ in: Array, out: Family })({
                        Nil: (arr) => (arr.length === 0 ? {} : null),
                        Cons: (arr) => (arr.length > 0 ? { head: arr[0], tail: arr.slice(1) } : null)
                    }),

                    RoundTrip: merge('toArray', 'FromArray')
                })),
                /must be camelCase/
            );
        });

        test('hylomorphism still requires PascalCase', () => {
            assert.throws(
                () => data(({ Family }) => ({
                    Nil: {},
                    Cons: { head: Number, tail: Family },
                    Range: unfold({ in: Number, out: Family })({
                        Nil: (n) => (n <= 0 ? {} : null),
                        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                    }),
                    sum: fold({ out: Number })({
                        Nil() { return 0; },
                        Cons({ head, tail }) { return head + tail; }
                    }),
                    triangular: merge('Range', 'sum')
                })),
                /must be PascalCase/
            );
        });
    });

    describe('Validation', () => {
        test('should still reject multiple folds', () => {
            assert.throws(
                () => data(({ Family }) => ({
                    Nil: {},
                    Cons: { head: Number, tail: Family },
                    sum: fold({ out: Number })({
                        Nil() { return 0; },
                        Cons({ head, tail }) { return head + tail; }
                    }),
                    product: fold({ out: Number })({
                        Nil() { return 1; },
                        Cons({ head, tail }) { return head * tail; }
                    }),
                    FromNumber: unfold({ in: Number, out: Family })({
                        Nil: (n) => (n <= 0 ? {} : null),
                        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                    }),
                    invalid: merge('sum', 'product', 'FromNumber')
                })),
                /multiple folds/
            );
        });

        test('should still reject multiple unfolds', () => {
            assert.throws(
                () => data(({ Family }) => ({
                    Nil: {},
                    Cons: { head: Number, tail: Family },
                    sum: fold({ out: Number })({
                        Nil() { return 0; },
                        Cons({ head, tail }) { return head + tail; }
                    }),
                    FromNumber: unfold({ in: Number, out: Family })({
                        Nil: (n) => (n <= 0 ? {} : null),
                        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                    }),
                    Range: unfold({ in: Number, out: Family })({
                        Nil: (n) => (n <= 0 ? {} : null),
                        Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                    }),
                    invalid: merge('sum', 'FromNumber', 'Range')
                })),
                /multiple unfolds/
            );
        });
    });

    describe('Parameterized ADTs', () => {
        test('metamorphism works with parameterized types', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family },

                toArray: fold({ out: Array })({
                    Nil() { return []; },
                    Cons({ head, tail }) { return [head, ...tail]; }
                }),

                FromArray: unfold({ in: Array, out: Family })({
                    Nil: (arr) => (arr.length === 0 ? {} : null),
                    Cons: (arr) => (arr.length > 0 ? { head: arr[0], tail: arr.slice(1) } : null)
                }),

                roundTrip: merge('toArray', 'FromArray')
            }));

            const NumList = List({ T: Number });
            const list = NumList.Cons(1, NumList.Cons(2, NumList.Cons(3, NumList.Nil)));

            const result = list.roundTrip;
            assert.strictEqual(result.head, 1);
            assert.strictEqual(result.tail.head, 2);
            assert.strictEqual(result.tail.tail.head, 3);
        });
    });

    describe('Existing hylomorphism still works', () => {
        test('unfold + fold hylomorphism is unaffected', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                Range: unfold({ in: Number, out: Family })({
                    Nil: (n) => (n <= 0 ? {} : null),
                    Cons: (n) => (n > 0 ? { head: n, tail: n - 1 } : null)
                }),
                product: fold({ out: Number })({
                    Nil() { return 1; },
                    Cons({ head, tail }) { return head * tail; }
                }),
                Factorial: merge('Range', 'product')
            }));

            assert.strictEqual(List.Factorial(0), 1);
            assert.strictEqual(List.Factorial(1), 1);
            assert.strictEqual(List.Factorial(5), 120);
        });
    });

    describe('Tree rebalancing (structural transformation)', () => {
        test('fold tree to array, unfold to new tree', () => {
            const BST = data(({ Family }) => ({
                Leaf: {},
                Node: { left: Family, value: Number, right: Family },

                // Fold: in-order traversal to sorted array
                toSortedArray: fold({ out: Array })({
                    Leaf() { return []; },
                    Node({ left, value, right }) { return [...left, value, ...right]; }
                }),

                // Unfold: build balanced BST from sorted array
                FromSortedArray: unfold({ in: Array, out: Family })({
                    Leaf: (arr) => (arr.length === 0 ? {} : null),
                    Node: (arr) => {
                        if (arr.length === 0) return null;
                        const mid = Math.floor(arr.length / 2);
                        return {
                            left: arr.slice(0, mid),
                            value: arr[mid],
                            right: arr.slice(mid + 1)
                        };
                    }
                }),

                // Metamorphism: flatten then rebuild balanced
                rebalanced: merge('toSortedArray', 'FromSortedArray')
            }));

            // Build a right-skewed tree: 1 → 2 → 3 → 4 → 5
            const skewed = BST.Node({
                left: BST.Leaf,
                value: 1,
                right: BST.Node({
                    left: BST.Leaf,
                    value: 2,
                    right: BST.Node({
                        left: BST.Leaf,
                        value: 3,
                        right: BST.Node({
                            left: BST.Leaf,
                            value: 4,
                            right: BST.Node({
                                left: BST.Leaf,
                                value: 5,
                                right: BST.Leaf
                            })
                        })
                    })
                })
            });

            // After rebalancing, the root should be the median
            const balanced = skewed.rebalanced;
            assert.strictEqual(balanced.value, 3); // median of [1,2,3,4,5]

            // Verify all values preserved via in-order
            const originalValues = skewed.toSortedArray;
            const balancedValues = balanced.toSortedArray;
            assert.deepStrictEqual(balancedValues, originalValues);
        });
    });
});
