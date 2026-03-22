/**
 * Applicative — Functor with application (extends Functor).
 *
 * Pure lifts a value into the structure.
 * apply applies a wrapped function to a wrapped value.
 *
 * Laws: identity, homomorphism, interchange, composition.
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Functor } from './Functor.mjs';

const Applicative = protocol(({ Family, fold, unfold }) => ({
    [extend]: Functor,
    Pure: unfold({ out: Family }),
    apply: fold({ in: Family, out: Family })
}));

export { Applicative };
