/**
 * Validation(E, A) — an error-accumulating applicative.
 *
 *   Validation(E, A) ::= Failure(errors: E) | Success(value: A)
 *
 * Unlike Either, Validation.apply accumulates errors rather than short-circuiting.
 * The two behaviours are fundamentally incompatible and cannot coexist on one type:
 * Either is a Monad (sequential, short-circuit on Left), while Validation is only an
 * Applicative (parallel, accumulating) — making it deliberately non-Monad.
 *
 * IMPORTANT — implicit constraint on E:
 *   `apply` requires E to satisfy Semigroup (`errors.combine(other.errors)`).
 *   This is enforced at runtime via a `demands` precondition on `apply`: if `this`
 *   is a `Failure` and `errors` does not satisfy Semigroup, a `DemandsError` is
 *   thrown before the handler runs.  A static type-level guard (e.g.
 *   `Applicative({ E: Semigroup })`) is not yet expressible in the framework;
 *   tracking that as a future enhancement.
 *
 * Satisfies: Functor, Applicative (error-accumulating), Eq({ E: Eq, A: Eq })
 *
 * Primary use case: List.traverse — pass Validation as the applicative to validate
 * every element of a list and collect *all* errors rather than stopping at the first.
 * Secondary: form validation, configuration parsing, batch error reporting.
 *
 * @module
 */

import { data, satisfies } from '../../index.mjs';
import { Functor, Applicative, Eq, Semigroup } from '../protocols/index.mjs';

const Validation = data(({ E, A }) => ({
    [satisfies]: [
        Functor,
        Applicative,
        Eq({ E: Eq, A: Eq })
    ],
    Failure: { errors: E },
    Success: { value: A }
})).ops(({ fold, unfold, map, Family, A }) => ({

    // ── Functor (maps over Success; Failure propagates unchanged) ─────────
    fmap: map({ out: Family })({
        A: (x: unknown, f: (a: unknown) => unknown) => f(x)
    }),

    // ── Applicative (error-accumulating) ──────────────────────────────────
    // Pure(x) → Success(x)
    Pure: unfold({ in: Object, out: Family })({
        Failure: () => null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Success: (value: any) => ({ value })
    }),
    // this.apply(vf): vf is Validation(E, fn A→B)
    // Accumulates errors if both are Failure.
    // demands: when this is Failure, E must satisfy Semigroup for error accumulation.
    apply: fold({
        in: Family,
        out: Family,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        demands: (self: any) => !('errors' in self) || (self.errors instanceof Semigroup)
    })({
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Failure({ errors }: any, vf: any) {
            if (vf !== null && vf !== undefined && 'errors' in vf)
                // Both failures: combine errors (requires E: Semigroup)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (Family(A) as any).Failure({ errors: (errors as any).combine(vf.errors) });
            // this is Failure, vf is Success(fn): return this Failure
            return this;
        },
        // @ts-expect-error — binary fold handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Success({ value }: any, vf: any) {
            if (vf !== null && vf !== undefined && 'value' in vf && typeof vf.value === 'function')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (Family(A) as any).Success({ value: vf.value(value) });
            return vf; // propagate Failure from vf
        }
    }),

    // ── Eq (conditional: E and A must satisfy Eq) ─────────────────────────
    equals: fold({ in: Object, out: Boolean })({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Failure({ errors }: any, other: any) {
            return other !== null && other !== undefined &&
                   this.constructor === other.constructor &&
                   // eslint-disable-next-line @typescript-eslint/no-explicit-any
                   (errors as any).equals(other.errors);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Success({ value }: any, other: any) {
            return other !== null && other !== undefined &&
                   this.constructor === other.constructor &&
                   // eslint-disable-next-line @typescript-eslint/no-explicit-any
                   (value as any).equals(other.value);
        }
    })

}));

export { Validation };
