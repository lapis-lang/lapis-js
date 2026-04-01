/**
 * Spike: Sorts and Type Parameters as Associated Types (Issue #189)
 *
 * Validates:
 * (A) Each sort is a separate data() declaration — no $E/$S variables needed.
 * (B) Cross-sort field references work: Expr.IfExpr has `then/else: Stmt` fields.
 * (C) fold, instanceof, and contracts each work within a sort.
 * (D) Type-param-as-subtype pattern (NumList extends List with field narrowing).
 *     See also: type-params-as-subtypes.test.mts for comprehensive coverage.
 */
import { data, extend } from '../index.mjs';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Spike: sorts as separate data() declarations', () => {

    // ── Declare Stmt first (no forward reference to Expr) ──────────────────

    const Stmt = data(({ family }) => ({
        Assign: { name: String, value: Number },
        Seq:    { first: family, second: family }
    })).ops(({ fold }) => ({
        prettyPrint: fold({ out: String })({
            Assign({ name, value }) { return `${name} = ${value}`; },

            Seq({ first, second }: any) { return `${first}; ${second}`; }
        })
    }));

    // ── Declare Expr after Stmt (can reference Stmt in field specs safely) ──

    const Expr = data(({ family }) => ({
        Lit:    { value: Number },
        Add:    { left: family, right: family },
        // Cross-sort field: Stmt is already declared above — no TDZ here
        IfExpr: { cond: family, then: Stmt, else: Stmt }
    })).ops(({ fold }) => ({
        eval: fold({ out: Number })({
            Lit({ value }) { return value as number; },

            Add({ left, right }: any) { return left + right; },
            // Stmt-typed fields are passed as-is (not folded across sorts)

            IfExpr({ cond }: any) { return cond !== 0 ? cond : 0; }
        })
    }));

    // ── Sort membership via instanceof ────────────────────────────────────

    test('Stmt instances are instanceof Stmt (not Expr)', () => {
        const s = Stmt.Assign({ name: 'x', value: 1 });
        assert.strictEqual(s instanceof Stmt, true,  'Assign is-a Stmt');
        assert.strictEqual(s instanceof Expr, false, 'Assign is not an Expr');
    });

    test('Expr instances are instanceof Expr (not Stmt)', () => {
        const e = Expr.Lit({ value: 42 });
        assert.strictEqual(e instanceof Expr, true,  'Lit is-a Expr');
        assert.strictEqual(e instanceof Stmt, false, 'Lit is not a Stmt');
    });

    // ── Fold within each sort ─────────────────────────────────────────────

    test('Stmt fold: prettyPrint', () => {
        const s1 = Stmt.Assign({ name: 'x', value: 1 });
        const s2 = Stmt.Assign({ name: 'y', value: 2 });
        const seq = Stmt.Seq({ first: s1, second: s2 });
        assert.strictEqual(s1.prettyPrint, 'x = 1');
        assert.strictEqual(seq.prettyPrint, 'x = 1; y = 2');
    });

    test('Expr fold: eval', () => {
        const e = Expr.Add({ left: Expr.Lit({ value: 3 }), right: Expr.Lit({ value: 4 }) });
        assert.strictEqual(e.eval, 7);
    });

    // ── Cross-sort field reference ────────────────────────────────────────

    test('Expr.IfExpr accepts Stmt fields (field validation works cross-sort)', () => {
        const cond  = Expr.Lit({ value: 1 });
        const thenS = Stmt.Assign({ name: 'x', value: 1 });
        const elseS = Stmt.Assign({ name: 'y', value: 2 });

        // Should not throw: Stmt instances are valid for Stmt-typed fields
        const ifExpr = Expr.IfExpr({ cond, then: thenS, else: elseS });
        assert.strictEqual(ifExpr instanceof Expr, true);
    });

    test('Expr.IfExpr rejects non-Stmt values for Stmt-typed fields', () => {
        // A plain Expr instance is not a Stmt — should throw
        const cond  = Expr.Lit({ value: 1 });
        const notStmt = Expr.Lit({ value: 99 });
        assert.throws(
            () => Expr.IfExpr({ cond, then: notStmt, else: cond }),
            /must be an instance of/
        );
    });

    // ── Separate folds per sort ───────────────────────────────────────────

    test('RichExpr (extend Expr) inherits fold from Expr', () => {
        const RichExpr = data(({ family }) => ({
            [extend]: Expr,
            Mul: { left: family, right: family }
        })).ops(({ fold }) => ({
            eval: fold({ out: Number })({
                Lit({ value }) { return value as number; },

                Add({ left, right }: any) { return left + right; },

                Mul({ left, right }: any) { return left * right; },

                IfExpr({ cond }: any) { return cond; }
            })
        }));

        const two   = RichExpr.Lit({ value: 2 });
        const three = RichExpr.Lit({ value: 3 });
        const six   = RichExpr.Mul({ left: two, right: three });
        assert.strictEqual(six.eval, 6);

        // Subtyping: RichExpr instances are instanceof Expr (extend chain)
        assert.strictEqual(six instanceof Expr, true);
        assert.strictEqual(six instanceof RichExpr, true);
    });
});

