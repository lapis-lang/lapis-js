/**
 * Functor — Structure-preserving map over a type parameter.
 *
 * Laws:
 *   identity:    fmap(id) ≡ id
 *   composition: fmap(g ∘ f) ≡ fmap(g) ∘ fmap(f)
 *
 * The composition law enables map-map fusion.
 *
 * @module
 */

import { protocol } from '../../index.mjs';

const Functor = protocol(({ Family, map }) => ({
    fmap: map({
        out: Family,
        properties: ['identity', 'composition']
    })
}));

export { Functor };
