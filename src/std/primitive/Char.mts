/**
 * Char — single Unicode code point.
 *
 * Represents a single Unicode scalar value (a string of codepoint-length 1).
 * The variant invariant rejects multi-codepoint strings at construction time,
 * correctly handling surrogate pairs and emoji via spread iteration.
 *
 * Satisfies: Eq, Ord (by Unicode code point value)
 *
 * Extras:
 *   char.code          — extracts the raw numeric code point (fold, getter)
 *   Char.FromCode(n)   — constructs a Char from a numeric code point
 *
 * Str is the free monoid over Char: foldMap on List(Char) to Str reconstructs
 * the original string.
 *
 * @module
 */

import { data, satisfies, invariant } from '../../index.mjs';
import { Eq, Ord } from '../protocols/index.mjs';

const Char = data(() => ({
    [satisfies]: [Eq, Ord],
    C: {
        [invariant]: ({ value }: { value: string }) => [...value].length === 1,
        value: String
    }
})).ops(({ fold, unfold, family }) => ({

    // ── Eq ───────────────────────────────────────────────────────────────
    equals: fold({
        in: family,
        out: Boolean
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        C({ value }: any, other: any) {
            return value === other.value;
        }
    }),

    // ── Ord (by Unicode code point) ──────────────────────────────────────
    compare: fold({
        in: family,
        out: Number
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        C({ value }: any, other: any) {
            const a = value.codePointAt(0) as number;
            const b = other.value.codePointAt(0) as number;
            return a < b ? -1 : a > b ? 1 : 0;
        }
    }),

    // ── Extras ───────────────────────────────────────────────────────────
    // code — the Unicode code point as a raw number (getter-style fold)
    code: fold({ out: Number })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        C({ value }: any) { return value.codePointAt(0) as number; }
    }),

    // FromCode — construct a Char from a numeric code point
    FromCode: unfold({ in: Number, out: family })({
        C: (code: number) => ({ value: String.fromCodePoint(code) })
    })

}));

export { Char };
