/**
 * @lapis-lang/lapis-js/std — Standard library barrel.
 *
 * Re-exports all protocols, data types, behavior types, primitives,
 * and derivation utilities.
 *
 * @module
 */

// ── Protocols ────────────────────────────────────────────────────────────────
export { Eq }                   from './protocols/Eq.mjs';
export { Ord }                  from './protocols/Ord.mjs';
export { Semigroup }            from './protocols/Semigroup.mjs';
export { Monoid }               from './protocols/Monoid.mjs';
export { CommutativeMonoid }    from './protocols/CommutativeMonoid.mjs';
export { Group }                from './protocols/Group.mjs';
export { AbelianGroup }         from './protocols/AbelianGroup.mjs';
export { Functor }              from './protocols/Functor.mjs';
export { Bifunctor }            from './protocols/Bifunctor.mjs';
export { Foldable }             from './protocols/Foldable.mjs';
export { Applicative }          from './protocols/Applicative.mjs';
export { Monad }                from './protocols/Monad.mjs';
export { Traversable }          from './protocols/Traversable.mjs';
export { Lattice }              from './protocols/Lattice.mjs';
export { BoundedLattice }       from './protocols/BoundedLattice.mjs';
export { DistributiveLattice }  from './protocols/DistributiveLattice.mjs';
export { Semiring }             from './protocols/Semiring.mjs';
export { Ring }                 from './protocols/Ring.mjs';

// ── Data types ───────────────────────────────────────────────────────────────
export { Pair }       from './data/Pair.mjs';
export { Maybe }      from './data/Maybe.mjs';
export { Either }     from './data/Either.mjs';
export { List }       from './data/List.mjs';
export { NonEmpty }   from './data/NonEmpty.mjs';
export { Tree }       from './data/Tree.mjs';
export { Validation } from './data/Validation.mjs';

// ── Behavior types ───────────────────────────────────────────────────────────
export { Stream } from './behavior/Stream.mjs';
export { LazyMap } from './behavior/LazyMap.mjs';
export { LazySet } from './behavior/LazySet.mjs';

// ── Primitives ───────────────────────────────────────────────────────────────
export { Num }  from './primitive/Num.mjs';
export { Str }  from './primitive/Str.mjs';
export { Bool } from './primitive/Bool.mjs';

