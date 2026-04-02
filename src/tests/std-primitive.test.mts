/**
 * Standard Library — Primitive Wrapper Tests
 *
 * Tests for Num, Str, Bool, TropicalNum, Int, Char.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Num }        from '../std/primitive/Num.mjs';
import { Str }        from '../std/primitive/Str.mjs';
import { Bool }       from '../std/primitive/Bool.mjs';
import { TropicalNum } from '../std/primitive/TropicalNum.mjs';
import { Int }        from '../std/primitive/Int.mjs';
import { Char }       from '../std/primitive/Char.mjs';

import { Eq }               from '../std/protocols/Eq.mjs';
import { Ord }              from '../std/protocols/Ord.mjs';
import { Monoid }           from '../std/protocols/Monoid.mjs';
import { CommutativeMonoid } from '../std/protocols/CommutativeMonoid.mjs';
import { Semiring }         from '../std/protocols/Semiring.mjs';
import { Ring }             from '../std/protocols/Ring.mjs';
import { Field }            from '../std/protocols/Field.mjs';
import { EuclideanDomain }  from '../std/protocols/EuclideanDomain.mjs';
import { BoundedLattice }   from '../std/protocols/BoundedLattice.mjs';

// ── Num ──────────────────────────────────────────────────────────────────────

describe('Num', () => {
    it('constructs N', () => {
        const n = Num.N({ value: 42 });
        assert.strictEqual(n.value, 42);
    });

    it('equals', () => {
        const a = Num.N({ value: 5 });
        const b = Num.N({ value: 5 });
        const c = Num.N({ value: 7 });
        assert.strictEqual(a.equals(b), true);
        assert.strictEqual(a.equals(c), false);
    });

    it('compare', () => {
        const a = Num.N({ value: 3 });
        const b = Num.N({ value: 5 });
        assert.strictEqual(a.compare(b), -1);
        assert.strictEqual(b.compare(a), 1);
        assert.strictEqual(a.compare(a), 0);
    });

    it('additive monoid: Identity + combine (aliases for Zero + add)', () => {
        const id = Num.Identity();
        assert.strictEqual(id.value, 0);
        // Identity is an alias for Zero
        assert.strictEqual(Num.Zero().value, Num.Identity().value);

        const a = Num.N({ value: 3 });
        const b = Num.N({ value: 4 });
        // combine is an alias for add
        assert.strictEqual(a.combine(b).value, 7);
        assert.strictEqual(a.combine(id).value, 3);
        assert.strictEqual(a.combine(b).value, a.add(b).value);
    });

    it('semiring: add, Zero, multiply, One', () => {
        const a = Num.N({ value: 3 });
        const b = Num.N({ value: 4 });

        assert.strictEqual(a.add(b).value, 7);
        assert.strictEqual(Num.Zero().value, 0);
        assert.strictEqual(a.multiply(b).value, 12);
        assert.strictEqual(Num.One().value, 1);
    });

    it('ring: negate', () => {
        const n = Num.N({ value: 7 });
        assert.strictEqual(n.negate.value, -7);
        assert.strictEqual(n.negate.negate.value, 7);  // involutory
    });

    it('field: reciprocal and divide', () => {
        const a = Num.N({ value: 4 });
        const b = Num.N({ value: 2 });

        assert.strictEqual(a.divide(b).value, 2);
        assert.strictEqual(b.reciprocal.value, 0.5);
        // involutory: reciprocal(reciprocal(x)) ≡ x
        assert.strictEqual(b.reciprocal.reciprocal.value, 2);
        // definition: a / b ≡ a * (1/b)
        assert.strictEqual(a.divide(b).value, a.multiply(b.reciprocal).value);
    });

    it('satisfies Eq, Ord, CommutativeMonoid, Semiring, Ring, Field', () => {
        const n = Num.N({ value: 1 });
        assert.ok(n instanceof Eq);
        assert.ok(n instanceof Ord);
        assert.ok(n instanceof CommutativeMonoid);
        assert.ok(n instanceof Semiring);
        assert.ok(n instanceof Ring);
        assert.ok(n instanceof Field);
    });
});

// ── Str ──────────────────────────────────────────────────────────────────────

describe('Str', () => {
    it('constructs S', () => {
        const s = Str.S({ value: 'hello' });
        assert.strictEqual(s.value, 'hello');
    });

    it('equals', () => {
        const a = Str.S({ value: 'abc' });
        const b = Str.S({ value: 'abc' });
        const c = Str.S({ value: 'xyz' });
        assert.strictEqual(a.equals(b), true);
        assert.strictEqual(a.equals(c), false);
    });

    it('compare', () => {
        const a = Str.S({ value: 'apple' });
        const b = Str.S({ value: 'banana' });
        assert.strictEqual(a.compare(b), -1);
    });

    it('monoid: Identity + combine (concatenation)', () => {
        const id = Str.Identity();
        assert.strictEqual(id.value, '');

        const a = Str.S({ value: 'hello' });
        const b = Str.S({ value: ' world' });
        assert.strictEqual(a.combine(b).value, 'hello world');
        assert.strictEqual(a.combine(id).value, 'hello');
    });

    it('satisfies Eq, Ord, Monoid', () => {
        const s = Str.S({ value: 'x' });
        assert.ok(s instanceof Eq);
        assert.ok(s instanceof Ord);
        assert.ok(s instanceof Monoid);
    });
});

// ── Bool ─────────────────────────────────────────────────────────────────────

describe('Bool', () => {
    const B = Bool as any;

    it('constructs True and False singletons', () => {
        assert.ok(B.True);
        assert.ok(B.False);
        assert.notStrictEqual(B.True, B.False);
    });

    it('From — wraps a native boolean', () => {
        assert.strictEqual(B.From(true).equals(B.True), true);
        assert.strictEqual(B.From(false).equals(B.False), true);
        assert.ok(B.From(true) instanceof Bool);
    });

    it('equals', () => {
        assert.strictEqual(B.True.equals(B.True), true);
        assert.strictEqual(B.True.equals(B.False), false);
        assert.strictEqual(B.False.equals(B.False), true);
        assert.strictEqual(B.False.equals(B.True), false);
    });

    it('compare (False < True)', () => {
        assert.strictEqual(B.False.compare(B.True), -1);
        assert.strictEqual(B.True.compare(B.False), 1);
        assert.strictEqual(B.True.compare(B.True), 0);
        assert.strictEqual(B.False.compare(B.False), 0);
    });

    it('lattice: join (OR) and meet (AND)', () => {
        assert.strictEqual(B.True.join(B.False).equals(B.True), true);
        assert.strictEqual(B.False.join(B.False).equals(B.False), true);
        assert.strictEqual(B.True.meet(B.False).equals(B.False), true);
        assert.strictEqual(B.True.meet(B.True).equals(B.True), true);
    });

    it('bounded: Top = True, Bottom = False', () => {
        assert.strictEqual(B.Top().equals(B.True), true);
        assert.strictEqual(B.Bottom().equals(B.False), true);
    });

    it('not (complement getter)', () => {
        assert.strictEqual(B.True.not.equals(B.False), true);
        assert.strictEqual(B.False.not.equals(B.True), true);
        assert.strictEqual(B.True.not.not.equals(B.True), true);   // involutory
    });

    it('and (≡ meet)', () => {
        assert.strictEqual(B.True.and(B.True).equals(B.True), true);
        assert.strictEqual(B.True.and(B.False).equals(B.False), true);
        assert.strictEqual(B.False.and(B.True).equals(B.False), true);
        assert.strictEqual(B.False.and(B.False).equals(B.False), true);
    });

    it('or (≡ join)', () => {
        assert.strictEqual(B.True.or(B.True).equals(B.True), true);
        assert.strictEqual(B.True.or(B.False).equals(B.True), true);
        assert.strictEqual(B.False.or(B.True).equals(B.True), true);
        assert.strictEqual(B.False.or(B.False).equals(B.False), true);
    });

    it('xor (exclusive or)', () => {
        assert.strictEqual(B.False.xor(B.False).equals(B.False), true);
        assert.strictEqual(B.False.xor(B.True).equals(B.True), true);
        assert.strictEqual(B.True.xor(B.False).equals(B.True), true);
        assert.strictEqual(B.True.xor(B.True).equals(B.False), true);
    });

    it('implies (→)', () => {
        assert.strictEqual(B.False.implies(B.False).equals(B.True), true);
        assert.strictEqual(B.False.implies(B.True).equals(B.True), true);
        assert.strictEqual(B.True.implies(B.False).equals(B.False), true);
        assert.strictEqual(B.True.implies(B.True).equals(B.True), true);
    });

    it('satisfies Eq, Ord, BoundedLattice', () => {
        assert.ok(B.True instanceof Eq);
        assert.ok(B.True instanceof Ord);
        assert.ok(B.True instanceof BoundedLattice);
    });
});

// ── TropicalNum ───────────────────────────────────────────────────────────────

describe('TropicalNum — Eq and Ord', () => {
    function T(v: number) { return TropicalNum.T({ value: v }); }

    it('equals', () => {
        assert.strictEqual(T(3).equals(T(3)), true);
        assert.strictEqual(T(3).equals(T(5)), false);
        assert.strictEqual(T(-Infinity).equals(TropicalNum.Zero()), true);
    });

    it('compare', () => {
        assert.strictEqual(T(2).compare(T(5)), -1);
        assert.strictEqual(T(5).compare(T(2)),  1);
        assert.strictEqual(T(3).compare(T(3)),  0);
    });

    it('satisfies Eq, Ord, Semiring', () => {
        const t = T(1);
        assert.ok(t instanceof Eq);
        assert.ok(t instanceof Ord);
        assert.ok(t instanceof Semiring);
    });
});

// ── Int ───────────────────────────────────────────────────────────────────────

describe('Int', () => {
    function Z(n: number) { return Int.Z({ value: n }); }

    it('constructs Z', () => {
        const n = Z(7);
        assert.strictEqual(n.value, 7);
    });

    it('rejects non-integer values', () => {
        assert.throws(() => Int.Z({ value: 3.14 }));
    });

    it('equals', () => {
        assert.strictEqual(Z(5).equals(Z(5)), true);
        assert.strictEqual(Z(5).equals(Z(6)), false);
    });

    it('compare', () => {
        assert.strictEqual(Z(2).compare(Z(5)), -1);
        assert.strictEqual(Z(5).compare(Z(2)),  1);
        assert.strictEqual(Z(3).compare(Z(3)),  0);
    });

    it('ring: add, Zero, multiply, One, negate', () => {
        assert.strictEqual(Z(3).add(Z(4)).value, 7);
        assert.strictEqual(Int.Zero().value, 0);
        assert.strictEqual(Z(3).multiply(Z(4)).value, 12);
        assert.strictEqual(Int.One().value, 1);
        assert.strictEqual(Z(5).negate.value, -5);
        assert.strictEqual(Z(5).negate.negate.value, 5);  // involutory
    });

    it('div — truncated quotient (towards zero)', () => {
        assert.strictEqual(Z(7).div(Z(3)).value,   2);   // 7 / 3 = 2 remainder 1
        assert.strictEqual(Z(-7).div(Z(3)).value, -2);   // truncation towards zero
        assert.strictEqual(Z(7).div(Z(-3)).value, -2);
    });

    it('mod — remainder consistent with dividend sign', () => {
        assert.strictEqual(Z(7).mod(Z(3)).value,   1);
        assert.strictEqual(Z(-7).mod(Z(3)).value, -1);   // sign matches dividend
    });

    it('div algorithm: a ≡ b * (a div b) + (a mod b)', () => {
        const pairs = [[7, 3], [17, 5], [-13, 4], [100, 7]];
        for (const [a, b] of pairs) {
            const q = Z(a).div(Z(b)).value;
            const r = Z(a).mod(Z(b)).value;
            assert.strictEqual(a, b * q + r, `failed for ${a}, ${b}`);
        }
    });

    it('gcd — always non-negative', () => {
        assert.strictEqual(Z(12).gcd(Z(8)).value,  4);
        assert.strictEqual(Z(-12).gcd(Z(8)).value, 4);
        assert.strictEqual(Z(7).gcd(Z(13)).value,  1);  // coprime
        assert.strictEqual(Z(0).gcd(Z(5)).value,   5);
    });

    it('satisfies Eq, Ord, EuclideanDomain (⊃ Ring ⊃ Semiring)', () => {
        const n = Z(1);
        assert.ok(n instanceof Eq);
        assert.ok(n instanceof Ord);
        assert.ok(n instanceof Semiring);
        assert.ok(n instanceof Ring);
        assert.ok(n instanceof EuclideanDomain);
    });
});

// ── Char ──────────────────────────────────────────────────────────────────────

describe('Char', () => {
    function C(s: string) { return Char.C({ value: s }); }

    it('constructs C', () => {
        const c = C('A');
        assert.strictEqual(c.value, 'A');
    });

    it('rejects empty string', () => {
        assert.throws(() => Char.C({ value: '' }));
    });

    it('rejects multi-codepoint string', () => {
        assert.throws(() => Char.C({ value: 'ab' }));
    });

    it('accepts surrogate-pair emoji (single code point)', () => {
        assert.doesNotThrow(() => C('😀'));
        assert.strictEqual(C('😀').value, '😀');
    });

    it('equals', () => {
        assert.strictEqual(C('A').equals(C('A')), true);
        assert.strictEqual(C('A').equals(C('B')), false);
    });

    it('compare — by Unicode code point', () => {
        assert.strictEqual(C('A').compare(C('B')), -1);  // 65 < 66
        assert.strictEqual(C('B').compare(C('A')),  1);
        assert.strictEqual(C('A').compare(C('A')),  0);
    });

    it('code — extracts numeric code point', () => {
        assert.strictEqual(C('A').code, 65);
        assert.strictEqual(C('a').code, 97);
        assert.strictEqual(C('😀').code, 0x1F600);
    });

    it('FromCode — constructs Char from code point', () => {
        assert.strictEqual(Char.FromCode(65).value, 'A');
        assert.strictEqual(Char.FromCode(0x1F600).value, '😀');
    });

    it('FromCode/code round-trip', () => {
        const c = C('Z');
        assert.strictEqual(Char.FromCode(c.code).value, c.value);
    });

    it('satisfies Eq, Ord', () => {
        const c = C('x');
        assert.ok(c instanceof Eq);
        assert.ok(c instanceof Ord);
    });
});
