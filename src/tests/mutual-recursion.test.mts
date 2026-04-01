/**
 * Mutual recursion tests (Issue #189 — Phase 3)
 *
 * Validates that two `data()` declarations can reference each other as field
 * types even when one is declared before the other.  The first declaration
 * triggers a temporal-dead-zone (TDZ) ReferenceError when `data()` tries to
 * evaluate its callback eagerly; lapis detects this and falls back to a lazy
 * proxy that materialises on the first variant property access, by which time
 * all `const` bindings in the calling scope are settled.
 */
import { data, extend } from '../index.mjs';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Mutual recursion between data() declarations', () => {

    // ── Basic mutual reference ────────────────────────────────────────────────

    test('Expr references Stmt declared after it (no TDZ error)', () => {
        // With always-lazy data(), the declFn is deferred and only evaluated when
        // materialization is triggered (by .ops() or first variant access).
        // For TDZ-safe mutual recursion, declare all ADTs first and then attach
        // .ops() after every const binding is initialised.
        const Expr = data(family => ({
            Lit:   { value: Number },
            Block: { stmt: Stmt, body: family }   // ← reads Stmt; evaluated lazily
        }));

        const Stmt = data(family => ({
            Assign: { name: String, value: Number },
            Seq:    { first: family, second: family }
        }));

        // Both declarations done — Stmt is now the lazy proxy (not TDZ).
        // .ops() triggers materialization; Stmt is safe to read here.
        const ExprWithOps = Expr.ops(({ fold }) => ({
            size: fold({ out: Number })({
                Lit()             { return 1; },
                Block({ body }: any) { return 1 + body; }
            })
        }));

        const StmtWithOps = Stmt.ops(({ fold }) => ({
            count: fold({ out: Number })({
                Assign()               { return 1; },
                Seq({ first, second }: any) { return first + second; }
            })
        }));

        // Construction works — both ADTs are now materialised
        const lit    = ExprWithOps.Lit({ value: 42 });
        const assign = StmtWithOps.Assign({ name: 'x', value: 1 });
        const block  = ExprWithOps.Block({ stmt: assign, body: ExprWithOps.Lit({ value: 1 }) });

        assert.strictEqual(lit.size,   1);
        assert.strictEqual(block.size, 2);
        assert.strictEqual(assign.count, 1);
    });

    test('instanceof works after lazy materialisation', () => {
        const A = data(family => ({
            Leaf: { value: Number },
            Node: { left: family, right: family }
        }));

        const leaf = A.Leaf({ value: 7 });
        assert.strictEqual(leaf instanceof A, true);
        assert.strictEqual(leaf instanceof A.Leaf, true);
    });

    test('second ADT can reference first (lazy proxy) without TDZ', () => {
        // First is lazy (reads Second which is TDZ at declaration time).
        // Second reads First — First is the lazy proxy at that point, not TDZ.
        const First = data(family => ({
            Leaf: { value: Number },
            Pair: { left: family, right: Second }  // reads Second (TDZ)
        }));

        const Second = data(family => ({
            Leaf: { tag: String },
            Wrap: { inner: First, next: family }   // reads First (lazy proxy — ok)
        }));

        // Build a simple tree that doesn't require full mutual nesting
        const firstLeaf  = First.Leaf({ value: 42 });
        const secondLeaf = Second.Leaf({ tag: 'hello' });
        const wrapped    = Second.Wrap({ inner: firstLeaf, next: secondLeaf });

        assert.strictEqual(firstLeaf  instanceof First,  true);
        assert.strictEqual(secondLeaf instanceof Second, true);
        assert.strictEqual(wrapped    instanceof Second, true);
        assert.strictEqual((wrapped as any).inner instanceof First, true);
    });

    // ── Cross-sort mutual reference (sorts-as-types complete spike) ───────────

    test('complete mutual-recursion sorts spike: Expr ↔ Stmt', () => {
        // Expr references Stmt (declared after); Stmt references Expr (now a
        // lazy proxy — no TDZ).  Declare both first, then attach ops.
        const Expr = data(family => ({
            Lit:    { value: Number },
            Add:    { left: family, right: family },
            IfExpr: { cond: family, then: Stmt, else: Stmt }  // evaluated lazily
        }));

        const Stmt = data(family => ({
            Assign: { name: String, value: Number },
            Seq:    { first: family, second: family }
        }));

        // After all declarations, attach ops (triggers materialization).
        const ExprWithOps = Expr.ops(({ fold }) => ({
            eval: fold({ out: Number })({
                Lit({ value })              { return value as number; },
                Add({ left, right }: any)   { return left + right; },
                IfExpr({ cond, then, else: el }: any) {
                    return cond !== 0 ? then : el;
                }
            })
        }));

        const StmtWithOps = Stmt.ops(({ fold }) => ({
            prettyPrint: fold({ out: String })({
                Assign({ name, value }) { return `${name as string} = ${value}`; },
                Seq({ first, second }: any)  { return `${first}; ${second}`; }
            })
        }));

        // Stmt construction
        const s1 = StmtWithOps.Assign({ name: 'x', value: 1 });
        const s2 = StmtWithOps.Assign({ name: 'y', value: 2 });
        const seq = StmtWithOps.Seq({ first: s1, second: s2 });
        assert.strictEqual(seq.prettyPrint, 'x = 1; y = 2');

        // Expr construction referencing Stmt instances
        const cond = ExprWithOps.Lit({ value: 1 });
        const ifExpr = ExprWithOps.IfExpr({ cond, then: s1, else: s2 });
        assert.strictEqual(ifExpr instanceof Expr, true);

        // Fold across Expr
        const sum = ExprWithOps.Add({ left: ExprWithOps.Lit({ value: 3 }), right: ExprWithOps.Lit({ value: 4 }) });
        assert.strictEqual(sum.eval, 7);
    });

    // ── Lazy materialisation does NOT affect extend chains ───────────────────

    test('lazy ADT can still be extended after materialisation', () => {
        const Base = data(family => ({
            Item: { value: Number }
        }));

        const Child = data(family => ({
            [extend]: Base,
            Extra:    { label: String }
        }));

        const item  = Child.Item({ value: 42 });
        const extra = Child.Extra({ label: 'hello' });

        assert.strictEqual(item  instanceof Child, true);
        assert.strictEqual(item  instanceof Base,  true);
        assert.strictEqual(extra instanceof Child, true);
        assert.strictEqual(extra instanceof Base,  true);
    });

    // ── Validation errors still surface immediately (not hidden by lazy path) ─

    test('declaration errors (non-TDZ) surface when first triggered', () => {
        // With always-lazy data(), validation errors from the declaration
        // surface when materialization is first triggered (via .ops() or
        // first variant access).  They do NOT surface at data() call time.
        assert.throws(
            () => data(() => ({ lowercase: {} })).ops(() => ({})),
            /Variant 'lowercase' must be PascalCase/
        );
    });
});
