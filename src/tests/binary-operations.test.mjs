import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

// Define ADTs once and share across all tests
const Pair = data(({ T, U }) => ({
    MakePair: { first: T, second: U }
}));

const List = data(({ Family, T }) => ({
    Nil: {},
    Cons: { head: T, tail: Family(T) }
}))
    .fold('zip', {}, ({ Nil, Cons }) => ({
        Nil() { return Nil; },
        Cons({ head, tail }, ys) {
            if (!ys || ys.constructor.name === 'Nil')
                return Nil;

            const PairType = Pair(typeof head, typeof ys.head);

            return Cons({
                head: PairType.MakePair({ first: head, second: ys.head }),
                tail: tail(ys.tail)  // tail is a partially applied function
            });
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

    describe('Object Literal Guard Validation', () => {
        test('should validate object literal guard structure', () => {
            NumList.unfold('BinaryOp', (ResultList) => ({
                in: { a: NumList, b: StrList },
                out: ResultList
            }), {
                Nil: ({ a, b }) => (a.constructor.name === 'Nil' || b.constructor.name === 'Nil') ? {} : null,
                Cons: ({ a, b }) => {
                    if (a.constructor.name === 'Cons' && b.constructor.name === 'Cons') {
                        return {
                            head: a.head + b.head.length,
                            tail: { a: a.tail, b: b.tail }
                        };
                    }
                    return null;
                }
            });

            const nums = NumList.Cons({ head: 10, tail: NumList.Cons({ head: 20, tail: NumList.Nil }) });
            const strs = StrList.Cons({ head: "hi", tail: StrList.Cons({ head: "bye", tail: StrList.Nil }) });

            const result = NumList.BinaryOp({ a: nums, b: strs });

            assert.strictEqual(result.head, 12); // 10 + "hi".length
            assert.strictEqual(result.tail.head, 23); // 20 + "bye".length

            console.log('Object literal guards validate correctly');
        });

        test('should prevent Function guards in specs', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }));

            // Should throw when trying to use Function guard
            assert.throws(() => {
                List.unfold('BadOp', (List) => ({
                    in: Function,  // Not allowed
                    out: List
                }), {
                    Nil: (fn) => { },
                    Cons: (fn) => null
                });
            }, {
                name: 'TypeError',
                message: /cannot use Function as 'in' guard/
            });

            console.log('Function guards in specs are prevented');
        });

        test('should prevent Function in nested object literal guards', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }));

            // Should throw when trying to use Function in nested guard
            assert.throws(() => {
                List.unfold('BadOp', (List) => ({
                    in: { a: Number, fn: Function },  // Function not allowed
                    out: List
                }), {
                    Nil: ({ a, fn }) => { },
                    Cons: ({ a, fn }) => null
                });
            }, {
                name: 'TypeError',
                message: /cannot use Function as guard for field 'fn'/
            });

            console.log('Nested Function guards are prevented');
        });
    });
});
