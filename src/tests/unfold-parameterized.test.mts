import { data } from '../index.mjs';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';

describe('Unfold on parameterized ADTs', () => {
    const List = data(({ Family, T }) => ({
        Nil: {},
        Cons: { head: T, tail: Family(T) }
    })).ops(({ fold, unfold, map, merge, Family, T }) => ({
        FromArray: unfold({ in: Array, out: Family(T) })({
            Nil: (arr: unknown[]) => arr.length === 0 ? {} : null,
            Cons: (arr: unknown[]) => arr.length > 0
                ? { head: arr[0], tail: arr.slice(1) }
                : null
        }),
        toArray: fold({ out: Array })({
            Nil() { return []; },
            Cons({ head, tail }: { head: unknown; tail: unknown[] }) {
                return [head, ...tail];
            }
        })
    }));

    const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));
    const ColorList = List({ T: Color });

    it('direct construction should be instanceof parameterized ADT', () => {
        const direct = ColorList.Cons({
            head: Color.Red,
            tail: ColorList.Nil
        });

        assert.ok(direct instanceof List, 'direct should be instanceof List');
        assert.ok(direct instanceof ColorList, 'direct should be instanceof ColorList');
    });

    it('unfolded value should be instanceof parameterized ADT', () => {
        const unfolded = ColorList.FromArray([Color.Red, Color.Green]);

        assert.ok(unfolded instanceof List,
            'unfolded should be instanceof List');
        assert.ok(unfolded instanceof ColorList,
            'unfolded should be instanceof ColorList');
    });

    it('unfolded empty list should be instanceof parameterized ADT', () => {
        const empty = ColorList.FromArray([]);

        assert.ok(empty instanceof List,
            'empty should be instanceof List');
        assert.ok(empty instanceof ColorList,
            'empty should be instanceof ColorList');
    });

    it('unfolded value should round-trip through fold', () => {
        const colors = [Color.Red, Color.Green, Color.Blue];
        const unfolded = ColorList.FromArray(colors);
        const arr = unfolded.toArray;

        assert.strictEqual(arr.length, 3);
        assert.ok(arr[0] instanceof Color);
        assert.ok(arr[1] instanceof Color);
        assert.ok(arr[2] instanceof Color);
    });

    it('parameterized ADT should work as a field guard', () => {
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

describe('Generator merge on parameterized ADTs', () => {
    const List = data(({ Family, T }) => ({
        Nil: {},
        Cons: { head: T, tail: Family(T) }
    })).ops(({ fold, unfold, map, merge, Family, T }) => ({
        Range: unfold({ in: Number, out: Family(T) })({
            Nil: (n: number) => (n <= 0 ? {} : null),
            Cons: (n: number) => (n > 0 ? { head: n, tail: n - 1 } : null)
        }),
        sum: fold({ out: Number })({
            Nil() { return 0; },
            Cons({ head, tail }) {
                return (head as number) + (tail as number);
            }
        }),
        square: map({ out: Family })({
            T: (x: number) => x * x
        }),
        Triangular: merge('Range', 'sum'),
        SumOfSquares: merge('Range', 'square', 'sum')
    }));

    const NumList = List({ T: Number });

    it('hylomorphism merge should produce correct result on parameterized ADT', () => {
        // Triangular(5) = 5 + 4 + 3 + 2 + 1 = 15
        assert.strictEqual(NumList.Triangular(5), 15);
    });

    it('unfold+map+fold merge should produce correct result on parameterized ADT', () => {
        // SumOfSquares(4) = 16 + 9 + 4 + 1 = 30
        assert.strictEqual(NumList.SumOfSquares(4), 30);
    });

    it('merge resolves unfold from parameterized ADT, not base', () => {
        // Verify the unfold step in the merge uses the parameterized ADT's
        // rebound unfold (via `this`) rather than the closure-captured base.
        // The standalone unfold should produce parameterized instances.
        const result = NumList.Range(3);
        assert.ok(result instanceof NumList,
            'standalone unfold should produce parameterized instance');

        // The merge pipeline (unfold → fold) should use the same rebound
        // unfold and produce the correct result.
        assert.strictEqual(NumList.Triangular(3), 6);
        assert.strictEqual(NumList.Triangular(0), 0);
    });

    it('merge works with different parameterizations of the same base', () => {
        const NumList2 = List({ T: Number });

        // Different parameterization of the same base should independently
        // produce correct merge results.
        assert.strictEqual(NumList.Triangular(4), 10);
        assert.strictEqual(NumList2.Triangular(4), 10);

        // Standalone unfolds on different parameterizations should each
        // produce instances of their own parameterized ADT.
        const r1 = NumList.Range(2);
        const r2 = NumList2.Range(2);
        assert.ok(r1 instanceof NumList);
        assert.ok(r2 instanceof NumList2);
    });
});
