/**
 * Tests for algebraic property annotations.
 *
 * Covers:
 * - `properties` symbol and `KNOWN_PROPERTIES`
 * - `[properties]` annotation on fold/unfold/map protocol specs
 * - Validation against the closed property vocabulary
 * - Property storage on `ProtocolOpSpec.properties`
 * - Property inheritance through `[extend]` (union, never removal)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    protocol,
    data,
    behavior,
    extend,
    properties
} from '../index.mjs';
import { KNOWN_PROPERTIES } from '../operations.mjs';

// =============================================================================
// 1. KNOWN_PROPERTIES and properties symbol
// =============================================================================

describe('KNOWN_PROPERTIES', () => {
    it('is a non-empty ReadonlySet', () => {
        assert.ok(KNOWN_PROPERTIES instanceof Set);
        assert.ok(KNOWN_PROPERTIES.size > 0);
    });

    it('contains the standard algebraic property names', () => {
        const expected = [
            'associative', 'commutative', 'idempotent', 'identity', 'absorbing',
            'distributive', 'involutory', 'reflexive', 'symmetric', 'antisymmetric',
            'transitive', 'total', 'composition'
        ];
        for (const name of expected)
            assert.ok(KNOWN_PROPERTIES.has(name), `Expected '${name}' in KNOWN_PROPERTIES`);
    });

    it('properties is a unique symbol', () => {
        assert.strictEqual(typeof properties, 'symbol');
    });
});

// =============================================================================
// 2. [properties] annotation on protocol specs — Phase 1 metadata
// =============================================================================

describe('[properties] metadata in protocol specs', () => {
    it('stores properties on fold spec', () => {
        const Semigroup = protocol(({ Family, fold }) => ({
            combine: fold({ in: Family, out: Family, [properties]: ['associative'] })
        }));

        const opSpec = Semigroup.requiredOps.get('combine');
        assert.ok(opSpec, 'combine op spec should exist');
        assert.ok(opSpec.properties instanceof Set);
        assert.ok(opSpec.properties.has('associative'));
    });

    it('stores multiple properties on a single op', () => {
        const CommutativeMonoid = protocol(({ Family, fold }) => ({
            combine: fold({ in: Family, out: Family, [properties]: ['associative', 'commutative'] })
        }));

        const props = CommutativeMonoid.requiredOps.get('combine')!.properties;
        assert.ok(props.has('associative'));
        assert.ok(props.has('commutative'));
    });

    it('stores properties on unfold spec', () => {
        const P = protocol(({ Family, unfold }) => ({
            Build: unfold({ out: Family, [properties]: ['reflexive'] })
        }));

        const props = P.requiredOps.get('Build')!.properties;
        assert.ok(props.has('reflexive'));
    });

    it('stores properties on map spec', () => {
        const Functor = protocol(({ Family, T, map }) => ({
            fmap: map({ out: Family, [properties]: ['composition'] })
        }));

        const props = Functor.requiredOps.get('fmap')!.properties;
        assert.ok(props.has('composition'));
    });

    it('properties set is empty when [properties] is absent', () => {
        const P = protocol(({ Family, fold }) => ({
            size: fold({ out: Number })
        }));

        const props = P.requiredOps.get('size')!.properties;
        assert.ok(props instanceof Set);
        assert.strictEqual(props.size, 0);
    });

    it('throws TypeError on unknown property name', () => {
        assert.throws(
            () => protocol(({ Family, fold }) => ({
                combine: fold({ in: Family, out: Family, [properties]: ['unknownProp' as never] })
            })),
            TypeError
        );
    });

    it('throws TypeError when [properties] is not an array', () => {
        assert.throws(
            () => protocol(({ Family, fold }) => ({
                combine: fold({ in: Family, out: Family, [properties]: 'associative' as never })
            })),
            TypeError
        );
    });

    it('throws TypeError when [properties] contains a non-string', () => {
        assert.throws(
            () => protocol(({ Family, fold }) => ({
                combine: fold({ in: Family, out: Family, [properties]: [42 as never] })
            })),
            TypeError
        );
    });
});

// =============================================================================
// 3. Property inheritance through [extend]
// =============================================================================

describe('[properties] inheritance via [extend]', () => {
    it('child inherits parent op properties when not overriding', () => {
        const Semigroup = protocol(({ Family, fold }) => ({
            combine: fold({ in: Family, out: Family, [properties]: ['associative'] })
        }));

        const CommutativeMonoid = protocol(({ Family, fold, unfold }) => ({
            [extend]: Semigroup,
            Identity: unfold({ out: Family })
            // combine is inherited — NOT redeclared here
        }));

        const props = CommutativeMonoid.requiredOps.get('combine')!.properties;
        assert.ok(props.has('associative'), 'should inherit associative from parent');
    });

    it('child gets union of parent and child properties when overriding', () => {
        const Semigroup = protocol(({ Family, fold }) => ({
            combine: fold({ in: Family, out: Family, [properties]: ['associative'] })
        }));

        const CommutativeMonoid = protocol(({ Family, fold, unfold }) => ({
            [extend]: Semigroup,
            // Override combine, adding commutative
            combine: fold({ in: Family, out: Family, [properties]: ['commutative'] })
        }));

        const props = CommutativeMonoid.requiredOps.get('combine')!.properties;
        assert.ok(props.has('associative'), 'should keep parent property associative');
        assert.ok(props.has('commutative'), 'should add child property commutative');
    });

    it('parent protocol itself has correct properties unchanged', () => {
        const Parent = protocol(({ Family, fold }) => ({
            combine: fold({ in: Family, out: Family, [properties]: ['associative'] })
        }));

        protocol(({ Family, fold }) => ({
            [extend]: Parent,
            combine: fold({ in: Family, out: Family, [properties]: ['commutative'] })
        }));

        // Parent's properties must not be mutated
        const parentProps = Parent.requiredOps.get('combine')!.properties;
        assert.ok(parentProps.has('associative'));
        assert.strictEqual(parentProps.has('commutative'), false);
    });
});

// =============================================================================
// 4. [properties] on data() operations
// =============================================================================

describe('[properties] on data() operations', () => {
    it('stores properties on a fold operation via transformer', () => {
        const Nat = data(({ Family }) => ({
            Zero: {},
            Succ: { pred: Family }
        })).ops(({ fold, unfold, Family }) => ({
            Add: unfold({ in: Family, out: Family })({
                Zero: (other: unknown) => other,
                Succ: (other: unknown) => ({ pred: other })
            }),
            add: fold({ in: Family, out: Family, [properties]: ['associative', 'commutative'] })({
                Zero(_ctx: any, other?: any): any { return other; },
                Succ({ pred }: any, other?: any): any {
                    return (Nat as unknown as Record<string, (...a: unknown[]) => unknown>).Succ({ pred: pred(other) });
                }
            })
        }));

        const transformer = (Nat as unknown as { _getTransformer: (n: string) => { properties?: Set<string> } })
            ._getTransformer('add');
        assert.ok(transformer, 'add transformer should exist');
        assert.ok(transformer.properties instanceof Set);
        assert.ok(transformer.properties.has('associative'));
        assert.ok(transformer.properties.has('commutative'));
    });

    it('stores properties on an unfold operation via transformer', () => {
        const Wrapper = data(() => ({
            Val: { value: Number }
        })).ops(({ unfold }) => ({
            FromNum: unfold({ in: Number, [properties]: ['reflexive'] })({
                Val: (n: unknown) => ({ value: n })
            })
        }));

        const transformer = (Wrapper as unknown as { _getTransformer: (n: string) => { properties?: Set<string> } })
            ._getTransformer('FromNum');
        assert.ok(transformer, 'FromNum transformer should exist');
        assert.ok(transformer.properties instanceof Set);
        assert.ok(transformer.properties.has('reflexive'));
    });

    it('stores properties on a map operation via transformer', () => {
        const Box = data(({ Family, T }) => ({
            Box: { value: T }
        })).ops(({ map, Family }) => ({
            fmap: map({ out: Family, [properties]: ['composition'] })({
                T: (x: unknown) => x
            })
        }));

        const transformer = (Box as unknown as { _getTransformer: (n: string) => { properties?: Set<string> } })
            ._getTransformer('fmap');
        assert.ok(transformer, 'fmap transformer should exist');
        assert.ok(transformer.properties instanceof Set);
        assert.ok(transformer.properties.has('composition'));
    });

    it('transformer has no properties when [properties] is absent', () => {
        const Color = data(() => ({
            Red: {}, Green: {}, Blue: {}
        })).ops(({ fold }) => ({
            toHex: fold({ out: String })({
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; }
            })
        }));

        const transformer = (Color as unknown as { _getTransformer: (n: string) => { properties?: Set<string> } })
            ._getTransformer('toHex');
        assert.ok(transformer, 'toHex transformer should exist');
        assert.strictEqual(transformer.properties, undefined);
    });

    it('throws TypeError for unknown property on data fold', () => {
        assert.throws(
            () => data(() => ({
                A: {}
            })).ops(({ fold }) => ({
                bad: fold({ out: Number, [properties]: ['notReal'] })({
                    A() { return 0; }
                })
            })),
            TypeError
        );
    });
});

// =============================================================================
// 6. [properties] on behavior() operations
// =============================================================================

describe('[properties] on behavior() operations', () => {
    it('stores properties on a behavior fold operation', () => {
        const Counter = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, Self }) => ({
            Start: unfold({ in: Number, out: Self })({
                value: (n: number) => n
            }),
            step: fold({ out: Number, [properties]: ['idempotent'] })({
                _: (ctx: { value: number }) => ctx.value
            })
        }));

        // Access the fold ops symbol map to check properties
        const FoldOpsSymbol = Object.getOwnPropertySymbols(Counter).find(
            s => s.description === 'FoldOps'
        );
        assert.ok(FoldOpsSymbol, 'FoldOps symbol should exist');
        const foldOps = (Counter as unknown as Record<symbol, Map<string, { properties?: Set<string> }>>)[FoldOpsSymbol];
        assert.ok(foldOps instanceof Map);
        const stepEntry = foldOps.get('step');
        assert.ok(stepEntry, 'step fold entry should exist');
        assert.ok(stepEntry.properties instanceof Set);
        assert.ok(stepEntry.properties.has('idempotent'));
    });

    it('stores properties on a behavior unfold operation', () => {
        const Counter = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, Self }) => ({
            Start: unfold({ in: Number, out: Self, [properties]: ['reflexive'] })({
                value: (n: number) => n
            }),
            step: fold({ out: Number })({
                _: (ctx: { value: number }) => ctx.value
            })
        }));

        const UnfoldOpsSymbol = Object.getOwnPropertySymbols(Counter).find(
            s => s.description === 'UnfoldOps'
        );
        assert.ok(UnfoldOpsSymbol, 'UnfoldOps symbol should exist');
        const unfoldOps = (Counter as unknown as Record<symbol, Map<string, { properties?: Set<string> }>>)[UnfoldOpsSymbol];
        assert.ok(unfoldOps instanceof Map);
        const startEntry = unfoldOps.get('Start');
        assert.ok(startEntry, 'Start unfold entry should exist');
        assert.ok(startEntry.properties instanceof Set);
        assert.ok(startEntry.properties.has('reflexive'));
    });

    it('no properties when [properties] is absent on behavior ops', () => {
        const Counter = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, Self }) => ({
            Start: unfold({ in: Number, out: Self })({
                value: (n: number) => n
            }),
            step: fold({ out: Number })({
                _: (ctx: { value: number }) => ctx.value
            })
        }));

        const FoldOpsSymbol = Object.getOwnPropertySymbols(Counter).find(
            s => s.description === 'FoldOps'
        );
        assert.ok(FoldOpsSymbol);
        const foldOps = (Counter as unknown as Record<symbol, Map<string, { properties?: Set<string> }>>)[FoldOpsSymbol];
        const stepEntry = foldOps.get('step');
        assert.ok(stepEntry);
        assert.strictEqual(stepEntry.properties, undefined);
    });
});
