/**
 * Pair(T, U) — a simple product type with two typed fields.
 *
 * Satisfies: Bifunctor, Eq({ T: Eq, U: Eq })
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Bifunctor, Eq } from '../protocols/index.mjs';

const Pair = data(({ T, U }) => ({
    [satisfies]: [Bifunctor, Eq({ T: Eq, U: Eq })],
    MakePair: { first: T, second: U }
})).ops(({ map, fold, Family }) => ({
    // Bifunctor: bimap(f, g) applies f to first and g to second
    bimap: map({ out: Family })({
        T: (x: unknown, f: (a: unknown) => unknown, _g: unknown) => f(x),
        U: (x: unknown, _f: unknown, g: (a: unknown) => unknown) => g(x)
    }),
    // Eq: structural equality on both fields
    equals: fold({ in: Family, out: Boolean })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        MakePair({ first, second }: any, other: any) {
            return other !== null && other !== undefined &&
                   this.constructor === other.constructor &&
                   // eslint-disable-next-line @typescript-eslint/no-explicit-any
                   (first as any).equals(other.first) &&
                   // eslint-disable-next-line @typescript-eslint/no-explicit-any
                   (second as any).equals(other.second);
        }
    })
}));

export { Pair };
