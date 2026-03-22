/**
 * Ord — Total ordering protocol (extends Eq).
 *
 * Laws: antisymmetry, transitivity, totality.
 * compare returns: -1 (less than), 0 (equal), 1 (greater than).
 * equals can be derived: a.equals(b) ≡ a.compare(b) === 0
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Eq } from './Eq.mjs';

const Ord = protocol(({ Family, fold }) => ({
    [extend]: Eq,
    compare: fold({
        in: Family,
        out: Number,
        properties: ['antisymmetric', 'transitive', 'total'],
        ensures: (_self: unknown, _old: unknown, result: unknown) =>
            result === -1 || result === 0 || result === 1
    })
}));

export { Ord };
