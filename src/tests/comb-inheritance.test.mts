/**
 * Comb Inheritance tests (Issue #189)
 *
 * Verifies that instances of inherited variants satisfy instanceof for
 * both the child ADT's variant constructor AND the parent ADT's variant
 * constructor, via the parent chain introduced in createChildVariant.
 *
 * Prior to this change:
 *   - `lit instanceof RichExpr.Lit`  worked (prototype chain — child inherits ADT proto)
 *   - `lit instanceof Expr.Lit`      FAILED (different prototype branch)
 *
 * After comb inheritance (variantProtoParentMap + Symbol.hasInstance):
 *   - `lit instanceof RichExpr.Lit`  ✅ still works
 *   - `lit instanceof Expr.Lit`      ✅ now works (parent chain walk)
 *
 * Reference: https://thenewobjective.com/types-and-programming-languages/comb-inheritance/
 */
import { data, extend } from '../index.mjs';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Comb Inheritance — variant instanceof across extend', () => {

    // ── Shared ADT hierarchy ──────────────────────────────────────────────

    const Expr = data(({ family }) => ({
        Lit: { value: Number },
        Add: { left: family, right: family }
    }));

    const RichExpr = data(({ family }) => ({
        [extend]: Expr,
        Mul: { left: family, right: family }
    }));

    test('direct instance: instanceof ADT and own variant ctor', () => {
        const lit = Expr.Lit({ value: 5 });
        assert.strictEqual(lit instanceof Expr, true,      'lit instanceof Expr (ADT)');
        assert.strictEqual(lit instanceof Expr.Lit, true,  'lit instanceof Expr.Lit (direct variant)');
        assert.strictEqual(lit instanceof Expr.Add, false, 'lit NOT instanceof Expr.Add');
    });

    test('inherited variant: all four instanceof cases', () => {
        const lit = RichExpr.Lit({ value: 5 });

        // Prototype chain — unchanged
        assert.strictEqual(lit instanceof Expr,    true,  'lit instanceof Expr (extend chain)');
        assert.strictEqual(lit instanceof RichExpr, true, 'lit instanceof RichExpr (prototype chain)');

        // Direct variant ctor — requires stable variant caching in proxy
        assert.strictEqual(lit instanceof RichExpr.Lit, true, 'lit instanceof RichExpr.Lit (direct)');

        // Comb parent chain — NEW: requires Symbol.hasInstance + variantProtoParentMap
        assert.strictEqual(lit instanceof Expr.Lit, true, 'lit instanceof Expr.Lit (comb parent chain)');
    });

    test('inherited variant: negative cases', () => {
        const lit = RichExpr.Lit({ value: 5 });
        assert.strictEqual(lit instanceof Expr.Add,    false, 'lit NOT instanceof Expr.Add');
        assert.strictEqual(lit instanceof RichExpr.Mul, false, 'lit NOT instanceof RichExpr.Mul');
    });

    test('own new variant: not instanceof parent version (no such variant in parent)', () => {
        const mul = RichExpr.Mul({ left: RichExpr.Lit({ value: 2 }), right: RichExpr.Lit({ value: 3 }) });
        assert.strictEqual(mul instanceof RichExpr,     true,  'mul instanceof RichExpr');
        assert.strictEqual(mul instanceof Expr,         true,  'mul instanceof Expr (extend chain)');
        assert.strictEqual(mul instanceof RichExpr.Mul, true,  'mul instanceof RichExpr.Mul (direct)');
        // Expr.Mul does not exist — this would be a runtime error, so no assertion needed
    });

    test('RichExpr.Lit accesses return identical constructor (stable caching)', () => {
        // Both access expressions must return the same constructor object
        const litCtor1 = RichExpr.Lit;
        const litCtor2 = RichExpr.Lit;
        assert.strictEqual(litCtor1, litCtor2,
            'RichExpr.Lit accessed twice returns the same cached constructor');
    });

    test('three-level extend: grandchild instanceof grandparent variant', () => {
        const Expr2 = data(({ family }) => ({
            Lit: { value: Number }
        }));

        const Expr3 = data(({ family }) => ({
            [extend]: Expr2,
            Add: { left: family, right: family }
        }));

        const Expr4 = data(({ family }) => ({
            [extend]: Expr3,
            Mul: { left: family, right: family }
        }));

        const lit = Expr4.Lit({ value: 7 });

        assert.strictEqual(lit instanceof Expr4,     true,  'lit instanceof Expr4 (own ADT)');
        assert.strictEqual(lit instanceof Expr3,     true,  'lit instanceof Expr3 (parent ADT)');
        assert.strictEqual(lit instanceof Expr2,     true,  'lit instanceof Expr2 (grandparent ADT)');
        assert.strictEqual(lit instanceof Expr4.Lit, true,  'lit instanceof Expr4.Lit (direct)');
        assert.strictEqual(lit instanceof Expr3.Lit, true,  'lit instanceof Expr3.Lit (comb parent)');
        assert.strictEqual(lit instanceof Expr2.Lit, true,  'lit instanceof Expr2.Lit (comb grandparent)');
    });

    test('base variant instances are not affected by comb chain (no false positives)', () => {
        const lit = Expr.Lit({ value: 5 });
        const add = Expr.Add({ left: lit, right: lit });

        // Base variants have no parent chain entry — Symbol.hasInstance degrades to standard check
        assert.strictEqual(add instanceof Expr.Add, true,  'add instanceof Expr.Add (direct)');
        assert.strictEqual(add instanceof Expr.Lit, false, 'add NOT instanceof Expr.Lit (no comb link)');
        assert.strictEqual(lit instanceof Expr.Add, false, 'lit NOT instanceof Expr.Add');
    });

    test('fold across extend works on inherited variants (regression)', () => {
        const EvalExpr = data(({ family }) => ({
            Lit: { value: Number },
            Add: { left: family, right: family }
        })).ops(({ fold }) => ({
            eval: fold({ out: Number })({
                Lit({ value }) { return value as number; },

                Add({ left, right }: any) { return left + right; }
            })
        }));

        const ExtExpr = data(({ family }) => ({
            [extend]: EvalExpr,
            Mul: { left: family, right: family }
        })).ops(({ fold }) => ({
            eval: fold({ out: Number })({
                Lit({ value }) { return value as number; },

                Add({ left, right }: any) { return left + right; },

                Mul({ left, right }: any) { return left * right; }
            })
        }));

        const two   = ExtExpr.Lit({ value: 2 });
        const three = ExtExpr.Lit({ value: 3 });
        const six   = ExtExpr.Mul({ left: two, right: three });

        assert.strictEqual(six.eval, 6);
        assert.strictEqual(six instanceof EvalExpr, true);
        assert.strictEqual(six instanceof ExtExpr, true);
        assert.strictEqual(two instanceof ExtExpr.Lit, true);
        assert.strictEqual(two instanceof EvalExpr.Lit, true, 'two instanceof EvalExpr.Lit (comb parent)');
    });
});
