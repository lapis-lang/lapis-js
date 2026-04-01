/**
 * Monoid — Semigroup with an identity element.
 *
 * Laws: all Semigroup laws plus:
 *   left identity  — Identity.combine(a) ≡ a
 *   right identity — a.combine(Identity) ≡ a
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Semigroup } from './Semigroup.mjs';

const Monoid = protocol(({ family, fold, unfold }) => ({
    [extend]: Semigroup,
    Identity: unfold({ out: family }),
    combine: fold({
        in: family,
        out: family,
        properties: ['identity', 'identity:Identity']
    })
}));

export { Monoid };
