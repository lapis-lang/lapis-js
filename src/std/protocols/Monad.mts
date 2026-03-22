/**
 * Monad — Applicative with sequencing (extends Applicative).
 *
 * flatMap(f) chains computations that produce wrapped values (bind / >>=).
 *
 * Laws:
 *   left identity:  Pure(a).flatMap(f) ≡ f(a)
 *   right identity: m.flatMap(Pure) ≡ m
 *   associativity:  m.flatMap(f).flatMap(g) ≡ m.flatMap(x => f(x).flatMap(g))
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Applicative } from './Applicative.mjs';

const Monad = protocol(({ Family, fold }) => ({
    [extend]: Applicative,
    flatMap: fold({ in: Object, out: Family })
}));

export { Monad };
