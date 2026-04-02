/**
 * Scan Operation Tests (Issue #179 — Phase C)
 *
 * The scan operation is the datatype-generic generalisation of `scanr`.
 * For any recursive ADT and fold φ, `scanOp('φ')` creates an operation
 * that traverses the structure and returns an Array of fold results — one
 * per subterm, including the root — in top-down (root-first) order.
 *
 * Scan Lemma:  L(fold_F(φ)) ∘ subterms  =  scan_F(φ)
 *
 * For a list `Cons(1, Cons(2, Cons(3, Nil)))` with `sum` fold:
 *   scanSum = [6, 5, 3, 0]   (analogous to Haskell's `scanr (+) 0 [1,2,3]`)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, scan } from '../index.mjs';

// ─── List ADT ────────────────────────────────────────────────────────────────

const NumList = data(family => ({
    Nil:  {},
    Cons: { head: Number, tail: family }
})).ops(({ fold, unfold, family }) => ({

    FromArray: unfold({ in: Array, out: family })({
        Nil:  (xs: number[]) => xs.length === 0 ? {} : null,
        Cons: (xs: number[]) => xs.length > 0 ? { head: xs[0], tail: xs.slice(1) } : null
    }),

    sum: fold({ out: Number })({
        Nil()                      { return 0; },
        Cons({ head, tail }: any)  { return (head as number) + tail; }
    }),

    product: fold({ out: Number })({
        Nil()                      { return 1; },
        Cons({ head, tail }: any)  { return (head as number) * tail; }
    }),

    length: fold({ out: Number })({
        Nil()             { return 0; },
        Cons({ tail }: any) { return 1 + tail; }
    }),

    scanSum:     scan('sum'),
    scanProduct: scan('product'),
    scanLength:  scan('length')
}));

// ─── Binary Tree ADT ────────────────────────────────────────────────────────

const Tree = data(family => ({
    Leaf: { value: Number },
    Node: { left: family, right: family }
})).ops(({ fold }) => ({

    sum: fold({ out: Number })({
        Leaf({ value }: any)        { return value as number; },
        Node({ left, right }: any)  { return left + right; }
    }),

    scanSum: scan('sum')
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('scan — list', () => {
    it('empty list: scan returns [identity]', () => {
        const nil = NumList.Nil;
        assert.deepStrictEqual((nil as any).scanSum, [0],
            'scanSum of Nil should be [0]');
    });

    it('single-element list: [elem, identity]', () => {
        const list = (NumList as any).FromArray([5]);
        assert.deepStrictEqual((list as any).scanSum, [5, 0]);
    });

    it('three-element list: matches scanr (+) 0', () => {
        const list = (NumList as any).FromArray([1, 2, 3]);
        // scanr (+) 0 [1,2,3] = [6, 5, 3, 0]
        assert.deepStrictEqual((list as any).scanSum, [6, 5, 3, 0]);
    });

    it('first element of scan equals the plain fold', () => {
        const list = (NumList as any).FromArray([4, 7, 2]);
        const scanResult = (list as any).scanSum as number[];
        const foldResult = (list as any).sum as number;
        assert.strictEqual(scanResult[0], foldResult,
            'first scan element should equal fold(φ)(root)');
    });

    it('last element of scan is the identity (Nil result)', () => {
        const list = (NumList as any).FromArray([1, 2, 3]);
        const scanResult = (list as any).scanSum as number[];
        assert.strictEqual(scanResult[scanResult.length - 1], 0,
            'last scan element should be sum(Nil) = 0');
    });

    it('length of scan array equals list length + 1', () => {
        const list = (NumList as any).FromArray([10, 20, 30, 40]);
        const scanResult = (list as any).scanSum as number[];
        assert.strictEqual(scanResult.length, 5,
            'scan array length should be list.length + 1');
    });

    it('scan of product fold: scanr (*) 1 [2,3,4]', () => {
        const list = (NumList as any).FromArray([2, 3, 4]);
        // scanr (*) 1 [2,3,4] = [24, 12, 4, 1]
        assert.deepStrictEqual((list as any).scanProduct, [24, 12, 4, 1]);
    });

    it('scan of length fold', () => {
        const list = (NumList as any).FromArray([10, 20, 30]);
        // scan of length: [3, 2, 1, 0]
        assert.deepStrictEqual((list as any).scanLength, [3, 2, 1, 0]);
    });

    it('scan is consistent: each tail[0] equals previous scan[1]', () => {
        const list = (NumList as any).FromArray([1, 2, 3, 4]);
        const scan0 = (list as any).scanSum as number[];
        const tail  = (list as any).tail;
        const scan1 = (tail as any).scanSum as number[];
        assert.strictEqual(scan0[1], scan1[0],
            'scan[1] at root should equal scan[0] at tail');
    });
});

describe('scan — binary tree', () => {
    it('single leaf: [leaf.value]', () => {
        const leaf = Tree.Leaf({ value: 7 });
        assert.deepStrictEqual((leaf as any).scanSum, [7]);
    });

    it('simple node: [sum(node), left.value, right.value]', () => {
        const tree = Tree.Node({
            left: Tree.Leaf({ value: 3 }),
            right: Tree.Leaf({ value: 4 })
        });
        // sum at root = 7, left leaf = 3, right leaf = 4
        assert.deepStrictEqual((tree as any).scanSum, [7, 3, 4]);
    });

    it('first element equals the plain fold of root', () => {
        const tree = Tree.Node({
            left: Tree.Node({
                left: Tree.Leaf({ value: 1 }),
                right: Tree.Leaf({ value: 2 })
            }),
            right: Tree.Leaf({ value: 3 })
        });
        const scanResult = (tree as any).scanSum as number[];
        assert.strictEqual(scanResult[0], (tree as any).sum as number,
            'first scan element should equal sum of root');
    });

    it('scan collects results for every node in the tree', () => {
        // Build a balanced 3-node tree: root(left(2,3), right(4))
        const tree = Tree.Node({
            left: Tree.Node({
                left: Tree.Leaf({ value: 2 }),
                right: Tree.Leaf({ value: 3 })
            }),
            right: Tree.Leaf({ value: 4 })
        });
        const scanResult = (tree as any).scanSum as number[];
        // root = 9, left-node = 5, leaf(2) = 2, leaf(3) = 3, leaf(4) = 4
        assert.deepStrictEqual(scanResult, [9, 5, 2, 3, 4]);
    });
});

describe('scan — type errors at registration', () => {
    it('throws when target fold does not exist', () => {
        assert.throws(() => {
            data(family => ({
                Nil: {},
                Cons: { head: Number, tail: family }
            })).ops(() => ({
                // 'missing' is not a fold on this type
                scanMissing: scan('missing')
            }));
        }, /scan\('missing'\).*not a fold/i);
    });
});
