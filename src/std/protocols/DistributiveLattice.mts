/**
 * DistributiveLattice — Lattice where join distributes over meet and vice versa.
 *
 * Laws: all Lattice laws plus distributivity:
 *   a.join(b.meet(c)) ≡ a.join(b).meet(a.join(c))
 *   a.meet(b.join(c)) ≡ a.meet(b).join(a.meet(c))
 *
 * Note: join and meet are re-declared with the `distributive` property added
 * to the property set (strengthened postcondition).
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Lattice } from './Lattice.mjs';

const DistributiveLattice = protocol(({ Family, fold }) => ({
    [extend]: Lattice,
    join: fold({
        in: Family,
        out: Family,
        properties: ['associative', 'commutative', 'idempotent', 'distributive']
    }),
    meet: fold({
        in: Family,
        out: Family,
        properties: ['associative', 'commutative', 'idempotent', 'distributive']
    })
}));

export { DistributiveLattice };
