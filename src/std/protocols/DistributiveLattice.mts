/**
 * DistributiveLattice — Lattice where join distributes over meet and vice versa.
 *
 * Laws: all Lattice laws plus distributivity:
 *   a.join(b.meet(c)) ≡ a.join(b).meet(a.join(c))
 *   a.meet(b.join(c)) ≡ a.meet(b).join(a.meet(c))
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
        properties: ['distributive:meet']
    }),
    meet: fold({
        in: Family,
        out: Family,
        properties: ['distributive:join']
    })
}));

export { DistributiveLattice };
