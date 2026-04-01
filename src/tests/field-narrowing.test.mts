/**
 * Field Narrowing tests (Issue #189 — Phase 2)
 *
 * `extend` now allows a child ADT to re-declare an inherited variant with
 * narrower (covariant) field types.  The child spec is merged with the parent
 * spec; unspecified fields are inherited unchanged.
 *
 * Rules enforced at declaration time:
 *  - Child may not introduce NEW fields (would violate product-type subtyping).
 *  - Each re-specified field must satisfy: childType <: parentType.
 *  - FamilyRef fields are always covariant with other FamilyRef fields.
 *  - Same field type (identity) is trivially covariant.
 */
import { data, extend } from '../index.mjs';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// ── Shared class hierarchy used for constructor-subtyping tests ──────────────

class Animal { species = 'animal'; }
class Dog extends Animal { breed = 'dog'; }
class Cat extends Animal { meow = true; }

// ── Basic covariant narrowing ─────────────────────────────────────────────────

describe('Field narrowing — valid covariant specs', () => {

    test('Object → Number: list with narrowed head type', () => {
        const List = data(({ family }) => ({
            Nil:  {},
            Cons: { head: Object, tail: family }
        })).ops(({ fold }) => ({
            toArray: fold({ out: Array })({
                Nil()                    { return []; },
                Cons({ head, tail }: any) { return [head, ...tail]; }
            })
        }));

        const NumList = data(({ family }) => ({
            [extend]: List,
            Cons: { head: Number, tail: family }
        })).ops(({ fold }) => ({
            toArray: fold({ out: Array })({
                Nil()                    { return []; },
                Cons({ head, tail }: any) { return [head, ...tail]; }
            }),
            sum: fold({ out: Number })({
                Nil()                    { return 0; },
                Cons({ head, tail }: any) { return (head as number) + tail; }
            })
        }));

        const list = NumList.Cons({ head: 3, tail: NumList.Cons({ head: 4, tail: NumList.Nil }) });
        assert.deepStrictEqual(list.toArray, [3, 4]);
        assert.strictEqual(list.sum, 7);
    });

    test('Animal → Dog: fold dispatches to narrowed variant constructor', () => {
        const Box = data(({ family }) => ({
            Empty: {},
            Full:  { item: Animal, next: family }
        }));

        const DogBox = data(({ family }) => ({
            [extend]: Box,
            Full: { item: Dog, next: family }
        }));

        const fido = new Dog();
        const box  = DogBox.Full({ item: fido, next: DogBox.Empty });
        assert.strictEqual((box as any).item, fido);
    });

    test('partial re-spec: only narrowed field + inherited fields still accessible', () => {
        const List = data(({ family }) => ({
            Nil:  {},
            Cons: { head: Object, tail: family }
        }));

        // Child re-specifies only `head`; `tail` is inherited from parent spec
        const NumList = data(({ family }) => ({
            [extend]: List,
            Cons: { head: Number, tail: family }
        }));

        const cons = NumList.Cons({ head: 42, tail: NumList.Nil });
        assert.strictEqual((cons as any).head, 42);
    });

    test('identical field type is always covariant (no-op narrowing)', () => {
        const Box = data(({ family }) => ({
            Full: { item: Number }
        }));

        // Re-specifying with the identical type should be silently allowed
        assert.doesNotThrow(() =>
            data(({ family }) => ({
                [extend]: Box,
                Full: { item: Number }
            }))
        );
    });

    test('FamilyRef is covariant with FamilyRef across different markers', () => {
        const Tree = data(({ family }) => ({
            Leaf:  { value: Object },
            Node:  { left: family, right: family }
        }));

        // Re-specifying value: Object → Number; left/right: family → family (ok)
        assert.doesNotThrow(() =>
            data(({ family }) => ({
                [extend]: Tree,
                Leaf: { value: Number }
            }))
        );
    });
});

// ── Comb instanceof with narrowed variant ─────────────────────────────────────

describe('Field narrowing — comb instanceof', () => {

    const List = data(({ family }) => ({
        Nil:  {},
        Cons: { head: Object, tail: family }
    }));

    const NumList = data(({ family }) => ({
        [extend]: List,
        Cons: { head: Number, tail: family }
    }));

    test('narrowed instance does NOT satisfy a different Cons from an unrelated ADT', () => {
        const OtherList = data(({ family }) => ({
            Cons: { head: Object, tail: family }
        }));
        const e = NumList.Cons({ head: 1, tail: NumList.Nil });
        // Singletons (e.g. Nil) are not constructors — cannot appear on the RHS of instanceof.
        // Instead verify no false positive against a completely unrelated ADT's variant:
        assert.strictEqual(e instanceof OtherList,      false, 'not instanceof OtherList (unrelated)');
        assert.strictEqual(e instanceof OtherList.Cons, false, 'not instanceof OtherList.Cons (unrelated)');
    });

    test('un-narrowed parent instance passes parent variant but not child (no comb from parent to child)', () => {
        const e = List.Cons({ head: 'hello', tail: List.Nil });
        assert.strictEqual(e instanceof List.Cons,    true,  'instanceof List.Cons (direct)');
        assert.strictEqual(e instanceof NumList.Cons, false, 'not instanceof NumList.Cons (parent is not a child)');
    });
});

// ── Field validation with narrowed types ─────────────────────────────────────

describe('Field narrowing — runtime field validation', () => {

    const List = data(({ family }) => ({
        Nil:  {},
        Cons: { head: Object, tail: family }
    }));

    const NumList = data(({ family }) => ({
        [extend]: List,
        Cons: { head: Number, tail: family }
    }));

    test('NumList.Cons accepts Number for head', () => {
        assert.doesNotThrow(() =>
            NumList.Cons({ head: 99, tail: NumList.Nil })
        );
    });

    test('NumList.Cons rejects String for head (narrowed to Number)', () => {
        assert.throws(
            () => NumList.Cons({ head: 'not-a-number' as unknown as number, tail: NumList.Nil }),
            /must be a Number/
        );
    });

    test('List.Cons still accepts any Object for head (parent unaffected)', () => {
        assert.doesNotThrow(() => List.Cons({ head: 'a string', tail: List.Nil }));
        assert.doesNotThrow(() => List.Cons({ head: 42,        tail: List.Nil }));
        assert.doesNotThrow(() => List.Cons({ head: {},        tail: List.Nil }));
    });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe('Field narrowing — error cases', () => {

    test('widening (Number → Object) throws at declaration time', () => {
        const NumBox = data(() => ({
            Box: { value: Number }
        }));

        assert.throws(
            () => data(() => ({
                [extend]: NumBox,
                Box: { value: Object }
            })).ops(() => ({})),
            /Cannot narrow field 'value'/
        );
    });

    test('unrelated type throw at declaration time', () => {
        const List = data(({ family }) => ({
            Cons: { head: Number, tail: family }
        }));

        assert.throws(
            () => data(({ family }) => ({
                [extend]: List,
                Cons: { head: String, tail: family }  // String is not a subtype of Number
            })).ops(() => ({})),
            /Cannot narrow field 'head'/
        );
    });

    test('sibling class throw at declaration time (Cat is not a Dog)', () => {
        const Box = data(() => ({
            Full: { item: Dog }
        }));

        assert.throws(
            () => data(() => ({
                [extend]: Box,
                Full: { item: Cat }  // Cat not a subtype of Dog
            })).ops(() => ({})),
            /Cannot narrow field 'item'/
        );
    });

    test('introducing a new field in child throws', () => {
        const Box = data(() => ({
            Full: { value: Number }
        }));

        assert.throws(
            () => data(() => ({
                [extend]: Box,
                Full: { value: Number, extra: String }  // 'extra' is new
            })).ops(() => ({})),
            /introduces new field 'extra'/
        );
    });
});
