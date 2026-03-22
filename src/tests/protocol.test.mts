/**
 * Tests for the protocol system.
 *
 * Covers:
 * - protocol() declaration and required ops
 * - [satisfies] in data() phase 1
 * - instanceof via Symbol.hasInstance
 * - Protocol inheritance via [extend]
 * - Conditional conformance via Ordered({ T: Ordered })
 * - Protocol-level [invariant]
 * - Naming convention enforcement
 * - Error on missing required operations
 * - behavior() conformance
 * - Defaults auto-installed for satisfied conditional protocols
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

const Printable = protocol(({ Family, fold }) => ({
    print: fold({ out: String })
}));

const Ordered = protocol(({ Family, fold }) => ({
    compare: fold({ in: Family, out: Number })
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
        const Constructible = protocol(({ Family, unfold }) => ({
            Empty: unfold({ out: Family })
        }));

        assert.ok(Constructible.requiredOps.has('Empty'));
        assert.strictEqual(Constructible.requiredOps.get('Empty')?.kind, 'unfold');
    });

    it('stores map required op', () => {
        const Functor = protocol(({ Family, T, map }) => ({
            fmap: map({ out: Family })
        }));

        assert.ok(Functor.requiredOps.has('fmap'));
        assert.strictEqual(Functor.requiredOps.get('fmap')?.kind, 'map');
    });

    it('parentProtocol is null for standalone protocol', () => {
        const Standalone = protocol(({ Family, fold }) => ({
            check: fold({ out: Boolean })
        }));

        assert.strictEqual(Standalone.parentProtocol, null);
    });

    it('invariantFn is null when [invariant] not given', () => {
        const NoInvariant = protocol(({ Family, fold }) => ({
            size: fold({ out: Number })
        }));

        assert.strictEqual(NoInvariant.invariantFn, null);
    });

    it('throws TypeError on camelCase unfold name', () => {
        assert.throws(
            () => protocol(({ Family, unfold }) => ({
                empty: unfold({ out: Family }) // should be PascalCase
            })),
            TypeError
        );
    });

    it('throws TypeError on PascalCase fold name', () => {
        assert.throws(
            () => protocol(({ Family, fold }) => ({
                Print: fold({ out: String }) // should be camelCase
            })),
            TypeError
        );
    });

    it('throws TypeError on PascalCase map name', () => {
        assert.throws(
            () => protocol(({ Family, map }) => ({
                Transform: map({ out: Family }) // should be camelCase
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
        const Semigroup = protocol(({ Family, fold }) => ({
            combine: fold({ in: Family, out: Family })
        }));

        const Monoid = protocol(({ Family, fold, unfold }) => ({
            [extend]: Semigroup,
            Identity: unfold({ out: Family })
        }));

        assert.ok(Monoid.requiredOps.has('combine'), 'inherited from Semigroup');
        assert.ok(Monoid.requiredOps.has('Identity'), 'own op');
        assert.strictEqual(Monoid.parentProtocol, Semigroup);
    });

    it('inherits transitively across three levels', () => {
        const A = protocol(({ Family, fold }) => ({
            opA: fold({ out: Number })
        }));
        const B = protocol(({ Family, fold }) => ({
            [extend]: A,
            opB: fold({ out: Number })
        }));
        const C = protocol(({ Family, fold }) => ({
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
        const Verified = protocol(({ Family, fold }) => ({
            size: fold({ out: Number }),
            [invariant]: pred
        }));

        assert.strictEqual(Verified.invariantFn, pred);
    });
});

describe('protocol [invariant] enforcement', () => {
    it('throws TypeError when data ADT fails unconditional protocol invariant', () => {
        // Protocol requires that the type has a static 'tag' property
        const Tagged = protocol(({ Family, fold }) => ({
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
        const HasIdentity = protocol(({ Family, unfold }) => ({
            Identity: unfold({ out: Family }),
            [invariant]: (type: unknown) =>
                typeof (type as Record<string, unknown>)['Identity'] !== 'undefined'
        }));

        const Unit = data(() => ({
            [satisfies]: [HasIdentity],
            Unit: {}
        })).ops(({ unfold, Family }) => ({
            Identity: unfold({ out: Family })({
                Unit: () => ({})
            })
        }));

        assert.ok(Unit.Identity);
    });

    it('ancestor protocol invariant is also checked', () => {
        const Base = protocol(({ Family, fold }) => ({
            val: fold({ out: Number }),
            [invariant]: (_type: unknown) => false   // always fails
        }));

        const Child = protocol(({ Family, fold }) => ({
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
        const Boom = protocol(({ Family, fold }) => ({
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
        const NeedsStatic = protocol(({ Family, fold }) => ({
            step: fold({ out: Number }),
            [invariant]: (type: unknown) =>
                typeof (type as Record<string, unknown>)['magic'] === 'function'
        }));

        assert.throws(() => {
            behavior(({ Self }) => ({
                [satisfies]: [NeedsStatic],
                value: Number
            })).ops(({ fold, unfold, Self }) => ({
                Start: unfold({ in: Number, out: Self })({
                    value: (n) => n
                }),
                step: fold({ out: Number })({
                    _: (ctx) => ctx.value
                })
            }));
        }, TypeError);
    });

    it('conditional protocol invariant is checked when constraints are met', () => {
        // Base protocol — no invariant, easy to satisfy
        const Checkable = protocol(({ Family, fold }) => ({
            check: fold({ out: Boolean })
        }));

        // Conditional protocol — has a strict invariant that Box won't satisfy
        const Strict = protocol(({ Family, fold }) => ({
            check: fold({ out: Boolean }),
            [invariant]: (type: unknown) =>
                (type as Record<string, unknown>)['magic'] === 42
        }));

        const Box = data(({ T }) => ({
            [satisfies]: [Strict({ T: Checkable })],
            Box: { val: T }
        })).ops(({ fold }) => ({
            check: fold({ out: Boolean })({
                Box() { return true; }
            })
        }));

        // SimpleT satisfies Checkable (no invariant) — that's the constraint
        const SimpleT = data(() => ({
            [satisfies]: [Checkable],
            S: {}
        })).ops(({ fold }) => ({
            check: fold({ out: Boolean })({
                S() { return true; }
            })
        }));

        // Constraint met (T=SimpleT satisfies Checkable), so Strict's invariant fires.
        // Box has no 'magic' property → invariant fails → TypeError
        assert.throws(() => Box({ T: SimpleT }), TypeError);
    });
});

// =============================================================================
// 4. Conditional conformance (callable protocol)
// =============================================================================

describe('protocol conditional conformance', () => {
    it('calling a protocol returns a ConditionalConformance object', () => {
        const cond = Ordered({ T: Ordered });
        assert.strictEqual(typeof cond, 'object');
        assert.strictEqual(cond.protocol, Ordered);
        assert.deepStrictEqual(Object.keys(cond.constraints), ['T']);
    });

    it('calling with no args returns empty constraints', () => {
        const cond = Ordered();
        assert.deepStrictEqual(cond.constraints, {});
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
        const Serializable = protocol(({ Family, fold }) => ({
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
        const P = protocol(({ Family, fold }) => ({
            doIt: fold({ out: Number })
        }));
        const cls = asClass(P);
        assert.strictEqual((3 as unknown) instanceof cls, false);
        assert.strictEqual(('' as unknown) instanceof cls, false);
        assert.strictEqual((true as unknown) instanceof cls, false);
        assert.strictEqual((Symbol() as unknown) instanceof cls, false);
    });

    it('satisfying Monoid also satisfies parent Semigroup via instanceof', () => {
        const Semigroup = protocol(({ Family, fold }) => ({
            combine: fold({ in: Family, out: Family })
        }));

        const Monoid = protocol(({ Family, fold, unfold }) => ({
            [extend]: Semigroup,
            Identity: unfold({ out: Family })
        }));

        const Num = data(() => ({
            [satisfies]: [Monoid],
            Num: { value: Number }
        })).ops(({ fold, unfold, Family }) => ({
            Identity: unfold({ out: Family })({
                Num: () => ({ value: 0 })
            }),
            combine: fold({ in: Family, out: Family })({
                Num({ value }) { return Family.Num({ value }); }
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
        const Displayable = protocol(({ Family, fold }) => ({
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
// 6. Conditional conformance — data() [satisfies] with constraints
// =============================================================================

describe('data() [satisfies] conditional', () => {
    // Shared fixtures for negative tests (T does not satisfy Ordered)
    const Unordered = data(() => ({
        Item: { label: String }
    })).ops(({ fold }) => ({
        display: fold({ out: String })({
            Item({ label }) { return label; }
        })
    }));

    const UnorderedList = data(({ Family, T }) => ({
        [satisfies]: [Ordered({ T: Ordered })],
        Nil: {},
        Cons: { head: T, tail: Family(T) }
    })).ops(({ fold, Family }) => ({
        compare: fold({ in: Family, out: Number })({
            Nil() { return 0; },
            Cons() { return 0; }
        })
    }));

    it('conditional conformance is registered when constraint is met', () => {
        const Num = data(() => ({
            [satisfies]: [Ordered],  // Num unconditionally satisfies Ordered
            Num: { value: Number }
        })).ops(({ fold, Family }) => ({
            compare: fold({ in: Family, out: Number })({
                Num({ value }) { return value; }
            })
        }));

        const List = data(({ Family, T }) => ({
            [satisfies]: [Ordered({ T: Ordered })],
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, Family, T }) => ({
            compare: fold({ in: Family, out: Number })({
                Nil() { return 0; },
                Cons({ head }) { return (head as { compare: () => number }).compare(); }
            })
        }));

        const ListOfNum = List({ T: Num });

        const a = (ListOfNum as unknown as { Cons: (x: object) => unknown; Nil: unknown }).Cons({
            head: Num.Num({ value: 1 }),
            tail: (ListOfNum as unknown as { Nil: unknown }).Nil
        });

        assert.ok(a instanceof asClass(Ordered));
    });

    it('conditional conformance is NOT registered when constraint is not met', () => {
        const ListOfUnordered = UnorderedList({ T: Unordered });

        const a = (ListOfUnordered as unknown as { Cons: (x: object) => unknown; Nil: unknown }).Cons({
            head: Unordered.Item({ label: 'x' }),
            tail: (ListOfUnordered as unknown as { Nil: unknown }).Nil
        });

        assert.ok(!(a instanceof asClass(Ordered)));
    });

    it('throws TypeError with clear message when calling a constrained op on non-conforming parameterization', () => {
        const ListOfUnordered = UnorderedList({ T: Unordered });
        const a = (ListOfUnordered as unknown as { Nil: unknown }).Nil as unknown as { compare: (x: unknown) => number };

        assert.throws(
            () => a.compare(a),
            (err: unknown) => err instanceof TypeError &&
                (err as TypeError).message.includes("'compare'") &&
                (err as TypeError).message.includes("'T'")
        );
    });
});

// =============================================================================
// 7. Multiple protocols in [satisfies]
// =============================================================================

describe('data() [satisfies] multiple protocols', () => {
    it('satisfies two independent protocols simultaneously', () => {
        const Printable = protocol(({ Family, fold }) => ({
            print: fold({ out: String })
        }));
        const Sizeable = protocol(({ Family, fold }) => ({
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
        const Steppable = protocol(({ Family, fold }) => ({
            step: fold({ out: Number })
        }));

        const Counter = behavior(({ Self }) => ({
            [satisfies]: [Steppable],
            value: Number
        })).ops(({ fold, unfold, Self }) => ({
            Counting: unfold({ in: Number, out: Self })({
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
        const Steppable = protocol(({ Family, fold }) => ({
            step: fold({ out: Number })
        }));

        assert.throws(
            () => {
                behavior(({ Self }) => ({
                    [satisfies]: [Steppable],
                    value: Number
                })).ops(({ unfold, Self }) => ({
                    Counting: unfold({ in: Number, out: Self })({
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
        const A = protocol(({ Family, fold }) => ({
            opA: fold({ out: Number })
        }));
        const B = protocol(({ Family, fold }) => ({
            [extend]: A,
            opB: fold({ out: Number })
        }));
        const C = protocol(({ Family, fold }) => ({
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
    const NonNeg = protocol(({ Family, fold }) => ({
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
        const Bounded = protocol(({ Family, fold }) => ({
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
        const PositiveSeed = protocol(({ Family, unfold }) => ({
            FromNum: unfold({
                in: Number,
                out: Family,
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
        const ValidStep = protocol(({ Family, fold }) => ({
            stepped: fold({
                in: Number,
                out: Number,
                demands: (_self, n) => (n as number) >= 0
            })
        }));

        const Counter = behavior(({ Self }) => ({
            [satisfies]: [ValidStep],
            value: Number,
            next: Self
        })).ops(({ fold, unfold, Self }) => ({
            Start: unfold({ in: Number, out: Self })({
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
        const PositiveSeed = protocol(({ Family, unfold }) => ({
            Start: unfold({
                in: Number,
                out: Family,
                demands: (_self, n) => (n as number) >= 0
            })
        }));

        const Counter = behavior(({ Self }) => ({
            [satisfies]: [PositiveSeed],
            value: Number,
            next: Self
        })).ops(({ fold, unfold, Self }) => ({
            Start: unfold({ in: Number, out: Self })({
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
// Conditional protocol contract composition (data parameterized type)
// ==========================================================================

describe('conditional protocol contract composition — data() getter fold', () => {
    // Measurable protocol: size must be non-negative (ensures law).
    const Measurable = protocol(({ Family, fold }) => ({
        size: fold({
            out: Number,
            ensures: (_self, _old, result) => (result as number) >= 0
        })
    }));

    // Element unconditionally satisfies Measurable.
    const Element = data(() => ({
        [satisfies]: [Measurable],
        El: { x: Number }
    })).ops(({ fold }) => ({
        size: fold({ out: Number })({ El({ x }) { return x; } })
    }));

    // Pair(T) conditionally satisfies Measurable when T satisfies Measurable.
    // The 'size' implementation intentionally returns -1 to exercise the ensures check.
    const Pair = data(({ T }) => ({
        [satisfies]: [Measurable({ T: Measurable })],
        Pair: { a: T, b: T }
    })).ops(({ fold }) => ({
        size: fold({ out: Number })({
            Pair() { return -1; }  // intentionally violates ensures (< 0)
        })
    }));

    it('conditional protocol ensures is enforced when constraint is met', () => {
        const PairOfEl = Pair({ T: Element });
        const p = PairOfEl.Pair({ a: Element.El({ x: 1 }), b: Element.El({ x: 2 }) });
        // size returns -1 → violates Measurable.ensures ≥ 0 → must throw EnsuresError
        assert.throws(() => p.size, EnsuresError);
    });

    it('conditional protocol ensures is NOT enforced when constraint is not met', () => {
        // Plain object does not satisfy Measurable.
        const PlainVal = data(() => ({
            Val: { n: Number }
        })).ops(({ fold }) => ({
            weight: fold({ out: Number })({ Val({ n }) { return n; } })
            // no 'size' — does not satisfy Measurable
        }));

        const PairOfPlain = Pair({ T: PlainVal });
        const p = PairOfPlain.Pair({ a: PlainVal.Val({ n: 1 }), b: PlainVal.Val({ n: 2 }) });
        // Constraint NOT met — 'size' is a stub, NOT wrapped with Measurable.ensures.
        // The stub should throw TypeError ("not available"), not EnsuresError.
        assert.throws(() => p.size, TypeError);
        assert.throws(() => p.size, (e) => !(e instanceof EnsuresError));
    });
});

describe('conditional protocol contract composition — data() method fold', () => {
    // Comparable protocol: compare(n) must return -1, 0, or 1 (ensures law).
    // demands: the argument must not be null.
    const Comparable = protocol(({ Family, fold }) => ({
        compare: fold({
            in: Number,
            out: Number,
            demands: (_self, n) => n !== null && n !== undefined,
            ensures: (_self, _old, result) =>
                result === -1 || result === 0 || result === 1
        })
    }));

    const Scalar = data(() => ({
        [satisfies]: [Comparable],
        Scalar: { value: Number }
    })).ops(({ fold }) => ({
        compare: fold({ in: Number, out: Number })({
            Scalar({ value }, n) { return value < (n as number) ? -1 : value > (n as number) ? 1 : 0; }
        })
    }));

    // Boxed(T) conditionally satisfies Comparable when T does.
    const Boxed = data(({ T }) => ({
        [satisfies]: [Comparable({ T: Comparable })],
        Boxed: { item: T }
    })).ops(({ fold }) => ({
        // Returns 99 — intentionally violates ensures (not -1/0/1) so an EnsuresError fires.
        compare: fold({ in: Number, out: Number })({
            Boxed() { return 99; }
        })
    }));

    it('conditional protocol ensures is enforced on method fold when constraint is met', () => {
        const BoxedScalar = Boxed({ T: Scalar });
        const b = BoxedScalar.Boxed({ item: Scalar.Scalar({ value: 1 }) });
        // compare returns 99 → violates Comparable.ensures → must throw EnsuresError
        assert.throws(() => b.compare(5), EnsuresError);
    });

    it('conditional protocol demands are enforced on method fold when there are no prior demands', () => {
        // NoDemandType has no own demands on compare.
        const NoDemandType = data(() => ({
            [satisfies]: [Comparable],
            Val: { n: Number }
        })).ops(({ fold }) => ({
            // No demands — conditional protocol demands are the sole source.
            compare: fold({ in: Number, out: Number })({
                Val({ n }, x) { return n < (x as number) ? -1 : n > (x as number) ? 1 : 0; }
            })
        }));

        const v = NoDemandType.Val({ n: 5 });
        assert.strictEqual(v.compare(5), 0);
        assert.throws(() => v.compare(null as unknown as number), DemandsError);
        assert.throws(() => v.compare(undefined as unknown as number), DemandsError);
    });
});

describe('conditional protocol contract composition — data() unfold', () => {
    // Protocol: From unfold must produce a result whose 'n' field is positive.
    const Positive = protocol(({ Family, unfold }) => ({
        From: unfold({
            in: Number,
            out: Family,
            ensures: (_self, _old, result) =>
                ((result as Record<string, unknown>)['n'] as number) > 0
        })
    }));

    // Satisfies Positive unconditionally.
    const AtomP = data(() => ({
        [satisfies]: [Positive],
        AtomP: { n: Number }
    })).ops(({ unfold, Family }) => ({
        From: unfold({ in: Number, out: Family })({
            AtomP: (n) => ({ n: Math.abs(n as number) || 1 })
        })
    }));

    // Wrapper(T) satisfies Positive conditionally when T does.
    // Its unfold always returns { n: -1 } — intentionally violates Positive.ensures.
    const Wrapper = data(({ T }) => ({
        [satisfies]: [Positive({ T: Positive })],
        WP: { n: Number }
    })).ops(({ unfold, Family }) => ({
        From: unfold({ in: Number, out: Family })({
            WP: (_n) => ({ n: -1 })
        })
    }));

    it('conditional protocol unfold ensures is enforced when constraint is met', () => {
        // T = AtomP satisfies Positive → contract wrapping active → n=-1 violates ensures.
        const WrappedAtomP = Wrapper({ T: AtomP });
        assert.throws(() => WrappedAtomP.From(42), EnsuresError);
    });

    it('conditional protocol unfold ensures NOT enforced when constraint is NOT met', () => {
        // T = Plain does not satisfy Positive → no contract wrapping → n=-1 is allowed.
        const Plain = data(() => ({ Plain: { v: Number } }));
        const WrappedPlain = Wrapper({ T: Plain });
        const result = WrappedPlain.From(7);
        assert.strictEqual((result as Record<string, unknown>)['n'], -1);
    });
});

describe('protocol conformance — behavior merge ops are recognized', () => {
    it('behavior satisfying a protocol with a merge op passes conformance', () => {
        const Summable = protocol(({ Family, fold, unfold, merge }) => ({
            From: unfold({ in: Number, out: Family }),
            take: fold({ in: Number, out: Array }),
            TakeFrom: merge('From', 'take')
        }));

        const Stream = behavior(({ Self }) => ({
            [satisfies]: [Summable],
            head: Number,
            tail: Self
        })).ops(({ fold, unfold, merge, Self }) => ({
            From: unfold({ in: Number, out: Self })({
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

// ---- Defaults auto-installed for satisfied conditional protocols ----

describe('conditional protocol defaults — installed when constraints are satisfied', () => {
    it('default op is installed on parameterized ADT when constraint is met', () => {
        // HasSize protocol: size() returns a number; equals() has a default
        // derived from size: two instances are equal when both have the same size.
        const HasSize = protocol(({ Family, fold: f }) => ({
            size: f({ out: Number }),
            equals: f({
                in: Family,
                out: Boolean
            })({
                _: (ctx: any, other: any) => ctx.size === other.size
            })
        }));

        const Element = data(() => ({
            [satisfies]: [HasSize],
            El: { value: Number }
        })).ops(({ fold }) => ({
            size: fold({ out: Number })({ El: ({ value }) => value })
            // 'equals' intentionally omitted — should come from the default
        }));

        // Wrapper(T) conditionally satisfies HasSize when T satisfies HasSize.
        const Wrapper = data(({ T }) => ({
            [satisfies]: [HasSize({ T: HasSize })],
            Wrap: { inner: T }
        })).ops(({ fold }) => ({
            size: fold({ out: Number })({
                Wrap: ({ inner }) => (inner as { size: number }).size
            })
            // 'equals' omitted — should be installed via default when T: HasSize
        }));

        const WrapEl = Wrapper({ T: Element });
        const a = WrapEl.Wrap({ inner: Element.El({ value: 3 }) });
        const b = WrapEl.Wrap({ inner: Element.El({ value: 3 }) });
        const c = WrapEl.Wrap({ inner: Element.El({ value: 7 }) });

        // Default 'equals' compares size — should be callable via the installed default.
        const aTyped = a as unknown as { equals: (other: unknown) => boolean };
        assert.strictEqual(aTyped.equals(b), true);  // size 3 === size 3
        assert.strictEqual(aTyped.equals(c), false); // size 3 !== size 7
    });

    it('default op is NOT installed when constraint is not met (stub throws)', () => {
        const HasSize = protocol(({ Family, fold: f }) => ({
            size: f({ out: Number }),
            equals: f({ in: Family, out: Boolean })({
                _: (ctx: any, other: any) => ctx.size === other.size
            })
        }));

        const Plain = data(() => ({
            Val: { n: Number }
        })).ops(({ fold }) => ({
            weight: fold({ out: Number })({ Val: ({ n }) => n })
            // does NOT satisfy HasSize
        }));

        const Wrapper = data(({ T }) => ({
            [satisfies]: [HasSize({ T: HasSize })],
            Wrap: { inner: T }
        })).ops(({ fold }) => ({
            size: fold({ out: Number })({
                Wrap: ({ inner }) => (inner as { weight: number }).weight
            })
        }));

        // Constraint NOT satisfied (Plain doesn't satisfy HasSize).
        const WrapPlain = Wrapper({ T: Plain });
        const w = WrapPlain.Wrap({ inner: Plain.Val({ n: 1 }) });
        const wTyped = w as unknown as { equals: (other: unknown) => boolean };
        // 'equals' should be the error-throwing stub, not the default.
        assert.throws(() => wTyped.equals(w), TypeError);
    });
});
