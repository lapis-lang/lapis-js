/**
 * ops.mts `.as()` aliasing tests
 *
 * Verifies that fold/unfold/map operations can be given additional alias
 * names via `.as()`, and that alias and canonical names are both accessible
 * on the resulting ADT / behavior type at runtime.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, behavior, extend, fold, unfold, map } from '../index.mjs';
import { aliasesSymbol } from '../ops.mjs';

// ---------------------------------------------------------------------------
// Data — fold aliases
// ---------------------------------------------------------------------------

describe('ops aliasing — data fold .as()', () => {
    const Bool = data(() => ({ False: {}, True: {} }))
        .ops(({ fold, Family }) => ({
            meet: fold({ in: Family, out: Family })({
                // @ts-expect-error -- arity
                False({}, _other: any) { return this; },
                // @ts-expect-error -- arity
                True({},  other: any)  { return other; }
            }).as('and'),
            join: fold({ in: Family, out: Family })({
                // @ts-expect-error -- arity
                False({}, other: any)  { return other; },
                // @ts-expect-error -- arity
                True({},  _other: any) { return this; }
            }).as('or')
        }));

    it('canonical instance method is accessible', () => {
        assert.ok(typeof Bool.True.meet === 'function', 'Bool.True.meet should be a function');
        assert.ok(typeof Bool.True.join === 'function', 'Bool.True.join should be a function');
    });

    it('single alias instance method is accessible', () => {
        assert.ok(typeof Bool.True.and === 'function', 'Bool.True.and should be a function');
        assert.ok(typeof Bool.True.or  === 'function', 'Bool.True.or  should be a function');
    });

    it('alias produces same result as canonical', () => {
        const t = Bool.True;
        const f = Bool.False;
        // meet(True)(False) = False; and(True)(False) = False
        const meetResult = Bool.True.meet(f);
        const andResult  = Bool.True.and(f);
        assert.strictEqual(meetResult, andResult, 'meet ≡ and');
        assert.strictEqual(Bool.False.join(t), Bool.False.or(t), 'join ≡ or');
    });

    it('multiple aliases on one fold', () => {
        const Nat = data(() => ({ Zero: {}, Succ: { pred: Object } }))
            .ops(({ fold }) => ({
                isZero: fold({ out: Boolean })({
                    Zero()           { return true;  },
                    Succ(_: unknown) { return false; }
                }).as('zero', 'nullp')
            }));

        assert.strictEqual(Nat.Zero.isZero, true);
        assert.strictEqual(Nat.Zero.isZero, Nat.Zero.zero);
        assert.strictEqual(Nat.Zero.isZero, Nat.Zero.nullp);
    });
});

// ---------------------------------------------------------------------------
// Data — unfold aliases
// ---------------------------------------------------------------------------

describe('ops aliasing — data unfold .as()', () => {
    const Nat = data(() => ({ Zero: {}, Succ: { pred: Object } }))
        .ops(({ unfold, Family }) => ({
            FromNumber: unfold({ in: Number, out: Family })({
                Zero: (n: number) => n <= 0 ? {} : null,
                Succ: (n: number) => n >  0 ? { pred: n - 1 } : null
            }).as('Of', 'From')
        }));

    it('canonical unfold is accessible', () => {
        assert.ok(typeof Nat.FromNumber === 'function');
    });

    it('unfold aliases are accessible', () => {
        assert.ok(typeof Nat.Of   === 'function', 'Nat.Of should be a function');
        assert.ok(typeof Nat.From === 'function', 'Nat.From should be a function');
    });

    it('unfold alias produces the same instance as canonical', () => {
        const a = Nat.FromNumber(2);
        const b = Nat.Of(2);
        const c = Nat.From(2);
        assert.ok(a instanceof Nat, 'FromNumber result is a Nat');
        assert.ok(b instanceof Nat, 'Of result is a Nat');
        assert.ok(c instanceof Nat, 'From result is a Nat');
        assert.deepStrictEqual(Object.keys(a), Object.keys(b));
    });
});

// ---------------------------------------------------------------------------
// Data — map aliases
// ---------------------------------------------------------------------------

describe('ops aliasing — data map .as()', () => {
    const Container = data(() => ({ Box: { value: Number } }))
        .ops(({ map, Family }) => ({
            fmap: map({ in: Number, out: Number, self: Family })({
                Box: (n: number) => n * 2
            }).as('double')
        }));

    it('canonical map is accessible on instance', () => {
        const box = Container.Box({ value: 3 });
        assert.ok('fmap' in box, 'fmap should exist on instance');
    });

    it('map alias is accessible on instance', () => {
        const box = Container.Box({ value: 3 });
        assert.ok('double' in box, 'double should exist on instance');
    });

    it('map alias produces same result as canonical', () => {
        const box = Container.Box({ value: 3 });
        const a = (box as { fmap: unknown }).fmap;
        const b = (box as { double: unknown }).double;
        assert.deepStrictEqual(a, b);
    });
});

// ---------------------------------------------------------------------------
// Behavior — unfold aliases
// ---------------------------------------------------------------------------

describe('ops aliasing — behavior unfold .as()', () => {
    const Stream = behavior(({ Self }) => ({
        head: Number,
        tail: Self
    })).ops(({ unfold, Self }) => ({
        From: unfold({ in: Number, out: Self })({
            head: (n: number) => n,
            tail: (n: number) => n + 1
        }).as('Of')
    }));

    it('behavior canonical unfold is accessible', () => {
        assert.ok(typeof Stream.From === 'function', 'Stream.From should be a function');
    });

    it('behavior unfold alias is accessible', () => {
        assert.ok(typeof Stream.Of === 'function', 'Stream.Of should be a function');
    });

    it('behavior unfold alias produces same-shaped instance', () => {
        const s1 = Stream.From(0);
        const s2 = Stream.Of(0);
        assert.ok(s1, 'From instance should exist');
        assert.ok(s2, 'of instance should exist');
        assert.strictEqual(s1.head, s2.head, 'head should match');
    });

    it('alias property descriptor is identical to canonical', () => {
        const canonDesc = Object.getOwnPropertyDescriptor(Stream, 'From');
        const aliasDesc  = Object.getOwnPropertyDescriptor(Stream, 'Of');
        assert.ok(canonDesc, 'From descriptor should exist');
        assert.ok(aliasDesc,  'of descriptor should exist');
        assert.strictEqual(aliasDesc!.get ?? aliasDesc!.value,
            canonDesc!.get ?? canonDesc!.value,
            'alias and canonical should share the same accessor/value');
        assert.strictEqual(aliasDesc!.enumerable,   canonDesc!.enumerable);
        assert.strictEqual(aliasDesc!.configurable,  canonDesc!.configurable);
    });

    it('alias is inherited by a sub-behavior (UnfoldAliasMapSymbol entry copied)', () => {
        // Verifies that the internal UnfoldAliasMapSymbol map carries the alias so
        // that behavior extension correctly re-installs it on the child type.
        const ChildStream = behavior(({ Self }) => ({
            [extend]: Stream
        }));
        assert.ok(typeof ChildStream.From === 'function', 'child should inherit canonical From');
        assert.ok(typeof ChildStream.Of   === 'function', 'child should inherit alias Of');
        const s_canon = ChildStream.From(5);
        const s_alias = ChildStream.Of(5);
        assert.strictEqual(s_canon.head, s_alias.head, 'canonical and alias produce same head');
    });
});

// ---------------------------------------------------------------------------
// Standalone fold/unfold/map — .as() returns HasAliases brand
// ---------------------------------------------------------------------------

describe('ops aliasing — .as() on standalone builders', () => {
    it('fold().as() attaches array of alias names', () => {
        const def = fold({ out: Number })({ A(_: unknown) { return 1; } }).as('x', 'y');
        assert.deepStrictEqual((def as unknown as Record<symbol, unknown>)[aliasesSymbol], ['x', 'y']);
    });

    it('unfold().as() attaches array of alias names', () => {
        const def = unfold({ in: Number, out: Number })({ A: (n: number) => n }).as('make');
        assert.deepStrictEqual((def as unknown as Record<symbol, unknown>)[aliasesSymbol], ['make']);
    });

    it('map().as() attaches array of alias names', () => {
        const def = map({ in: Number, out: Number, self: Object })({ A: (n: number) => n }).as('transform');
        assert.deepStrictEqual((def as unknown as Record<symbol, unknown>)[aliasesSymbol], ['transform']);
    });
});
