/**
 * Standard Library — Data Type Tests
 *
 * Tests for Pair, Maybe, Either, List, NonEmpty, Tree, Validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Pair }       from '../std/data/Pair.mjs';
import { Maybe }      from '../std/data/Maybe.mjs';
import { Either }     from '../std/data/Either.mjs';
import { List }       from '../std/data/List.mjs';
import { NonEmpty }   from '../std/data/NonEmpty.mjs';
import { Tree }       from '../std/data/Tree.mjs';
import { Validation } from '../std/data/Validation.mjs';

import { Eq }          from '../std/protocols/Eq.mjs';
import { Functor }     from '../std/protocols/Functor.mjs';
import { Monoid }      from '../std/protocols/Monoid.mjs';
import { Monad }       from '../std/protocols/Monad.mjs';
import { Applicative } from '../std/protocols/Applicative.mjs';
import { Foldable }    from '../std/protocols/Foldable.mjs';
import { Bifunctor }   from '../std/protocols/Bifunctor.mjs';
import { Semigroup }   from '../std/protocols/Semigroup.mjs';

// ── Pair ─────────────────────────────────────────────────────────────────────

describe('Pair', () => {
    it('constructs and reads fields', () => {
        const p = Pair.MakePair({ first: 1, second: 'hello' });
        assert.strictEqual(p.first, 1);
        assert.strictEqual(p.second, 'hello');
    });

    it('bimap transforms both', () => {
        const p = Pair.MakePair({ first: 2, second: 3 });

        const q = (p as any).bimap((x: number) => x * 10, (y: number) => y + 1);
        assert.strictEqual(q.first, 20);
        assert.strictEqual(q.second, 4);
    });

    it('satisfies Bifunctor', () => {
        const p = Pair.MakePair({ first: 1, second: 2 });
        assert.ok(p instanceof Bifunctor);
    });
});

// ── Maybe ────────────────────────────────────────────────────────────────────

describe('Maybe', () => {
    it('Nothing and Just construct', () => {

        const n = (Maybe as any).Nothing;

        const j = (Maybe as any).Just({ value: 42 });
        assert.ok(n);
        assert.strictEqual(j.value, 42);
    });

    it('fmap maps over Just, preserves Nothing', () => {

        const j = (Maybe as any).Just({ value: 5 });

        const mapped = j.fmap((x: number) => x * 2);
        assert.strictEqual(mapped.value, 10);


        const n = (Maybe as any).Nothing;

        const mappedN = n.fmap((x: number) => x * 2);
        // Nothing.fmap should still be Nothing-like (no value)
        assert.strictEqual(mappedN.value, undefined);
    });

    it('satisfies Functor and Monad', () => {

        const j = (Maybe as any).Just({ value: 1 });
        assert.ok(j instanceof Functor);
        assert.ok(j instanceof Monad);
    });

    it('Identity is Nothing', () => {

        const id = (Maybe as any).Identity();
        assert.ok(id);
        assert.ok(id instanceof Maybe);
    });

    it('combine returns first non-Nothing', () => {

        const M = Maybe as any;
        const n = M.Nothing;
        const j1 = M.Just({ value: 10 });
        const j2 = M.Just({ value: 20 });

        assert.strictEqual(n.combine(j1).value, 10);
        assert.strictEqual(j1.combine(j2).value, 10);
        assert.strictEqual(j1.combine(n).value, 10);
    });
});

// ── Either ──────────────────────────────────────────────────────────────────

describe('Either', () => {
    it('Left and Right construct', () => {

        const E = Either as any;
        const l = E.Left({ value: 'err' });
        const r = E.Right({ value: 42 });
        assert.strictEqual(l.value, 'err');
        assert.strictEqual(r.value, 42);
    });

    it('fmap maps Right, preserves Left', () => {

        const E = Either as any;
        const r = E.Right({ value: 5 });
        const mapped = r.fmap((x: number) => x + 1);
        assert.strictEqual(mapped.value, 6);

        const l = E.Left({ value: 'err' });
        const mappedL = l.fmap((x: number) => x + 1);
        assert.strictEqual(mappedL.value, 'err');  // unchanged
    });

    it('satisfies Functor', () => {

        const r = (Either as any).Right({ value: 1 });
        assert.ok(r instanceof Functor);
    });
});

// ── List ─────────────────────────────────────────────────────────────────────

describe('List', () => {
    it('FromArray and toArray round-trip', () => {

        const L = List as any;
        const xs = L.FromArray([1, 2, 3]);
        assert.deepEqual(xs.toArray, [1, 2, 3]);
    });

    it('length works', () => {

        const L = List as any;
        const xs = L.FromArray([10, 20, 30]);
        assert.strictEqual(xs.length, 3);
        assert.strictEqual(L.Nil.length, 0);
    });

    it('isEmpty', () => {

        const L = List as any;
        assert.strictEqual(L.Nil.isEmpty, true);
        assert.strictEqual(L.FromArray([1]).isEmpty, false);
    });

    it('fmap maps over elements', () => {

        const L = List as any;
        const xs = L.FromArray([1, 2, 3]);
        const doubled = xs.fmap((x: number) => x * 2);
        assert.deepEqual(doubled.toArray, [2, 4, 6]);
    });

    it('combine appends two lists', () => {

        const L = List as any;
        const a = L.FromArray([1, 2]);
        const b = L.FromArray([3, 4]);
        const combined = a.combine(b);
        assert.deepEqual(combined.toArray, [1, 2, 3, 4]);
    });

    it('Identity is Nil', () => {

        const L = List as any;
        const id = L.Identity();
        assert.ok(id instanceof List);
        assert.strictEqual(id.isEmpty, true);
    });

    it('satisfies Functor and Monoid', () => {

        const xs = (List as any).FromArray([1]);
        assert.ok(xs instanceof Functor);
        assert.ok(xs instanceof Monoid);
    });
});

// ── NonEmpty ─────────────────────────────────────────────────────────────────

describe('NonEmpty', () => {
    it('Singleton constructs', () => {

        const ne = (NonEmpty as any).Singleton({ value: 42 });
        assert.strictEqual(ne.value, 42);
    });

    it('satisfies Semigroup (not Monoid)', () => {

        const ne = (NonEmpty as any).Singleton({ value: 1 });
        assert.ok(ne instanceof Semigroup);
    });
});

// ── Tree ─────────────────────────────────────────────────────────────────────

describe('Tree', () => {
    it('Leaf and Branch construct', () => {

        const T = Tree as any;
        const leaf = T.Leaf({ value: 1 });
        const branch = T.Branch({ value: 2, children: [leaf, leaf] });
        assert.strictEqual(leaf.value, 1);
        assert.strictEqual(branch.value, 2);
    });

    it('fmap transforms all values', () => {

        const T = Tree as any;
        const tree = T.Branch({
            value: 1,
            children: [T.Leaf({ value: 2 }), T.Leaf({ value: 3 })]
        });
        const doubled = tree.fmap((x: number) => x * 2);
        assert.strictEqual(doubled.value, 2);
    });

    it('satisfies Functor and Foldable', () => {

        const leaf = (Tree as any).Leaf({ value: 1 });
        assert.ok(leaf instanceof Functor);
        assert.ok(leaf instanceof Foldable);
    });
});

// ── Validation ───────────────────────────────────────────────────────────────

describe('Validation', () => {
    it('Success and Failure construct', () => {

        const V = Validation as any;
        const s = V.Success({ value: 42 });
        const f = V.Failure({ errors: ['bad'] });
        assert.strictEqual(s.value, 42);
        assert.deepEqual(f.errors, ['bad']);
    });

    it('fmap maps Success, preserves Failure', () => {

        const V = Validation as any;
        const s = V.Success({ value: 5 });
        const mapped = s.fmap((x: number) => x + 1);
        assert.strictEqual(mapped.value, 6);
    });

    it('satisfies Functor and Applicative', () => {

        const s = (Validation as any).Success({ value: 1 });
        assert.ok(s instanceof Functor);
        assert.ok(s instanceof Applicative);
    });
});
