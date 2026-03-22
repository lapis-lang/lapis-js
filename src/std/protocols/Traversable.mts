/**
 * Traversable — Foldable with effectful mapping (extends both Foldable and Functor).
 *
 * traverse(applicative, f) is "map with effects" — e.g., validating each
 * element of a list with an Applicative effect type.
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Foldable } from './Foldable.mjs';
import { Functor } from './Functor.mjs';

const Traversable = protocol(({ Family, fold }) => ({
    [extend]: [Foldable, Functor],
    // traverse(f) maps each element through an effectful function f: A → F B
    // and reassembles the structure inside the applicative F.
    // `in: Function` — the mapping f (runtime-checks the argument is callable).
    // `out: Family`  — the result is still a Family-shaped structure (wrapped in F).
    traverse: fold({ in: Function, out: Family })
}));

export { Traversable };
