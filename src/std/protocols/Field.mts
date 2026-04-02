/**
 * Field — Ring with a multiplicative inverse for every non-zero element.
 *
 * Laws: all Ring laws plus:
 *   multiplicative inverse — a.multiply(a.reciprocal()) ≡ One  (for a ≠ Zero)
 *   involutory             — a.reciprocal().reciprocal() ≡ a   (for a ≠ Zero)
 *   divide definition      — a.divide(b) ≡ a.multiply(b.reciprocal())
 *
 * Classic instances: ℝ (Num), ℚ, ℂ, finite fields GF(p).
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Ring } from './Ring.mjs';

const Field = protocol(({ family, fold, map }) => ({
    [extend]: Ring,
    reciprocal: map({
        out: family,
        properties: ['involutory']
    }),
    divide: fold({
        in: family,
        out: family
    }),
    // Re-declare multiply to attach the multiplicative inverse law.
    multiply: fold({
        in: family,
        out: family,
        properties: ['inverse:reciprocal:One']
    })
}));

export { Field };
