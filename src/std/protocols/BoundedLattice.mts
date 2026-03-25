/**
 * BoundedLattice — Lattice with top (greatest) and bottom (least) elements.
 *
 * Laws: all Lattice laws plus:
 *   join identity   — a.join(Bottom) ≡ a
 *   meet identity   — a.meet(Top) ≡ a
 *   join absorbing  — a.join(Top) ≡ Top
 *   meet absorbing  — a.meet(Bottom) ≡ Bottom
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Lattice } from './Lattice.mjs';

const BoundedLattice = protocol(({ Family, fold, unfold }) => ({
    [extend]: Lattice,
    Top: unfold({ out: Family }),
    Bottom: unfold({ out: Family }),
    // Re-declare join/meet only to add the bounded laws; intra-op properties are inherited from Lattice.
    join: fold({
        in: Family,
        out: Family,
        properties: ['identity:Bottom', 'absorbing:Top']
    }),
    meet: fold({
        in: Family,
        out: Family,
        properties: ['identity:Top', 'absorbing:Bottom']
    })
}));

export { BoundedLattice };
