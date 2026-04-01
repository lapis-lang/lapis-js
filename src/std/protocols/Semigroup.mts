/**
 * Semigroup — Associative binary operation.
 *
 * Law: associativity — a.combine(b.combine(c)) ≡ a.combine(b).combine(c)
 *
 * @module
 */

import { protocol } from '../../index.mjs';

const Semigroup = protocol(({ family, fold }) => ({
    combine: fold({
        in: family,
        out: family,
        properties: ['associative']
    })
}));

export { Semigroup };
