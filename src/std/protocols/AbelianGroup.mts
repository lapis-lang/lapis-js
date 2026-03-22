/**
 * AbelianGroup — Commutative Group.
 *
 * Extends both Group and CommutativeMonoid. The diamond through Monoid is
 * resolved automatically: both parents declare the same `combine` spec
 * (in: Family, out: Family, no contracts) so the runtime merger unions their
 * property sets and `instanceof CommutativeMonoid` works transitively without
 * any extra `[satisfies]` annotation on implementers.
 *
 * combine is re-declared here to make the strengthened postcondition explicit.
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Group } from './Group.mjs';
import { CommutativeMonoid } from './CommutativeMonoid.mjs';

const AbelianGroup = protocol(({ Family, fold }) => ({
    [extend]: [Group, CommutativeMonoid],
    combine: fold({
        in: Family,
        out: Family,
        properties: ['associative', 'commutative', 'identity']
    })
}));

export { AbelianGroup };
