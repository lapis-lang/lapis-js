/**
 * Tests for the protocol system.
 *
 * Covers:
 * - protocol() declaration and required ops
 * - [satisfies] in data() phase 1
 * - instanceof via Symbol.hasInstance
 * - Protocol inheritance via [extend]
 * - Protocol-level [invariant]
 * - Naming convention enforcement
 * - Error on missing required operations
 * - behavior() conformance
 * - Explicit subtype conformance (replacing conditional conformance)
 * - Protocol contract composition via unconditional [satisfies]
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
    DemandsError,
    EnsuresError
} from '../index.mjs';

// ---- Shared fixtures (used across multiple sections) -----------------------

const Printable = protocol(({ family, fold }) => ({
    print: fold({ out: String })
}));

const Ordered = protocol(({ family, fold }) => ({
    compare: fold({ in: family, out: Number })
}));

/** Cast a protocol to the constructor type required by `instanceof` */
function asClass(p: unknown): abstract new () => unknown {
    return p as unknown as abstract new () => unknown;
}

// =============================================================================
// 1. protocol() factory basics
// =============================================================================

describe('protocol() factory', () => {
    it('creates a callable function branded as a protocol', () => {
        assert.strictEqual(typeof Printable, 'function');
    });

    it('stores required operations', () => {
        assert.ok(Printable.requiredOps.has('print'));
        assert.strictEqual(Printable.requiredOps.get('print')?.kind, 'fold');
    });

    it('stores unfold as PascalCase required op', () => {
        const Constructible = protocol(({ family, unfold }) => ({
            Empty: unfold({ out: family })
        }));

        assert.ok(Constructible.requiredOps.has('Empty'));
        assert.strictEqual(Constructible.requiredOps.get('Empty')?.kind, 'unfold');
    });

    it('stores map required op', () => {
        const Functor = protocol(({ family, T, map }) => ({
            fmap: map({ out: family })
        }));

        assert.ok(Functor.requiredOps.has('fmap'));
        assert.strictEqual(Functor.requiredOps.get('fmap')?.kind, 'map');
    });

    it('parentProtocol is null for standalone protocol', () => {
        const Standalone = protocol(({ family, fold }) => ({
            check: fold({ out: Boolean })
        }));

        assert.strictEqual(Standalone.parentProtocol, null);
    });

    it('invariantFn is null when [invariant] not given', () => {
        const NoInvariant = protocol(({ family, fold }) => ({
            size: fold({ out: Number })
        }));

        assert.strictEqual(NoInvariant.invariantFn, null);
    });

    it('throws TypeError on camelCase unfold name', () => {
        assert.throws(
            () => protocol(({ family, unfold }) => ({
                empty: unfold({ out: family }) // should be PascalCase
            })),
            TypeError
        );
    });

    it('throws TypeError on PascalCase fold name', () => {
        assert.throws(
            () => protocol(({ family, fold }) => ({
                Print: fold({ out: String }) // should be camelCase
            })),
            TypeError
        );
    });

    it('throws TypeError on PascalCase map name', () => {
        assert.throws(
            () => protocol(({ family, map }) => ({
                Transform: map({ out: family }) // should be camelCase
            })),
            TypeError
        );
    });
});

// =============================================================================
// 2. Protocol inheritance via [extend]
// =============================================================================

describe('protocol() with [extend]', () => {
    it('inherits parent required ops', () => {
        const Semigroup = protocol(({ family, fold }) => ({
            combine: fold({ in: family, out: family })
        }));

        const Monoid = protocol(({ family, fold, unfold }) => ({
            [extend]: Semigroup,
            Identity: unfold({ out: family })
        }));

        assert.ok(Monoid.requiredOps.has('combine'), 'inherited from Semigroup');
        assert.ok(Monoid.requiredOps.has('Identity'), 'own op');
        assert.strictEqual(Monoid.parentProtocol, Semigroup);
    });

    it('inherits transitively across three levels', () => {
        const A = protocol(({ family, fold }) => ({
            opA: fold({ out: Number })
        }));
        const B = protocol(({ family, fold }) => ({
            [extend]: A,
            opB: fold({ out: Number })
        }));
        const C = protocol(({ family, fold }) => ({
            [extend]: B,
            opC: fold({ out: Number })
        }));

        assert.ok(C.requiredOps.has('opA'));
        assert.ok(C.requiredOps.has('opB'));
        assert.ok(C.requiredOps.has('opC'));
    });
});

// =============================================================================
// 3. Protocol [invariant]
// =============================================================================

describe('protocol() [invariant]', () => {
    it('stores [invariant] as invariantFn', () => {
        const pred = (_type: unknown) => true;
        const Verified = protocol(({ family, fold }) => ({
            size: fold({ out: Number }),
            [invariant]: pred
        }));

        assert.strictEqual(Verified.invariantFn, pred);
    });
});

describe('protocol [invariant] enforcement', () => {
    it('throws TypeError when data ADT fails unconditional protocol invariant', () => {
        // Protocol requires that the type has a static 'tag' property
        const Tagged = protocol(({ family, fold }) => ({
            name: fold({ out: String }),
            [invariant]: (type: unknown) =>
                typeof (type as Record<string, unknown>)['tag'] === 'string'
        }));

        // ADT does NOT have a static 'tag' property → invariant fails
        assert.throws(() => {
            data(() => ({
                [satisfies]: [Tagged],
                T: { label: String }
            })).ops(({ fold }) => ({
                name: fold({ out: String })({
                    T({ label }) { return label; }
                })
            }));
        }, TypeError);
    });

    it('no error when data ADT passes unconditional protocol invariant', () => {
        const HasIdentity = protocol(({ family, unfold }) => ({
            Identity: unfold({ out: family }),
            [invariant]: (type: unknown) =>
                typeof (type as Record<string, unknown>)['Identity'] !== 'undefined'
        }));

        const Unit = data(() => ({
            [satisfies]: [HasIdentity],
            Unit: {}
        })).ops(({ unfold, family }) => ({
            Identity: unfold({ out: family })({
                Unit: () => ({})
            })
        }));

        assert.ok(Unit.Identity);
    });

    it('ancestor protocol invariant is also checked', () => {
        const Base = protocol(({ family, fold }) => ({
            val: fold({ out: Number }),
            [invariant]: (_type: unknown) => false   // always fails
        }));

        const Child = protocol(({ family, fold }) => ({
            [extend]: Base,
            extra: fold({ out: Number })
        }));

        assert.throws(() => {
            data(() => ({
                [satisfies]: [Child],
                X: { n: Number }
            })).ops(({ fold }) => ({
                val: fold({ out: Number })({
                    X({ n }) { return n; }
                }),
                extra: fold({ out: Number })({
                    X({ n }) { return n + 1; }
                })
            }));
        }, TypeError);
    });

    it('invariant that throws is caught and wrapped in TypeError', () => {
        const Boom = protocol(({ family, fold }) => ({
            go: fold({ out: Number }),
            [invariant]: () => { throw new Error('kaboom'); }
        }));

        assert.throws(() => {
            data(() => ({
                [satisfies]: [Boom],
                B: { v: Number }
            })).ops(({ fold }) => ({
                go: fold({ out: Number })({
                    B({ v }) { return v; }
                })
            }));
        }, (e) => e instanceof TypeError && /kaboom/.test(e.message));
    });

    it('behavior type fails protocol invariant', () => {
        const NeedsStatic = protocol(({ family, fold }) => ({
            step: fold({ out: Number }),
            [invariant]: (type: unknown) =>
                typeof (type as Record<string, unknown>)['magic'] === 'function'
        }));

        assert.throws(() => {
            behavior(({ self }) => ({
                [satisfies]: [NeedsStatic],
                value: Number
            })).ops(({ fold, unfold, self }) => ({
                Start: unfold({ in: Number, out: self })({
                    value: (n) => n
                }),
                step: fold({ out: Number })({
                    _: (ctx) => ctx.value
                })
            }));
        }, TypeError);
    });

    it('protocol invariant fires when type unconditionally satisfies protocol', () => {
        // Protocol with a strict invariant requiring a static 'magic' property
        const Strict = protocol(({ family, fold }) => ({
            check: fold({ out: Boolean }),
            [invariant]: (type: unknown) =>
                (type as Record<string, unknown>)['magic'] === 42
        }));

        // Box tries to satisfy Strict unconditionally — invariant fires at creation.
        // Box has no 'magic' property → invariant fails → TypeError
        assert.throws(() => data(family => ({
            [satisfies]: [Strict],
            Box: { val: Object }
        })).ops(({ fold }) => ({
            check: fold({ out: Boolean })({
                Box() { return true; }
            })
        })), TypeError);
    });
});

// =============================================================================
// 4. Protocol is not callable (conditional conformance removed)
// =============================================================================

describe('protocol is not callable', () => {
    it('calling a protocol throws TypeError', () => {
        assert.throws(
            () => (Ordered as unknown as (...args: unknown[]) => unknown)({ T: Ordered }),
            TypeError
        );
    });

    it('calling a protocol with no args also throws TypeError', () => {
        assert.throws(
            () => (Ordered as unknown as (...args: unknown[]) => unknown)(),
            TypeError
        );
    });
});

// =============================================================================
// 5. data() [satisfies] — unconditional conformance + instanceof
// =============================================================================

describe('data() [satisfies] unconditional', () => {
    it('instance is instanceof protocol after .ops()', () => {
        const Tag = data(() => ({
            [satisfies]: [Printable],
            Tag: { label: String }
        })).ops(({ fold }) => ({
            print: fold({ out: String })({
                Tag({ label }) { return label; }
            })
        }));

        const t = Tag.Tag({ label: 'hello' });
        assert.ok(t instanceof asClass(Printable));
    });

    it('instance is not instanceof unrelated protocol', () => {
        const Serializable = protocol(({ family, fold }) => ({
            serialize: fold({ out: String })
        }));

        const Tag = data(() => ({
            [satisfies]: [Printable],
            Tag: { label: String }
        })).ops(({ fold }) => ({
            print: fold({ out: String })({
                Tag({ label }) { return label; }
            })
        }));

        const t = Tag.Tag({ label: 'hello' });
        assert.ok(!(t instanceof asClass(Serializable)));
    });

    it('primitives return false for instanceof protocol without throwing', () => {
        const P = protocol(({ family, fold }) => ({
            doIt: fold({ out: Number })
        }));
        const cls = asClass(P);
        assert.strictEqual((3 as unknown) instanceof cls, false);
        assert.strictEqual(('' as unknown) instanceof cls, false);
        assert.strictEqual((true as unknown) instanceof cls, false);
        assert.strictEqual((Symbol() as unknown) instanceof cls, false);
    });

    it('satisfying Monoid also satisfies parent Semigroup via instanceof', () => {
        const Semigroup = protocol(({ family, fold }) => ({
            combine: fold({ in: family, out: family })
        }));

        const Monoid = protocol(({ family, fold, unfold }) => ({
            [extend]: Semigroup,
            Identity: unfold({ out: family })
        }));

        const Num = data(() => ({
            [satisfies]: [Monoid],
            Num: { value: Number }
        })).ops(({ fold, unfold, family }) => ({
            Identity: unfold({ out: family })({
                Num: () => ({ value: 0 })
            }),
            combine: fold({ in: family, out: family })({
                Num({ value }) { return family.Num({ value }); }
            })
        }));

        const n = Num.Num({ value: 1 });
        assert.ok(n instanceof asClass(Monoid));
        assert.ok(n instanceof asClass(Semigroup));
    });

    it('throws when required operation is missing', () => {
        assert.throws(
            () => {
                data(() => ({
                    [satisfies]: [Printable],
                    Tag: { label: String }
                })).ops(({ fold }) => ({
                    // 'print' is intentionally omitted
                    size: fold({ out: Number })({
                        Tag() { return 1; }
                    })
                }));
            },
            TypeError
        );
    });

    it('satisfies a single protocol (not in array)', () => {
        const Displayable = protocol(({ family, fold }) => ({
            display: fold({ out: String })
        }));

        const Lbl = data(() => ({
            [satisfies]: Displayable,
            Lbl: { name: String }
        })).ops(({ fold }) => ({
            display: fold({ out: String })({
                Lbl({ name }) { return name; }
            })
        }));

        assert.ok(Lbl.Lbl({ name: 'x' }) instanceof asClass(Displayable));
    });
});

// =============================================================================
// 6. Explicit subtype conformance (replaces conditional conformance)
// =============================================================================

describe('data() [satisfies] explicit subtype conformance', () => {
    it('instance of explicit subtype with [satisfies] satisfies protocol', () => {
        const Num = data(family => ({
            [satisfies]: [Ordered],
            Num: { value: Number }
        })).ops(({ fold, family }) => ({
            compare: fold({ in: family, out: Number })({
                Num({ value }) { return value; }
            })
        }));

        const List = data(family => ({
            Nil: {},
            Cons: { head: Object, tail: family }
        }));

        const NumList = data(family => ({
            [extend]: List,
            [satisfies]: [Ordered],
            Cons: { head: Number, tail: family }
        })).ops(({ fold, family }) => ({
            compare: fold({ in: family, out: Number })({
                Nil() { return 0; },
                Cons({ head }) { return head as number; }
            })
        }));

        const a = NumList.Cons({ head: 1, tail: NumList.Nil });
        assert.ok(a instanceof asClass(Ordered));
    });

    it('instance of base type without [satisfies] does NOT satisfy protocol', () => {
        const List = data(family => ({
            Nil: {},
            Cons: { head: Object, tail: family }
        }));

        const a = List.Nil;
        assert.ok(!(a instanceof asClass(Ordered)));
    });
});

// =============================================================================
// 7. Multiple protocols in [satisfies]
// =============================================================================

describe('data() [satisfies] multiple protocols', () => {
    it('satisfies two independent protocols simultaneously', () => {
        const Printable = protocol(({ family, fold }) => ({
            print: fold({ out: String })
        }));
        const Sizeable = protocol(({ family, fold }) => ({
            size: fold({ out: Number })
        }));

        const Box = data(() => ({
            [satisfies]: [Printable, Sizeable],
            Box: { label: String, count: Number }
        })).ops(({ fold }) => ({
            print: fold({ out: String })({
                Box({ label }) { return label; }
            }),
            size: fold({ out: Number })({
                Box({ count }) { return count; }
            })
        }));

        const b = Box.Box({ label: 'items', count: 5 });
        assert.ok(b instanceof asClass(Printable));
        assert.ok(b instanceof asClass(Sizeable));
    });
});

// =============================================================================
// 8. behavior() [satisfies]
// =============================================================================

describe('behavior() [satisfies]', () => {
    it('behavior instance is instanceof protocol after .ops()', () => {
        const Steppable = protocol(({ family, fold }) => ({
            step: fold({ out: Number })
        }));

        const Counter = behavior(({ self }) => ({
            [satisfies]: [Steppable],
            value: Number
        })).ops(({ fold, unfold, self }) => ({
            Counting: unfold({ in: Number, out: self })({
                value: (n) => n
            }),
            step: fold({ out: Number })({
                _: (ctx) => ctx.value
            })
        }));

        const c = Counter.Counting(3);
        assert.ok(c instanceof asClass(Steppable));
    });

    it('behavior does not satisfy protocol if ops missing', () => {
        const Steppable = protocol(({ family, fold }) => ({
            step: fold({ out: Number })
        }));

        assert.throws(
            () => {
                behavior(({ self }) => ({
                    [satisfies]: [Steppable],
                    value: Number
                })).ops(({ unfold, self }) => ({
                    Counting: unfold({ in: Number, out: self })({
                        value: (n) => n
                    })
                    // 'step' fold intentionally omitted
                }));
            },
            TypeError
        );
    });
});

// =============================================================================
// 9. registerConformance transitive via [extend]
// =============================================================================

describe('protocol [extend] transitive instanceof', () => {
    it('satisfying C also satisfies B and A when C extends B extends A', () => {
        const A = protocol(({ family, fold }) => ({
            opA: fold({ out: Number })
        }));
        const B = protocol(({ family, fold }) => ({
            [extend]: A,
            opB: fold({ out: Number })
        }));
        const C = protocol(({ family, fold }) => ({
            [extend]: B,
            opC: fold({ out: Number })
        }));

        const ADT = data(() => ({
            [satisfies]: [C],
            Node: {}
        })).ops(({ fold }) => ({
            opA: fold({ out: Number })({ Node() { return 1; } }),
            opB: fold({ out: Number })({ Node() { return 2; } }),
            opC: fold({ out: Number })({ Node() { return 3; } })
        }));

        const n = ADT.Node;
        assert.ok(n instanceof asClass(C));
        assert.ok(n instanceof asClass(B));
        assert.ok(n instanceof asClass(A));
    });
});

// ==========================================================================
// Protocol contract composition (data)
// ==========================================================================

describe('protocol contract composition — data() fold', () => {
    // A protocol whose fold requires a non-negative input argument.
    const NonNeg = protocol(({ family, fold }) => ({
        doubled: fold({
            in: Number,
            out: Number,
            demands: (_self, n) => (n as number) >= 0
        })
    }));

    const Box = data(() => ({
        [satisfies]: [NonNeg],
        Box: { value: Number }
    })).ops(({ fold }) => ({
        doubled: fold({ in: Number, out: Number })({
            Box: ({ value }, n) => (value + (n as number)) * 2
        })
    }));

    it('protocol demands (OR) are enforced when op has no own demands', () => {
        const b = Box.Box({ value: 5 });
        // valid: protocol demands pass (n >= 0)
        assert.strictEqual(b.doubled(3), 16);
        // invalid: protocol demands fail (n < 0)
        assert.throws(() => b.doubled(-1), DemandsError);
    });

    it('operation demands (OR) allow wider input than protocol alone', () => {
        // When the op has its own demands, OR-composition means passing
        // EITHER the protocol OR the op demands is sufficient.
        const BoxWider = data(() => ({
            [satisfies]: [NonNeg],
            Box: { value: Number }
        })).ops(({ fold }) => ({
            // Op also accepts n === -1 (its own demands pass for n === -1),
            // even though the protocol would reject it.
            doubled: fold({
                in: Number,
                out: Number,
                demands: (_self, n) => (n as number) === -1 || (n as number) >= 0
            })({
                Box: ({ value }, n) => (value + (n as number)) * 2
            })
        }));

        const b = BoxWider.Box({ value: 5 });
        assert.strictEqual(b.doubled(-1), 8);  // op demands accept -1
        assert.strictEqual(b.doubled(3), 16);  // both accept 3
        assert.throws(() => b.doubled(-2), DemandsError); // neither accepts -2
    });

    it('protocol ensures (AND) are enforced in addition to op ensures', () => {
        // Protocol requires result > 0; op requires result < 1000.
        // Both must hold (AND).
        const Bounded = protocol(({ family, fold }) => ({
            compute: fold({
                out: Number,
                ensures: (_self, _old, result) => (result as number) > 0
            })
        }));

        const Num = data(() => ({
            [satisfies]: [Bounded],
            Num: { value: Number }
        })).ops(({ fold }) => ({
            compute: fold({
                out: Number,
                ensures: (_self, _old, result) => (result as number) < 1000
            })({
                Num: ({ value }) => value
            })
        }));

        const n = Num.Num({ value: 5 });
        assert.strictEqual(n.compute, 5); // 0 < 5 < 1000 — passes both

        const nZero = Num.Num({ value: 0 });
        // result === 0: op ensures (< 1000) passes; protocol ensures (> 0) fails → EnsuresError
        assert.throws(() => nZero.compute, EnsuresError);

        const nBig = Num.Num({ value: 999 });
        assert.strictEqual(nBig.compute, 999); // 0 < 999 < 1000 — passes both

        const nTooBig = Num.Num({ value: 1001 });
        // result === 1001: protocol ensures passes; op ensures fails → EnsuresError
        assert.throws(() => nTooBig.compute, EnsuresError);
    });
});

describe('protocol contract composition — data() unfold', () => {
    it('protocol unfold demands are enforced when op has no own demands', () => {
        const PositiveSeed = protocol(({ family, unfold }) => ({
            FromNum: unfold({
                in: Number,
                out: family,
                demands: (_self, n) => (n as number) > 0
            })
        }));

        const Box = data(() => ({
            [satisfies]: [PositiveSeed],
            Box: { value: Number }
        })).ops(({ unfold }) => ({
            FromNum: unfold({ in: Number, out: Object })({
                Box: (n) => ({ value: n as number })
            })
        }));

        assert.deepStrictEqual(Box.FromNum(5), Box.Box({ value: 5 }));
        assert.throws(() => Box.FromNum(-1), DemandsError);
        assert.throws(() => Box.FromNum(0), DemandsError);
    });
});

describe('protocol contract composition — behavior() fold', () => {
    it('protocol fold demands are enforced on behavior folds', () => {
        const ValidStep = protocol(({ family, fold }) => ({
            stepped: fold({
                in: Number,
                out: Number,
                demands: (_self, n) => (n as number) >= 0
            })
        }));

        const Counter = behavior(({ self }) => ({
            [satisfies]: [ValidStep],
            value: Number,
            next: self
        })).ops(({ fold, unfold, self }) => ({
            Start: unfold({ in: Number, out: self })({
                value: (n) => n as number,
                next: (n) => n as number
            }),
            stepped: fold({ in: Number, out: Number })({
                _: ({ value }, n) => value + (n as number)
            })
        }));

        const c = Counter.Start(10);
        assert.strictEqual(c.stepped(5), 15);
        assert.throws(() => c.stepped(-1), DemandsError);
    });
});

describe('protocol contract composition — behavior() unfold', () => {
    it('protocol unfold demands are enforced on behavior unfolds', () => {
        const PositiveSeed = protocol(({ family, unfold }) => ({
            Start: unfold({
                in: Number,
                out: family,
                demands: (_self, n) => (n as number) >= 0
            })
        }));

        const Counter = behavior(({ self }) => ({
            [satisfies]: [PositiveSeed],
            value: Number,
            next: self
        })).ops(({ fold, unfold, self }) => ({
            Start: unfold({ in: Number, out: self })({
                value: (n) => n as number,
                next: (n) => n as number
            }),
            count: fold({ out: Number })({ _: ({ value }) => value })
        }));

        assert.strictEqual(Counter.Start(3).count, 3);
        assert.throws(() => Counter.Start(-1), DemandsError);
    });
});

// ==========================================================================
// Explicit subtype protocol contract composition (data subtype)
// ==========================================================================

describe('explicit subtype protocol contract composition — data() getter fold', () => {
    // Measurable protocol: size must be non-negative (ensures law).
    const Measurable = protocol(({ family, fold }) => ({
        size: fold({
            out: Number,
            ensures: (_self, _old, result) => (result as number) >= 0
        })
    }));

    const Pair = data(family => ({
        Pair: { a: Object, b: Object }
    }));

    // PairOfPair explicitly satisfies Measurable — ensures enforced.
    const PairOfPair = data(family => ({
        [extend]: Pair,
        [satisfies]: [Measurable]
    })).ops(({ fold }) => ({
        size: fold({ out: Number })({
            Pair() { return -1; }  // intentionally violates ensures (< 0)
        })
    }));

    it('protocol ensures is enforced on explicit subtype with [satisfies]', () => {
        const p = PairOfPair.Pair({ a: {}, b: {} });
        // size returns -1 → violates Measurable.ensures ≥ 0 → must throw EnsuresError
        assert.throws(() => p.size, EnsuresError);
    });

    it('base type without [satisfies] does NOT have ensures enforced', () => {
        const BasePair = data(family => ({
            Pair: { a: Object, b: Object }
        })).ops(({ fold }) => ({
            size: fold({ out: Number })({
                Pair() { return -1; }  // returns -1, but no protocol ensures
            })
        }));

        const p = BasePair.Pair({ a: {}, b: {} });
        // No [satisfies]: [Measurable] → no ensures check → -1 is allowed
        assert.strictEqual(p.size, -1);
    });
});

describe('explicit subtype protocol contract composition — data() method fold', () => {
    // Comparable protocol: compare(n) must return -1, 0, or 1 (ensures law).
    // demands: the argument must not be null.
    const Comparable = protocol(({ family, fold }) => ({
        compare: fold({
            in: Number,
            out: Number,
            demands: (_self, n) => n !== null && n !== undefined,
            ensures: (_self, _old, result) =>
                result === -1 || result === 0 || result === 1
        })
    }));

    // BoxedVal explicitly satisfies Comparable; returns 99 — violates ensures.
    const BoxedVal = data(family => ({
        [satisfies]: [Comparable],
        Boxed: { item: Number }
    })).ops(({ fold }) => ({
        compare: fold({ in: Number, out: Number })({
            Boxed() { return 99; }  // intentionally violates ensures
        })
    }));

    it('protocol ensures is enforced on method fold for explicit subtype', () => {
        const b = BoxedVal.Boxed({ item: 1 });
        // compare returns 99 → violates Comparable.ensures → EnsuresError
        assert.throws(() => b.compare(5), EnsuresError);
    });

    it('protocol demands are enforced on method fold for explicit subtype', () => {
        // Comparable demands: argument must not be null/undefined
        const Conforming = data(family => ({
            [satisfies]: [Comparable],
            Val: { n: Number }
        })).ops(({ fold }) => ({
            compare: fold({ in: Number, out: Number })({
                Val({ n }, x) { return n < (x as number) ? -1 : n > (x as number) ? 1 : 0; }
            })
        }));

        const v = Conforming.Val({ n: 5 });
        assert.strictEqual(v.compare(5), 0);
        assert.throws(() => v.compare(null as unknown as number), DemandsError);
        assert.throws(() => v.compare(undefined as unknown as number), DemandsError);
    });
});

describe('explicit subtype protocol contract composition — data() unfold', () => {
    // Protocol: From unfold must produce a result whose 'n' field is positive.
    const Positive = protocol(({ family, unfold }) => ({
        From: unfold({
            in: Number,
            out: family,
            ensures: (_self, _old, result) =>
                ((result as Record<string, unknown>)['n'] as number) > 0
        })
    }));

    // BrokenP explicitly satisfies Positive but returns n=-1 — violates ensures.
    const BrokenP = data(family => ({
        [satisfies]: [Positive],
        WP: { n: Number }
    })).ops(({ unfold, family }) => ({
        From: unfold({ in: Number, out: family })({
            WP: (_n) => ({ n: -1 })  // intentionally violates ensures
        })
    }));

    it('protocol unfold ensures is enforced when type explicitly satisfies protocol', () => {
        assert.throws(() => BrokenP.From(42), EnsuresError);
    });

    it('protocol unfold ensures not enforced on type that does not satisfy protocol', () => {
        // Plain does not declare Positive — no contract wrapping.
        const Plain = data(family => ({
            WP: { n: Number }
        })).ops(({ unfold, family }) => ({
            From: unfold({ in: Number, out: family })({
                WP: (_n) => ({ n: -1 })
            })
        }));
        const result = Plain.From(7);
        assert.strictEqual((result as Record<string, unknown>)['n'], -1);
    });
});

describe('protocol conformance — behavior merge ops are recognized', () => {
    it('behavior satisfying a protocol with a merge op passes conformance', () => {
        const Summable = protocol(({ family, fold, unfold, merge }) => ({
            From: unfold({ in: Number, out: family }),
            take: fold({ in: Number, out: Array }),
            TakeFrom: merge('From', 'take')
        }));

        const Stream = behavior(({ self }) => ({
            [satisfies]: [Summable],
            head: Number,
            tail: self
        })).ops(({ fold, unfold, merge, self }) => ({
            From: unfold({ in: Number, out: self })({
                head: (n) => n,
                tail: (n) => n + 1
            }),
            take: fold({ in: Number, out: Array })({
                _: ({ head, tail }, n) => (n as number) > 0 ? [head, ...tail((n as number) - 1)] : []
            }),
            TakeFrom: merge('From', 'take')
        }));

        assert.ok(Stream.TakeFrom(0, 3));
        const s = Stream.From(10);
        assert.ok(s instanceof Summable);
    });
});

