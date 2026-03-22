/**
 * Bifunctor — Functor over two type parameters simultaneously.
 *
 * Laws:
 *   identity:    bimap(id, id) ≡ id
 *   composition: bimap(g ∘ f, h ∘ k) ≡ bimap(g, h) ∘ bimap(f, k)
 *
 * @module
 */

import { protocol } from '../../index.mjs';

const Bifunctor = protocol(({ Family, map }) => ({
    bimap: map({
        out: Family,
        properties: ['identity', 'composition']
    })
}));

export { Bifunctor };
