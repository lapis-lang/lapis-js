/**
 * Group — Monoid where every element has an inverse.
 *
 * Laws: all Monoid laws plus:
 *   left inverse  — a.invert().combine(a) ≡ Identity
 *   right inverse — a.combine(a.invert()) ≡ Identity
 *   involutory    — a.invert().invert() ≡ a
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Monoid } from './Monoid.mjs';

const Group = protocol(({ family, fold, map }) => ({
    [extend]: Monoid,
    invert: map({
        out: family,
        properties: ['involutory']
    }),
    // Re-declare combine to add the inverse law
    combine: fold({
        in: family,
        out: family,
        properties: ['inverse:invert:Identity']
    })
}));

export { Group };
