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
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    data,
    behavior,
    protocol,
    satisfies,
    extend,
    invariant
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
