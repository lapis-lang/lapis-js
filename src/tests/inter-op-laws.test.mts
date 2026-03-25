/**
 * Tests for inter-operation algebraic law support (issue #168).
 *
 * Covers:
 * - INTER_OP_PREFIXES constant
 * - parseProperties validation for namespaced strings and predicate functions
 * - Runtime law enforcement for all 5 inter-op law shapes:
 *     identity:E, absorbing:Z, distributive:g, absorption:g, inverse:via:E
 * - Named predicate function dispatch (pass and fail)
 * - LawError thrown on violation, skipped gracefully when companion is absent
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    data,
    INTER_OP_PREFIXES,
    KNOWN_PROPERTIES,
    LawError
} from '../index.mjs';

// =============================================================================
// 1. INTER_OP_PREFIXES constant
// =============================================================================

describe('INTER_OP_PREFIXES', () => {
    it('is a non-empty ReadonlySet', () => {
        assert.ok(INTER_OP_PREFIXES instanceof Set);
        assert.ok(INTER_OP_PREFIXES.size > 0);
    });

    it('contains exactly the 5 known prefixes', () => {
        for (const prefix of ['identity', 'absorbing', 'distributive', 'absorption', 'inverse'])
            assert.ok(INTER_OP_PREFIXES.has(prefix), `Expected '${prefix}' in INTER_OP_PREFIXES`);
        assert.strictEqual(INTER_OP_PREFIXES.size, 5);
    });

    it('bare inter-op names are also in KNOWN_PROPERTIES (metadata-only)', () => {
        for (const bare of ['identity', 'absorbing', 'distributive', 'absorption', 'inverse'])
            assert.ok(KNOWN_PROPERTIES.has(bare), `Expected bare '${bare}' in KNOWN_PROPERTIES`);
    });
});

// =============================================================================
// 2. parseProperties — namespaced string validation
// =============================================================================

describe('parseProperties — namespaced string validation', () => {
    it('accepts valid identity:E namespaced property without throwing', () => {
        assert.doesNotThrow(() =>
            data(() => ({ A: {} })).ops(({ fold, unfold, Family }) => ({
                E: unfold({ out: Family })({ A: () => ({}) }),
                op: fold({ in: Family, out: Family, properties: ['identity:E'] })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            }))
        );
    });

    it('accepts valid absorbing:Z namespaced property without throwing', () => {
        assert.doesNotThrow(() =>
            data(() => ({ A: {} })).ops(({ fold, unfold, Family }) => ({
                Z: unfold({ out: Family })({ A: () => ({}) }),
                op: fold({ in: Family, out: Family, properties: ['absorbing:Z'] })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, _other: unknown): any { return (Family as any).A; }
                })
            }))
        );
    });

    it('accepts valid absorption:g namespaced property without throwing', () => {
        assert.doesNotThrow(() =>
            data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                g: fold({ in: Family, out: Family })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                }),
                op: fold({ in: Family, out: Family, properties: ['absorption:g'] })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, _other: unknown): unknown {

                        return (Family as any).A;
                    }
                })
            }))
        );
    });

    it('accepts valid distributive:g namespaced property without throwing', () => {
        assert.doesNotThrow(() =>
            data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                g: fold({ in: Family, out: Family })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                }),
                op: fold({ in: Family, out: Family, properties: ['distributive:g'] })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            }))
        );
    });

    it('accepts valid inverse:via:E namespaced property without throwing', () => {
        assert.doesNotThrow(() =>
            data(() => ({ A: {} })).ops(({ fold, unfold, map, Family }) => ({
                E: unfold({ out: Family })({ A: () => ({}) }),

                via: map({ out: Family })({ A: (_: unknown) => (Family as any).A }),
                op: fold({ in: Family, out: Family, properties: ['inverse:via:E'] })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            }))
        );
    });

    it('throws TypeError for unknown inter-op prefix', () => {
        assert.throws(
            () => data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                op: fold({
                    in: Family,
                    out: Family,
                    properties: ['badPrefix:X' as never]
                })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            })),
            TypeError
        );
    });

    it('throws TypeError for too many parts on identity (identity:X:Y)', () => {
        assert.throws(
            () => data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                op: fold({
                    in: Family,
                    out: Family,
                    properties: ['identity:X:Y' as never]
                })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            })),
            TypeError
        );
    });

    it('throws TypeError for too few parts on inverse (inverse:via)', () => {
        assert.throws(
            () => data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                op: fold({
                    in: Family,
                    out: Family,
                    properties: ['inverse:via' as never]
                })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            })),
            TypeError
        );
    });
});

// =============================================================================
// 3. parseProperties — predicate-function validation
// =============================================================================

describe('parseProperties — predicate-function validation', () => {
    it('accepts a named function in properties', () => {
        function alwaysTrue(_v: unknown, _adt: unknown): boolean { return true; }
        assert.doesNotThrow(() =>
            data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                op: fold({ in: Family, out: Family, properties: [alwaysTrue] })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            }))
        );
    });

    it('throws TypeError for an anonymous arrow function in properties', () => {
        assert.throws(
            () => data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                op: fold({
                    in: Family,
                    out: Family,

                    properties: [(_v: unknown, _adt: unknown) => true as any]
                })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            })),
            TypeError
        );
    });

    it('throws LawError when named predicate returns false', () => {
        function alwaysFalse(_v: unknown, _adt: unknown): boolean { return false; }
        assert.throws(
            () => data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                op: fold({ in: Family, out: Family, properties: [alwaysFalse] })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            })),
            LawError
        );
    });

    it('law name in LawError matches predicate function name', () => {
        function myCustomLaw(_v: unknown, _adt: unknown): boolean { return false; }
        try {
            data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                op: fold({ in: Family, out: Family, properties: [myCustomLaw] })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            }));
            assert.fail('Expected LawError to be thrown');
        } catch (e) {
            assert.ok(e instanceof LawError, 'Should throw LawError');
            assert.strictEqual(e.propertyName, 'myCustomLaw');
        }
    });
});

// =============================================================================
// 4. Inter-op law enforcement — passing cases
//
// Z2 field: two-element field Z/2Z with singletons { Zero, One }.
//   add (XOR): commutative group with Zero as identity; every element is its own inverse
//   multiply (AND): commutative monoid with One as identity, Zero as absorbing,
//                   distributes over add
//   negate (identity): since -1 ≡ 1 in Z/2Z, every element is its own additive inverse
// =============================================================================

describe('Z2 field — inter-op laws (all passing)', () => {
    // Z/2Z: two-element field. add = XOR, multiply = AND.
    const Z2 = data(() => ({
        Zero: {},
        One:  {}
    })).ops(({ fold, map, Family }) => ({
        // negate: in Z/2Z, every element is its own additive inverse (x + x = 0)
        negate: map({
            out: Family,
            properties: ['involutory']
        })({
            Zero: (_: unknown) => (Family as any).Zero,
            One:  (_: unknown) => (Family as any).One
        }),
        // add: XOR - commutative group with additive identity Zero
        add: fold({
            in: Family,
            out: Family,
            properties: [
                'associative', 'commutative',
                'identity:Zero',
                'inverse:negate:Zero'
            ]
        })({
            // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
            Zero({}: Record<string, never>, other: unknown): unknown { return other; },
            // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
            One({}: Record<string, never>, other: unknown): unknown {
                const F = Family as any;
                if (other === F.One) return F.Zero;  // 1 XOR 1 = 0
                return F.One;                         // 1 XOR 0 = 1
            }
        }),
        // multiply: AND - commutative monoid with multiplicative identity One
        multiply: fold({
            in: Family,
            out: Family,
            properties: [
                'associative', 'commutative',
                'identity:One',
                'absorbing:Zero',
                'distributive:add'
            ]
        })({
            // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
            Zero({}: Record<string, never>, _other: unknown): unknown {
                return (Family as any).Zero;   // 0 AND anything = 0
            },
            // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
            One({}: Record<string, never>, other: unknown): unknown { return other; } // 1 AND x = x
        })
    }));

    it('Z2 ADT constructs without throwing (all laws pass)', () => {
        assert.ok(Z2, 'Z2 should be defined');
        assert.ok(Z2.Zero, 'Z2.Zero should exist');
        assert.ok(Z2.One, 'Z2.One should exist');
    });

    it('identity:Zero holds for add', () => {
        assert.strictEqual(Z2.Zero.add(Z2.Zero), Z2.Zero);
        assert.strictEqual(Z2.Zero.add(Z2.One),  Z2.One);
        assert.strictEqual(Z2.One.add(Z2.Zero),  Z2.One);
    });

    it('absorbing:Zero holds for multiply', () => {
        assert.strictEqual(Z2.Zero.multiply(Z2.Zero), Z2.Zero);
        assert.strictEqual(Z2.Zero.multiply(Z2.One),  Z2.Zero);
        assert.strictEqual(Z2.One.multiply(Z2.Zero),  Z2.Zero);
    });

    it('identity:One holds for multiply', () => {
        assert.strictEqual(Z2.One.multiply(Z2.Zero), Z2.Zero);
        assert.strictEqual(Z2.One.multiply(Z2.One),  Z2.One);
    });

    it('inverse:negate:Zero holds for add', () => {
        // In Z/2Z every element is its own inverse: x + negate(x) = Zero
        assert.strictEqual(Z2.Zero.negate.add(Z2.Zero), Z2.Zero);
        assert.strictEqual(Z2.One.negate.add(Z2.One),   Z2.Zero);
    });

    it('distributive:add holds for multiply', () => {
        // a * (b + c) == (a*b) + (a*c)
        const { Zero, One } = Z2;
        assert.strictEqual(
            One.multiply(Zero.add(One)),
            One.multiply(Zero).add(One.multiply(One))
        );
        assert.strictEqual(
            Zero.multiply(One.add(Zero)),
            Zero.multiply(One).add(Zero.multiply(Zero))
        );
    });
});

// =============================================================================
// 5. Bool lattice — absorption:g (passing)
// =============================================================================

describe('Bool lattice — absorption law (passing)', () => {
    // Bool ADT: join=OR, meet=AND, each annotated with absorption of the other.
    const Bool = data(() => ({
        False: {},
        True:  {}
    })).ops(({ fold, Family }) => ({
        join: fold({
            in: Family,
            out: Family,
            properties: ['associative', 'commutative', 'idempotent', 'absorption:meet']
        })({
            // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
            False({}: Record<string, never>, other: unknown): unknown { return other; },
            // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
            True({}: Record<string, never>, _other: unknown): unknown { return (Family as any).True; }
        }),
        meet: fold({
            in: Family,
            out: Family,
            properties: ['associative', 'commutative', 'idempotent', 'absorption:join']
        })({
            // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
            False({}: Record<string, never>, _other: unknown): unknown { return (Family as any).False; },
            // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
            True({}: Record<string, never>, other: unknown): unknown { return other; }
        })
    }));

    it('Bool ADT constructs without throwing (absorption laws pass)', () => {
        assert.ok(Bool.True, 'Bool.True should exist');
        assert.ok(Bool.False, 'Bool.False should exist');
    });

    it('join absorbs meet: join(a, meet(a, b)) ≡ a', () => {
        const { True, False } = Bool;
        assert.strictEqual(True.join(True.meet(False)), True);
        assert.strictEqual(False.join(False.meet(True)), False);
    });

    it('meet absorbs join: meet(a, join(a, b)) ≡ a', () => {
        const { True, False } = Bool;
        assert.strictEqual(True.meet(True.join(False)), True);
        assert.strictEqual(False.meet(False.join(True)), False);
    });
});

// =============================================================================
// 6. Law violation — LawError thrown at .ops() time
// =============================================================================

describe('Law violations — LawError thrown at .ops() time', () => {
    it('throws LawError when identity:Zero law is violated', () => {
        assert.throws(
            () => data(() => ({ Zero: {}, Elem: {} })).ops(({ fold, Family }) => ({
                // combine(a, Zero) incorrectly returns Zero instead of a
                op: fold({
                    in: Family,
                    out: Family,
                    properties: ['identity:Zero']
                })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    Zero({}: Record<string, never>, _other: unknown): any { return (Family as any).Zero; },
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    Elem({}: Record<string, never>, _other: unknown): any { return (Family as any).Zero; } // wrong
                })
            })),
            LawError
        );
    });

    it('throws LawError when absorbing:Zero law is violated', () => {
        assert.throws(
            () => data(() => ({ Zero: {}, Elem: {} })).ops(({ fold, Family }) => ({
                // multiply(a, Zero) incorrectly returns Elem
                op: fold({
                    in: Family,
                    out: Family,
                    properties: ['absorbing:Zero']
                })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    Zero({}: Record<string, never>, other: unknown): any { return other; },
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    Elem({}: Record<string, never>, other: unknown): any { return other; } // wrong — should return Zero when other=Zero
                })
            })),
            LawError
        );
    });

    it('throws LawError when absorption:meet law is violated', () => {
        assert.throws(
            () => data(() => ({ True: {}, False: {} })).ops(({ fold, Family }) => ({
                meet: fold({ in: Family, out: Family })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    True({}: Record<string, never>, other: unknown): any { return other; },
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    False(_: Record<string, never>, other: unknown): any { return other; } // wrong (should return False)
                }),
                join: fold({
                    in: Family,
                    out: Family,
                    properties: ['absorption:meet']
                })({
                    // join(a, meet(a,b)) should equal a but won't because meet is wrong
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    True({}: Record<string, never>, _other: unknown): any { return (Family as any).True; },
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    False({}: Record<string, never>, other: unknown): any { return other; }
                })
            })),
            LawError
        );
    });

    it('throws LawError when inverse:negate:Zero law is violated', () => {
        assert.throws(
            () => data(() => ({ Zero: {}, Pos: {} })).ops(({ fold, map, Family }) => ({
                // negate does NOT return the correct inverse
                negate: map({ out: Family })({
                    Zero: (_: unknown) => (Family as any).Zero,
                    Pos:  (_: unknown) => (Family as any).Pos  // wrong: should return Zero or something that combines to Zero
                }),
                add: fold({
                    in: Family,
                    out: Family,
                    properties: ['inverse:negate:Zero']
                })({
                    // add(a, b) = b (wrong identity — but we only care about inverse here)
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    Zero({}: Record<string, never>, other: unknown): unknown { return other; },
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    Pos({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            })),
            LawError
        );
    });
});

// =============================================================================
// 7. TypeError when companion element or operation is absent
// =============================================================================

describe('TypeError when companion element or operation is not found on ADT', () => {
    it('throws TypeError when referenced companion element is absent', () => {
        // 'identity:Missing' references a companion 'Missing' that does not exist.
        // A missing companion is a declaration error and must throw TypeError.
        assert.throws(
            () => data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                op: fold({
                    in: Family,
                    out: Family,
                    properties: ['identity:Missing']
                })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime; TS fold signature only models single-arg
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            })),
            TypeError
        );
    });
});

// =============================================================================
// 8. parseProperties rejects empty argument segments
// =============================================================================

describe('parseProperties rejects empty inter-op argument segments', () => {
    it('throws TypeError for identity with empty companion name (identity:)', () => {
        assert.throws(
            () => data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                op: fold({ in: Family, out: Family, properties: ['identity:'] })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            })),
            TypeError
        );
    });

    it('throws TypeError for inverse with empty via segment (inverse::Zero)', () => {
        assert.throws(
            () => data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                op: fold({ in: Family, out: Family, properties: ['inverse::Zero'] })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            })),
            TypeError
        );
    });

    it('throws TypeError for inverse with empty element segment (inverse:negate:)', () => {
        assert.throws(
            () => data(() => ({ A: {} })).ops(({ fold, Family }) => ({
                op: fold({ in: Family, out: Family, properties: ['inverse:negate:'] })({
                    // @ts-expect-error -- binary fold handler receives 2nd arg at runtime
                    A({}: Record<string, never>, other: unknown): unknown { return other; }
                })
            })),
            TypeError
        );
    });
});
