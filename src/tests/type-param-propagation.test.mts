/**
 * Regression tests for issue #126:
 * Parameterized ADT Calls Do Not Propagate Type Arguments at the Type Level
 *
 * These tests verify that parameterized ADT instantiation propagates type
 * arguments through variant field types, so that `TypeParamRef<'T'>` resolves
 * to the concrete type supplied at instantiation rather than `unknown`.
 *
 * Type-level propagation requires the **object form** of type instantiation
 * (`List({ T: Number })`), which preserves the mapping from parameter names
 * to concrete types.
 */
import { data } from '@lapis-lang/lapis-js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Type-parameter propagation at the type level (issue #126)', () => {

    // ---------- Single type parameter ----------

    test('List({ T: Number }): head field is typed as number', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        }));

        const NumList = List({ T: Number });
        const list = NumList.Cons({ head: 42, tail: NumList.Nil });

        // Runtime check
        assert.strictEqual(list.head, 42);

        // Type-level: list.head should be `number`, not `unknown`.
        // The following assignment must compile without casts.
        const headValue: number = list.head;
        assert.strictEqual(headValue, 42);
    });

    test('Maybe({ T: String }): value field is typed as string', () => {
        const Maybe = data(({ T }) => ({
            Nothing: {},
            Just: { value: T }
        }));

        const StrMaybe = Maybe({ T: String });
        const just = StrMaybe.Just({ value: 'hello' });

        // Type-level: just.value should be `string`.
        const v: string = just.value;
        assert.strictEqual(v, 'hello');
    });

    // ---------- Two type parameters ----------

    test('Pair({ T: String, U: Number }): first/second typed correctly', () => {
        const Pair = data(({ T, U }) => ({
            MakePair: { first: T, second: U }
        }));

        const PairSN = Pair({ T: String, U: Number });
        const p = PairSN.MakePair({ first: 'hello', second: 42 });

        const f: string = p.first;
        const s: number = p.second;
        assert.strictEqual(f, 'hello');
        assert.strictEqual(s, 42);
    });

    // ---------- Nested parameterized ADTs ----------

    test('List of Pairs: head fields are accessible', () => {
        const Pair = data(({ T, U }) => ({
            MakePair: { first: T, second: U }
        }));

        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        }));

        const PairSN = Pair({ T: String, U: Number });
        const ListOfPairs = List({ T: PairSN });

        const goodPair = PairSN.MakePair({ first: 'hello', second: 42 });
        const list = ListOfPairs.Cons({ head: goodPair, tail: ListOfPairs.Nil });

        // Runtime checks
        assert.strictEqual(list.head.first, 'hello');
        assert.strictEqual(list.head.second, 42);

        // Type-level: list.head should carry the Pair's instance type,
        // so .first is `string` and .second is `number` without casts.
        const f: string = list.head.first;
        const s: number = list.head.second;
        assert.strictEqual(f, 'hello');
        assert.strictEqual(s, 42);
    });

    // ---------- Object-form parameterization ----------

    test('List({ T: Number }): head is typed as number', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        }));

        const NumList = List({ T: Number });
        const list = NumList.Cons({ head: 7, tail: NumList.Nil });

        const headValue: number = list.head;
        assert.strictEqual(headValue, 7);
    });

    // ---------- Stack({ T: Number }) ----------

    test('Stack({ T: Number }): value field is typed as number', () => {
        const Stack = data(({ Family, T }) => ({
            Empty: {},
            Push: { value: T, rest: Family(T) }
        }));

        const NumStack = Stack({ T: Number });
        const stk = NumStack.Push({ value: 99, rest: NumStack.Empty });

        const v: number = stk.value;
        assert.strictEqual(v, 99);
    });

    // ---------- Single-letter type parameter names ----------

    test('Dictionary({ K: String, V: Number }): two single-letter params K/V', () => {
        const Dictionary = data(({ K, V }) => ({
            Empty: {},
            Entry: { key: K, value: V }
        }));

        const StrNumDict = Dictionary({ K: String, V: Number });
        const entry = StrNumDict.Entry({ key: 'age', value: 30 });

        assert.strictEqual(entry.key, 'age');
        assert.strictEqual(entry.value, 30);

        // Runtime type safety
        assert.throws(
            () => StrNumDict.Entry({ key: 42, value: 'bad' }),
            /Field 'key' must be a String/
        );
    });

    test('List with E param name', () => {
        const List = data(({ Family, E }) => ({
            Nil: {},
            Cons: { head: E, tail: Family(E) }
        }));

        const NumList = List({ E: Number });
        const list = NumList.Cons({ head: 42, tail: NumList.Nil });

        assert.strictEqual(list.head, 42);

        assert.throws(
            () => NumList.Cons({ head: 'bad', tail: NumList.Nil }),
            /Field 'head' must be a Number/
        );
    });
});
