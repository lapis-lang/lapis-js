/**
 * Direct-parameter syntax tests (Issue #189 — Phase 4)
 *
 * Validates that the `data(family => ...)` form (using the parameter directly
 * as a field-type sentinel) produces identical runtime behaviour to the
 * existing `data(({ family }) => ...)` destructuring form.
 *
 * Both forms are fully supported simultaneously; Phase 4 does not break any
 * existing code.
 */
import { data, extend } from '../index.mjs';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Phase 4 — data(family => ...) direct-parameter syntax', () => {

    // ── Direct use as recursive field spec ────────────────────────────────────

    test('family used directly as field type: List', () => {
        // New syntax: parameter IS the family sentinel
        const List = data(family => ({
            Nil:  {},
            Cons: { head: Object, tail: family }   // ← direct use
        })).ops(({ fold }) => ({
            toArray: fold({ out: Array })({
                Nil()                    { return []; },
                Cons({ head, tail }: any) { return [head, ...tail]; }
            })
        }));

        const xs = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) });
        assert.deepStrictEqual(xs.toArray, [1, 2]);
        assert.strictEqual(xs instanceof List, true);
    });

    test('family used directly: binary tree', () => {
        const Tree = data(family => ({
            Leaf: { value: Number },
            Node: { left: family, right: family }
        })).ops(({ fold }) => ({
            sum: fold({ out: Number })({
                Leaf({ value }) { return value as number; },
                Node({ left, right }: any) { return left + right; }
            })
        }));

        const t = Tree.Node({
            left:  Tree.Leaf({ value: 3 }),
            right: Tree.Leaf({ value: 4 })
        });
        assert.strictEqual(t.sum, 7);
    });

    // ── Backward-compat destructuring still works ─────────────────────────────

    test('({ family }) destructuring still works unchanged', () => {
        const List = data(({ family }) => ({
            Nil:  {},
            Cons: { head: Number, tail: family }
        })).ops(({ fold }) => ({
            sum: fold({ out: Number })({
                Nil()                    { return 0; },
                Cons({ head, tail }: any) { return (head as number) + tail; }
            })
        }));

        const xs = List.Cons({ head: 10, tail: List.Cons({ head: 20, tail: List.Nil }) });
        assert.strictEqual(xs.sum, 30);
    });

    // ── Plain Object fields work for generic containers ──────────────────────

    test('Object-typed fields accept any value', () => {
        const Pair = data(_ => ({
            MakePair: { first: Object, second: Object }
        }));

        const p = Pair.MakePair({ first: 1, second: 2 });
        assert.strictEqual((p as any).first, 1);
    });

    // ── extend works with both syntaxes ──────────────────────────────────────

    test('extend + direct syntax: child can narrow inherited variant', () => {
        const List = data(family => ({
            Nil:  {},
            Cons: { head: Object, tail: family }
        }));

        const NumList = data(family => ({
            [extend]: List,
            Cons: { head: Number, tail: family }
        })).ops(({ fold }) => ({
            sum: fold({ out: Number })({
                Nil()                    { return 0; },
                Cons({ head, tail }: any) { return (head as number) + tail; }
            })
        }));

        const xs = NumList.Cons({ head: 5, tail: NumList.Cons({ head: 6, tail: NumList.Nil }) });
        assert.strictEqual(xs.sum, 11);
        assert.strictEqual(xs instanceof List, true);
        assert.strictEqual(xs instanceof NumList.Cons, true);
        assert.strictEqual(xs instanceof List.Cons, true, 'comb parent instanceof');
    });

});
