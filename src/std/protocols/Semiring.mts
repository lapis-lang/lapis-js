/**
 * Semiring — Two operations (add, multiply) with identity elements.
 *
 * Laws:
 *   add forms a CommutativeMonoid with Zero
 *   multiply forms a Monoid with One
 *   multiply distributes over add
 *   Zero absorbs multiply: Zero.multiply(a) ≡ Zero ≡ a.multiply(Zero)
 *
 * Underlies shortest-path, reachability, and Datalog evaluation
 * (see Dolan, "Fun with Semirings").
 *
 * @module
 */

import { protocol } from '../../index.mjs';

const Semiring = protocol(({ Family, fold, unfold }) => ({
    add: fold({
        in: Family,
        out: Family,
        properties: ['associative', 'commutative', 'identity']
    }),
    Zero: unfold({ out: Family }),
    multiply: fold({
        in: Family,
        out: Family,
        properties: ['associative', 'identity', 'absorbing']
    }),
    One: unfold({ out: Family })
}));

export { Semiring };
