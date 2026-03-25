/**
 * Ring — Semiring where add forms an AbelianGroup.
 *
 * Laws: all Semiring laws plus:
 *   left additive inverse  — a.negate().add(a) ≡ Zero
 *   right additive inverse — a.add(a.negate()) ≡ Zero
 *   involutory             — a.negate().negate() ≡ a
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Semiring } from './Semiring.mjs';

const Ring = protocol(({ Family, fold, map }) => ({
    [extend]: Semiring,
    negate: map({
        out: Family,
        properties: ['involutory']
    }),
    // Re-declare add to attach the inverse law (negate is the via-operation).
    add: fold({
        in: Family,
        out: Family,
        properties: ['inverse:negate:Zero']
    })
}));

export { Ring };
