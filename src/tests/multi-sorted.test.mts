import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, extend, fold, unfold, map, sort, isSort } from '../index.mjs';
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
                Add: { left: $E, right: $E },
                eval: fold({ out: Number })({
                    Lit({ value }) { return value; },
                    Add({ left, right }) { return left + right; }
                })
            }));

            const e = Expr.Add(Expr.Lit(1), Expr.Lit(2));
            assert.strictEqual(e.eval, 3);
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

            assert.strictEqual((Lang as any)[isSort](lit, '$E'), true);
            assert.strictEqual((Lang as any)[isSort](lit, '$S'), false);
            assert.strictEqual((Lang as any)[isSort](assign, '$S'), true);
            assert.strictEqual((Lang as any)[isSort](assign, '$E'), false);
        });
    });

    // ── Fold ───────────────────────────────────────────────────────────────

    describe('Fold', () => {

        test('fold over multi-sorted ADT (sort-erasing: all sorts → single output)', () => {
            const Lang = data(({ $E, $S }) => ({
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                Assign: { [sort]: $S, name: String, expr: $E },
                Seq:    { [sort]: $S, first: $S, second: $S },

                // Sort-erasing fold: all sorts collapse to String
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
                Seq:    { [sort]: $S, first: $S, second: $S },

                eval: fold({ in: Object })({
                    Lit({ value }) { return value; },
                    Add({ left, right }, env) { return left(env) + right(env); },
                    Assign({ name, expr }, env) {
                        const newEnv = { ...env, [name]: expr(env) };
                        return newEnv;
                    },
                    Seq({ first, second }, env) {
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
                Succ: { pred: $E },
                toNumber: fold({ out: Number })({
                    Zero() { return 0; },
                    Succ({ pred }) { return 1 + pred; }
                })
            }));

            const three = Nat.Succ(Nat.Succ(Nat.Succ(Nat.Zero)));
            assert.strictEqual(three.toNumber, 3);
        });
    });

    // ── Unfold ─────────────────────────────────────────────────────────────

    describe('Unfold', () => {

        test('unfold into multi-sorted ADT', () => {
            const Lang = data(({ $E, $S }: DataDeclParams) => ({
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                Assign: { [sort]: $S, name: String, expr: $E },
                Seq:    { [sort]: $S, first: $S, second: $S },

                pretty: fold({ out: String })({
                    Lit({ value }) { return String(value); },
                    Add({ left, right }) { return `(${left} + ${right})`; },
                    Assign({ name, expr }) { return `${name} = ${expr}`; },
                    Seq({ first, second }) { return `${first}; ${second}`; }
                }),

                // Unfold: build an expression tree from a number
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
            const Expr = data(({ T, $E }: DataDeclParams) => ({
                Lit:  { [sort]: $E, value: T },
                Add:  { [sort]: $E, left: $E, right: $E },

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
            const BaseLang = data(({ $E, $S }: DataDeclParams) => ({
                Lit:    { [sort]: $E, value: Number },
                Add:    { [sort]: $E, left: $E, right: $E },
                Assign: { [sort]: $S, name: String, expr: $E },

                pretty: fold({ out: String })({
                    Lit({ value }) { return String(value); },
                    Add({ left, right }) { return `(${left} + ${right})`; },
                    Assign({ name, expr }) { return `${name} = ${expr}`; }
                })
            }));

            const ExtLang = data(({ $E, $S }: DataDeclParams) => ({
                [extend]: BaseLang,
                Mul:  { [sort]: $E, left: $E, right: $E },
                Seq:  { [sort]: $S, first: $S, second: $S },

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
            assert.strictEqual((ExtLang as any)[isSort]((ExtLang as any).Lit(42), '$E'), true);
            assert.strictEqual((ExtLang as any)[isSort]((ExtLang as any).Lit(42), '$S'), false);
            // Inherited Nop should still be $S sort
            assert.strictEqual((ExtLang as any)[isSort]((ExtLang as any).Nop, '$S'), true);
        });
    });

    // ── Backward compatibility ─────────────────────────────────────────────

    describe('Backward compatibility', () => {

        test('ADT with no sort params works as before (Family-based)', () => {
            const Tree = data(({ Family }) => ({
                Leaf: { value: Number },
                Node: { left: Family, right: Family },
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
                Succ: { pred: $N },
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
