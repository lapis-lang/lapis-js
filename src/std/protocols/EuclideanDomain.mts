/**
 * EuclideanDomain — Ring equipped with Euclidean division.
 *
 * Laws: all Ring laws plus:
 *   division algorithm — a ≡ b.multiply(a.div(b)).add(a.mod(b))
 *   gcd               — a.gcd(b) divides both a and b, and is the greatest
 *                       such common divisor
 *
 * Classic instances: ℤ (Int), ℤ[x] (polynomials over integers), 𝔽[x].
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Ring } from './Ring.mjs';

const EuclideanDomain = protocol(({ family, fold }) => ({
    [extend]: Ring,
    div: fold({
        in: family,
        out: family
    }),
    mod: fold({
        in: family,
        out: family
    }),
    gcd: fold({
        in: family,
        out: family
    })
}));

export { EuclideanDomain };
