/**
 * Lattice — Two binary operations (join/meet) satisfying absorption.
 *
 * Both join and meet form idempotent commutative semigroups (bands).
 *
 * Laws:
 *   join and meet are each: associative, commutative, idempotent
 *   absorption — a.join(a.meet(b)) ≡ a
 *                a.meet(a.join(b)) ≡ a
 *
 * Lattices underlie Datalog evaluation and static analysis.
 *
 * @module
 */

import { protocol } from '../../index.mjs';

const Lattice = protocol(({ family, fold }) => ({
    join: fold({
        in: family,
        out: family,
        properties: ['associative', 'commutative', 'idempotent', 'absorption:meet']
    }),
    meet: fold({
        in: family,
        out: family,
        properties: ['associative', 'commutative', 'idempotent', 'absorption:join']
    })
}));

export { Lattice };
