/**
 * Eq — Structural equality protocol.
 *
 * Laws: reflexivity (a.equals(a)), symmetry (a.equals(b) ↔ b.equals(a)),
 * transitivity (a.equals(b) ∧ b.equals(c) → a.equals(c))
 *
 * @module
 */

import { protocol } from '../../index.mjs';

const Eq = protocol(({ family, fold }) => ({
    equals: fold({
        in: family,
        out: Boolean,
        properties: ['reflexive', 'symmetric', 'transitive']
    })
}));

export { Eq };
