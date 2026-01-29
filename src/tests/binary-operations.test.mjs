import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

// Define ADTs once and share across all tests
const Pair = data(({ T, U }) => ({
    MakePair: { first: T, second: U }
}));

const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) },
    zip: {
        op: 'fold',
        spec: {},
        Nil() { return Family(T).Nil; },
        Cons({ head, tail }, ys) {
            if (!ys || ys.constructor.name === 'Nil')
                return Family(T).Nil;

            const PairType = Pair(typeof head, typeof ys.head);

            return Family(T).Cons({
                head: PairType.MakePair({ first: head, second: ys.head }),
                tail: tail(ys.tail)  // tail is a partially applied function
            });
        }
    }
}));

const NumList = List(Number),
    StrList = List(String);

describe('Binary Operations with Fold', () => {
    describe('Zip Operation', () => {
        test('should zip two lists of equal length', () => {

            // Create test lists
            const nums = NumList.Cons({
                head: 1,
                tail: NumList.Cons({
                    head: 2,
                    tail: NumList.Cons({ head: 3, tail: NumList.Nil })
                })
            });
            const strs = StrList.Cons({
                head: "a",
                tail: StrList.Cons({
                    head: "b",
                    tail: StrList.Cons({ head: "c", tail: StrList.Nil })
                })
            });

            const zipped = nums.zip(strs);

            // Verify structure
            assert.strictEqual(zipped.constructor.name, 'Cons');

            // Check first pair
            assert.strictEqual(zipped.head.first, 1);
            assert.strictEqual(zipped.head.second, "a");

            // Check second pair
            assert.strictEqual(zipped.tail.head.first, 2);
            assert.strictEqual(zipped.tail.head.second, "b");

            // Check third pair
            assert.strictEqual(zipped.tail.tail.head.first, 3);
            assert.strictEqual(zipped.tail.tail.head.second, "c");

            // Check end
            assert.strictEqual(zipped.tail.tail.tail.constructor.name, 'Nil');

            console.log('Zip operation works for equal-length lists');
        });

        test('should handle lists of different lengths (shorter first)', () => {
            // Shorter first list
            const nums = NumList.Cons({
                head: 1,
                tail: NumList.Cons({ head: 2, tail: NumList.Nil })
            });
            const strs = StrList.Cons({
                head: "a",
                tail: StrList.Cons({
                    head: "b",
                    tail: StrList.Cons({ head: "c", tail: StrList.Nil })
                })
            });

            const zipped = nums.zip(strs);

            // Should only zip 2 elements
            assert.strictEqual(zipped.head.first, 1);
            assert.strictEqual(zipped.head.second, "a");
            assert.strictEqual(zipped.tail.head.first, 2);
            assert.strictEqual(zipped.tail.head.second, "b");
            assert.strictEqual(zipped.tail.tail.constructor.name, 'Nil');

            console.log('Zip handles shorter first list correctly');
        });

        test('should handle lists of different lengths (shorter second)', () => {
            // Shorter second list
            const nums = NumList.Cons({
                head: 1,
                tail: NumList.Cons({
                    head: 2,
                    tail: NumList.Cons({ head: 3, tail: NumList.Nil })
                })
            });
            const strs = StrList.Cons({ head: "a", tail: StrList.Nil });

            const zipped = nums.zip(strs);

            // Should only zip 1 element
            assert.strictEqual(zipped.head.first, 1);
            assert.strictEqual(zipped.head.second, "a");
            assert.strictEqual(zipped.tail.constructor.name, 'Nil');

            console.log('Zip handles shorter second list correctly');
        });

        test('should handle empty first list', () => {
            const nums = NumList.Nil;
            const strs = StrList.Cons({
                head: "a",
                tail: StrList.Cons({ head: "b", tail: StrList.Nil })
            });

            const zipped = nums.zip(strs);

            assert.strictEqual(zipped.constructor.name, 'Nil');

            console.log('Zip handles empty first list correctly');
        });

        test('should handle empty second list', () => {
            const nums = NumList.Cons({
                head: 1,
                tail: NumList.Cons({ head: 2, tail: NumList.Nil })
            });
            const strs = StrList.Nil;

            const zipped = nums.zip(strs);

            assert.strictEqual(zipped.constructor.name, 'Nil');

            console.log('Zip handles empty second list correctly');
        });

        test('should handle both empty lists', () => {
            const nums = NumList.Nil;
            const strs = StrList.Nil;
            const zipped = nums.zip(strs);
            assert.strictEqual(zipped.constructor.name, 'Nil');

            console.log('Zip handles both empty lists correctly');
        });
    });
});
