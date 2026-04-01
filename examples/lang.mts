#!/usr/bin/env node

/**
 * Multi-Sorted Algebra — Expression Language (Expr + Stmt)
 *
 * Demonstrates Issue #189: each sort (Expr, Stmt) is its own `data()`
 * declaration. Cross-sort references are plain field types. Mutual recursion
 * (Expr ↔ Stmt via IfExpr/While) works because data() defers callback
 * invocation until the first variant is accessed.
 *
 * Before — sort variables threaded through one declaration:
 *   const Lang = data(spec => ({
 *       Lit:    { [sort]: $E, value: Number },
 *       Assign: { [sort]: $S, name: String, expr: $E },
 *       ...
 *   }));
 *
 * After — each sort is its own data() declaration:
 *   const Expr = data(family => ({ Lit: { value: Number }, ... }));
 *   const Stmt = data(family => ({ Assign: { name: String, expr: Expr }, ... }));
 *
 * Sort membership is `instanceof` — no special sort predicate needed.
 */
import { data, extend } from '@lapis-lang/lapis-js';

// ─────────────────────────────────────────────────────────────────────────────
// Declare both ADTs before attaching .ops().
//
// data() uses a lazy proxy: the declaration callback is deferred until the
// first variant access, so Expr can capture Stmt (and vice versa) even though
// the const bindings are evaluated top-to-bottom.
// ─────────────────────────────────────────────────────────────────────────────

const Expr = data(family => ({
    Lit:    { value: Number },
    Add:    { left: family, right: family },
    Mul:    { left: family, right: family },
    IfExpr: { cond: family, then: family, else: family }
}));

const Stmt = data(family => ({
    Assign: { name: String, expr: Expr },               // cross-sort ref to Expr
    Seq:    { first: family, second: family },
    While:  { cond: Expr, body: family }                // cross-sort ref to Expr
}));

// ─────────────────────────────────────────────────────────────────────────────
// Attach operations after all const bindings are settled.
// ─────────────────────────────────────────────────────────────────────────────

const ExprLang = Expr.ops(({ fold }) => ({
    eval: fold({ out: Number })({
        Lit({ value })            { return value as number; },
        Add({ left, right }: any) { return left + right; },
        Mul({ left, right }: any) { return left * right; },
        // Non-zero cond is truthy; branches are Expr, so eval stays numeric.
        IfExpr({ cond, then: t, else: e }: any) { return (cond !== 0 ? t : e) as number; }
    })
}));

const StmtLang = Stmt.ops(({ fold }) => ({
    // Collect assigned variable names in execution order
    varNames: fold({ out: Array })({
        Assign({ name }: any)           { return [name]; },
        Seq({ first, second }: any)     { return [...(first as string[]), ...(second as string[])]; },
        While({ body }: any)            { return body as string[]; }
    })
}));

// ─────────────────────────────────────────────────────────────────────────────
// Usage
// ─────────────────────────────────────────────────────────────────────────────

console.log('=== Multi-Sorted Expression Language (Expr + Stmt) ===\n');

// Expr sort ───────────────────────────────────────────────────────────────────
console.log('--- Expr sort ---');

const lit3  = ExprLang.Lit({ value: 3 });
const lit4  = ExprLang.Lit({ value: 4 });
const sum   = ExprLang.Add({ left: lit3,  right: lit4  });
const prod  = ExprLang.Mul({ left: lit3,  right: lit4  });
const lit0  = ExprLang.Lit({ value: 0 });

console.log(`Lit(3).eval   = ${lit3.eval}`);   // 3
console.log(`Add(3,4).eval = ${sum.eval}`);     // 7
console.log(`Mul(3,4).eval = ${prod.eval}`);    // 12

// Sort membership via instanceof
console.log(`\nlit3  instanceof Expr: ${lit3  instanceof ExprLang}`);   // true
console.log(`lit3  instanceof Stmt: ${lit3  instanceof StmtLang}`);    // false

// Stmt sort ───────────────────────────────────────────────────────────────────
console.log('\n--- Stmt sort ---');

const assign1 = StmtLang.Assign({ name: 'x', expr: lit3 as any });
const assign2 = StmtLang.Assign({ name: 'y', expr: sum as any  });
const seq     = StmtLang.Seq({ first: assign1, second: assign2 });

console.log(`Assign("x",3).varNames = ${JSON.stringify(assign1.varNames)}`);  // ["x"]
console.log(`Assign("y",7).varNames = ${JSON.stringify(assign2.varNames)}`);  // ["y"]
console.log(`Seq(x,y).varNames      = ${JSON.stringify(seq.varNames)}`);      // ["x","y"]

console.log(`\nassign1 instanceof Stmt: ${assign1 instanceof StmtLang}`);  // true
console.log(`assign1 instanceof Expr: ${assign1 instanceof ExprLang}`);   // false

// Expr conditional evaluation (numeric) ───────────────────────────────────────
console.log('\n--- Expr conditional evaluation ---');

const thenExpr = prod;   // 12
const elseExpr = lit3;   // 3
const ifExpr   = ExprLang.IfExpr({ cond: sum as any, then: thenExpr as any, else: elseExpr as any });

console.log(`IfExpr cond=7 (truthy), thenExpr.eval = ${thenExpr.eval}`);
// When cond ≠ 0 the then-branch is taken; eval returns thenExpr.eval.
console.log(`IfExpr(7, thenExpr, elseExpr).eval = ${ifExpr.eval}`);              // 12

// ─────────────────────────────────────────────────────────────────────────────
// Extension: adding new variants to each sort (the Expression Problem)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Extension: add Sub to Expr, Print to Stmt ---');

const RichExpr = data(family => ({
    [extend]: Expr,
    Sub: { left: family, right: family }
})).ops(({ fold }) => ({
    eval: fold({ out: Number })({
        Sub({ left, right }: any) { return left - right; }
    })
}));

const RichStmt = data(family => ({
    [extend]: Stmt,
    Print: { expr: RichExpr }
})).ops(({ fold }) => ({
    varNames: fold({ out: Array })({
        Print() { return [] as string[]; }
    })
}));

const richSub  = RichExpr.Sub({ left: ExprLang.Lit({ value: 10 }), right: ExprLang.Lit({ value: 4 }) });
const richPrint = RichStmt.Print({ expr: richSub as any });

console.log(`Sub(10, 4).eval  = ${richSub.eval}`);       // 6

// Comb inheritance: extended variant is instanceof both child and parent ADT
console.log(`richSub instanceof RichExpr: ${richSub instanceof RichExpr}`);  // true
console.log(`richSub instanceof Expr:     ${richSub instanceof ExprLang}`);  // true  (comb inheritance)

console.log(`richPrint instanceof RichStmt: ${richPrint instanceof RichStmt}`);  // true
console.log(`richPrint instanceof Stmt:     ${richPrint instanceof StmtLang}`);  // true
