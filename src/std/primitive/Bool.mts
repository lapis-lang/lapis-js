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

const Bool = data(_Family => ({
    [satisfies]: [Eq, Ord, BoundedLattice],
    False: {},
    True:  {}
})).ops(({ fold, unfold, family }) => ({

    // ── From — wrap a native boolean ─────────────────────────────────────
    From: unfold({ in: Boolean, out: family })({
        True:  (v: boolean) => v ? {} : null,
        False: (v: boolean) => v ? null : {}
    }),

    // ── Eq ───────────────────────────────────────────────────────────────
    equals: fold({
        in: family,
        out: Boolean
    })({
    // @ts-expect-error -- arity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        False({}, other: any) { return this.constructor === other?.constructor; },
        // @ts-expect-error -- arity
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        True({},  other: any) { return this.constructor === other?.constructor; }
    }),

    // ── Ord (False < True) ───────────────────────────────────────────────
    compare: fold({
        in: family,
        out: Number
    })({
    // @ts-expect-error -- arity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        False({}, other: any) { return this.constructor === other?.constructor ? 0 : -1; },
        // @ts-expect-error -- arity
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        True({},  other: any) { return this.constructor === other?.constructor ? 0 :  1; }
    }),

    // ── Lattice / Boolean algebra ─────────────────────────────────────────
    // meet ≡ and: False AND x = False,  True AND x = x
    meet: fold({ in: family, out: family })({
        // @ts-expect-error -- arity
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        False({}, _other: any) { return this;  },
        // @ts-expect-error -- arity
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        True({},  other: any)  { return other; }
    }).as('and'),
    // join ≡ or:  False OR x = x,  True OR x = True
    join: fold({ in: family, out: family })({
        // @ts-expect-error -- arity
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        False({}, other: any)  { return other; },
        // @ts-expect-error -- arity
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        True({},  _other: any) { return this;  }
    }).as('or'),

    // ── BoundedLattice ───────────────────────────────────────────────────
    Top: unfold({ out: family })({
        True: () => ({})
    }),
    Bottom: unfold({ out: family })({
        False: () => ({})
    }),

    // ── Boolean algebra (derived operations) ─────────────────────────────
    // not — unary complement: False.not = True, True.not = False
    not: fold({ out: family })({
        False() { return family.True;  },
        True()  { return family.False; }
    }),
    // xor — exclusive or: F xor x = x,  T xor x = ¬x
    xor: fold({ in: family, out: family })({
    // @ts-expect-error -- arity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        False({}, other: any)  { return other;     },
        // @ts-expect-error -- arity
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        True({},  other: any)  { return other.not; }
    }),
    // implies — logical implication: F → x = T,  T → x = x
    implies: fold({ in: family, out: family })({
    // @ts-expect-error -- arity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        False({}, _other: any) { return family.True;  },
        // @ts-expect-error -- arity
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        True({},  other: any)  { return other; }
    })

}));

export { Bool };
