import { data } from '@lapis-lang/lapis-js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Higher-Kinded Type Guards (issue #55)', () => {
    const Pair = data(({ T, U }) => ({
        MakePair: { first: T, second: U }
    }));

    const List = data(({ Family, T }) => ({
        Nil: {},
        Cons: { head: T, tail: Family(T) }
    }));

    test('BUG 1: plain string rejected where Pair({ T: String, U: Number }) expected', () => {
        const PairSN = Pair({ T: String, U: Number });
        const ListOfPairs = List({ T: PairSN });

        assert.throws(
            () => ListOfPairs.Cons({ head: 'not a pair', tail: ListOfPairs.Nil }),
            /Field 'head' must be an instance of/
        );
    });

    test('BUG 2: wrong parameterization rejected', () => {
        const PairSN = Pair({ T: String, U: Number });
        const ListOfPairs = List({ T: PairSN });

        const wrongPair = Pair({ T: Number, U: Number }).MakePair({ first: 1, second: 2 });

        assert.throws(
            () => ListOfPairs.Cons({ head: wrongPair, tail: ListOfPairs.Nil }),
            /Field 'head' must be an instance of/
        );
    });

    test('correct parameterization accepted', () => {
        const PairSN = Pair({ T: String, U: Number });
        const ListOfPairs = List({ T: PairSN });

        const goodPair = PairSN.MakePair({ first: 'hello', second: 42 });
        const list = ListOfPairs.Cons({ head: goodPair, tail: ListOfPairs.Nil }) as
            { head: { first: string; second: number } };

        assert.strictEqual(list.head.first, 'hello');
        assert.strictEqual(list.head.second, 42);
    });

    test('non-parameterized ADT used as type argument', () => {
        const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));
        const ListOfColors = List({ T: Color });

        // Valid: Color instances accepted
        const list = ListOfColors.Cons({ head: Color.Red, tail: ListOfColors.Nil });
        assert.strictEqual(list.head, Color.Red);

        // Invalid: plain string rejected
        assert.throws(
            () => ListOfColors.Cons({ head: 'red', tail: ListOfColors.Nil }),
            /Field 'head' must be an instance of/
        );

        // Invalid: number rejected
        assert.throws(
            () => ListOfColors.Cons({ head: 42, tail: ListOfColors.Nil }),
            /Field 'head' must be an instance of/
        );
    });

    test('nested parameterized ADT type args', () => {
        const PairSN = Pair({ T: String, U: Number });
        const ListOfPairs = List({ T: PairSN });

        const pair1 = PairSN.MakePair({ first: 'a', second: 1 });
        const pair2 = PairSN.MakePair({ first: 'b', second: 2 });

        const list = ListOfPairs.Cons({
            head: pair2,
            tail: ListOfPairs.Cons({ head: pair1, tail: ListOfPairs.Nil })
        }) as { head: { first: string }; tail: { head: { first: string } } };

        assert.strictEqual(list.head.first, 'b');
        assert.strictEqual(list.tail.head.first, 'a');
    });
});
