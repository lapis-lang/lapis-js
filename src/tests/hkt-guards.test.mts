import { data, extend } from '@lapis-lang/lapis-js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Higher-Kinded Type Guards via subtype declarations (issue #55 — new approach).
 *
 * The old pattern `List({ T: PairSN })` is replaced by a subtype declaration:
 *   const ListOfPairs = data(family => ({ [extend]: List, Cons: { head: PairSN, tail: family } }));
 *
 * Type safety is enforced by comb-inheritance `instanceof` checks at construction time.
 */
describe('Higher-Kinded Type Guards (issue #55 — subtype approach)', () => {
    // Base Pair — accepts any first/second
    const Pair = data(_ => ({
        MakePair: { first: Object, second: Object }
    }));

    // Base List — accepts any head value
    const List = data(family => ({
        Nil: {},
        Cons: { head: Object, tail: family }
    }));

    test('plain string rejected where PairSN element expected', () => {
        // Narrow first:String, second:Number
        const PairSN = data(_ => ({ [extend]: Pair, MakePair: { first: String, second: Number } }));
        // List whose head must be a PairSN instance
        const ListOfPairs = data(family => ({ [extend]: List, Cons: { head: PairSN, tail: family } }));

        assert.throws(
            () => ListOfPairs.Cons({ head: 'not a pair', tail: ListOfPairs.Nil }),
            /Field 'head' must be an instance of/
        );
    });

    test('wrong subtype rejected', () => {
        const PairSN = data(_ => ({ [extend]: Pair, MakePair: { first: String, second: Number } }));
        const PairNN = data(_ => ({ [extend]: Pair, MakePair: { first: Number, second: Number } }));
        const ListOfPairs = data(family => ({ [extend]: List, Cons: { head: PairSN, tail: family } }));

        // PairNN is not PairSN — should be rejected
        const wrongPair = PairNN.MakePair({ first: 1, second: 2 });

        assert.throws(
            () => ListOfPairs.Cons({ head: wrongPair, tail: ListOfPairs.Nil }),
            /Field 'head' must be an instance of/
        );
    });

    test('correct subtype accepted', () => {
        const PairSN = data(_ => ({ [extend]: Pair, MakePair: { first: String, second: Number } }));
        const ListOfPairs = data(family => ({ [extend]: List, Cons: { head: PairSN, tail: family } }));

        const goodPair = PairSN.MakePair({ first: 'hello', second: 42 });
        const list = ListOfPairs.Cons({ head: goodPair, tail: ListOfPairs.Nil }) as
            { head: { first: string; second: number } };

        assert.strictEqual(list.head.first, 'hello');
        assert.strictEqual(list.head.second, 42);
    });

    test('non-parameterized ADT used as element type', () => {
        const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));
        const ListOfColors = data(family => ({ [extend]: List, Cons: { head: Color, tail: family } }));

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

    test('nested subtype element in list', () => {
        const PairSN = data(_ => ({ [extend]: Pair, MakePair: { first: String, second: Number } }));
        const ListOfPairs = data(family => ({ [extend]: List, Cons: { head: PairSN, tail: family } }));

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
