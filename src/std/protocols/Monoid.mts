/**
 * Monoid — Semigroup with identity element.
 *
 * Laws: combine is associative; Identity is a left and right identity for combine.
 *   a.combine(Identity) ≡ a
 *   Identity.combine(a) ≡ a
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Semigroup } from './Semigroup.mjs';

const Monoid = protocol(({ Family, fold, unfold }) => ({
    [extend]: Semigroup,
    Identity: unfold({ out: Family }),
    combine: fold({
        in: Family,
        out: Family,
        properties: ['associative', 'identity']
    })
}));

export { Monoid };
