/**
 * Tests for multi-parent protocol inheritance (Phase 1 of issue #161).
 *
 * Covers:
 * - `[extend]: [ParentA, ParentB]` on protocols — union of requiredOps
 * - Single-parent array `[extend]: [Parent]` backward compatibility
 * - `parentProtocols` array property
 * - `parentProtocol` backward-compat first-parent accessor
 * - `requiredTypeParams` union from all parents
 * - Diamond resolution: identical specs (same kind + matching in/out/contracts) merge silently
 * - Diamond resolution: same kind but incompatible specs throw at protocol definition time
 * - Diamond resolution: different kinds throw at protocol definition time
 * - Transitive instanceof / conformance registry with multiple parents
 * - Protocol-level [invariant] checked for all parents transitively
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    data,
    behavior,
    protocol,
    satisfies,
    extend,
    invariant,
    fold,
    unfold
} from '../index.mjs';

/** Cast a protocol to the constructor type required by `instanceof` */
function asClass(p: unknown): abstract new () => unknown {
    return p as unknown as abstract new () => unknown;
}

// =============================================================================
// Fixtures
// =============================================================================

const Semigroup = protocol(({ Family, fold: f }) => ({
    combine: f({ in: Family, out: Family })
}));

const Monoid = protocol(({ Family, fold: f, unfold: u }) => ({
    [extend]: Semigroup,
    Identity: u({ out: Family })
}));

const Group = protocol(({ Family, fold: f }) => ({
    [extend]: Monoid,
    inverse: f({ out: Family })
}));

const CommutativeMonoid = protocol(({ Family, fold: f }) => ({
    [extend]: Monoid
    // no new ops — just the commutative law annotation (handled via [properties] elsewhere)
}));

// =============================================================================
// 1. Basic two-parent protocol
// =============================================================================

describe('multi-parent protocol [extend]', () => {
    it('parentProtocols array has both parents', () => {
        const AbelianGroup = protocol(({ Family, fold: f }) => ({
            [extend]: [Group, CommutativeMonoid]
        }));

        assert.strictEqual(AbelianGroup.parentProtocols.length, 2);
        assert.strictEqual(AbelianGroup.parentProtocols[0], Group);
        assert.strictEqual(AbelianGroup.parentProtocols[1], CommutativeMonoid);
    });

    it('parentProtocol is the first parent (backward compat)', () => {
        const AbelianGroup = protocol(({ Family, fold: f }) => ({
            [extend]: [Group, CommutativeMonoid]
        }));

        assert.strictEqual(AbelianGroup.parentProtocol, Group);
    });

    it('requiredOps is the union of both parents\' ops (including grandparents)', () => {
        const AbelianGroup = protocol(({ Family, fold: f }) => ({
            [extend]: [Group, CommutativeMonoid]
        }));

        // From Semigroup (via both paths)
        assert.ok(AbelianGroup.requiredOps.has('combine'));
        // From Monoid
        assert.ok(AbelianGroup.requiredOps.has('Identity'));
        // From Group
        assert.ok(AbelianGroup.requiredOps.has('inverse'));
    });

    it('child can add new ops on top of multi-parent inheritance', () => {
        const Ring = protocol(({ Family, fold: f }) => ({
            [extend]: [Group, CommutativeMonoid],
            multiply: f({ in: Family, out: Family })
        }));

        assert.ok(Ring.requiredOps.has('combine'));
        assert.ok(Ring.requiredOps.has('Identity'));
        assert.ok(Ring.requiredOps.has('inverse'));
        assert.ok(Ring.requiredOps.has('multiply'));
        assert.strictEqual(Ring.requiredOps.get('multiply')?.kind, 'fold');
    });

    it('single-element array is equivalent to a plain single-parent [extend]', () => {
        const MonoidArr = protocol(({ Family, fold: f, unfold: u }) => ({
            [extend]: [Semigroup],
            Identity: u({ out: Family })
        }));

        assert.strictEqual(MonoidArr.parentProtocols.length, 1);
        assert.strictEqual(MonoidArr.parentProtocols[0], Semigroup);
        assert.ok(MonoidArr.requiredOps.has('combine'));
        assert.ok(MonoidArr.requiredOps.has('Identity'));
    });

    it('zero-parent (no [extend]) gives empty parentProtocols', () => {
        const Standalone = protocol(({ Family, fold: f }) => ({
            check: f({ out: Boolean })
        }));

        assert.strictEqual(Standalone.parentProtocols.length, 0);
        assert.strictEqual(Standalone.parentProtocol, null);
    });

    it('throws TypeError when [extend] contains a non-protocol value', () => {
        assert.throws(
            () => protocol(({ Family, fold: f }) => ({
                [extend]: [Semigroup, 42 as unknown as typeof Semigroup],
                extra: f({ out: Boolean })
            })),
            TypeError
        );
    });
});

// =============================================================================
// 2. requiredTypeParams union from all parents
// =============================================================================

describe('requiredTypeParams union across parents', () => {
    it('unions type params from two parents', () => {
        const PA = protocol(({ T, Family, fold: f }) => ({
            first: f({ out: Family })
        }));

        const PB = protocol(({ U, Family, fold: f }) => ({
            second: f({ out: Family })
        }));

        const Child = protocol(({ Family, fold: f }) => ({
            [extend]: [PA, PB]
        }));

        assert.ok(Child.requiredTypeParams.has('T'));
        assert.ok(Child.requiredTypeParams.has('U'));
    });

    it('does not duplicate type params appearing in both parents', () => {
        const PA = protocol(({ T, Family, fold: f }) => ({
            first: f({ out: Family })
        }));

        const PB = protocol(({ T, Family, fold: f }) => ({
            second: f({ out: Family })
        }));

        const Child = protocol(({ Family, fold: f }) => ({
            [extend]: [PA, PB]
        }));

        // T appears in both but requiredTypeParams is a Set — should be one entry
        assert.strictEqual([...Child.requiredTypeParams].filter(x => x === 'T').length, 1);
    });
});

// =============================================================================
// 3. Diamond resolution
// =============================================================================

describe('diamond protocol resolution', () => {
    it('identical op from two paths merges silently (no error)', () => {
        // Both Group and CommutativeMonoid inherit `combine` from Monoid (same kind)
        assert.doesNotThrow(() => {
            protocol(({ Family, fold: f }) => ({
                [extend]: [Group, CommutativeMonoid]
            }));
        });
    });

    it('same op with matching TypeParam names in both parents merges silently', () => {
        // Two independent protocols both declare `transform: fold({ in: T, out: T })`.
        // The T markers have different object identities (separate protocol() calls)
        // but the same param name, so typeRefEqual must treat them as equal.
        const PA = protocol(({ T, Family, fold: f }) => ({
            transform: f({ in: T, out: T })
        }));

        const PB = protocol(({ T, Family, fold: f }) => ({
            transform: f({ in: T, out: T })
        }));

        assert.doesNotThrow(() => {
            protocol(({ Family, fold: f }) => ({
                [extend]: [PA, PB]
            }));
        });
    });

    it('properties are unioned when same op comes from two paths', () => {
        // PA uses the same in/out shape as Semigroup.combine so the specs are
        // compatible and merge silently (both FamilyRef values normalise as equal).
        const PA = protocol(({ Family, fold: f }) => ({
            combine: f({ in: Family, out: Family })
        }));

        const Child = protocol(({ Family, fold: f }) => ({
            [extend]: [PA, Semigroup]
        }));

        assert.ok(Child.requiredOps.has('combine'));
    });

    it('throws when same op name appears with different kinds in two parents', () => {
        // Create two protocols where 'foo' has different kinds
        const PA = protocol(({ Family, fold: f }) => ({
            foo: f({ out: Boolean })   // kind = 'fold'
        }));

        const PB = protocol(({ Family, unfold: u }) => ({
            Foo: u({ out: Family })    // kind = 'unfold'
        }));

        // Add a fold 'foo' to PB by creating a bridge protocol
        const PBWithFoo = protocol(({ Family, map: m }) => ({
            [extend]: PB,
            foo: m({ out: Family })    // kind = 'map' — conflicts with PA's 'fold'
        }));

        assert.throws(
            () => protocol(({ Family, fold: f }) => ({
                [extend]: [PA, PBWithFoo]
            })),
            (e: Error) => e instanceof TypeError && e.message.includes("'foo'")
        );
    });

    it('throws when same-kind op has incompatible out types in two parents', () => {
        const PA = protocol(({ Family, fold: f }) => ({
            foo: f({ out: Boolean })   // out = Boolean
        }));
        const PB = protocol(({ Family, fold: f }) => ({
            foo: f({ out: Number })    // out = Number — incompatible!
        }));

        assert.throws(
            () => protocol(({ Family, fold: f }) => ({
                [extend]: [PA, PB]
            })),
            (e: Error) =>
                e instanceof TypeError &&
                e.message.includes("'foo'") &&
                e.message.includes('incompatible specs')
        );
    });

    it('throws when same-kind op has incompatible in types in two parents', () => {
        const PA = protocol(({ Family, fold: f }) => ({
            bar: f({ in: Family, out: Boolean })
        }));
        const PB = protocol(({ Family, fold: f }) => ({
            bar: f({ out: Boolean })   // no 'in' — incompatible!
        }));

        assert.throws(
            () => protocol(({ Family, fold: f }) => ({
                [extend]: [PA, PB]
            })),
            (e: Error) =>
                e instanceof TypeError &&
                e.message.includes("'bar'") &&
                e.message.includes('incompatible specs')
        );
    });

    it('throws when same-kind op has different contract functions in two parents', () => {
        const demandA = () => true;
        const demandB = () => true; // different function reference, same shape

        const PA = protocol(({ Family, fold: f }) => ({
            foo: f({ out: Boolean, demands: demandA })
        }));
        const PB = protocol(({ Family, fold: f }) => ({
            foo: f({ out: Boolean, demands: demandB })
        }));

        assert.throws(
            () => protocol(({ Family, fold: f }) => ({
                [extend]: [PA, PB]
            })),
            (e: Error) =>
                e instanceof TypeError &&
                e.message.includes("'foo'") &&
                e.message.includes('incompatible specs')
        );
    });

    it('merges silently when same-kind op shares the exact same contract reference', () => {
        const sharedDemand = () => true;

        const PA = protocol(({ Family, fold: f }) => ({
            foo: f({ out: Boolean, demands: sharedDemand })
        }));
        const PB = protocol(({ Family, fold: f }) => ({
            foo: f({ out: Boolean, demands: sharedDemand })
        }));

        assert.doesNotThrow(() => {
            protocol(({ Family, fold: f }) => ({
                [extend]: [PA, PB]
            }));
        });
    });

    it('child re-declaration resolves a same-kind spec conflict', () => {
        const PA = protocol(({ Family, fold: f }) => ({
            foo: f({ out: Boolean })
        }));
        const PB = protocol(({ Family, fold: f }) => ({
            foo: f({ out: Number })    // same kind, different out
        }));

        assert.doesNotThrow(() => {
            protocol(({ Family, fold: f }) => ({
                [extend]: [PA, PB],
                foo: f({ out: Boolean })   // child re-declares, resolves the conflict
            }));
        });
    });

    it('child re-declaration resolves a kind conflict', () => {
        const PA = protocol(({ Family, fold: f }) => ({
            foo: f({ out: Boolean })
        }));

        const PBWithFoo = protocol(({ Family, map: m }) => ({
            foo: m({ out: Family })
        }));

        // Child re-declares foo — this overrides the conflict
        assert.doesNotThrow(() => {
            protocol(({ Family, fold: f }) => ({
                [extend]: [PA, PBWithFoo],
                foo: f({ out: Boolean })   // child re-declares, resolves the conflict
            }));
        });
    });
});

// =============================================================================
// 4. Conformance & instanceof with multi-parent protocols
// =============================================================================

describe('conformance and instanceof with multi-parent protocols', () => {
    const AbelianGroup = protocol(({ Family, fold: f }) => ({
        [extend]: [Group, CommutativeMonoid]
    }));

    const MyNum = data(({ Family }) => ({
        [satisfies]: AbelianGroup,
        Num: { value: Number }
    })).ops(({ fold: f, unfold: u, Family }) => ({
        combine: f({ in: Family, out: Family })({
            Num({ value }: any, other?: any) {
                return Family.Num({ value: value + (other as { value: number }).value });
            }
        }),
        Identity: u({ out: Family })({
            Num: () => ({ value: 0 })
        }),
        inverse: f({ out: Family })({
            Num: ({ value }) => Family.Num({ value: -value })
        })
    }));

    it('satisfies AbelianGroup', () => {
        assert.ok(MyNum.Num({ value: 1 }) instanceof (asClass(AbelianGroup)));
    });

    it('satisfies Group (transitive through first parent)', () => {
        assert.ok(MyNum.Num({ value: 1 }) instanceof (asClass(Group)));
    });

    it('satisfies CommutativeMonoid (transitive through second parent)', () => {
        assert.ok(MyNum.Num({ value: 1 }) instanceof (asClass(CommutativeMonoid)));
    });

    it('satisfies Monoid (transitive via diamond)', () => {
        assert.ok(MyNum.Num({ value: 1 }) instanceof (asClass(Monoid)));
    });

    it('satisfies Semigroup (transitive grandparent)', () => {
        assert.ok(MyNum.Num({ value: 1 }) instanceof (asClass(Semigroup)));
    });

    it('does not satisfy an unrelated protocol', () => {
        const Unrelated = protocol(({ Family, fold: f }) => ({
            foo: f({ out: Boolean })
        }));

        assert.ok(!(MyNum.Num({ value: 1 }) instanceof (asClass(Unrelated))));
    });
});

// =============================================================================
// 5. Throws when conforming type is missing an op from any parent
// =============================================================================

describe('missing ops from multi-parent protocol', () => {
    it('throws when missing an op inherited from the second parent', () => {
        const PA = protocol(({ Family, fold: f }) => ({
            aOp: f({ out: Boolean })
        }));

        const PB = protocol(({ Family, fold: f }) => ({
            bOp: f({ out: Number })
        }));

        const AB = protocol(({ Family, fold: f }) => ({
            [extend]: [PA, PB]
        }));

        assert.throws(
            () => data(({ Family }) => ({
                [satisfies]: AB,
                X: {}
            })).ops(({ fold: f }) => ({
                aOp: f({ out: Boolean })({ X: () => true })
                // bOp missing → should throw
            })),
            (e: Error) => e instanceof TypeError && e.message.includes("'bOp'")
        );
    });
});

// =============================================================================
// 6. Multi-parent on behavior()
// =============================================================================

describe('behavior() with multi-parent protocol', () => {
    const Observable = protocol(({ Self, fold: f }) => ({
        subscribe: f({ out: Boolean })
    }));

    const Printable = protocol(({ Self, fold: f }) => ({
        print: f({ out: String })
    }));

    const PrintableObservable = protocol(({ Self, fold: f }) => ({
        [extend]: [Observable, Printable]
    }));

    it('behavior satisfying multi-parent protocol passes instanceof checks', () => {
        const Counter = behavior(({ Self }) => ({
            [satisfies]: PrintableObservable,
            value: Number
        })).ops(({ fold: f, unfold: u, Self }) => ({
            From: u({ in: Number, out: Self })({
                value: (n: number) => n
            }),
            subscribe: f({ out: Boolean })({
                _: (_observers: unknown) => true
            }),
            print: f({ out: String })({
                _: ({ value }: { value: number }) => String(value)
            })
        }));

        const c = Counter.From(0);
        assert.ok(c instanceof (asClass(PrintableObservable)));
        assert.ok(c instanceof (asClass(Observable)));
        assert.ok(c instanceof (asClass(Printable)));
    });
});

// =============================================================================
// 7. Protocol [invariant] walks all parents
// =============================================================================

describe('[invariant] with multi-parent protocols', () => {
    it('validates invariants from both parents', () => {
        const PA = protocol(({ Family, fold: f }) => ({
            [invariant]: (_type: unknown) => true,  // always passes
            aOp: f({ out: Boolean })
        }));

        const PB = protocol(({ Family, fold: f }) => ({
            [invariant]: (_type: unknown) => false, // always fails
            bOp: f({ out: Number })
        }));

        const AB = protocol(({ Family, fold: f }) => ({
            [extend]: [PA, PB]
        }));

        assert.throws(
            () => data(({ Family }) => ({
                [satisfies]: AB,
                X: {}
            })).ops(({ fold: f }) => ({
                aOp: f({ out: Boolean })({ X: () => true }),
                bOp: f({ out: Number })({ X: () => 0 })
            })),
            TypeError
        );
    });

    it('passes when both parent invariants pass', () => {
        const PA = protocol(({ Family, fold: f }) => ({
            [invariant]: (_type: unknown) => true,
            aOp: f({ out: Boolean })
        }));

        const PB = protocol(({ Family, fold: f }) => ({
            [invariant]: (_type: unknown) => true,
            bOp: f({ out: Number })
        }));

        const AB = protocol(({ Family, fold: f }) => ({
            [extend]: [PA, PB]
        }));

        assert.doesNotThrow(
            () => data(({ Family }) => ({
                [satisfies]: AB,
                X: {}
            })).ops(({ fold: f }) => ({
                aOp: f({ out: Boolean })({ X: () => true }),
                bOp: f({ out: Number })({ X: () => 0 })
            }))
        );
    });
});
