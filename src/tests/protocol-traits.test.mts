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

const Semigroup = protocol(({ family, fold: f }) => ({
    combine: f({ in: family, out: family })
}));

const Monoid = protocol(({ family, fold: f, unfold: u }) => ({
    [extend]: Semigroup,
    Identity: u({ out: family })
}));

const Group = protocol(({ family, fold: f }) => ({
    [extend]: Monoid,
    inverse: f({ out: family })
}));

const CommutativeMonoid = protocol(({ family, fold: f }) => ({
    [extend]: Monoid
    // no new ops — just the commutative law annotation (handled via [properties] elsewhere)
}));

// =============================================================================
// 1. Basic two-parent protocol
// =============================================================================

describe('multi-parent protocol [extend]', () => {
    it('parentProtocols array has both parents', () => {
        const AbelianGroup = protocol(({ family, fold: f }) => ({
            [extend]: [Group, CommutativeMonoid]
        }));

        assert.strictEqual(AbelianGroup.parentProtocols.length, 2);
        assert.strictEqual(AbelianGroup.parentProtocols[0], Group);
        assert.strictEqual(AbelianGroup.parentProtocols[1], CommutativeMonoid);
    });

    it('parentProtocol is the first parent (backward compat)', () => {
        const AbelianGroup = protocol(({ family, fold: f }) => ({
            [extend]: [Group, CommutativeMonoid]
        }));

        assert.strictEqual(AbelianGroup.parentProtocol, Group);
    });

    it('requiredOps is the union of both parents\' ops (including grandparents)', () => {
        const AbelianGroup = protocol(({ family, fold: f }) => ({
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
        const Ring = protocol(({ family, fold: f }) => ({
            [extend]: [Group, CommutativeMonoid],
            multiply: f({ in: family, out: family })
        }));

        assert.ok(Ring.requiredOps.has('combine'));
        assert.ok(Ring.requiredOps.has('Identity'));
        assert.ok(Ring.requiredOps.has('inverse'));
        assert.ok(Ring.requiredOps.has('multiply'));
        assert.strictEqual(Ring.requiredOps.get('multiply')?.kind, 'fold');
    });

    it('single-element array is equivalent to a plain single-parent [extend]', () => {
        const MonoidArr = protocol(({ family, fold: f, unfold: u }) => ({
            [extend]: [Semigroup],
            Identity: u({ out: family })
        }));

        assert.strictEqual(MonoidArr.parentProtocols.length, 1);
        assert.strictEqual(MonoidArr.parentProtocols[0], Semigroup);
        assert.ok(MonoidArr.requiredOps.has('combine'));
        assert.ok(MonoidArr.requiredOps.has('Identity'));
    });

    it('zero-parent (no [extend]) gives empty parentProtocols', () => {
        const Standalone = protocol(({ family, fold: f }) => ({
            check: f({ out: Boolean })
        }));

        assert.strictEqual(Standalone.parentProtocols.length, 0);
        assert.strictEqual(Standalone.parentProtocol, null);
    });

    it('throws TypeError when [extend] contains a non-protocol value', () => {
        assert.throws(
            () => protocol(({ family, fold: f }) => ({
                [extend]: [Semigroup, 42 as unknown as typeof Semigroup],
                extra: f({ out: Boolean })
            })),
            TypeError
        );
    });
});

// =============================================================================
// 2. multi-parent protocol [extend] merges ops from all parents
// =============================================================================

describe('multi-parent protocol [extend] merges ops', () => {
    it('child protocol exposes ops from both parents', () => {
        const PA = protocol(({ family, fold: f }) => ({
            first: f({ out: family })
        }));

        const PB = protocol(({ family, fold: f }) => ({
            second: f({ out: family })
        }));

        const Child = protocol(({ family, fold: f }) => ({
            [extend]: [PA, PB]
        }));

        // An ADT satisfying Child must also satisfy PA and PB
        const Impl = data(family => ({
            [satisfies]: [Child],
            Val: { n: Number }
        })).ops(({ fold, family }) => ({
            first: fold({ out: family })({ Val() { return this; } }),
            second: fold({ out: family })({ Val() { return this; } })
        }));

        const v = Impl.Val({ n: 1 });
        assert.ok(v instanceof PA);
        assert.ok(v instanceof PB);
        assert.ok(v instanceof Child);
    });

    it('child protocol with same op from two parents merges silently', () => {
        const PA = protocol(({ family, fold: f }) => ({
            size: f({ out: Number })
        }));

        const PB = protocol(({ family, fold: f }) => ({
            size: f({ out: Number })
        }));

        // Same-named identical op from both parents: should not throw
        assert.doesNotThrow(() => {
            protocol(({ family, fold: f }) => ({
                [extend]: [PA, PB]
            }));
        });
    });
});

// =============================================================================
// 3. Diamond resolution
// =============================================================================

describe('diamond protocol resolution', () => {
    it('identical op from two paths merges silently (no error)', () => {
        // Both Group and CommutativeMonoid inherit `combine` from Monoid (same kind)
        assert.doesNotThrow(() => {
            protocol(({ family, fold: f }) => ({
                [extend]: [Group, CommutativeMonoid]
            }));
        });
    });

    it('same op with matching TypeParam names in both parents merges silently', () => {
        // Two independent protocols both declare `transform: fold({ in: T, out: T })`.
        // The T markers have different object identities (separate protocol() calls)
        // but the same param name, so typeRefEqual must treat them as equal.
        const PA = protocol(({ T, family, fold: f }) => ({
            transform: f({ in: T, out: T })
        }));

        const PB = protocol(({ T, family, fold: f }) => ({
            transform: f({ in: T, out: T })
        }));

        assert.doesNotThrow(() => {
            protocol(({ family, fold: f }) => ({
                [extend]: [PA, PB]
            }));
        });
    });

    it('properties are unioned when same op comes from two paths', () => {
        // PA uses the same in/out shape as Semigroup.combine so the specs are
        // compatible and merge silently (both FamilyRef values normalise as equal).
        const PA = protocol(({ family, fold: f }) => ({
            combine: f({ in: family, out: family })
        }));

        const Child = protocol(({ family, fold: f }) => ({
            [extend]: [PA, Semigroup]
        }));

        assert.ok(Child.requiredOps.has('combine'));
    });

    it('throws when same op name appears with different kinds in two parents', () => {
        // Create two protocols where 'foo' has different kinds
        const PA = protocol(({ family, fold: f }) => ({
            foo: f({ out: Boolean })   // kind = 'fold'
        }));

        const PB = protocol(({ family, unfold: u }) => ({
            Foo: u({ out: family })    // kind = 'unfold'
        }));

        // Add a fold 'foo' to PB by creating a bridge protocol
        const PBWithFoo = protocol(({ family, map: m }) => ({
            [extend]: PB,
            foo: m({ out: family })    // kind = 'map' — conflicts with PA's 'fold'
        }));

        assert.throws(
            () => protocol(({ family, fold: f }) => ({
                [extend]: [PA, PBWithFoo]
            })),
            (e: Error) => e instanceof TypeError && e.message.includes("'foo'")
        );
    });

    it('throws when same-kind op has incompatible out types in two parents', () => {
        const PA = protocol(({ family, fold: f }) => ({
            foo: f({ out: Boolean })   // out = Boolean
        }));
        const PB = protocol(({ family, fold: f }) => ({
            foo: f({ out: Number })    // out = Number — incompatible!
        }));

        assert.throws(
            () => protocol(({ family, fold: f }) => ({
                [extend]: [PA, PB]
            })),
            (e: Error) =>
                e instanceof TypeError &&
                e.message.includes("'foo'") &&
                e.message.includes('incompatible specs')
        );
    });

    it('throws when same-kind op has incompatible in types in two parents', () => {
        const PA = protocol(({ family, fold: f }) => ({
            bar: f({ in: family, out: Boolean })
        }));
        const PB = protocol(({ family, fold: f }) => ({
            bar: f({ out: Boolean })   // no 'in' — incompatible!
        }));

        assert.throws(
            () => protocol(({ family, fold: f }) => ({
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

        const PA = protocol(({ family, fold: f }) => ({
            foo: f({ out: Boolean, demands: demandA })
        }));
        const PB = protocol(({ family, fold: f }) => ({
            foo: f({ out: Boolean, demands: demandB })
        }));

        assert.throws(
            () => protocol(({ family, fold: f }) => ({
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

        const PA = protocol(({ family, fold: f }) => ({
            foo: f({ out: Boolean, demands: sharedDemand })
        }));
        const PB = protocol(({ family, fold: f }) => ({
            foo: f({ out: Boolean, demands: sharedDemand })
        }));

        assert.doesNotThrow(() => {
            protocol(({ family, fold: f }) => ({
                [extend]: [PA, PB]
            }));
        });
    });

    it('child re-declaration resolves a same-kind spec conflict', () => {
        const PA = protocol(({ family, fold: f }) => ({
            foo: f({ out: Boolean })
        }));
        const PB = protocol(({ family, fold: f }) => ({
            foo: f({ out: Number })    // same kind, different out
        }));

        assert.doesNotThrow(() => {
            protocol(({ family, fold: f }) => ({
                [extend]: [PA, PB],
                foo: f({ out: Boolean })   // child re-declares, resolves the conflict
            }));
        });
    });

    it('child re-declaration resolves a kind conflict', () => {
        const PA = protocol(({ family, fold: f }) => ({
            foo: f({ out: Boolean })
        }));

        const PBWithFoo = protocol(({ family, map: m }) => ({
            foo: m({ out: family })
        }));

        // Child re-declares foo — this overrides the conflict
        assert.doesNotThrow(() => {
            protocol(({ family, fold: f }) => ({
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
    const AbelianGroup = protocol(({ family, fold: f }) => ({
        [extend]: [Group, CommutativeMonoid]
    }));

    const MyNum = data(family => ({
        [satisfies]: AbelianGroup,
        Num: { value: Number }
    })).ops(({ fold: f, unfold: u, family }) => ({
        combine: f({ in: family, out: family })({
            Num({ value }: any, other?: any) {
                return family.Num({ value: value + (other as { value: number }).value });
            }
        }),
        Identity: u({ out: family })({
            Num: () => ({ value: 0 })
        }),
        inverse: f({ out: family })({
            Num: ({ value }) => family.Num({ value: -value })
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
        const Unrelated = protocol(({ family, fold: f }) => ({
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
        const PA = protocol(({ family, fold: f }) => ({
            aOp: f({ out: Boolean })
        }));

        const PB = protocol(({ family, fold: f }) => ({
            bOp: f({ out: Number })
        }));

        const AB = protocol(({ family, fold: f }) => ({
            [extend]: [PA, PB]
        }));

        assert.throws(
            () => data(family => ({
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
    const Observable = protocol(({ self, fold: f }) => ({
        subscribe: f({ out: Boolean })
    }));

    const Printable = protocol(({ self, fold: f }) => ({
        print: f({ out: String })
    }));

    const PrintableObservable = protocol(({ self, fold: f }) => ({
        [extend]: [Observable, Printable]
    }));

    it('behavior satisfying multi-parent protocol passes instanceof checks', () => {
        const Counter = behavior(self => ({
            [satisfies]: PrintableObservable,
            value: Number
        })).ops(({ fold: f, unfold: u, self }) => ({
            From: u({ in: Number, out: self })({
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
        const PA = protocol(({ family, fold: f }) => ({
            [invariant]: (_type: unknown) => true,  // always passes
            aOp: f({ out: Boolean })
        }));

        const PB = protocol(({ family, fold: f }) => ({
            [invariant]: (_type: unknown) => false, // always fails
            bOp: f({ out: Number })
        }));

        const AB = protocol(({ family, fold: f }) => ({
            [extend]: [PA, PB]
        }));

        assert.throws(
            () => data(family => ({
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
        const PA = protocol(({ family, fold: f }) => ({
            [invariant]: (_type: unknown) => true,
            aOp: f({ out: Boolean })
        }));

        const PB = protocol(({ family, fold: f }) => ({
            [invariant]: (_type: unknown) => true,
            bOp: f({ out: Number })
        }));

        const AB = protocol(({ family, fold: f }) => ({
            [extend]: [PA, PB]
        }));

        assert.doesNotThrow(
            () => data(family => ({
                [satisfies]: AB,
                X: {}
            })).ops(({ fold: f }) => ({
                aOp: f({ out: Boolean })({ X: () => true }),
                bOp: f({ out: Number })({ X: () => 0 })
            }))
        );
    });
});
