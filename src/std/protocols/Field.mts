/**
 * Field — Ring with a multiplicative inverse for every non-zero element.
 *
 * Laws: all Ring laws plus:
 *   multiplicative inverse — a.multiply(a.reciprocal) ≡ One  (for a ≠ Zero)
 *   involutory             — a.reciprocal.reciprocal ≡ a     (for a ≠ Zero)
 *   divide definition      — a.divide(b) ≡ a.multiply(b.reciprocal)
 *
 * Precondition contract (enforced by convention):
 *   `reciprocal` and `divide` MUST throw `DemandsError` when called on or with
 *   the zero element. The law checker skips samples that trigger `DemandsError`
 *   (via `tryOp`), so failing to throw will cause the `inverse:reciprocal:One`
 *   law to be checked unsoundly against zero — producing `Infinity`/`NaN` and
 *   silently passing or failing in unpredictable ways.
 *
 * Classic instances: ℝ (Num), ℚ, ℂ, finite fields GF(p).
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Ring } from './Ring.mjs';

const Field = protocol(({ family, fold, map }) => ({
    [extend]: Ring,
    // `reciprocal` is a partial map — MUST throw DemandsError for the zero
    // element. The 'involutory' law and the 'inverse:reciprocal:One' law on
    // multiply are checked via tryOp, which skips DemandsError samples.
    // An implementation that returns Infinity/NaN instead of throwing will
    // produce unsound law verification results.
    reciprocal: map({
        out: family,
        properties: ['involutory']
    }),
    // `divide(other)` MUST throw DemandsError when other is the zero element.
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
