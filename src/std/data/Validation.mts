/**
 * Validation — an error-accumulating applicative.
 *
 *   Validation ::= Failure(errors) | Success(value)
 *
 * Unlike Either, Validation.apply accumulates errors rather than short-circuiting.
 *
 * IMPORTANT — implicit constraint on errors field:
 *   `apply` requires errors to satisfy Semigroup (`errors.combine(other.errors)`).
 *   This is enforced at runtime via a `demands` precondition on `apply`.
 *
 * Note: Eq is NOT declared here. Subtypes that know their concrete field
 * types should declare [satisfies]: [Eq] explicitly.
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Functor, Applicative, Semigroup } from '../protocols/index.mjs';

const Validation = data(() => ({
    [satisfies]: [Functor, Applicative],
    Failure: { errors: Object },
    Success: { value: Object }
})).ops(({ fold, unfold, family }) => ({

    // ── Functor (maps over Success; Failure propagates unchanged) ─────────
    fmap: fold({ in: Function, out: family })({
        Failure() { return this; },
        // @ts-expect-error — variant-specific return type is a DataInstance subtype
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Success({ value }: any, f: any) { return family.Success({ value: f(value) }); }
    }),

    // ── Applicative (error-accumulating) ──────────────────────────────────
    // Pure(x) → Success(x)
    Pure: unfold({ in: Object, out: family })({
        Failure: () => null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Success: (value: any) => ({ value })
    }),
    // this.apply(vf): vf is Validation(E, fn A→B)
    // Accumulates errors if both are Failure.
    // demands: when this is Failure, errors must satisfy Semigroup.
    apply: fold({
        in: family,
        out: family,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        demands: (self: any) => !('errors' in self) || (self.errors instanceof Semigroup)
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Failure({ errors }: any, vf: any) {
            if (vf !== null && vf !== undefined && 'errors' in vf)
                // Both failures: combine errors (requires errors: Semigroup)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return family.Failure({ errors: (errors as any).combine(vf.errors) });
            // this is Failure, vf is Success(fn): return this Failure
            return this;
        },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Success({ value }: any, vf: any) {
            if (vf !== null && vf !== undefined && 'value' in vf && typeof vf.value === 'function')
                return family.Success({ value: vf.value(value) });
            return vf; // propagate Failure from vf
        }
    })

}));

export { Validation };
