import { data } from '@lapis-lang/lapis-js'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Parameterized ADTs', () => {
    test('List must be instantiated with type arguments', () => {
        const List = data(({ Family, T }) => ({ 
            Nil: [], 
            Cons: [{ head: T }, { tail: Family(T) }] 
        }));

        // List itself should be a function
        assert.strictEqual(typeof List, 'function');

        // Instantiate with Number
        const NumList = List({ T: Number });
        
        // Now we can use the variants
        const empty = NumList.Nil;
        assert.strictEqual(empty.constructor.name, 'Nil');

        const list1 = NumList.Cons({ head: 1, tail: empty });
        assert.strictEqual(list1.head, 1);
        assert.strictEqual(list1.tail, empty);

        const list2 = NumList.Cons({ head: 2, tail: list1 });
        assert.strictEqual(list2.head, 2);
        assert.strictEqual(list2.tail.head, 1);
    });

    test('different type instantiations are separate', () => {
        const List = data(({ Family, T }) => ({ 
            Nil: [], 
            Cons: [{ head: T }, { tail: Family(T) }] 
        }));

        const NumList = List({ T: Number });
        const StrList = List({ T: String });

        // Number list
        const numList = NumList.Cons({ head: 42, tail: NumList.Nil });
        assert.strictEqual(numList.head, 42);

        // String list  
        const strList = StrList.Cons({ head: 'hello', tail: StrList.Nil });
        assert.strictEqual(strList.head, 'hello');

        // Type safety enforced at compile-time by TypeScript:
        // @ts-expect-error - TypeScript catches this: string not assignable to number
        NumList.Cons({ head: 'bad', tail: NumList.Nil });

        // @ts-expect-error - TypeScript catches this: number not assignable to string
        StrList.Cons({ head: 42, tail: StrList.Nil });
    });

    test('supports Maybe with type parameter', () => {
        const Maybe = data(({ T }) => ({
            Nothing: [],
            Just: [{ value: T }]
        }));

        const NumMaybe = Maybe({ T: Number });
        const StrMaybe = Maybe({ T: String });

        const nothing = NumMaybe.Nothing;
        assert.strictEqual(nothing.constructor.name, 'Nothing');

        const justNum = NumMaybe.Just({ value: 42 });
        assert.strictEqual(justNum.value, 42);

        const justStr = StrMaybe.Just({ value: 'hello' });
        assert.strictEqual(justStr.value, 'hello');

        // Type safety enforced at compile-time by TypeScript:
        // @ts-expect-error - TypeScript catches this: string not assignable to number
        NumMaybe.Just({ value: 'bad' });
    });

    test('supports Either with type parameter', () => {
        const Either = data(({ T }) => ({
            Left: [{ value: T }],
            Right: [{ value: T }]
        }));

        const StrEither = Either({ T: String });
        const NumEither = Either({ T: Number });

        const left = StrEither.Left({ value: 'error' });
        assert.strictEqual(left.value, 'error');

        const right = NumEither.Right({ value: 42 });
        assert.strictEqual(right.value, 42);
    });

    test('supports Tree with type parameter', () => {
        const Tree = data(({ Family, T }) => ({
            Leaf: [{ value: T }],
            Node: [{ left: Family }, { right: Family }, { value: T }]
        }));

        const NumTree = Tree({ T: Number });
        const StrTree = Tree({ T: String });

        const leaf1 = NumTree.Leaf({ value: 1 });
        const leaf2 = NumTree.Leaf({ value: 2 });
        
        const tree = NumTree.Node({ left: leaf1, right: leaf2, value: 10 });
        assert.strictEqual(tree.value, 10);
        assert.strictEqual(tree.left.value, 1);
        assert.strictEqual(tree.right.value, 2);

        // String tree
        const strLeaf = StrTree.Leaf({ value: 'a' });
        assert.strictEqual(strLeaf.value, 'a');
    });

    test('supports nested ADTs with type parameters', () => {
        const Maybe = data(({ T }) => ({
            Nothing: [],
            Just: [{ value: T }]
        }));

        const List = data(({ Family, T }) => ({
            Nil: [],
            Cons: [{ head: T }, { tail: Family }]
        }));

        const MaybeNum = Maybe({ T: Number });
        const MaybeList = List({ T: MaybeNum });

        const justOne = MaybeNum.Just({ value: 1 });
        const justTwo = MaybeNum.Just({ value: 2 });

        const list = MaybeList.Cons({
            head: justOne,
            tail: MaybeList.Cons({ head: justTwo, tail: MaybeList.Nil })
        });

        // Type assertion needed because head is a union of Nothing | Just
        assert.strictEqual((list.head as any).value, 1);
        assert.strictEqual((list.tail.head as any).value, 2);
    });

    test('supports predicates as field specs with type parameters', () => {
        const isPositive = (x: unknown): x is number => typeof x === 'number' && x > 0;

        const PositiveList = data(({ Family }) => ({
            Nil: [],
            Cons: [{ head: isPositive }, { tail: Family }]
        }));

        const list = PositiveList.Cons({ head: 5, tail: PositiveList.Nil });
        assert.strictEqual(list.head, 5);

        assert.throws(
            () => PositiveList.Cons({ head: -1, tail: PositiveList.Nil } as any),
            /Field 'head' failed predicate validation/
        );
    });

    test('supports parameterized List', () => {
        const List = data(({ Family, T }) => ({ 
            Nil: [], 
            Cons: [{ head: T }, { tail: Family }] 
        }));

        const NumList = List({ T: Number });

        const list = NumList.Cons({ head: 1, tail: NumList.Nil });
        assert.strictEqual(list.head, 1);
    });

    test('supports heterogeneous Pair with different type parameters', () => {
        // Pair with different types for first and second
        const Pair = data(({ T }) => ({
            MakePair: [{ first: T }, { second: T }]
        }));

        // Create a Pair that holds a Number and a String
        // Without strict instantiation, this works naturally
        const pair1 = Pair.MakePair({ first: 42, second: 'hello' });
        assert.strictEqual(pair1.first, 42);
        assert.strictEqual(pair1.second, 'hello');

        // Another pair with different types
        const pair2 = Pair.MakePair({ first: 'world', second: true });
        assert.strictEqual(pair2.first, 'world');
        assert.strictEqual(pair2.second, true);

        // Homogeneous pairs still work
        const numPair = Pair.MakePair({ first: 1, second: 2 });
        assert.strictEqual(numPair.first, 1);
        assert.strictEqual(numPair.second, 2);
    });

    test('freezes variants with type parameters', () => {
        const Maybe = data(({ T }) => ({
            Nothing: [],
            Just: [{ value: T }]
        }));

        const NumMaybe = Maybe({ T: Number });

        const just = NumMaybe.Just({ value: 42 });
        assert.ok(Object.isFrozen(just));
        assert.ok(Object.isFrozen(NumMaybe.Nothing));
    });

    test('instanceof works with parameterized types', () => {
        const List = data(({ Family, T }) => ({ 
            Nil: [], 
            Cons: [{ head: T }, { tail: Family }] 
        }));

        const NumList = List({ T: Number });

        const list = NumList.Cons({ head: 1, tail: NumList.Nil });
        
        assert.ok(list instanceof (NumList as any));
        assert.ok(NumList.Nil instanceof (NumList as any));
        assert.ok(list instanceof (NumList.Cons as any));
    });

    test('comprehensive demo: Maybe, Either, and instantiated types', () => {
        // Generic Maybe without instantiation
        const Maybe = data(({ T }) => ({
            Nothing: [],
            Just: [{ value: T }]
        }));

        const nothing = Maybe.Nothing;
        const justNum = Maybe.Just({ value: 42 });
        const justStr = Maybe.Just({ value: 'hello' });

        assert.strictEqual(nothing.constructor.name, 'Nothing');
        assert.strictEqual(justNum.value, 42);
        assert.strictEqual(justStr.value, 'hello');

        // Generic Either
        const Either = data(({ T }) => ({
            Left: [{ value: T }],
            Right: [{ value: T }]
        }));

        const left = Either.Left({ value: 'error: not found' });
        const right = Either.Right({ value: 42 });
        assert.strictEqual(left.value, 'error: not found');
        assert.strictEqual(right.value, 42);

        // Parameterized List with instantiation
        const List = data(({ Family, T }) => ({
            Nil: [],
            Cons: [{ head: T }, { tail: Family(T) }]
        }));

        // Number list
        const NumList = List({ T: Number });
        const nums = NumList.Cons({
            head: 10,
            tail: NumList.Cons({ head: 20, tail: NumList.Nil })
        });
        assert.strictEqual(nums.head, 10);
        assert.strictEqual(nums.tail.head, 20);

        // String list
        const StrList = List({ T: String });
        const strs = StrList.Cons({
            head: 'hello',
            tail: StrList.Cons({ head: 'world', tail: StrList.Nil })
        });
        assert.strictEqual(strs.head, 'hello');
        assert.strictEqual(strs.tail.head, 'world');

        // Type safety enforced at compile-time by TypeScript:
        // @ts-expect-error - TypeScript catches this: string not assignable to number
        NumList.Cons({ head: 'bad', tail: NumList.Nil });

        // Instantiated Maybe with validation
        const NumMaybe = Maybe({ T: Number });
        const justFortyTwo = NumMaybe.Just({ value: 42 });
        assert.strictEqual(justFortyTwo.value, 42);

        // @ts-expect-error - TypeScript catches this: string not assignable to number
        NumMaybe.Just({ value: 'string' });
    });
});
