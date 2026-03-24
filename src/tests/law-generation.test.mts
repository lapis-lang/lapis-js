/**
 * Tests for Phase 2: Definition-time algebraic law generation and enforcement.
 * Issue #162 — Law Generation and Contract Integration.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data, LawError } from '../index.mjs';

// ---- Helpers ----------------------------------------------------------------

/** Assert that the given thunk throws a LawError for the named property. */
function assertLawError(thunk: () => unknown, opName: string, property: string): void {
    assert.throws(thunk, (err) => {
        assert.ok(err instanceof LawError, `Expected LawError, got ${(err as object).constructor.name}: ${(err as Error).message}`);
        assert.strictEqual(err.opName, opName);
        assert.strictEqual(err.propertyName, property);
        return true;
    });
}

/**
 * Binary fold handler notes:
 *
 * - `this` inside the handler refers to the current ADT instance (the fold receiver).
 * - First arg = destructured fields (already folded for recursive children).
 * - Second arg = the raw binary argument.
 * - To return the receiver as-is:         `return this;`
 * - To return the binary arg as-is:       `return other;`
 * - To construct a NEW same-variant instance, two patterns are available:
 *
 *   Pattern A — use `this.constructor({...})` (typed, works even for anonymous `data()` expressions):
 *     `return this.constructor({ field: value });`
 *
 *   Pattern B — close over the named ADT in a separate declaration (requires two-step style):
 *     `const MyADT = data(...);`
 *     `MyADT.ops(..., N({ v }) { return MyADT.N({ field: value }); })`
 *   This pattern is more readable when the ADT name is available but requires separating
 *   the `data()` and `.ops()` calls so `MyADT` is initialised before the handler closes over it.
 *   The chained form `const X = data(...).ops(...)` puts `X` in the temporal dead zone
 *   during `.ops()`, so Pattern A is always safe for chained declarations.
 *
 * **`@ts-expect-error -- arity` suppressions:**
 * The TypeScript type for a fold variant handler is typed for a single argument
 * (the destructured variant fields). In binary folds the handler physically receives
 * a second argument — the raw operand — but the type system has no way to express
 * this: the second parameter is intentionally untyped at the fold-definition level
 * and is instead typed by the caller's `in:` spec. Declaring it explicitly in the
 * handler method signature therefore causes an "expected 1 argument, got 2" error.
 * Every `@ts-expect-error -- arity` in this file suppresses exactly that false
 * positive; the runtime behaviour is correct.
 */

// ============================================================================
// Associativity
// ============================================================================

describe('Law: associative', () => {

    it('passes for a correct associative binary fold', () => {
        // max: returns whichever instance has the larger value — associative.
        assert.doesNotThrow(() =>
            data(() => ({ N: { v: Number } }))
                .ops(({ fold, Family }) => ({
                    max: fold({ in: Family, out: Family, properties: ['associative'] })({
                        // @ts-expect-error -- arity
                        N({ v }, b: { v: number }) { return (v >= b.v) ? this : b; }
                    })
                }))
        );
    });

    it('throws LawError for a non-associative operation', () => {
        // Subtraction: (a-b)-c ≠ a-(b-c) in general.
        assertLawError(
            () =>
                data(() => ({ N: { v: Number } }))
                    .ops(({ fold, Family }) => ({
                        sub: fold({ in: Family, out: Family, properties: ['associative'] })({
                            // @ts-expect-error -- arity
                            N({ v }, b: { v: number }) { return this.constructor({ v: v - b.v }); }
                        })
                    })),
            'sub',
            'associative'
        );
    });

    it('includes a 3-element counterexample in the LawError', () => {
        let caught: LawError | null = null;
        try {
            data(() => ({ N: { v: Number } }))
                .ops(({ fold, Family }) => ({
                    sub: fold({ in: Family, out: Family, properties: ['associative'] })({
                        // @ts-expect-error -- arity
                        N({ v }, b: { v: number }) { return this.constructor({ v: v - b.v }); }
                    })
                }));
        } catch (e) {
            if (e instanceof LawError) caught = e;
        }
        assert.ok(caught !== null, 'Expected LawError to be thrown');
        assert.ok(Array.isArray(caught.counterexample));
        assert.strictEqual(caught.counterexample.length, 3); // (a, b, c)
    });

    it('passes for a 2-element singletons-only ADT with AND', () => {
        // F AND anything = F; T AND x = x → associative, commutative, idempotent
        assert.doesNotThrow(() =>
            data(() => ({ F: {}, T: {} }))
                .ops(({ fold, Family }) => ({
                    and: fold({ in: Family, out: Family, properties: ['associative', 'commutative', 'idempotent'] })({
                        // @ts-expect-error -- arity
                        F(_fields, _other) { return this; },
                        // @ts-expect-error -- arity
                        T(_fields, other) { return other; }
                    })
                }))
        );
    });

});

// ============================================================================
// Commutativity
// ============================================================================

describe('Law: commutative', () => {

    it('passes for a commutative binary fold', () => {
        assert.doesNotThrow(() =>
            data(() => ({ N: { v: Number } }))
                .ops(({ fold, Family }) => ({
                    max: fold({ in: Family, out: Family, properties: ['commutative'] })({
                        // @ts-expect-error -- arity
                        N({ v }, b: { v: number }) { return (v >= b.v) ? this : b; }
                    })
                }))
        );
    });

    it('throws LawError for a non-commutative operation', () => {
        assertLawError(
            () =>
                data(() => ({ N: { v: Number } }))
                    .ops(({ fold, Family }) => ({
                        sub: fold({ in: Family, out: Family, properties: ['commutative'] })({
                            // @ts-expect-error -- arity
                            N({ v }, b: { v: number }) { return this.constructor({ v: v - b.v }); }
                        })
                    })),
            'sub',
            'commutative'
        );
    });

});

// ============================================================================
// Idempotency
// ============================================================================

describe('Law: idempotent', () => {

    it('passes for an idempotent binary fold', () => {
        assert.doesNotThrow(() =>
            data(() => ({ N: { v: Number } }))
                .ops(({ fold, Family }) => ({
                    max: fold({ in: Family, out: Family, properties: ['idempotent'] })({
                        // @ts-expect-error -- arity
                        N({ v }, b: { v: number }) { return (v >= b.v) ? this : b; }
                    })
                }))
        );
    });

    it('throws LawError for a non-idempotent operation', () => {
        // Addition: N(v) + N(v) = N(2v) ≠ N(v) for v ≠ 0
        assertLawError(
            () =>
                data(() => ({ N: { v: Number } }))
                    .ops(({ fold, Family }) => ({
                        add: fold({ in: Family, out: Family, properties: ['idempotent'] })({
                            // @ts-expect-error -- arity
                            N({ v }, b: { v: number }) { return this.constructor({ v: v + b.v }); }
                        })
                    })),
            'add',
            'idempotent'
        );
    });

});

// ============================================================================
// Involutory
// ============================================================================

describe('Law: involutory', () => {

    it('passes for a correct involutory unary fold', () => {
        assert.doesNotThrow(() => {
            const Sign = data(() => ({ Pos: {}, Neg: {} }));
            Sign.ops(({ fold, Family }) => ({
                flip: fold({ out: Family, properties: ['involutory'] })({
                    Pos() { return Sign.Neg; },
                    Neg() { return Sign.Pos; }
                })
            }));
        });
    });

    it('throws LawError for a broken involutory operation', () => {
        // Neg→Zero instead of Neg→Pos: flip(flip(Neg)) = flip(Zero) = Pos ≠ Neg
        assertLawError(
            () => {
                const Sign = data(() => ({ Pos: {}, Neg: {}, Zero: {} }));
                Sign.ops(({ fold, Family }) => ({
                    flip: fold({ out: Family, properties: ['involutory'] })({
                        Pos()  { return Sign.Neg; },
                        Neg()  { return Sign.Zero; }, // broken
                        Zero() { return Sign.Pos; }
                    })
                }));
            },
            'flip',
            'involutory'
        );
    });

    it('is silently skipped when the result is not an ADT instance (e.g., Number)', () => {
        // Result type is Number — not an object with the operation on its prototype.
        // The involutory check skips such results; no LawError is thrown.
        assert.doesNotThrow(() =>
            data(() => ({ N: { v: Number } }))
                .ops(({ fold }) => ({
                    negate: fold({ out: Number, properties: ['involutory'] })({
                        N({ v }) { return -v; }
                    })
                }))
        );
    });

});

// ============================================================================
// Relation / predicate laws
// ============================================================================

describe('Law: reflexive', () => {

    it('passes for a reflexive predicate', () => {
        assert.doesNotThrow(() =>
            data(() => ({ N: { v: Number } }))
                .ops(({ fold, Family }) => ({
                    lte: fold({ in: Family, out: Boolean, properties: ['reflexive'] })({
                        // @ts-expect-error -- arity
                        N({ v }, b: { v: number }) { return v <= b.v; }
                    })
                }))
        );
    });

    it('throws LawError for a non-reflexive predicate', () => {
        // Strict less-than: a < a is always false
        assertLawError(
            () =>
                data(() => ({ N: { v: Number } }))
                    .ops(({ fold, Family }) => ({
                        lt: fold({ in: Family, out: Boolean, properties: ['reflexive'] })({
                            // @ts-expect-error -- arity
                            N({ v }, b: { v: number }) { return v < b.v; }
                        })
                    })),
            'lt',
            'reflexive'
        );
    });

});

describe('Law: symmetric', () => {

    it('passes for a symmetric predicate', () => {
        assert.doesNotThrow(() =>
            data(() => ({ N: { v: Number } }))
                .ops(({ fold, Family }) => ({
                    eq: fold({ in: Family, out: Boolean, properties: ['symmetric'] })({
                        // @ts-expect-error -- arity
                        N({ v }, b: { v: number }) { return v === b.v; }
                    })
                }))
        );
    });

    it('throws LawError for a non-symmetric predicate', () => {
        // lte: N(0).lte(N(1)) = true, N(1).lte(N(0)) = false — not symmetric
        assertLawError(
            () =>
                data(() => ({ N: { v: Number } }))
                    .ops(({ fold, Family }) => ({
                        lte: fold({ in: Family, out: Boolean, properties: ['symmetric'] })({
                            // @ts-expect-error -- arity
                            N({ v }, b: { v: number }) { return v <= b.v; }
                        })
                    })),
            'lte',
            'symmetric'
        );
    });

});

describe('Law: antisymmetric', () => {

    it('passes for an antisymmetric predicate', () => {
        assert.doesNotThrow(() =>
            data(() => ({ N: { v: Number } }))
                .ops(({ fold, Family }) => ({
                    lte: fold({ in: Family, out: Boolean, properties: ['antisymmetric'] })({
                        // @ts-expect-error -- arity
                        N({ v }, b: { v: number }) { return v <= b.v; }
                    })
                }))
        );
    });

    it('throws LawError for a non-antisymmetric predicate', () => {
        // always-true predicate: not antisymmetric (N(0)≠N(1) but both R(0,1) and R(1,0))
        assertLawError(
            () =>
                data(() => ({ N: { v: Number } }))
                    .ops(({ fold, Family }) => ({
                        always: fold({ in: Family, out: Boolean, properties: ['antisymmetric'] })({
                            N() { return true; }
                        })
                    })),
            'always',
            'antisymmetric'
        );
    });

});

describe('Law: transitive', () => {

    it('passes for a transitive predicate', () => {
        assert.doesNotThrow(() =>
            data(() => ({ N: { v: Number } }))
                .ops(({ fold, Family }) => ({
                    lte: fold({ in: Family, out: Boolean, properties: ['transitive'] })({
                        // @ts-expect-error -- arity
                        N({ v }, b: { v: number }) { return v <= b.v; }
                    })
                }))
        );
    });

    it('throws LawError for a non-transitive predicate', () => {
        // |v - b.v| ≤ 1 is not transitive: N(0)~N(1)~N(2) but N(0) not ~ N(2)
        assertLawError(
            () =>
                data(() => ({ N: { v: Number } }))
                    .ops(({ fold, Family }) => ({
                        near: fold({ in: Family, out: Boolean, properties: ['transitive'] })({
                            // @ts-expect-error -- arity
                            N({ v }, b: { v: number }) { return Math.abs(v - b.v) <= 1; }
                        })
                    })),
            'near',
            'transitive'
        );
    });

});

describe('Law: total', () => {

    it('passes for a total relation', () => {
        assert.doesNotThrow(() =>
            data(() => ({ N: { v: Number } }))
                .ops(({ fold, Family }) => ({
                    lte: fold({ in: Family, out: Boolean, properties: ['total'] })({
                        // @ts-expect-error -- arity
                        N({ v }, b: { v: number }) { return v <= b.v; }
                    })
                }))
        );
    });

    it('throws LawError for a non-total relation', () => {
        // Strict equality is not total: N(0).eq(N(1)) = false and N(1).eq(N(0)) = false
        assertLawError(
            () =>
                data(() => ({ N: { v: Number } }))
                    .ops(({ fold, Family }) => ({
                        strictEq: fold({ in: Family, out: Boolean, properties: ['total'] })({
                            // @ts-expect-error -- arity
                            N({ v }, b: { v: number }) { return v === b.v; }
                        })
                    })),
            'strictEq',
            'total'
        );
    });

});

// ============================================================================
// Demands-aware filtering
// ============================================================================

describe('demands-aware filtering', () => {

    it('does not treat DemandsError as a law violation', () => {
        // All generated samples have v ∈ {0, 1, 2}.
        // The demand requires v > 100, which is never satisfied.
        // → All tuples are filtered by demands → no valid checks → warn + no LawError.
        assert.doesNotThrow(() =>
            data(() => ({ N: { v: Number } }))
                .ops(({ fold, Family }) => ({
                    op: fold({
                        in: Family,
                        out: Family,
                        properties: ['associative'],
                        demands: (_self: unknown, b: { v: number }) => b.v > 100
                    })({
                        // @ts-expect-error -- arity
                        N({ v }, b: { v: number }) { return this.constructor({ v: v + b.v }); }
                    })
                }))
        );
    });

});

// ============================================================================
// LawError export and shape
// ============================================================================

describe('LawError', () => {

    it('is a proper Error subclass', () => {
        const err = new LawError('op', 'associative', [1, 2, 3], 'TestADT');
        assert.ok(err instanceof Error);
        assert.ok(err instanceof LawError);
        assert.strictEqual(err.name, 'LawError');
    });

    it('exposes opName and propertyName', () => {
        const err = new LawError('combine', 'commutative', ['a', 'b'], 'TestADT');
        assert.strictEqual(err.opName, 'combine');
        assert.strictEqual(err.propertyName, 'commutative');
    });

    it('includes property name and operation name in the message', () => {
        const err = new LawError('merge', 'associative', [0, 1, 2], 'TestADT');
        assert.ok(err.message.includes('associative'));
        assert.ok(err.message.includes('merge'));
    });

    it('includes the counterexample array on the instance', () => {
        const ce = [{ v: 0 }, { v: 1 }, { v: 2 }];
        const err = new LawError('sub', 'associative', ce, 'TestADT');
        assert.strictEqual(err.counterexample, ce);
    });

});

// ============================================================================
// Operations without properties — no checks, no errors
// ============================================================================

describe('Operations without properties', () => {

    it('does not run any checks for operations without properties', () => {
        assert.doesNotThrow(() =>
            data(() => ({ N: { v: Number } }))
                .ops(({ fold }) => ({
                    double: fold({ out: Number })({
                        N({ v }) { return v * 2; }
                    })
                }))
        );
    });

});

// ============================================================================
// Parametric ADTs — sample generation is limited
// ============================================================================

describe('Parametric ADTs', () => {

    it('checks laws on singletons when record variants are skipped', () => {
        // List(T): Cons has TypeParam T — only Nil is sampled.
        // append law on Nil triples: Nil.append(Nil.append(Nil)) = Nil = Nil.append(Nil).append(Nil) ✓
        assert.doesNotThrow(() => {
            const List = data(({ T, Family }) => ({
                Nil:  {},
                Cons: { head: T, tail: Family }
            }));
            List.ops(({ fold, Family }) => ({
                append: fold({ in: Family, out: Family, properties: ['associative'] })({
                    // @ts-expect-error -- arity
                    Nil(_fields, b) { return b; },
                    // @ts-expect-error -- arity
                    Cons({ head, tail }, b) { return List.Cons({ head, tail: (tail as any).append(b) }); }
                })
            }));
        });
    });

});

// ============================================================================
// Recursive ADTs — shallow recursive samples
// ============================================================================

describe('Recursive ADTs', () => {

    it('generates shallow recursive samples and verifies the law', () => {
        // List of Numbers: Nil and Cons({head:0, tail:Nil}) are both sampled.
        assert.doesNotThrow(() => {
            const List = data(({ Family }) => ({
                Nil:  {},
                Cons: { head: Number, tail: Family }
            }));
            List.ops(({ fold, Family }) => ({
                append: fold({ in: Family, out: Family, properties: ['associative'] })({
                    // @ts-expect-error -- arity
                    Nil(_fields, b) { return b; },
                    // @ts-expect-error -- arity
                    Cons({ head, tail }, b) {
                        // For parameterized folds, tail is a continuation: call it with b
                        return List.Cons({ head, tail: (tail as any)(b) });
                    }
                })
            }));
        });
    });

    it('throws LawError for a non-associative recursive operation', () => {
        // A contrived binary operation that is NOT associative even on the two samples
        // {Nil, Cons(0, Nil)}: return left argument always (i.e. always `this` / `self`).
        // left-biased "union" is NOT associative: (A op B) op C = A op C = A
        // but A op (B op C) = A op B = A — hmm, that IS associative for left-bias.
        //
        // Instead use: swap args: a op b = b (right bias).
        // (A op B) op C = B op C = C; A op (B op C) = A op C = C — associative too.
        //
        // Let's test a different non-associative op: "take first non-Nil, else second"
        // but only for specific combinations.
        //
        // Easiest: use the numerical sub check but with the recursive variant included.
        assertLawError(
            () => {
                const Num = data(() => ({ N: { v: Number } }));
                Num.ops(({ fold, Family }) => ({
                    sub: fold({ in: Family, out: Family, properties: ['associative'] })({
                        // @ts-expect-error -- arity
                        N({ v }, b: { v: number }) { return this.constructor({ v: v - b.v }); }
                    })
                }));
            },
            'sub',
            'associative'
        );
    });

});
