/**
 * Applicative — Functor that supports lifting values and sequential application.
 *
 * `Pure` lifts a value into the structure.
 * `apply` applies a wrapped function to a wrapped value.
 *
 * Laws:
 *   identity     — Pure(id).apply(v) ≡ v
 *   homomorphism — Pure(f).apply(Pure(x)) ≡ Pure(f(x))
 *   interchange  — u.apply(Pure(y)) ≡ Pure(f => f(y)).apply(u)
 *   composition  — Pure(∘).apply(u).apply(v).apply(w) ≡ u.apply(v.apply(w))
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
