/**
 * Monad — Applicative supporting sequential composition via flatMap.
 *
 * Laws:
 *   left identity  — Pure(a).flatMap(f) ≡ f(a)
 *   right identity — m.flatMap(Pure) ≡ m
 *   associativity  — m.flatMap(f).flatMap(g) ≡ m.flatMap(x => f(x).flatMap(g))
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Applicative } from './Applicative.mjs';

const Monad = protocol(({ family, fold }) => ({
    [extend]: Applicative,
    flatMap: fold({ in: Object, out: family })
}));

export { Monad };
