/**
 * Zygomorphism Tests
 *
 * A zygomorphism fuses two folds into a single traversal: a primary fold and
 * one or more auxiliary folds.  At each recursive position the handler receives
 * the auxiliary fold results via the exported `aux` symbol.
 *
 * String form — `aux: 'foldName'`:  flat shape, `a.left`, `a.right`, …
 * Array  form — `aux: ['f1','f2']`: nested shape, `a.f1.left`, `a.f2.right`, …
 *
 * Enabled by adding `aux` to the fold spec:
 *   fold({ aux: 'depth', out: Boolean })({ … })
 *   fold({ aux: ['depth', 'size'], out: String })({ … })
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, fold, unfold, map, merge, behavior, aux, extend, history } from '../index.mjs';

// ---------------------------------------------------------------------------
// Shared base ADTs
// ---------------------------------------------------------------------------

const BaseTree = data(({ Family }) => ({
    Leaf: { value: Number },
    Node: { left: Family, right: Family },
    depth: fold({ out: Number })({
        Leaf() { return 0; },
        Node({ left, right }) { return 1 + Math.max(left, right); }
    }),
    size: fold({ out: Number })({
        Leaf() { return 1; },
        Node({ left, right }) { return 1 + left + right; }
    })
}));

const BaseList = data(({ Family }) => ({
    Nil: {},
    Cons: { head: Number, tail: Family },
    FromArray: unfold({ in: Array })({
        Nil: (arr) => (arr.length === 0 ? {} : null),
        Cons: (arr) => (arr.length > 0 ? { head: arr[0], tail: arr.slice(1) } : null)
    }),
    sum: fold({ out: Number })({
        Nil() { return 0; },
        Cons({ head, tail }) { return head + tail; }
    }),
    length: fold({ out: Number })({
        Nil() { return 0; },
        Cons({ tail }) { return 1 + tail; }
    })
}));

const BaseNat = data(({ Family }) => ({
    Zero: {},
    Succ: { pred: Family },
    FromValue: unfold({ in: Number })({
        Zero: (n: number) => (n <= 0 ? {} : null),
        Succ: (n: number) => (n > 0 ? { pred: n - 1 } : null)
    }),
    toValue: fold({ out: Number })({
        Zero() { return 0; },
        Succ({ pred }) { return 1 + pred; }
    })
}));

// ---------------------------------------------------------------------------
// Data zygomorphism — string form
// ---------------------------------------------------------------------------

describe('Zygomorphism (Data) — string form', () => {
    describe('Classic balanced tree check', () => {
        test('balanced tree returns true', () => {
            const Tree = data(() => ({
                [extend]: BaseTree,
                isBalanced: fold({ aux: 'depth', out: Boolean })({
                    Leaf() { return true; },
                    Node({ left, right, [aux]: a }) {
                        return left && right && Math.abs(a.left - a.right) <= 1;
                    }
                })
            }));

            //   Node
            //  /    \
            // L(1) L(2)
            const balanced = Tree.Node({
                left: Tree.Leaf({ value: 1 }),
                right: Tree.Leaf({ value: 2 })
            });
            assert.strictEqual(balanced.isBalanced, true);
        });

        test('unbalanced tree returns false', () => {
            const Tree = data(() => ({
                [extend]: BaseTree,
                isBalanced: fold({ aux: 'depth', out: Boolean })({
                    Leaf() { return true; },
                    Node({ left, right, [aux]: a }) {
                        return left && right && Math.abs(a.left - a.right) <= 1;
                    }
                })
            }));

            //        Node
            //       /    \
            //     Node   L(3)
            //    /    \
            //  Node  L(2)
            //  / \
            // L(1) L(4)
            const unbalanced = Tree.Node({
                left: Tree.Node({
                    left: Tree.Node({
                        left: Tree.Leaf({ value: 1 }),
                        right: Tree.Leaf({ value: 4 })
                    }),
                    right: Tree.Leaf({ value: 2 })
                }),
                right: Tree.Leaf({ value: 3 })
            });
            assert.strictEqual(unbalanced.isBalanced, false);
        });
    });

    describe('List zygomorphism', () => {
        test('each element >= suffix sum', () => {
            const List = data(() => ({
                [extend]: BaseList,
                allGeqSuffixSum: fold({ aux: 'sum', out: Boolean })({
                    Nil() { return true; },
                    Cons({ head, tail, [aux]: a }) {
                        // a.tail = sum of the tail
                        return head >= a.tail && tail;
                    }
                })
            }));

            // [10, 3, 2, 1] → suffix sums: [6, 3, 1, 0]
            // 10≥6 ✓, 3≥3 ✓, 2≥1 ✓, 1≥0 ✓ → true
            assert.strictEqual(
                List.FromArray([10, 3, 2, 1]).allGeqSuffixSum, true
            );

            // [1, 2, 3] → suffix sums: [5, 3, 0]
            // 1≥5 ✗ → false
            assert.strictEqual(
                List.FromArray([1, 2, 3]).allGeqSuffixSum, false
            );
        });

        test('single-element and empty lists', () => {
            const List = data(() => ({
                [extend]: BaseList,
                allGeqSuffixSum: fold({ aux: 'sum', out: Boolean })({
                    Nil() { return true; },
                    Cons({ head, tail, [aux]: a }) {
                        return head >= a.tail && tail;
                    }
                })
            }));

            assert.strictEqual(List.FromArray([]).allGeqSuffixSum, true);
            assert.strictEqual(List.FromArray([42]).allGeqSuffixSum, true);
        });
    });

    describe('Nat zygomorphism', () => {
        test('isEven using toValue as aux', () => {
            const Nat = data(() => ({
                [extend]: BaseNat,
                isEven: fold({ aux: 'toValue', out: Boolean })({
                    Zero() { return true; },
                    Succ({ pred, [aux]: a }) {
                        // a.pred = toValue of predecessor = n-1
                        // n is even ↔ n-1 is odd
                        return a.pred % 2 === 1;
                    }
                })
            }));

            assert.strictEqual(Nat.FromValue(0).isEven, true);
            assert.strictEqual(Nat.FromValue(1).isEven, false);
            assert.strictEqual(Nat.FromValue(2).isEven, true);
            assert.strictEqual(Nat.FromValue(3).isEven, false);
            assert.strictEqual(Nat.FromValue(4).isEven, true);
        });
    });

    describe('Base case variant has empty [aux]', () => {
        test('non-recursive variant gets [aux] as empty object', () => {
            let leafAux: unknown = 'not-set';

            const Tree = data(() => ({
                [extend]: BaseTree,
                checkAux: fold({ aux: 'depth', out: Number })({
                    Leaf({ [aux]: a }) {
                        leafAux = a;
                        return 0;
                    },
                    Node({ left, right }) { return left + right; }
                })
            }));

            Tree.Leaf({ value: 42 }).checkAux;
            assert.ok(typeof leafAux === 'object' && leafAux !== null,
                'base case [aux] should be an object');
            assert.strictEqual(Object.keys(leafAux as object).length, 0,
                'base case [aux] should be empty (no recursive fields)');
        });
    });

    describe('Wildcard handler with aux', () => {
        test('_ handler receives [aux]', () => {
            let receivedAux = false;

            const Tree = data(() => ({
                [extend]: BaseTree,
                check: fold({ aux: 'depth', out: Number })({
                    _({ [aux]: a }) {
                        if (a !== undefined) receivedAux = true;
                        return 0;
                    }
                })
            }));

            Tree.Node({
                left: Tree.Leaf({ value: 1 }),
                right: Tree.Leaf({ value: 2 })
            }).check;

            assert.ok(receivedAux, 'wildcard handler should receive [aux]');
        });
    });

    describe('DAG safety with zygo', () => {
        test('shared substructure produces correct results', () => {
            const Tree = data(() => ({
                [extend]: BaseTree,
                isBalanced: fold({ aux: 'depth', out: Boolean })({
                    Leaf() { return true; },
                    Node({ left, right, [aux]: a }) {
                        return left && right && Math.abs(a.left - a.right) <= 1;
                    }
                })
            }));

            const shared = Tree.Leaf({ value: 42 });
            const t = Tree.Node({ left: shared, right: shared });
            assert.strictEqual(t.isBalanced, true);
            assert.strictEqual(t.depth, 1);
        });
    });

    describe('Extended ADT inherits zygo fold', () => {
        test('child ADT inherits fold with aux from parent', () => {
            const TreeWithZygo = data(() => ({
                [extend]: BaseTree,
                isBalanced: fold({ aux: 'depth', out: Boolean })({
                    Leaf() { return true; },
                    Node({ left, right, [aux]: a }) {
                        return left && right && Math.abs(a.left - a.right) <= 1;
                    }
                })
            }));

            const ExtTree = data(() => ({
                [extend]: TreeWithZygo,
                toList: fold({ out: Array })({
                    Leaf({ value }) { return [value]; },
                    Node({ left, right }) { return [...left, ...right]; }
                })
            }));

            const t = ExtTree.Node({
                left: ExtTree.Leaf({ value: 1 }),
                right: ExtTree.Leaf({ value: 2 })
            });

            assert.strictEqual(t.isBalanced, true);
            assert.deepStrictEqual(t.toList, [1, 2]);
            assert.strictEqual(t.depth, 1);
        });
    });

    describe('Merge pipeline with zygo fold', () => {
        test('unfold → zygo fold via merge', () => {
            const Nat = data(() => ({
                [extend]: BaseNat,
                isEven: fold({ aux: 'toValue', out: Boolean })({
                    Zero() { return true; },
                    Succ({ pred, [aux]: a }) {
                        return a.pred % 2 === 1;
                    }
                }),
                IsEven: merge('FromValue', 'isEven')
            }));

            assert.strictEqual(Nat.IsEven(0), true);
            assert.strictEqual(Nat.IsEven(1), false);
            assert.strictEqual(Nat.IsEven(2), true);
            assert.strictEqual(Nat.IsEven(3), false);
            assert.strictEqual(Nat.IsEven(10), true);
        });
    });

    describe('fold without aux still works', () => {
        test('regular fold ignores aux symbol', () => {
            const Tree = data(() => ({
                [extend]: BaseTree,
                sum: fold({ out: Number })({
                    Leaf({ value }) { return value; },
                    Node({ left, right }) { return left + right; }
                })
            }));

            const t = Tree.Node({
                left: Tree.Leaf({ value: 3 }),
                right: Tree.Leaf({ value: 7 })
            });
            assert.strictEqual(t.sum, 10);
        });
    });

    describe('Error on non-existent auxiliary fold', () => {
        test('data throws when aux names a fold that does not exist', () => {
            assert.throws(() => {
                data(() => ({
                    [extend]: BaseTree,
                    bad: fold({ aux: 'nonExistent', out: Number })({
                        Leaf() { return 0; },
                        Node({ left, right }) { return left + right; }
                    })
                }));
            }, /references auxiliary fold 'nonExistent'.*but no fold named 'nonExistent' exists/);
        });

        test('data throws for array form with missing fold', () => {
            assert.throws(() => {
                data(() => ({
                    [extend]: BaseTree,
                    bad: fold({ aux: ['depth', 'noSuchFold'], out: Number })({
                        Leaf() { return 0; },
                        Node({ left, right }) { return left + right; }
                    })
                }));
            }, /references auxiliary fold 'noSuchFold'.*but no fold named 'noSuchFold' exists/);
        });

        test('behavior throws when aux names a fold that does not exist', () => {
            assert.throws(() => {
                behavior(({ Self }) => ({
                    head: Number,
                    tail: Self,
                    From: unfold({ in: Number, out: Self })({
                        head: (n: number) => n,
                        tail: (n: number) => n + 1
                    }),
                    bad: fold({ aux: 'missingFold', in: Number, out: Number })({
                        _: ({ head, tail }, n: number) => n > 0 ? head + tail(n - 1) : 0
                    })
                }));
            }, /references auxiliary fold 'missingFold'.*but no fold named 'missingFold' exists/);
        });

        test('throws on empty aux array', () => {
            assert.throws(() => {
                data(() => ({
                    [extend]: BaseTree,
                    bad: fold({ aux: [], out: Number })({
                        Leaf() { return 0; },
                        Node({ left, right }) { return left + right; }
                    })
                }));
            }, /aux.*array must contain at least one fold name/);
        });

        test('throws when aux array contains non-strings', () => {
            assert.throws(() => {
                data(() => ({
                    [extend]: BaseTree,
                    bad: fold({ aux: [123, {}] as unknown as string[], out: Number })({
                        Leaf() { return 0; },
                        Node({ left, right }) { return left + right; }
                    })
                }));
            }, /aux.*array elements must be strings.*index 0/);
        });

        test('throws when aux is an unsupported type', () => {
            assert.throws(() => {
                data(() => ({
                    [extend]: BaseTree,
                    bad: fold({ aux: 42 as unknown as string, out: Number })({
                        Leaf() { return 0; },
                        Node({ left, right }) { return left + right; }
                    })
                }));
            }, /aux.*must be a string or string\[\], got number/);
        });

        test('throws when aux references an unfold operation', () => {
            assert.throws(() => {
                data(({ Family }) => ({
                    Nil: {},
                    Cons: { head: Number, tail: Family },
                    FromArray: unfold({ in: Array })({
                        Nil: (arr: unknown[]) => (arr.length === 0 ? {} : null),
                        Cons: (arr: unknown[]) => (arr.length > 0 ? { head: arr[0], tail: arr.slice(1) } : null)
                    }),
                    bad: fold({ aux: 'FromArray', out: Number })({
                        Nil() { return 0; },
                        Cons({ tail }) { return 1 + tail; }
                    })
                }));
            }, /references auxiliary fold 'FromArray'.*but no fold named 'FromArray' exists/);
        });

        test('throws when aux references a map operation', () => {
            assert.throws(() => {
                data(({ Family, T }) => ({
                    Leaf: { value: T },
                    Node: { left: Family(T), right: Family(T) },
                    fmap: map({ out: Family })({
                        T: (x: unknown) => x
                    }),
                    bad: fold({ aux: 'fmap', out: Number })({
                        Leaf() { return 0; },
                        Node({ left, right }) { return left + right; }
                    })
                }));
            }, /references auxiliary fold 'fmap'.*but no fold named 'fmap' exists/);
        });
    });

    describe('Parameterized primary fold with getter aux', () => {
        test('method-primary + getter-aux: aux entries are values, not thunks', () => {
            // depth is a getter (no input).  sumWith is a method (has input).
            // The aux entry a.left / a.right should be plain numbers, not functions.
            const Tree = data(() => ({
                [extend]: BaseTree,
                sumWith: fold({ aux: 'depth', in: Number, out: Number })({
                    Leaf({ value }, bonus: number) { return value + bonus; },
                    Node({ left, right, [aux]: a }, bonus: number) {
                        // a.left and a.right must be numbers (from getter aux),
                        // NOT thunks — if they were thunks this would NaN/throw.
                        return left(bonus) + right(bonus) + a.left + a.right;
                    }
                })
            }));

            //   Node
            //  /    \
            // L(10) L(20)
            const t = Tree.Node({
                left: Tree.Leaf({ value: 10 }),
                right: Tree.Leaf({ value: 20 })
            });
            // sumWith(5): left(5)=15, right(5)=25, a.left=0, a.right=0 → 40
            assert.strictEqual(t.sumWith(5), 40);
        });

        test('array form: mixed getter-aux and method-aux', () => {
            // depth is a getter, size is a getter.
            // Primary fold is parameterized (has `in`).
            // Both aux entries should be plain values.
            const Tree = data(() => ({
                [extend]: BaseTree,
                info: fold({ aux: ['depth', 'size'], in: Number, out: Object })({
                    Leaf({ value }, bonus: number) {
                        return { total: value + bonus };
                    },
                    Node({ left, right, [aux]: a }, bonus: number) {
                        type AuxFields = { left: number; right: number };
                        type AuxShape = { depth: AuxFields; size: AuxFields };
                        const { depth: ad, size: as_ } = a as AuxShape;
                        const l = left(bonus) as { total: number };
                        const r = right(bonus) as { total: number };
                        return {
                            total: l.total + r.total + ad.left + ad.right + as_.left + as_.right
                        };
                    }
                })
            }));

            //      Node
            //     /    \
            //   Node   L(3)
            //  /    \
            // L(1)  L(2)
            const t = Tree.Node({
                left: Tree.Node({
                    left: Tree.Leaf({ value: 1 }),
                    right: Tree.Leaf({ value: 2 })
                }),
                right: Tree.Leaf({ value: 3 })
            });
            // bonus=0: leaves return {total: value}
            // inner Node: l.total=(1+2)=3, r... let's just check it doesn't throw
            // and returns a sensible number.
            const result = t.info(0) as { total: number };
            assert.strictEqual(typeof result.total, 'number');
            // Inner Node: l=1,r=2, ad.left=0,ad.right=0, as.left=1,as.right=1 → total=5
            // Outer Node: l=5, r=3, ad.left=1,ad.right=0, as.left=3,as.right=1 → total=13
            assert.strictEqual(result.total, 13);
        });
    });

    describe('Zygo + histo together', () => {
        test('fold with both history and aux', () => {
            const Nat = data(() => ({
                [extend]: BaseNat,
                // Uses both history (look back two levels) and
                // aux (toValue at each node)
                histoAux: fold({ history: true, aux: 'toValue', out: Number })({
                    Zero() { return 0; },
                    Succ({ pred, [history]: h, [aux]: a }) {
                        // a.pred = toValue of predecessor
                        // h.pred.pred = histoAux of n-2
                        const predValue = a.pred;
                        const grandResult = h.pred?.pred;
                        return grandResult !== undefined
                            ? Math.max(predValue, grandResult)
                            : predValue;
                    }
                })
            }));

            // histoAux(0) = 0
            // histoAux(1) = max(toValue(0), undef) = 0
            // histoAux(2) = max(toValue(1), histoAux(0)) = max(1, 0) = 1
            // histoAux(3) = max(toValue(2), histoAux(1)) = max(2, 0) = 2
            // histoAux(4) = max(toValue(3), histoAux(2)) = max(3, 1) = 3
            assert.strictEqual(Nat.FromValue(0).histoAux, 0);
            assert.strictEqual(Nat.FromValue(1).histoAux, 0);
            assert.strictEqual(Nat.FromValue(2).histoAux, 1);
            assert.strictEqual(Nat.FromValue(3).histoAux, 2);
            assert.strictEqual(Nat.FromValue(4).histoAux, 3);
        });
    });

    describe('Zygo where aux fold is defined in same ADT', () => {
        test('both depth and isBalanced defined together', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                depth: fold({ out: Number })({
                    Leaf() { return 0; },
                    Node({ left, right }) { return 1 + Math.max(left, right); }
                }),
                isBalanced: fold({ aux: 'depth', out: Boolean })({
                    Leaf() { return true; },
                    Node({ left, right, [aux]: a }) {
                        return left && right && Math.abs(a.left - a.right) <= 1;
                    }
                })
            }));

            const balanced = Tree.Node({
                left: Tree.Leaf({ value: 1 }),
                right: Tree.Leaf({ value: 2 })
            });
            assert.strictEqual(balanced.isBalanced, true);
            assert.strictEqual(balanced.depth, 1);
        });

        test('aux fold declared after primary fold (reverse order)', () => {
            // isBalanced references depth via aux, but depth is declared
            // *after* isBalanced in source order.  The topo sort must
            // resolve this dependency and register depth first.
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
                isBalanced: fold({ aux: 'depth', out: Boolean })({
                    Leaf() { return true; },
                    Node({ left, right, [aux]: a }) {
                        return left && right && Math.abs(a.left - a.right) <= 1;
                    }
                }),
                depth: fold({ out: Number })({
                    Leaf() { return 0; },
                    Node({ left, right }) { return 1 + Math.max(left, right); }
                })
            }));

            const t = Tree.Node({
                left: Tree.Node({
                    left: Tree.Leaf({ value: 1 }),
                    right: Tree.Leaf({ value: 2 })
                }),
                right: Tree.Leaf({ value: 3 })
            });
            assert.strictEqual(t.isBalanced, true);
            assert.strictEqual(t.depth, 2);
        });
    });
});

// ---------------------------------------------------------------------------
// Data zygomorphism — array form
// ---------------------------------------------------------------------------

describe('Zygomorphism (Data) — array form', () => {
    describe('Multiple auxiliary folds', () => {
        test('aux: [depth, size] gives nested shape', () => {
            const Tree = data(() => ({
                [extend]: BaseTree,
                check: fold({ aux: ['depth', 'size'], out: String })({
                    Leaf() { return 'leaf'; },
                    Node({ [aux]: a }) {
                        return `d:${a.depth.left}/${a.depth.right} s:${a.size.left}/${a.size.right}`;
                    }
                })
            }));

            //      Node
            //     /    \
            //   Node   Leaf(3)
            //  /    \
            // L(1)  L(2)
            const tree = Tree.Node({
                left: Tree.Node({
                    left: Tree.Leaf({ value: 1 }),
                    right: Tree.Leaf({ value: 2 })
                }),
                right: Tree.Leaf({ value: 3 })
            });

            // left child: depth=1, size=3; right child: depth=0, size=1
            assert.strictEqual(tree.check, 'd:1/0 s:3/1');
        });
    });

    describe('Array form base case', () => {
        test('non-recursive variant gets nested empty objects', () => {
            let leafAux: unknown = 'not-set';

            const Tree = data(() => ({
                [extend]: BaseTree,
                checkArray: fold({ aux: ['depth', 'size'], out: Number })({
                    Leaf({ [aux]: a }) {
                        leafAux = a;
                        return 0;
                    },
                    Node({ left, right }) { return left + right; }
                })
            }));

            Tree.Leaf({ value: 1 }).checkArray;
            const a = leafAux as Record<string, Record<string, unknown>>;
            assert.ok('depth' in a, 'should have depth key');
            assert.ok('size' in a, 'should have size key');
            assert.strictEqual(Object.keys(a.depth).length, 0);
            assert.strictEqual(Object.keys(a.size).length, 0);
        });
    });

    describe('Array form with single element behaves like nested, not flat', () => {
        test('aux: [\"depth\"] uses nested shape a.depth.left', () => {
            const Tree = data(() => ({
                [extend]: BaseTree,
                depthCheck: fold({ aux: ['depth'], out: Number })({
                    Leaf() { return 0; },
                    Node({ [aux]: a }) {
                        // Nested shape: a.depth.left, NOT a.left
                        return a.depth.left + a.depth.right;
                    }
                })
            }));

            //   Node
            //  /    \
            // L(1) L(2)
            const t = Tree.Node({
                left: Tree.Leaf({ value: 1 }),
                right: Tree.Leaf({ value: 2 })
            });
            // Both leaves have depth 0
            assert.strictEqual(t.depthCheck, 0);
        });
    });

    describe('Array form with balanced tree check', () => {
        test('balanced check using both depth and size', () => {
            const Tree = data(() => ({
                [extend]: BaseTree,
                info: fold({ aux: ['depth', 'size'], out: Object })({
                    Leaf() { return { balanced: true, depthDiff: 0, totalSize: 1 }; },
                    Node({ left, right, [aux]: a }) {
                        const depthDiff = Math.abs(a.depth.left - a.depth.right);
                        return {
                            balanced: (left as { balanced: boolean }).balanced &&
                                (right as { balanced: boolean }).balanced &&
                                depthDiff <= 1,
                            depthDiff,
                            totalSize: a.size.left + a.size.right + 1
                        };
                    }
                })
            }));

            const t = Tree.Node({
                left: Tree.Node({
                    left: Tree.Leaf({ value: 1 }),
                    right: Tree.Leaf({ value: 2 })
                }),
                right: Tree.Leaf({ value: 3 })
            });
            const result = t.info as { balanced: boolean; depthDiff: number; totalSize: number };
            assert.strictEqual(result.balanced, true);
            assert.strictEqual(result.depthDiff, 1);
            assert.strictEqual(result.totalSize, 5);
        });
    });
});

// ---------------------------------------------------------------------------
// Behavior zygomorphism
// ---------------------------------------------------------------------------

describe('Zygomorphism (Behavior)', () => {
    describe('Stream with aux', () => {
        test('behavior fold with parameterized aux', () => {
            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n: number) => n,
                    tail: (n: number) => n + 1
                }),
                sum: fold({ in: Number, out: Number })({
                    _: ({ head, tail }, n: number) => n > 0 ? head + tail(n - 1) : 0
                }),
                // Annotate each element with the partial sum of remaining.
                // String-form aux shape: { tail: (n) => number }
                // (one key per recursive field, each a thunk because sum is parameterized)
                annotate: fold({ aux: 'sum', in: Number, out: Array })({
                    _: ({ head, tail, [aux]: a }, n: number) => {
                        if (n <= 0) return [];
                        const { tail: auxTail } = a as { tail: (n: number) => number };
                        return [{ value: head, restSum: auxTail(n - 1) }, ...tail(n - 1)];
                    }
                })
            }));

            const s = Stream.From(1);
            const result = s.annotate(3) as Array<{ value: number; restSum: number }>;

            // Stream: 1, 2, 3, 4, …
            // annotate(3):
            //   head=1, a.tail(2) = sum of [2,3,…] for 2 steps = 2+3 = 5
            //   → { value: 1, restSum: 5 }
            //   head=2, a.tail(1) = sum of [3,4,…] for 1 step = 3
            //   → { value: 2, restSum: 3 }
            //   head=3, a.tail(0) = 0
            //   → { value: 3, restSum: 0 }
            assert.strictEqual(result.length, 3);
            assert.deepStrictEqual(result[0], { value: 1, restSum: 5 });
            assert.deepStrictEqual(result[1], { value: 2, restSum: 3 });
            assert.deepStrictEqual(result[2], { value: 3, restSum: 0 });
        });

        test('behavior fold without aux still works', () => {
            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n: number) => n,
                    tail: (n: number) => n + 1
                }),
                take: fold({ in: Number, out: Array })({
                    _: ({ head, tail }, n: number) =>
                        n > 0 ? [head, ...tail(n - 1)] : []
                })
            }));

            assert.deepStrictEqual(Stream.From(0).take(4), [0, 1, 2, 3]);
        });
    });

    describe('Behavior array form', () => {
        test('aux: [sum, double] on behavior stream', () => {
            const Stream = behavior(({ Self }) => ({
                head: Number,
                tail: Self,
                From: unfold({ in: Number, out: Self })({
                    head: (n: number) => n,
                    tail: (n: number) => n + 1
                }),
                sum: fold({ in: Number, out: Number })({
                    _: ({ head, tail }, n: number) => n > 0 ? head + tail(n - 1) : 0
                }),
                double: fold({ in: Number, out: Number })({
                    _: ({ head, tail }, n: number) => n > 0 ? head * 2 + tail(n - 1) : 0
                }),
                // Array-form aux shape: { sum: { tail: (n) => number }, double: { tail: (n) => number } }
                // (one key per aux fold, each containing one key per recursive field)
                info: fold({ aux: ['sum', 'double'], in: Number, out: Object })({
                    _: ({ head, tail, [aux]: a }, n: number) => {
                        if (n <= 0) return { items: [] };
                        type AuxFields = { tail: (n: number) => number };
                        type AuxShape = { sum: AuxFields; double: AuxFields };
                        const { sum: auxSum, double: auxDbl } = a as AuxShape;
                        const rest = tail(n - 1) as { items: Array<{ v: number; s: number; d: number }> };
                        return { items: [{ v: head, s: auxSum.tail(n - 1), d: auxDbl.tail(n - 1) }, ...rest.items] };
                    }
                })
            }));

            const s = Stream.From(1);
            const result = s.info(2) as { items: Array<{ v: number; s: number; d: number }> };

            // Stream: 1, 2, 3, …
            // info(2):
            //   head=1, a.sum.tail(1) = sum of [2,3,…] for 1 step = 2
            //           a.double.tail(1) = double of [2,3,…] for 1 step = 4
            //   head=2, a.sum.tail(0) = 0,  a.double.tail(0) = 0
            assert.strictEqual(result.items.length, 2);
            assert.deepStrictEqual(result.items[0], { v: 1, s: 2, d: 4 });
            assert.deepStrictEqual(result.items[1], { v: 2, s: 0, d: 0 });
        });
    });
});
