/**
 * Ring — Semiring where add forms an AbelianGroup.
 *
 * Laws: all Semiring laws plus:
 *   negate(negate(a)) ≡ a  (involutory)
 *   a.add(a.negate) ≡ Zero
 *   a.negate.add(a) ≡ Zero
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Semiring } from './Semiring.mjs';

const Ring = protocol(({ Family, map }) => ({
    [extend]: Semiring,
    negate: map({
        out: Family,
        properties: ['involutory']
    })
}));

export { Ring };
