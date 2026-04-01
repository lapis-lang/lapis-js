import { data, extend } from '../index.mjs';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';

describe('Unfold on element-typed ADTs (subtype approach)', () => {
    const List = data(family => ({
        Nil: {},
        Cons: { head: Object, tail: family }
    })).ops(({ fold, unfold, family }) => ({
        FromArray: unfold({ in: Array, out: family })({
            Nil: (arr: unknown[]) => arr.length === 0 ? {} : null,
            Cons: (arr: unknown[]) => arr.length > 0
                ? { head: arr[0], tail: arr.slice(1) }
                : null
        }),
        toArray: fold({ out: Array })({
            Nil() { return []; },

            Cons({ head, tail }: any) {
                return [head, ...tail];
            }
        })
    }));

    const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));
    // ColorList: a List whose head must be a Color instance
    const ColorList = data(family => ({ [extend]: List, Cons: { head: Color, tail: family } }));

    it('directly constructed instance is instanceof base and subtype', () => {
        const direct = ColorList.Cons({
            head: Color.Red,
            tail: ColorList.Nil
        });

        assert.ok(direct instanceof List, 'direct should be instanceof List');
        assert.ok(direct instanceof ColorList, 'direct should be instanceof ColorList');
    });

    it('element-typed ADT works as a field guard', () => {
        const Container = data(() => ({
            Box: { items: ColorList }
        }));

        const list = ColorList.FromArray([Color.Red]);

        // Should not throw — the unfolded value should satisfy the guard
        const box = Container.Box({ items: list });
        assert.ok(box instanceof Container);
        assert.ok(box.items instanceof ColorList);
    });
});

describe('Generator merge on element-typed ADTs (subtype approach)', () => {
    const List = data(family => ({
        Nil: {},
        Cons: { head: Object, tail: family }
    })).ops(({ fold, unfold, map, merge, family }) => ({
        Range: unfold({ in: Number, out: family })({
            Nil: (n: number) => (n <= 0 ? {} : null),
            Cons: (n: number) => (n > 0 ? { head: n, tail: n - 1 } : null)
        }),
        sum: fold({ out: Number })({
            Nil() { return 0; },

            Cons({ head, tail }: any) {
                return (head as number) + (tail as number);
            }
        }),
        square: map({ out: family })({

            head: (x: any) => x * x
        }),
        Triangular: merge('Range', 'sum'),
        SumOfSquares: merge('Range', 'square', 'sum')
    }));

    // NumList: head narrowed to Number
    const NumList = data(family => ({ [extend]: List, Cons: { head: Number, tail: family } }));

    it('hylomorphism merge should produce correct result on narrowed subtype', () => {
        // Triangular(5) = 5 + 4 + 3 + 2 + 1 = 15
        assert.strictEqual(NumList.Triangular(5), 15);
    });

    it('unfold+map+fold merge should produce correct result on narrowed subtype', () => {
        // SumOfSquares(4) = 16 + 9 + 4 + 1 = 30
        assert.strictEqual(NumList.SumOfSquares(4), 30);
    });

    it('merge resolves unfold from subtype, not base', () => {
        // The standalone unfold should produce subtype instances
        const result = NumList.Range(3);
        assert.ok(result instanceof NumList,
            'standalone unfold should produce NumList instance');

        assert.strictEqual(NumList.Triangular(3), 6);
        assert.strictEqual(NumList.Triangular(0), 0);
    });

    it('two independent list subtypes have separate identity', () => {
        // A second List subtype with Number-typed heads — separate declaration
        const NumList2 = data(family => ({ [extend]: List, Cons: { head: Number, tail: family } }));

        assert.strictEqual(NumList.Triangular(4), 10);
        assert.strictEqual(NumList2.Triangular(4), 10);

        const r1 = NumList.Range(2);
        const r2 = NumList2.Range(2);
        assert.ok(r1 instanceof NumList);
        assert.ok(r2 instanceof NumList2);
        // Different declarations → separate identity
        assert.ok(!(r1 instanceof NumList2));
        assert.ok(!(r2 instanceof NumList));
    });
});
