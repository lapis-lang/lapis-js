/**
 * Standard Library — Protocol Tests
 *
 * Verifies that all 18 protocols can be created, have the correct requiredOps,
 * and maintain inheritance chains.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Eq }                   from '../std/protocols/Eq.mjs';
import { Ord }                  from '../std/protocols/Ord.mjs';
import { Semigroup }            from '../std/protocols/Semigroup.mjs';
import { Monoid }               from '../std/protocols/Monoid.mjs';
import { CommutativeMonoid }    from '../std/protocols/CommutativeMonoid.mjs';
import { Group }                from '../std/protocols/Group.mjs';
import { AbelianGroup }         from '../std/protocols/AbelianGroup.mjs';
import { Functor }              from '../std/protocols/Functor.mjs';
import { Bifunctor }            from '../std/protocols/Bifunctor.mjs';
import { Foldable }             from '../std/protocols/Foldable.mjs';
import { Applicative }          from '../std/protocols/Applicative.mjs';
import { Monad }                from '../std/protocols/Monad.mjs';
import { Traversable }          from '../std/protocols/Traversable.mjs';
import { Lattice }              from '../std/protocols/Lattice.mjs';
import { BoundedLattice }       from '../std/protocols/BoundedLattice.mjs';
import { DistributiveLattice }  from '../std/protocols/DistributiveLattice.mjs';
import { Semiring }             from '../std/protocols/Semiring.mjs';
import { Ring }                 from '../std/protocols/Ring.mjs';

describe('Std Protocols — existence and requiredOps', () => {
    it('Eq has equals', () => {
        assert.ok(Eq.requiredOps.has('equals'));
    });

    it('Ord extends Eq (has compare + equals)', () => {
        assert.ok(Ord.requiredOps.has('compare'));
        assert.ok(Ord.requiredOps.has('equals'));
        assert.strictEqual(Ord.parentProtocol, Eq);
    });

    it('Semigroup has combine', () => {
        assert.ok(Semigroup.requiredOps.has('combine'));
    });

    it('Monoid extends Semigroup (has Identity + combine)', () => {
        assert.ok(Monoid.requiredOps.has('Identity'));
        assert.ok(Monoid.requiredOps.has('combine'));
        assert.strictEqual(Monoid.parentProtocol, Semigroup);
    });

    it('CommutativeMonoid extends Monoid', () => {
        assert.ok(CommutativeMonoid.requiredOps.has('combine'));
        assert.strictEqual(CommutativeMonoid.parentProtocol, Monoid);
    });

    it('Group extends Monoid (adds invert)', () => {
        assert.ok(Group.requiredOps.has('invert'));
        assert.ok(Group.requiredOps.has('combine'));
        assert.ok(Group.requiredOps.has('Identity'));
        assert.strictEqual(Group.parentProtocol, Monoid);
    });

    it('AbelianGroup extends Group', () => {
        assert.ok(AbelianGroup.requiredOps.has('invert'));
        assert.ok(AbelianGroup.requiredOps.has('combine'));
        assert.strictEqual(AbelianGroup.parentProtocol, Group);
    });

    it('Functor has fmap', () => {
        assert.ok(Functor.requiredOps.has('fmap'));
    });

    it('Bifunctor has bimap', () => {
        assert.ok(Bifunctor.requiredOps.has('bimap'));
    });

    it('Foldable has foldMap', () => {
        assert.ok(Foldable.requiredOps.has('foldMap'));
    });

    it('Applicative extends Functor (has Pure, apply, fmap)', () => {
        assert.ok(Applicative.requiredOps.has('Pure'));
        assert.ok(Applicative.requiredOps.has('apply'));
        assert.ok(Applicative.requiredOps.has('fmap'));
        assert.strictEqual(Applicative.parentProtocol, Functor);
    });

    it('Monad extends Applicative (adds flatMap)', () => {
        assert.ok(Monad.requiredOps.has('flatMap'));
        assert.ok(Monad.requiredOps.has('Pure'));
        assert.strictEqual(Monad.parentProtocol, Applicative);
    });

    it('Traversable extends Foldable (has traverse + fmap + foldMap)', () => {
        assert.ok(Traversable.requiredOps.has('traverse'));
        assert.ok(Traversable.requiredOps.has('fmap'));
        assert.ok(Traversable.requiredOps.has('foldMap'));
        assert.strictEqual(Traversable.parentProtocol, Foldable);
    });

    it('Lattice has join and meet', () => {
        assert.ok(Lattice.requiredOps.has('join'));
        assert.ok(Lattice.requiredOps.has('meet'));
    });

    it('BoundedLattice extends Lattice (adds Top, Bottom)', () => {
        assert.ok(BoundedLattice.requiredOps.has('Top'));
        assert.ok(BoundedLattice.requiredOps.has('Bottom'));
        assert.ok(BoundedLattice.requiredOps.has('join'));
        assert.ok(BoundedLattice.requiredOps.has('meet'));
        assert.strictEqual(BoundedLattice.parentProtocol, Lattice);
    });

    it('DistributiveLattice extends Lattice', () => {
        assert.ok(DistributiveLattice.requiredOps.has('join'));
        assert.ok(DistributiveLattice.requiredOps.has('meet'));
        assert.strictEqual(DistributiveLattice.parentProtocol, Lattice);
    });

    it('Semiring has add, Zero, multiply, One', () => {
        assert.ok(Semiring.requiredOps.has('add'));
        assert.ok(Semiring.requiredOps.has('Zero'));
        assert.ok(Semiring.requiredOps.has('multiply'));
        assert.ok(Semiring.requiredOps.has('One'));
    });

    it('Ring extends Semiring (adds negate)', () => {
        assert.ok(Ring.requiredOps.has('negate'));
        assert.ok(Ring.requiredOps.has('add'));
        assert.strictEqual(Ring.parentProtocol, Semiring);
    });
});

describe('Std Protocols — algebraic properties', () => {
    it('Eq.equals has reflexive, symmetric, transitive', () => {
        const props = Eq.requiredOps.get('equals')!.properties;
        assert.ok(props.has('reflexive'));
        assert.ok(props.has('symmetric'));
        assert.ok(props.has('transitive'));
    });

    it('Semigroup.combine has associative', () => {
        const props = Semigroup.requiredOps.get('combine')!.properties;
        assert.ok(props.has('associative'));
    });

    it('Monoid.combine inherits associative + adds identity', () => {
        const props = Monoid.requiredOps.get('combine')!.properties;
        assert.ok(props.has('associative'));
        assert.ok(props.has('identity'));
    });

    it('CommutativeMonoid.combine adds commutative', () => {
        const props = CommutativeMonoid.requiredOps.get('combine')!.properties;
        assert.ok(props.has('commutative'));
    });

    it('Functor.fmap has identity + composition', () => {
        const props = Functor.requiredOps.get('fmap')!.properties;
        assert.ok(props.has('identity'));
        assert.ok(props.has('composition'));
    });

    it('Lattice.join has associative, commutative, idempotent', () => {
        const props = Lattice.requiredOps.get('join')!.properties;
        assert.ok(props.has('associative'));
        assert.ok(props.has('commutative'));
        assert.ok(props.has('idempotent'));
    });
});
