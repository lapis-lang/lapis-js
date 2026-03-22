/**
 * Foldable — Structures that can be folded to a summary value.
 *
 * foldMap(monoid, f) maps each element to a monoid value and combines them.
 * This is the universal fold: toArray, length, sum, etc. are all derivable
 * from foldMap.
 *
 * @module
 */

import { protocol } from '../../index.mjs';

const Foldable = protocol(({ fold }) => ({
    foldMap: fold({ in: Object, out: Object })
}));

export { Foldable };
