/**
 * Traversable — Foldable with effectful mapping (extends both Foldable and Functor).
 *
 * traverse({ applicative, f }) is "map with effects" — e.g., validating each
 * element of a list with an Applicative effect type. The options bundle carries
 * the target applicative and the mapping function f: A → F B.
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Foldable } from './Foldable.mjs';
import { Functor } from './Functor.mjs';

const Traversable = protocol(({ fold }) => ({
    [extend]: [Foldable, Functor],
    // traverse({ applicative, f }) maps each element through f: A → F B
    // and reassembles the structure inside the applicative F.
    // `in: Object`  — the options bundle { applicative, f }.
    // `out: Object` — the result is F(Structure(B)), an applicative-wrapped value,
    //                 not a bare Family instance.
    traverse: fold({ in: Object, out: Object })
}));

export { Traversable };
