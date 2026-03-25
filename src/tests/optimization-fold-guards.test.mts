/**
 * Fold Guard Optimizations
 *
 * Tests that `applyFoldOptimizations` correctly short-circuits binary fold
 * operations based on declared algebraic properties:
 *
 *   identity:X  — op(identity, x) ≡ x  and  op(x, identity) ≡ x
 *   absorbing:X — op(zero, x)     ≡ zero  and  op(x, zero) ≡ zero
 *   idempotent  — op(x, x)        ≡ x
 *
 * Short-circuit is verified via reference identity: the guard returns the
 * ORIGINAL instance (same JS reference) rather than a freshly reconstructed
 * copy produced by the fold traversal.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

// =============================================================================
// Fixture: Peano natural numbers (identity:Zero on add)
// =============================================================================


function makeNat() {
    const adt = data(({ Family }) => ({
        Zero: {},
        Succ: { pred: Family }
    })).ops(({ fold, Family }) => ({
        add: fold({
            in: Family,
            out: Family,
            properties: ['associative', 'identity:Zero']
        })({
            Zero(_ctx: any, other?: any) { return other; },
            Succ({ pred }: any, other?: any) {
                return Family.Succ({ pred: pred(other) });
            }
        })
    }));
    return { adt, zero: (adt as any).Zero as object };
}

// =============================================================================
// Fixture: Boolean AND with absorbing:False
// =============================================================================


function makeBoolAnd() {
    const adt = data(() => ({
        False: {},
        True: {}
    })).ops(({ fold, Family }) => ({
        and: fold({
            in: Family,
            out: Family,
            properties: ['absorbing:False']
        })({
            False(_ctx: any, _other?: any) { return Family.False; },
            True(_ctx: any, other?: any) { return other; }
        })
    }));
    return { f: (adt as any).False as object, t: (adt as any).True as object };
}

// =============================================================================
// Fixture: Boolean OR with idempotent
// =============================================================================


function makeBoolOr() {
    const adt = data(() => ({
        False: {},
        True: {}
    })).ops(({ fold, Family }) => ({
        or: fold({
            in: Family,
            out: Family,
            properties: ['idempotent']
        })({
            False(_ctx: any, other?: any) { return other; },
            True(_ctx: any, _other?: any) { return Family.True; }
        })
    }));
    return { f: (adt as any).False as object, t: (adt as any).True as object };
}

// =============================================================================
// 1. Identity elimination
// =============================================================================

describe('Identity elimination guard', () => {

    it('op(identity, x) returns x (same reference — not reconstructed)', () => {
        const { adt: Nat, zero } = makeNat();

        const one = (Nat as any).Succ({ pred: zero });

        // Guard: structuralEquals(this=zero, identityValue=zero) → true → return other=one

        const result = (zero as any).add(one);

        // Should be the SAME reference, not a reconstructed instance
        assert.strictEqual(result, one,
            'add(zero, x) should return x via identity guard (same reference)');
    });

    it('op(x, identity) returns x (same reference — not reconstructed)', () => {
        const { adt: Nat, zero } = makeNat();

        const one = (Nat as any).Succ({ pred: zero });

        // Guard: structuralEquals(args[0]=zero, identityValue=zero) → true → return this=one

        const result = (one as any).add(zero);

        assert.strictEqual(result, one,
            'add(x, zero) should return x via identity guard (same reference)');
    });

    it('op(x, y) where neither is identity falls through to fold', () => {
        const { adt: Nat, zero } = makeNat();

        const one = (Nat as any).Succ({ pred: zero });

        const two = (Nat as any).Succ({ pred: one });

        // Guard does NOT fire — fold runs and produces a new Succ(Succ instance

        const result = (one as any).add(one);

        assert.notStrictEqual(result, one,  'result should be a new instance (1+1≠1)');

        assert.deepStrictEqual(result, two, '1+1 = 2 structurally');
    });

    it('op(identity, identity) returns identity', () => {
        const { zero } = makeNat();

        // Guard: structuralEquals(this=zero, identityValue=zero) → true → return other=zero

        const result = (zero as any).add(zero);

        assert.strictEqual(result, zero,
            'add(zero, zero) should return zero via identity guard');
    });

});

// =============================================================================
// 2. Absorbing short-circuit
// =============================================================================

describe('Absorbing short-circuit guard', () => {

    it('op(zero, x) returns zero (absorbing element, reference check)', () => {
        const { f, t } = makeBoolAnd();

        // Guard: structuralEquals(this=False, absorbingValue=False) → true → return absorbingValue=False

        const result = (f as any).and(t);

        assert.strictEqual(result, f,
            'and(False, True) should return False via absorbing guard (same reference)');
    });

    it('op(x, zero) returns zero (absorbing on right side)', () => {
        const { f, t } = makeBoolAnd();

        // Guard: structuralEquals(args[0]=False, absorbingValue=False) → true → return absorbingValue=False

        const result = (t as any).and(f);

        assert.strictEqual(result, f,
            'and(True, False) should return False via absorbing guard (same reference)');
    });

    it('op(non-zero, non-zero) falls through to fold', () => {
        const { t } = makeBoolAnd();

        // Guard does NOT fire — fold runs

        const result = (t as any).and(t);

        assert.strictEqual(result, t, 'and(True, True) = True (fold returns other = True)');
    });

    it('op(zero, zero) returns zero from absorbing guard', () => {
        const { f } = makeBoolAnd();


        const result = (f as any).and(f);

        assert.strictEqual(result, f,
            'and(False, False) should return False via absorbing guard');
    });

});

// =============================================================================
// 3. Idempotent deduplication
// =============================================================================

describe('Idempotent deduplication guard', () => {

    it('op(x, x) returns x (same reference — guard short-circuits)', () => {
        const { t } = makeBoolOr();

        // Guard: structuralEquals(this=True, other=True) → true → return this=True

        const result = (t as any).or(t);

        assert.strictEqual(result, t,
            'or(True, True) should return True via idempotent guard (same reference)');
    });

    it('op(false, false) — idempotent guard fires for the other singleton too', () => {
        const { f } = makeBoolOr();


        const result = (f as any).or(f);

        assert.strictEqual(result, f,
            'or(False, False) should return False via idempotent guard (same reference)');
    });

    it('op(x, y) where x ≠ y falls through to fold', () => {
        const { f, t } = makeBoolOr();

        // Guard does NOT fire — fold runs

        const result = (f as any).or(t);

        assert.strictEqual(result, t, 'or(False, True) = True (fold runs)');
    });

});

// =============================================================================
// 4. Guard accuracy — all three guards together
// =============================================================================

describe('Combined guards: identity + absorbing on a single op', () => {

    it('all guards are checked in order for ops with multiple properties', () => {
        // A "max" over a bounded semilattice: identity=Bottom, absorbing=Top
        const Bounded = data(() => ({
            Bot: {},
            Mid: {},
            Top: {}
        })).ops(({ fold, Family }) => ({
            join: fold({
                in: Family,
                out: Family,
                properties: ['associative', 'commutative', 'idempotent', 'identity:Bot', 'absorbing:Top']
            })({
                Bot(_ctx: any, other?: any) { return other; },   // Bot ⊔ x = x
                Mid(_ctx: any, other?: any) {
                    // Mid ⊔ Top = Top, Mid ⊔ anything-else = Mid
                    return other === Family.Top ? Family.Top : Family.Mid;
                },
                Top(_ctx: any, _other?: any) { return Family.Top; }
            })
        }));


        const bot = (Bounded as any).Bot as object;

        const top = (Bounded as any).Top as object;

        const mid = (Bounded as any).Mid as object;

        // Identity guard: join(Bot, x) = x

        assert.strictEqual((bot as any).join(mid), mid, 'Bot ⊔ Mid = Mid (identity guard)');

        assert.strictEqual((mid as any).join(bot), mid, 'Mid ⊔ Bot = Mid (identity guard)');

        // Absorbing guard: join(Top, x) = Top

        assert.strictEqual((top as any).join(mid), top, 'Top ⊔ Mid = Top (absorbing guard)');

        assert.strictEqual((mid as any).join(top), top, 'Mid ⊔ Top = Top (absorbing guard)');

        // Idempotent guard: join(x, x) = x

        assert.strictEqual((mid as any).join(mid), mid, 'Mid ⊔ Mid = Mid (idempotent guard)');
    });

});
