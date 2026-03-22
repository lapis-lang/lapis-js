/**
 * Semigroup — Associative binary operation.
 *
 * Law: associativity — a.combine(b.combine(c)) ≡ a.combine(b).combine(c)
 *
 * @module
 */

import { protocol } from '../../index.mjs';

const Semigroup = protocol(({ Family, fold }) => ({
    combine: fold({
        in: Family,
        out: Family,
        properties: ['associative']
    })
}));

export { Semigroup };
