/**
 * Group — Monoid with an inverse operation.
 *
 * Laws: all Monoid laws plus:
 *   a.combine(a.invert) ≡ Identity
 *   a.invert.combine(a) ≡ Identity
 *   invert is involutory: a.invert.invert ≡ a
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Monoid } from './Monoid.mjs';

const Group = protocol(({ Family, map }) => ({
    [extend]: Monoid,
    invert: map({
        out: Family,
        properties: ['involutory']
    })
}));

export { Group };
