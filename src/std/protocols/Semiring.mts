/**
 * Semiring — Two monoids (add/Zero and multiply/One) where multiply distributes over add.
 *
 * Laws:
 *   (add, Zero)  form a commutative monoid
 *   (mult, One)  form a monoid
 *   left distributivity  — a.multiply(b.add(c)) ≡ a.multiply(b).add(a.multiply(c))
 *   right distributivity — (a.add(b)).multiply(c) ≡ a.multiply(c).add(b.multiply(c))
 *   left annihilation    — Zero.multiply(a) ≡ Zero
 *   right annihilation   — a.multiply(Zero) ≡ Zero
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
        properties: ['associative', 'commutative', 'identity', 'identity:Zero']
    }),
    Zero: unfold({ out: Family }),
    multiply: fold({
        in: Family,
        out: Family,
        properties: ['associative', 'identity', 'identity:One', 'absorbing:Zero', 'distributive:add']
    }),
    One: unfold({ out: Family })
}));

export { Semiring };
