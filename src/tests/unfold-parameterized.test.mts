import { data, fold, unfold } from '../index.mjs';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';

describe('Unfold on parameterized ADTs', () => {
    const List = data(({ Family, T }) => ({
        Nil: {},
        Cons: { head: T, tail: Family(T) },

        FromArray: unfold({ in: Object, out: Family(T) })({
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
