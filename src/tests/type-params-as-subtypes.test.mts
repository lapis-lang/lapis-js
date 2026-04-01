/**
 * Spike: Type Parameters as Subtypes (Issue #189 — Step 5)
 *
 * Validates that parameterized algebraic data types can be expressed through
 * subtype-with-field-narrowing instead of threaded type-parameter declarations +
 * `Name({ T: SomeType })` invocation.
 *
 * Replace:
 *   const List   = data(family => ({ Nil: {}, Cons: { head: Object, tail: family } }))
 *   const NumList = List({ T: Number })
 *
 * With:
 *   const List    = data(family => ({ Nil: {}, Cons: { head: Object, tail: family } }))
 *   const NumList = data(family => ({ [extend]: List, Cons: { head: Number, tail: family } }))
 *
 * Benefits:
 *   – No threading of `T` through declarations
 *   – No `Name({ T: … })` invocation; subtypes declared with plain `const`
 *   – Comb inheritance: `numListInst instanceof List` === true
 *   – Runtime type safety via field narrowing (covariant subtyping)
 *   – Ops defined on the base still work on instances of the subtype
 */
import { data, extend } from '../index.mjs';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────────
// Shared base declarations (declared once, reused across describe blocks)
// ─────────────────────────────────────────────────────────────────────────────

// Base List – unconstrained element type (Object ≡ "any")
const List = data(family => ({
    Nil:  {},
    Cons: { head: Object, tail: family }
})).ops(({ fold }) => ({
    toArray: fold({ out: Array })({
        Nil()                     { return []; },
        Cons({ head, tail }: any) { return [head, ...tail]; }
    }),
    length: fold({ out: Number })({
        Nil()          { return 0; },
        Cons({ tail }: any) { return 1 + tail; }
    })
}));

// NumList narrows Cons.head: Object → Number (covariant)
const NumList = data(family => ({
    [extend]: List,
    Cons: { head: Number, tail: family }
})).ops(({ fold }) => ({
    sum: fold({ out: Number })({
        Nil()                     { return 0; },
        Cons({ head, tail }: any) { return (head as number) + tail; }
    })
}));

// StrList narrows Cons.head: Object → String (separate "instantiation")
const StrList = data(family => ({
    [extend]: List,
    Cons: { head: String, tail: family }
})).ops(({ fold }) => ({
    concat: fold({ out: String })({
        Nil()                     { return ''; },
        Cons({ head, tail }: any) { return (head as string) + tail; }
    })
}));

// Base Stack – unconstrained element type
const Stack = data(family => ({
    Empty: {},
    Push:  { top: Object, rest: family }
})).ops(({ fold }) => ({
    size: fold({ out: Number })({
        Empty()           { return 0; },
        Push({ rest }: any) { return 1 + rest; }
    })
}));

// NumStack narrows Push.top: Object → Number
const NumStack = data(family => ({
    [extend]: Stack,
    Push: { top: Number, rest: family }
})).ops(({ fold }) => ({
    total: fold({ out: Number })({
        Empty()              { return 0; },
        Push({ top, rest }: any) { return (top as number) + rest; }
    })
}));

// Base Maybe – unconstrained value type
const Maybe = data(_ => ({
    Nothing: {},
    Just:    { value: Object }
}));

// NumMaybe narrows Just.value: Object → Number
const NumMaybe = data(_ => ({
    [extend]: Maybe,
    Just: { value: Number }
}));

// Base Tree – unconstrained value type
const Tree = data(family => ({
    Leaf: { value: Object },
    Node: { left: family, right: family, value: Object }
})).ops(({ fold }) => ({
    depth: fold({ out: Number })({
        Leaf()                          { return 1; },
        Node({ left, right }: any) { return 1 + Math.max(left, right); }
    })
}));

// NumTree narrows value fields: Object → Number
const NumTree = data(family => ({
    [extend]: Tree,
    Leaf: { value: Number },
    Node: { left: family, right: family, value: Number }
})).ops(({ fold }) => ({
    sum: fold({ out: Number })({
        Leaf({ value }: any)            { return value as number; },
        Node({ left, right, value }: any) { return left + right + (value as number); }
    })
}));

// ─────────────────────────────────────────────────────────────────────────────

describe('Step 5 — Type Parameters as Subtypes (Issue #189)', () => {

    // ── List ──────────────────────────────────────────────────────────────────

    describe('List / NumList', () => {

        test('NumList.Cons construction and field access', () => {
            const xs = NumList.Cons({ head: 1, tail: NumList.Cons({ head: 2, tail: NumList.Nil }) });
            assert.strictEqual((xs as any).head, 1);
            assert.strictEqual((xs as any).tail.head, 2);
        });

        test('NumList fold: sum', () => {
            const xs = NumList.Cons({ head: 10, tail: NumList.Cons({ head: 20, tail: NumList.Nil }) });
            assert.strictEqual((xs as any).sum, 30);
        });

        test('NumList inherits toArray from List', () => {
            const xs = NumList.Cons({ head: 1, tail: NumList.Cons({ head: 2, tail: NumList.Nil }) });
            assert.deepStrictEqual((xs as any).toArray, [1, 2]);
        });

        test('NumList inherits length from List', () => {
            const xs = NumList.Cons({ head: 1, tail: NumList.Cons({ head: 2, tail: NumList.Nil }) });
            assert.strictEqual((xs as any).length, 2);
        });
        test('NumList.Nil is instanceof both NumList and List', () => {
            assert.strictEqual(NumList.Nil instanceof NumList, true);
            assert.strictEqual(NumList.Nil instanceof List,    true);
        });

        test('NumList enforces Number on head (type narrowing)', () => {
            assert.throws(
                () => NumList.Cons({ head: 'bad', tail: NumList.Nil }),
                /must be a Number|field.*head/i
            );
        });
    });

    // ── StrList – separate "instantiation" ───────────────────────────────────

    describe('StrList – separate subtype', () => {

        test('StrList.Cons construction and concat fold', () => {
            const ws = StrList.Cons({ head: 'hello', tail: StrList.Cons({ head: 'world', tail: StrList.Nil }) });
            assert.strictEqual((ws as any).concat, 'helloworld');
        });

        test('StrList inherits toArray from List', () => {
            const ws = StrList.Cons({ head: 'a', tail: StrList.Cons({ head: 'b', tail: StrList.Nil }) });
            assert.deepStrictEqual((ws as any).toArray, ['a', 'b']);
        });

        test('StrList enforces String on head', () => {
            assert.throws(
                () => StrList.Cons({ head: 42, tail: StrList.Nil }),
                /must be a String|field.*head/i
            );
        });

        test('NumList and StrList do not cross-contaminate', () => {
            const num = NumList.Cons({ head: 1, tail: NumList.Nil });
            const str = StrList.Cons({ head: 'x', tail: StrList.Nil });
            // Each is-a List
            assert.strictEqual(num instanceof List, true);
            assert.strictEqual(str instanceof List, true);
            // But not each-other's subtype
            assert.strictEqual(num instanceof StrList, false);
            assert.strictEqual(str instanceof NumList, false);
        });

        test('NumList.Nil and StrList.Nil are both instanceof List', () => {
            // Each subtype owns its own copy of inherited singletons.
            // What's guaranteed is that each is instanceof the base type.
            assert.strictEqual(NumList.Nil instanceof List, true);
            assert.strictEqual(StrList.Nil instanceof List, true);
        });
    });

    // ── Stack ─────────────────────────────────────────────────────────────────

    describe('Stack / NumStack', () => {

        test('NumStack construction and total fold', () => {
            const s = NumStack.Push({ top: 5, rest: NumStack.Push({ top: 10, rest: NumStack.Empty }) });
            assert.strictEqual((s as any).total, 15);
        });

        test('NumStack inherits size from Stack', () => {
            const s = NumStack.Push({ top: 1, rest: NumStack.Push({ top: 2, rest: NumStack.Empty }) });
            assert.strictEqual((s as any).size, 2);
        });

        test('direct field access: top from Push', () => {
            const s = NumStack.Push({ top: 42, rest: NumStack.Empty });
            assert.strictEqual((s as any).top, 42);
        });
        test('NumStack enforces Number on top', () => {
            assert.throws(
                () => NumStack.Push({ top: 'bad', rest: NumStack.Empty }),
                /must be a Number|field.*top/i
            );
        });
    });

    // ── Maybe ─────────────────────────────────────────────────────────────────

    describe('Maybe / NumMaybe', () => {

        test('NumMaybe.Just construction', () => {
            const j = NumMaybe.Just({ value: 42 });
            assert.strictEqual((j as any).value, 42);
        });

        test('NumMaybe.Nothing is instanceof both NumMaybe and Maybe', () => {
            assert.strictEqual(NumMaybe.Nothing instanceof NumMaybe, true);
            assert.strictEqual(NumMaybe.Nothing instanceof Maybe,    true);
        });
        test('NumMaybe.Just enforces Number on value', () => {
            assert.throws(
                () => NumMaybe.Just({ value: 'not a number' }),
                /must be a Number|field.*value/i
            );
        });

        test('frozen instances', () => {
            const j = NumMaybe.Just({ value: 99 });
            assert.ok(Object.isFrozen(j));
        });
    });

    // ── Tree ──────────────────────────────────────────────────────────────────

    describe('Tree / NumTree', () => {

        test('NumTree.Leaf and sum fold', () => {
            const leaf = NumTree.Leaf({ value: 5 });
            assert.strictEqual((leaf as any).sum, 5);
        });

        test('NumTree.Node sum fold', () => {
            const t = NumTree.Node({
                left:  NumTree.Leaf({ value: 3 }),
                right: NumTree.Leaf({ value: 4 }),
                value: 10
            });
            assert.strictEqual((t as any).sum, 17);
        });

        test('NumTree inherits depth from Tree', () => {
            const t = NumTree.Node({
                left:  NumTree.Leaf({ value: 1 }),
                right: NumTree.Node({
                    left:  NumTree.Leaf({ value: 2 }),
                    right: NumTree.Leaf({ value: 3 }),
                    value: 0
                }),
                value: 0
            });
            assert.strictEqual((t as any).depth, 3);
        });
        test('NumTree enforces Number on Leaf.value', () => {
            assert.throws(
                () => NumTree.Leaf({ value: 'oops' }),
                /must be a Number|field.*value/i
            );
        });
    });

    // ── Nested "instantiations" ───────────────────────────────────────────────

    describe('Nested subtypes (List of NumMaybe)', () => {

        test('construct a List of NumMaybe values', () => {
            const j1 = NumMaybe.Just({ value: 1 });
            const j2 = NumMaybe.Just({ value: 2 });
            // Use the base List — heads hold Object (any NumMaybe is an Object)
            const xs = List.Cons({ head: j1, tail: List.Cons({ head: j2, tail: List.Nil }) });
            assert.strictEqual((xs as any).toArray[0], j1);
            assert.strictEqual((xs as any).toArray[1], j2);
        });

        test('List of NumMaybe: values are still NumMaybe instances', () => {
            const j = NumMaybe.Just({ value: 42 });
            const xs = List.Cons({ head: j, tail: List.Nil });
            assert.strictEqual((xs as any).toArray[0] instanceof NumMaybe, true);
            assert.strictEqual((xs as any).toArray[0] instanceof Maybe,    true);
        });
    });

    // ── Instances are frozen ─────────────────────────────────────────────────

    describe('Instances are frozen', () => {

        test('NumList.Cons instance is frozen', () => {
            const xs = NumList.Cons({ head: 1, tail: NumList.Nil });
            assert.ok(Object.isFrozen(xs));
        });

        test('NumStack.Push instance is frozen', () => {
            const s = NumStack.Push({ top: 1, rest: NumStack.Empty });
            assert.ok(Object.isFrozen(s));
        });
    });
});
