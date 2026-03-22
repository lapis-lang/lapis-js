/**
 * AbelianGroup — Commutative Group.
 *
 * Extends Group with a commutative combine. This is a Group whose binary
 * operation is also commutative. combine is re-declared to add the commutative
 * property (strengthened postcondition).
 *
 * Note: CommutativeMonoid cannot also be listed as a `[extend]` parent due to
 * the single-parent constraint. Implementers should additionally declare
 * `[satisfies]: [CommutativeMonoid]` on their ADT so that
 * `instanceof CommutativeMonoid` works correctly.
 *
 * @module
 */

import { protocol, extend } from '../../index.mjs';
import { Group } from './Group.mjs';

const AbelianGroup = protocol(({ Family, fold }) => ({
    [extend]: Group,
    combine: fold({
        in: Family,
        out: Family,
        properties: ['associative', 'commutative', 'identity']
    })
}));

export { AbelianGroup };
