/**
 * BoundedLattice — Lattice with top (greatest) and bottom (least) elements.
 *
 * Laws: all Lattice laws plus:
 *   a.join(Bottom) ≡ a
 *   a.meet(Top) ≡ a
 *   a.join(Top) ≡ Top
 *   a.meet(Bottom) ≡ Bottom
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Lattice } from './Lattice.mjs';

const BoundedLattice = protocol(({ Family, unfold }) => ({
    [extend]: Lattice,
    Top: unfold({ out: Family }),
    Bottom: unfold({ out: Family })
}));

export { BoundedLattice };
