import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, fold } from '../index.mjs';

// Define ADTs once and share across all tests
const Pair = data(({ T, U }) => ({
    MakePair: { first: T, second: U }
}));

const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) },
    // zip changes the element type (T → Pair), so it returns an array
    // rather than a Family(T) list (which would enforce head: T).
    zip: fold({})({
        Nil() { return []; },
        // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
        Cons({ head, tail }: { head: unknown; tail: (ys: unknown) => unknown[] }, ys: any) {
            if (!ys || ys.constructor.name === 'Nil')
                return [];

            const PairType = Pair(typeof head === 'number' ? Number
                : typeof head === 'string' ? String : Object,
            typeof ys.head === 'number' ? Number
                : typeof ys.head === 'string' ? String : Object);

            return [
                PairType.MakePair({ first: head, second: ys.head }),
                ...tail(ys.tail)
            ];
        }
    })
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

            // Verify structure — result is an array of pairs
            assert.strictEqual(zipped.length, 3);

            // Check first pair
            assert.strictEqual(zipped[0].first, 1);
            assert.strictEqual(zipped[0].second, "a");

            // Check second pair
            assert.strictEqual(zipped[1].first, 2);
            assert.strictEqual(zipped[1].second, "b");

            // Check third pair
            assert.strictEqual(zipped[2].first, 3);
            assert.strictEqual(zipped[2].second, "c");

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
            assert.strictEqual(zipped.length, 2);
            assert.strictEqual(zipped[0].first, 1);
            assert.strictEqual(zipped[0].second, "a");
            assert.strictEqual(zipped[1].first, 2);
            assert.strictEqual(zipped[1].second, "b");

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
            assert.strictEqual(zipped.length, 1);
            assert.strictEqual(zipped[0].first, 1);
            assert.strictEqual(zipped[0].second, "a");

            console.log('Zip handles shorter second list correctly');
        });

        test('should handle empty first list', () => {
            const nums = NumList.Nil;
            const strs = StrList.Cons({
                head: "a",
                tail: StrList.Cons({ head: "b", tail: StrList.Nil })
            });

            const zipped = nums.zip(strs);

            assert.strictEqual(zipped.length, 0);

            console.log('Zip handles empty first list correctly');
        });

        test('should handle empty second list', () => {
            const nums = NumList.Cons({
                head: 1,
                tail: NumList.Cons({ head: 2, tail: NumList.Nil })
            });
            const strs = StrList.Nil;

            const zipped = nums.zip(strs);

            assert.strictEqual(zipped.length, 0);

            console.log('Zip handles empty second list correctly');
        });

        test('should handle both empty lists', () => {
            const nums = NumList.Nil;
            const strs = StrList.Nil;
            const zipped = nums.zip(strs);
            assert.strictEqual(zipped.length, 0);

            console.log('Zip handles both empty lists correctly');
        });
    });
});
