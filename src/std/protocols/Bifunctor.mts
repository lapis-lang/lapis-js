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

const Bifunctor = protocol(({ family, map }) => ({
    bimap: map({
        out: family,
        properties: ['identity', 'composition']
    })
}));

export { Bifunctor };
