import { data } from '@lapis-lang/lapis-js'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Recursive ADTs', () => {
    test('supports recursive Peano numbers', () => {
        const Peano = data(({ Family }) => ({ 
            Zero: [], 
            Succ: [{ pred: Family }] 
        }));

        // Zero
        const zero = Peano.Zero;
        assert.strictEqual(zero.constructor.name, 'Zero');
        assert.ok(zero instanceof Peano);

        // One = Succ(Zero)
        const one = Peano.Succ({ pred: zero });
        assert.strictEqual(one.constructor.name, 'Succ');
        assert.strictEqual(one.pred, zero);
        assert.ok(one instanceof Peano);

        // Two = Succ(Succ(Zero))
        const two = Peano.Succ({ pred: one });
        assert.strictEqual(two.pred, one);
        assert.strictEqual(two.pred.pred, zero);
        assert.ok(two instanceof Peano);

        // Three = Succ(Succ(Succ(Zero)))
        const three = Peano.Succ({ pred: two });
        assert.strictEqual(three.pred.pred.pred, zero);
    });

    test('validates recursive Peano structure', () => {
        const Peano = data(({ Family }) => ({ 
            Zero: [], 
            Succ: [{ pred: Family }] 
        }));

        // Should reject non-Peano values
        assert.throws(
            () => Peano.Succ({ pred: 42 } as any),
            /Field 'pred' must be an instance of the same ADT family/
        );

        assert.throws(
            () => Peano.Succ({ pred: [] } as any),
            /Field 'pred' must be an instance of the same ADT family/
        );
    });

    test('supports recursive List with type parameter concept', () => {
        // Note: TypeScript can't enforce the type parameter at runtime,
        // but the structure supports it conceptually
        const List = data(({ Family }) => ({ 
            Nil: [], 
            Cons: [{ head: Number }, { tail: Family }] 
        }));

        // Empty list
        const empty = List.Nil;
        assert.strictEqual(empty.constructor.name, 'Nil');
        assert.ok(empty instanceof List);

        // List with one element: 1
        const list1 = List.Cons({ head: 1, tail: empty });
        assert.strictEqual(list1.head, 1);
        assert.strictEqual(list1.tail, empty);
        assert.ok(list1 instanceof List);

        // List with two elements: 2, 1
        const list2 = List.Cons({ head: 2, tail: list1 });
        assert.strictEqual(list2.head, 2);
        assert.strictEqual(list2.tail, list1);

        // List with three elements: 3, 2, 1
        const list3 = List.Cons({ head: 3, tail: list2 });
        assert.strictEqual(list3.head, 3);
        assert.strictEqual(list3.tail.head, 2);
        assert.strictEqual(list3.tail.tail.head, 1);
        assert.strictEqual(list3.tail.tail.tail, empty);
    });

    test('validates recursive List structure', () => {
        const List = data(({ Family }) => ({ 
            Nil: [], 
            Cons: [{ head: Number }, { tail: Family }] 
        }));

        // Should reject non-List tails
        assert.throws(
            () => List.Cons({ head: 1, tail: null } as any),
            /Field 'tail' must be an instance of the same ADT family/
        );

        assert.throws(
            () => List.Cons({ head: 1, tail: [] } as any),
            /Field 'tail' must be an instance of the same ADT family/
        );
    });

    test('supports binary tree structure', () => {
        const Tree = data(({ Family }) => ({
            Leaf: [{ value: Number }],
            Node: [{ left: Family }, { right: Family }, { value: Number }]
        }));

        const leaf1 = Tree.Leaf({ value: 1 });
        const leaf2 = Tree.Leaf({ value: 2 });
        const leaf3 = Tree.Leaf({ value: 3 });

        // Simple tree: Node(Leaf(1), Leaf(2))
        const tree1 = Tree.Node({ left: leaf1, right: leaf2, value: 10 });
        assert.strictEqual(tree1.value, 10);
        assert.strictEqual(tree1.left, leaf1);
        assert.strictEqual(tree1.right, leaf2);

        // Deeper tree
        const tree2 = Tree.Node({ left: tree1, right: leaf3, value: 20 });
        assert.strictEqual(tree2.value, 20);
        assert.strictEqual(tree2.left.value, 10);
        assert.strictEqual(tree2.right, leaf3);
    });

    test('validates binary tree structure', () => {
        const Tree = data(({ Family }) => ({
            Leaf: [{ value: Number }],
            Node: [{ left: Family }, { right: Family }, { value: Number }]
        }));

        const leaf = Tree.Leaf({ value: 1 });

        assert.throws(
            () => Tree.Node({ left: leaf, right: [], value: 10 } as any),
            /Field 'right' must be an instance of the same ADT family/
        );
    });

    test('supports mixed recursive and non-recursive fields', () => {
        const Expr = data(({ Family }) => ({
            Num: [{ value: Number }],
            Add: [{ left: Family }, { right: Family }],
            Mul: [{ left: Family }, { right: Family }],
            Var: [{ name: String }]
        }));

        const x = Expr.Var({ name: 'x' });
        const two = Expr.Num({ value: 2 });
        const three = Expr.Num({ value: 3 });

        // 2 + 3
        const add = Expr.Add({ left: two, right: three });
        assert.strictEqual(add.left, two);
        assert.strictEqual(add.right, three);

        // (2 + 3) * x
        const mul = Expr.Mul({ left: add, right: x });
        assert.strictEqual(mul.left, add);
        assert.strictEqual(mul.right.name, 'x');
    });

    test('comprehensive demo: Peano, List, and Tree', () => {
        // Peano numbers
        const Peano = data(({ Family }) => ({ 
            Zero: [], 
            Succ: [{ pred: Family }] 
        }));

        const zero = Peano.Zero;
        const one = Peano.Succ({ pred: zero });
        const two = Peano.Succ({ pred: one });
        const three = Peano.Succ({ pred: two });

        assert.strictEqual(three.pred.pred.pred, zero);
        assert.ok(Object.isFrozen(one));

        // Recursive list
        const List = data(({ Family }) => ({ 
            Nil: [], 
            Cons: [{ head: Number }, { tail: Family }] 
        }));

        const empty = List.Nil;
        const list = List.Cons({ head: 3, 
            tail: List.Cons({ head: 2, 
                tail: List.Cons({ head: 1, tail: empty }) 
            }) 
        });

        assert.strictEqual(list.head, 3);
        assert.strictEqual(list.tail.head, 2);
        assert.strictEqual(list.tail.tail.head, 1);
        assert.strictEqual(list.tail.tail.tail, empty);

        // Binary tree
        const Tree = data(({ Family }) => ({
            Leaf: [{ value: Number }],
            Node: [{ left: Family }, { right: Family }, { value: Number }]
        }));

        const leaf1 = Tree.Leaf({ value: 1 });
        const leaf2 = Tree.Leaf({ value: 2 });
        const tree = Tree.Node({ left: leaf1, right: leaf2, value: 10 });

        assert.strictEqual(tree.value, 10);
        assert.strictEqual(tree.left.value, 1);
        assert.strictEqual(tree.right.value, 2);
        assert.ok(tree.left instanceof Tree);
        assert.ok(tree.right instanceof Tree);
    });
});
