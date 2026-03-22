/**
 * Standard Library — Primitive Wrapper Tests
 *
 * Tests for Num, Str, Bool.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Num }  from '../std/primitive/Num.mjs';
import { Str }  from '../std/primitive/Str.mjs';
import { Bool } from '../std/primitive/Bool.mjs';

import { Eq }               from '../std/protocols/Eq.mjs';
import { Ord }              from '../std/protocols/Ord.mjs';
import { Monoid }           from '../std/protocols/Monoid.mjs';
import { CommutativeMonoid } from '../std/protocols/CommutativeMonoid.mjs';
import { Semiring }         from '../std/protocols/Semiring.mjs';
import { Ring }             from '../std/protocols/Ring.mjs';
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

    it('additive monoid: Identity + combine', () => {
        const id = Num.Identity();
        assert.strictEqual(id.value, 0);

        const a = Num.N({ value: 3 });
        const b = Num.N({ value: 4 });
        assert.strictEqual(a.combine(b).value, 7);
        assert.strictEqual(a.combine(id).value, 3);
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

    it('satisfies Eq, Ord, CommutativeMonoid, Semiring, Ring', () => {
        const n = Num.N({ value: 1 });
        assert.ok(n instanceof Eq);
        assert.ok(n instanceof Ord);
        assert.ok(n instanceof CommutativeMonoid);
        assert.ok(n instanceof Semiring);
        assert.ok(n instanceof Ring);
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
