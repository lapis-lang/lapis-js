import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, extend, sort, isSort } from '../index.mjs';
import type { DataDeclParams } from '../index.mjs';

/**
 * Multi-sorted algebra tests.
 *
 * Inspired by Bruno Oliveira's Object Algebras (ECOOP 2012):
 *   An expression language with two sorts — Exp ($E) and Stmt ($S) —
 *   where variants carry fields typed by sorts rather than the single
 *   self-referential Family type.
 */
describe('Multi-Sorted Algebras', () => {

    // ── Declaration ────────────────────────────────────────────────────────

    describe('Declaration', () => {

        test('single-sorted ADT: [sort] optional, inferred for all variants', () => {
            const Expr = data(({ $E }) => ({
                Lit: { value: Number },
                Add: { left: $E, right: $E }
            })).ops(({ fold, unfold, map, merge, $E }) => ({
                eval: fold({ out: Number })({
                    Lit({ value }) { return value; },
                    Add({ left, right }) { return left + right; }
                })
            }));

            const e = Expr.Add(Expr.Lit(1), Expr.Lit(2));
            assert.strictEqual(e.eval, 3);
        });

        test('single-sorted ADT: unannotated variants default to sole sort when some are annotated', () => {
            const Expr = data(({ $E }) => ({
                Lit: { [sort]: $E, value: Number },
                Neg: { inner: $E },
                Add: { left: $E, right: $E }
            })).ops(({ fold, unfold, map, merge, $E }) => ({
                eval: fold({ out: Number })({
                    Lit({ value }) { return value; },
                    Neg({ inner }) { return -inner; },
                    Add({ left, right }) { return left + right; }
                })
            }));

            // Unannotated variants should still be $E and accepted in $E fields
            const e = Expr.Add(Expr.Neg(Expr.Lit(3)), Expr.Lit(2));
            assert.strictEqual(e.eval, -1);

            // isSort should work on unannotated variants too
            assert.strictEqual(Expr[isSort]!(Expr.Lit(1), '$E'), true);
            assert.strictEqual(Expr[isSort]!(Expr.Neg(Expr.Lit(1)), '$E'), true);
        });

        test('regression: partial [sort] annotations brand all variants including singletons', () => {
            // Only Succ has [sort]: $N; Zero (singleton) and Dbl (structured) omit it.
            // All three must receive SortNameSymbol branding for the single sort $N.
            const Nat = data(({ $N }) => ({
                Zero: {},
                Succ: { [sort]: $N, pred: $N },
                Dbl:  { inner: $N }
            })).ops(({ fold, unfold, map, merge, $N }) => ({
                toNum: fold({ out: Number })({
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; },
                    Dbl({ inner }) { return inner * 2; }
                })
            }));

            // Construction: unannotated variants accepted in $N-typed fields
            const two = Nat.Succ(Nat.Succ(Nat.Zero));
            assert.strictEqual(two.toNum, 2);
            const six = Nat.Dbl(Nat.Succ(Nat.Succ(Nat.Succ(Nat.Zero))));
            assert.strictEqual(six.toNum, 6);

            // Sort branding present on all variants
            assert.strictEqual(Nat[isSort]!(Nat.Zero, '$N'), true);
            assert.strictEqual(Nat[isSort]!(Nat.Succ(Nat.Zero), '$N'), true);
            assert.strictEqual(Nat[isSort]!(Nat.Dbl(Nat.Zero), '$N'), true);
        });

        test('multi-sorted ADT: $E and $S with explicit [sort]', () => {
            const Lang = data(({ $E, $S }) => ({
                // Exp sort
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                // Stm sort
                Assign: { [sort]: $S, name: String, expr: $E },
                Seq:    { [sort]: $S, first: $S, second: $S }
            }));

            const lit5 = Lang.Lit(5);
            const lit3 = Lang.Lit(3);
            const sum  = Lang.Add(lit5, lit3);
            const assign = Lang.Assign('x', sum);
            const seq  = Lang.Seq(assign, Lang.Assign('y', Lang.Lit(1)));

            // Instances are valid
            assert.ok(lit5);
            assert.ok(seq);
        });

        test('multi-sorted requires [sort] on every variant', () => {
            assert.throws(() => {
                data(({ $E, $S }) => ({
                    Lit:    { [sort]: $E, value: Number },
                    Add:    { left: $E, right: $E },  // missing [sort]
                    Assign: { [sort]: $S, name: String, expr: $E }
                }));
            }, /sort/i);
        });

        test('singleton variant with sort', () => {
            const Lang = data(({ $E, $S }) => ({
                Zero:   { [sort]: $E },
                Nop:    { [sort]: $S },
                Add:    { [sort]: $E, left: $E, right: $E },
                Seq:    { [sort]: $S, first: $S, second: $S }
            }));

            assert.ok(Lang.Zero);
            assert.ok(Lang.Nop);
        });
    });

    // ── Construction validation ────────────────────────────────────────────

    describe('Construction validation', () => {

        test('rejects wrong-sort value in sort-typed field', () => {
            const Lang = data(({ $E, $S }) => ({
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                Assign: { [sort]: $S, name: String, expr: $E },
                Seq:    { [sort]: $S, first: $S, second: $S }
            }));

            // Seq expects $S fields, but we're passing a $E (Lit)
            assert.throws(() => {
                Lang.Seq(Lang.Lit(1), Lang.Assign('x', Lang.Lit(2)));
            }, /sort/i);
        });

        test('accepts correct-sort value in sort-typed field', () => {
            const Lang = data(({ $E, $S }) => ({
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                Assign: { [sort]: $S, name: String, expr: $E },
                Seq:    { [sort]: $S, first: $S, second: $S }
            }));

            // Seq expects $S fields — Assign is $S
            const s = Lang.Seq(
                Lang.Assign('x', Lang.Lit(1)),
                Lang.Assign('y', Lang.Lit(2))
            );
            assert.ok(s);
        });
    });

    // ── Sort reflection ────────────────────────────────────────────────────

    describe('Sort reflection', () => {

        test('isSort correctly identifies sort membership', () => {
            const Lang = data(({ $E, $S }) => ({
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                Assign: { [sort]: $S, name: String, expr: $E },
                Seq:    { [sort]: $S, first: $S, second: $S }
            }));

            const lit = Lang.Lit(42);
            const assign = Lang.Assign('x', lit);

            assert.strictEqual(Lang[isSort]!(lit, '$E'), true);
            assert.strictEqual(Lang[isSort]!(lit, '$S'), false);
            assert.strictEqual(Lang[isSort]!(assign, '$S'), true);
            assert.strictEqual(Lang[isSort]!(assign, '$E'), false);
        });
    });

    // ── Fold ───────────────────────────────────────────────────────────────

    describe('Fold', () => {

        test('fold over multi-sorted ADT (sort-erasing: all sorts → single output)', () => {
            const Lang = data(({ $E, $S }) => ({
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                Assign: { [sort]: $S, name: String, expr: $E },
                Seq:    { [sort]: $S, first: $S, second: $S }
            })).ops(({ fold, unfold, map, merge, $E, $S }) => ({
                pretty: fold({ out: String })({
                    Lit({ value }) { return String(value); },
                    Add({ left, right }) { return `(${left} + ${right})`; },
                    Assign({ name, expr }) { return `${name} = ${expr}`; },
                    Seq({ first, second }) { return `${first}; ${second}`; }
                })
            }));

            const program = Lang.Seq(
                Lang.Assign('x', Lang.Add(Lang.Lit(1), Lang.Lit(2))),
                Lang.Assign('y', Lang.Lit(42))
            );

            assert.strictEqual(program.pretty, 'x = (1 + 2); y = 42');
        });

        test('fold with parameterized input over multi-sorted ADT', () => {
            const Lang = data(({ $E, $S }) => ({
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                Assign: { [sort]: $S, name: String, expr: $E },
                Seq:    { [sort]: $S, first: $S, second: $S }
            })).ops(({ fold, unfold, map, merge, $E, $S }) => ({
                eval: fold({ in: Object })({
                    Lit({ value }) { return value; },
                    Add({ left, right }: any, env: any) { return left(env) + right(env); },
                    Assign({ name, expr }: any, env: any) {
                        const newEnv = { ...env, [name]: expr(env) };
                        return newEnv;
                    },
                    Seq({ first, second }: any, env: any) {
                        const env1 = first(env);
                        return second(env1);
                    }
                })
            }));

            const program = Lang.Seq(
                Lang.Assign('x', Lang.Add(Lang.Lit(1), Lang.Lit(2))),
                Lang.Assign('y', Lang.Lit(42))
            );

            const result = program.eval({});
            assert.deepStrictEqual(result, { x: 3, y: 42 });
        });

        test('fold on single-sorted with $E (backward compatible)', () => {
            const Nat = data(({ $E }) => ({
                Zero: {},
                Succ: { pred: $E }
            })).ops(({ fold, unfold, map, merge, $E }) => ({
                toNumber: fold({ out: Number })({
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                })
            }));

            const three = Nat.Succ(Nat.Succ(Nat.Succ(Nat.Zero)));
            assert.strictEqual(three.toNumber, 3);
        });

        test('per-sort carrier fold: distinct carrier types per sort', () => {
            const Lang = data(({ $E, $S }) => ({
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                Assign: { [sort]: $S, name: String, expr: $E },
                Seq:    { [sort]: $S, first: $S, second: $S }
            })).ops(({ fold, unfold, map, merge, $E, $S }) => ({
                eval: fold({ out: { $E: Number, $S: undefined } })({
                    Lit({ value })         { return value; },
                    Add({ left, right }: any)   { return left + right; },
                    Assign({ name, expr }: any) { void name; void expr; },
                    Seq({ first, second }: any) { void first; void second; }
                })
            }));

            const program = Lang.Seq(
                Lang.Assign('x', Lang.Add(Lang.Lit(1), Lang.Lit(2))),
                Lang.Assign('y', Lang.Lit(42))
            );

            // $S carriers return undefined
            assert.strictEqual(program.eval, undefined);

            // $E carriers return Number
            const expr = Lang.Add(Lang.Lit(10), Lang.Lit(20));
            assert.strictEqual(expr.eval, 30);
        });

        test('per-sort carrier fold: validates return types per sort', () => {
            const Lang = data(({ $E, $S }) => ({
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                Print:  { [sort]: $S, expr: $E }
            })).ops(({ fold, unfold, map, merge, $E, $S }) => ({
                bad: fold({ out: { $E: Number, $S: String } })({
                    Lit({ value }) { return value; },
                    Add({ left, right }: any) { return left + right; },
                    // Return wrong type for $S: should be String, returns Number
                    Print({ expr }: any) { return expr; }
                })
            }));

            // $E handler returns Number → should pass
            assert.strictEqual(Lang.Lit(5).bad, 5);

            // $S handler returns Number instead of String → should fail
            assert.throws(
                () => Lang.Print(Lang.Lit(5)).bad,
                /expected to return/i
            );
        });

        test('per-sort carrier fold: missing sort key throws', () => {
            assert.throws(() => {
                data(({ $E, $S }) => ({
                    Lit:  { [sort]: $E, value: Number },
                    Skip: { [sort]: $S }
                })).ops(({ fold, unfold, map, merge, $E, $S }) => ({
                    bad: fold({ out: { $E: Number } })({
                        Lit({ value }) { return value; },
                        Skip() { return undefined; }
                    })
                }));
            }, /missing sort.*\$S/i);
        });

        test('per-sort carrier fold: extra sort key throws', () => {
            assert.throws(() => {
                data(({ $E, $S }) => ({
                    Lit:  { [sort]: $E, value: Number },
                    Skip: { [sort]: $S }
                })).ops(({ fold, unfold, map, merge, $E, $S }) => ({
                    bad: fold({ out: { $E: Number, $S: undefined, $X: String } })({
                        Lit({ value }) { return value; },
                        Skip() { return undefined; }
                    })
                }));
            }, /unknown sort.*\$X/i);
        });

        test('per-sort carrier fold: object out on non-sorted ADT throws', () => {
            assert.throws(() => {
                data(({ Family }) => ({
                    Leaf: { value: Number }
                })).ops(({ fold, unfold, map, merge, Family }) => ({
                    bad: fold({ out: { $E: Number } })({
                        Leaf({ value }) { return value; }
                    })
                }));
            }, /requires a multi-sorted ADT/i);
        });
    });

    // ── Unfold ─────────────────────────────────────────────────────────────

    describe('Unfold', () => {

        test('unfold into multi-sorted ADT', () => {
            const Lang = data(({ $E, $S }) => ({
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                Assign: { [sort]: $S, name: String, expr: $E },
                Seq:    { [sort]: $S, first: $S, second: $S }
            })).ops(({ fold, unfold, map, merge, $E, $S }) => ({
                pretty: fold({ out: String })({
                    Lit({ value }) { return String(value); },
                    Add({ left, right }) { return `(${left} + ${right})`; },
                    Assign({ name, expr }) { return `${name} = ${expr}`; },
                    Seq({ first, second }) { return `${first}; ${second}`; }
                }),
                FromNumber: unfold({ in: Number })({
                    Lit: (n: number) => (n <= 0 ? { value: 0 } : null),
                    Add: (n: number) => (n > 0 ? { left: n - 1, right: 0 } : null)
                })
            }));

            const expr = (Lang as any).FromNumber(3);
            assert.strictEqual((expr as any).pretty, '(((0 + 0) + 0) + 0)');
        });
    });

    // ── Map ────────────────────────────────────────────────────────────────

    describe('Map', () => {

        test('map over type-parameterized fields in multi-sorted ADT', () => {
            const Expr = data(({ T, $E }) => ({
                Lit:  { [sort]: $E, value: T },
                Add:  { [sort]: $E, left: $E, right: $E }
            })).ops(({ fold, unfold, map, merge, T, $E }) => ({
                eval: fold({ out: Number })({
                    Lit({ value }) { return Number(value); },
                    Add({ left, right }) { return left + right; }
                }),
                mapT: map({})({
                    T: (v: unknown) => Number(v) * 10
                })
            }));

            const expr = (Expr as any).Add((Expr as any).Lit(1), (Expr as any).Lit(2));
            const mapped = (expr as any).mapT;
            assert.strictEqual((mapped as any).eval, 30);
        });
    });

    // ── Extend ─────────────────────────────────────────────────────────────

    describe('Extend', () => {

        test('extend multi-sorted ADT with new variants preserving sorts', () => {
            const BaseLang = data(({ $E, $S }) => ({
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                Assign: { [sort]: $S, name: String, expr: $E }
            })).ops(({ fold, unfold, map, merge, $E, $S }) => ({
                pretty: fold({ out: String })({
                    Lit({ value }) { return String(value); },
                    Add({ left, right }) { return `(${left} + ${right})`; },
                    Assign({ name, expr }) { return `${name} = ${expr}`; }
                })
            }));

            const ExtLang = data(({ $E, $S }) => ({
                [extend]: BaseLang,
                Mul:  { [sort]: $E, left: $E, right: $E },
                Seq:  { [sort]: $S, first: $S, second: $S }
            })).ops(({ fold, unfold, map, merge, $E, $S }) => ({
                pretty: fold({ out: String })({
                    Mul({ left, right }) { return `(${left} * ${right})`; },
                    Seq({ first, second }) { return `${first}; ${second}`; }
                })
            }));

            const program = (ExtLang as any).Seq(
                (ExtLang as any).Assign('x', (ExtLang as any).Mul((ExtLang as any).Lit(2), (ExtLang as any).Lit(3))),
                (ExtLang as any).Assign('y', (ExtLang as any).Add((ExtLang as any).Lit(1), (ExtLang as any).Lit(1)))
            );

            assert.strictEqual(program.pretty, 'x = (2 * 3); y = (1 + 1)');
        });

        test('inherited variants preserve sort branding', () => {
            const BaseLang = data(({ $E, $S }: DataDeclParams) => ({
                Lit:    { [sort]: $E, value: Number },
                Nop:    { [sort]: $S }
            }));

            const ExtLang = data(({ $E, $S }: DataDeclParams) => ({
                [extend]: BaseLang,
                Add:    { [sort]: $E, left: $E, right: $E },
                Seq:    { [sort]: $S, first: $S, second: $S }
            }));

            // Inherited Lit should still be $E sort
            assert.strictEqual(ExtLang[isSort]!(ExtLang.Lit(42), '$E'), true);
            assert.strictEqual(ExtLang[isSort]!(ExtLang.Lit(42), '$S'), false);
            // Inherited Nop should still be $S sort
            assert.strictEqual(ExtLang[isSort]!(ExtLang.Nop, '$S'), true);
        });
    });

    // ── Backward compatibility ─────────────────────────────────────────────

    describe('Backward compatibility', () => {

        test('ADT with no sort params works as before (Family-based)', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family }
            })).ops(({ fold, unfold, map, merge, Family }) => ({
                sum: fold({ out: Number })({
                    Leaf({ value }) { return value; },
                    Node({ left, right }) { return left + right; }
                })
            }));

            const tree = Tree.Node(Tree.Leaf(1), Tree.Leaf(2));
            assert.strictEqual(tree.sum, 3);
        });

        test('single-char $ sort inferred when only one sort used', () => {
            // When only one $ param is used, all variants implicitly
            // belong to that single sort — no [sort] annotation needed
            const Nat = data(({ $N }) => ({
                Zero: {},
                Succ: { pred: $N }
            })).ops(({ fold, unfold, map, merge, $N }) => ({
                toNum: fold({ out: Number })({
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                })
            }));

            const two = Nat.Succ(Nat.Succ(Nat.Zero));
            assert.strictEqual(two.toNum, 2);
        });
    });
});
