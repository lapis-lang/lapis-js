/**
 * Lattice — Join (least upper bound) and meet (greatest lower bound).
 *
 * Both join and meet form idempotent commutative semigroups (bands).
 *
 * Laws:
 *   absorption: a.join(a.meet(b)) ≡ a
 *               a.meet(a.join(b)) ≡ a
 *   join and meet are each: associative, commutative, idempotent
 *
 * Lattices underlie Datalog evaluation and static analysis.
 *
 * @module
 */

import { protocol } from '../../index.mjs';

const Lattice = protocol(({ Family, fold }) => ({
    join: fold({
        in: Family,
        out: Family,
        properties: ['associative', 'commutative', 'idempotent']
    }),
    meet: fold({
        in: Family,
        out: Family,
        properties: ['associative', 'commutative', 'idempotent']
    })
}));

export { Lattice };
