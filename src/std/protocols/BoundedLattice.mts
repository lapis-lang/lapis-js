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

const BoundedLattice = protocol(({ family, fold, unfold }) => ({
    [extend]: Lattice,
    Top: unfold({ out: family }),
    Bottom: unfold({ out: family }),
    // Re-declare join/meet only to add the bounded laws; intra-op properties are inherited from Lattice.
    join: fold({
        in: family,
        out: family,
        properties: ['identity:Bottom', 'absorbing:Top']
    }),
    meet: fold({
        in: family,
        out: family,
        properties: ['identity:Top', 'absorbing:Bottom']
    })
}));

export { BoundedLattice };
