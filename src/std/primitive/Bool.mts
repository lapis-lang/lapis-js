/**
 * Bool — boolean wrapper satisfying algebraic protocols.
 *
 * Constructors: Bool.True, Bool.False (singletons)
 * Factory:      Bool.From(nativeBool)
 *
 * Boolean algebra: not (getter), and, or, xor, implies
 * Note: and ≡ meet, or ≡ join (lattice names kept for protocol conformance).
 *
 * Satisfies: Eq, Ord, Lattice (join = OR, meet = AND),
 * BoundedLattice (Top = True, Bottom = False)
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Eq, Ord, BoundedLattice } from '../protocols/index.mjs';

const Bool = data(({ Family: _Family }) => ({
    [satisfies]: [Eq, Ord, BoundedLattice],
    False: {},
    True:  {}
})).ops(({ fold, unfold, Family }) => {

    // Shared fold bodies — aliased by and≡meet and or≡join
     
    const _meet = fold({ in: Family, out: Family })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        False(_: any, _other: any) { return this;  },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        True(_: any, other: any)   { return other; }
    });

     
    const _join = fold({ in: Family, out: Family })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        False(_: any, other: any)  { return other; },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        True(_: any, _other: any)  { return this;  }
    });

    return {

        // ── From — wrap a native boolean ─────────────────────────────────────
        From: unfold({ in: Boolean, out: Family })({
            True:  (v: boolean) => v ? {} : null,
            False: (v: boolean) => v ? null : {}
        }),

        // ── Eq ───────────────────────────────────────────────────────────────
        equals: fold({
            in: Family,
            out: Boolean
        })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
            False(_: any, other: any) { return this.constructor === other?.constructor; },
            // @ts-expect-error — binary fold handler
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            True(_: any, other: any)  { return this.constructor === other?.constructor; }
        }),

        // ── Ord (False < True) ───────────────────────────────────────────────
        compare: fold({
            in: Family,
            out: Number
        })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
            False(_: any, other: any) { return this.constructor === other?.constructor ? 0 : -1; },
            // @ts-expect-error — binary fold handler
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            True(_: any, other: any)  { return this.constructor === other?.constructor ? 0 :  1; }
        }),

        // ── Lattice / Boolean algebra (shared declarations) ──────────────────
        // join ≡ or:  False OR x = x,  True OR x = True
        join: _join,  or: _join,
        // meet ≡ and: False AND x = False,  True AND x = x
        meet: _meet,  and: _meet,

        // ── BoundedLattice ───────────────────────────────────────────────────
        Top: unfold({ out: Family })({
            True: () => ({})
        }),
        Bottom: unfold({ out: Family })({
            False: () => ({})
        }),

        // ── Boolean algebra (derived operations) ─────────────────────────────
        // not — unary complement: False.not = True, True.not = False
        not: fold({ out: Family })({
            False() { return Family.True;  },
            True()  { return Family.False; }
        }),
        // xor — exclusive or: F xor x = x,  T xor x = ¬x
        xor: fold({ in: Family, out: Family })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
            False(_: any, other: any)  { return other;     },
            // @ts-expect-error — binary fold handler
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            True(_: any, other: any)   { return other.not; }
        }),
        // implies — logical implication: F → x = T,  T → x = x
        implies: fold({ in: Family, out: Family })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
            False(_: any, _other: any) { return Family.True;  },
            // @ts-expect-error — binary fold handler
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            True(_: any, other: any)   { return other; }
        })

    };
});

export { Bool };
