/**
 * CommutativeMonoid — Monoid where combine is also commutative.
 *
 * Laws: all Monoid laws plus:
 *   commutativity — a.combine(b) ≡ b.combine(a)
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Monoid } from './Monoid.mjs';

const CommutativeMonoid = protocol(({ Family, fold, unfold: _unfold }) => ({
    [extend]: Monoid,
    combine: fold({
        in: Family,
        out: Family,
        properties: ['commutative']
    })
}));

export { CommutativeMonoid };
