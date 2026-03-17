import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { module, data } from '../index.mjs';
import { DemandsError, EnsuresError, InvariantError } from '../index.mjs';

describe('module() — extend extension and subcontracting', () => {
    describe('export inheritance', () => {
        test('child inherits all parent exports', () => {
            const TypeA = data(() => ({ A: {} }));
            const TypeB = data(() => ({ B: {} }));
            const TypeC = data(() => ({ C: {} }));
            const Base = module({}, () => ({ TypeA, TypeB }));
            const Child = module({ extend: Base }, () => ({ TypeC }));
            const instance = Child({});
            assert.strictEqual(instance.TypeA, TypeA);
            assert.strictEqual(instance.TypeB, TypeB);
            assert.strictEqual(instance.TypeC, TypeC);
        });

        test('child can override parent exports', () => {
            const V1 = data(() => ({ V: {} }));
            const V2 = data(() => ({ V: {} }));
            const TypeB = data(() => ({ B: {} }));
            const Base = module({}, () => ({ Versioned: V1, TypeB }));
            const Child = module({ extend: Base }, () => ({ Versioned: V2 }));
            const instance = Child({});
            assert.strictEqual(instance.Versioned, V2);
            assert.strictEqual(instance.TypeB, TypeB);
        });

        test('parent module is unmodified by extension', () => {
            const TypeA   = data(() => ({ A: {} }));
            const TypeA2  = data(() => ({ A: {}, Extra: {} }));
            const TypeB   = data(() => ({ B: {} }));
            const Base  = module({}, () => ({ Export: TypeA }));
            const Child = module({ extend: Base }, () => ({ Export: TypeA2, Extra: TypeB }));
            const base  = Base({});
            const child = Child({});
            assert.strictEqual(base.Export, TypeA);
            assert.ok(!('Extra' in base));
            assert.strictEqual(child.Export, TypeA2);
            assert.ok('Extra' in child);
        });

        test('symbol-keyed exports from parent are inherited', () => {
            const ns = Symbol('ns');
            const NamedADT = data(() => ({ Item: {} }));
            const ValADT   = data(() => ({ Val: {} }));
            const Base  = module({}, () => ({ [ns]: NamedADT, Val: ValADT }));
            const Child = module({ extend: Base }, () => ({ Extra: data(() => ({ Extra: {} })) }));
            const instance = Child({}) as unknown as { [ns]: typeof NamedADT; Val: typeof ValADT; Extra: unknown };
            assert.strictEqual(instance[ns], NamedADT);
            assert.strictEqual(instance.Val, ValADT);
            assert.ok('Extra' in instance);
        });

        test('symbol-keyed exports can be overridden in child', () => {
            const ns    = Symbol('ns');
            const ADT_A = data(() => ({ A: {} }));
            const ADT_B = data(() => ({ B: {} }));
            const Common = data(() => ({ X: {} }));
            const Base  = module({}, () => ({ [ns]: ADT_A, Common }));
            const Child = module({ extend: Base }, () => ({ [ns]: ADT_B, Common }));
            const instance = Child({}) as any;
            assert.strictEqual(instance[ns], ADT_B);
            assert.strictEqual(instance.Common, Common);
        });
    });

    describe('dependency injection through extension', () => {
        test('child and parent bodies both receive the same deps object', () => {
            let parentReceived: unknown, childReceived: unknown;
            const SharedADT = data(() => ({ D: {} }));
            const Base = module({}, (deps: { multiplier: number }) => {
                parentReceived = deps;
                return { BaseADT: SharedADT };
            });
            const Child = module({ extend: Base }, (deps: { multiplier: number }) => {
                childReceived = deps;
                return { ChildADT: SharedADT };
            });
            const d = { multiplier: 5 };
            Child(d);
            assert.strictEqual(parentReceived, d);
            assert.strictEqual(childReceived, d);
        });
    });

    describe('multi-level extension', () => {
        test('3-level chain merges all exports', () => {
            const TypeA = data(() => ({ A: {} }));
            const TypeB = data(() => ({ B: {} }));
            const TypeC = data(() => ({ C: {} }));
            const A = module({}, () => ({ TypeA }));
            const B = module({ extend: A }, () => ({ TypeB }));
            const C = module({ extend: B }, () => ({ TypeC }));
            const instance = C({});
            assert.strictEqual(instance.TypeA, TypeA);
            assert.strictEqual(instance.TypeB, TypeB);
            assert.strictEqual(instance.TypeC, TypeC);
        });

        test('deepest child override wins in multi-level chain', () => {
            const V1 = data(() => ({ V: {} }));
            const V2 = data(() => ({ V: {} }));
            const V3 = data(() => ({ V: {} }));
            const A = module({}, () => ({ Versioned: V1 }));
            const B = module({ extend: A }, () => ({ Versioned: V2 }));
            const C = module({ extend: B }, () => ({ Versioned: V3 }));
            assert.strictEqual(C({}).Versioned, V3);
            assert.strictEqual(B({}).Versioned, V2);
            assert.strictEqual(A({}).Versioned, V1);
        });

        test('4-level chain resolves correctly', () => {
            const TA = data(() => ({ A: {} }));
            const TB = data(() => ({ B: {} }));
            const TC = data(() => ({ C: {} }));
            const TD = data(() => ({ D: {} }));
            const GRAND_SHARED = data(() => ({ GS: {} }));
            const GC_SHARED    = data(() => ({ GCS: {} }));
            const Grand      = module({}, () => ({ TypeA: TA, Shared: GRAND_SHARED }));
            const Parent     = module({ extend: Grand }, () => ({ TypeB: TB }));
            const Child2     = module({ extend: Parent }, () => ({ TypeC: TC }));
            const GrandChild = module({ extend: Child2 }, () => ({ Shared: GC_SHARED, TypeD: TD }));
            const instance = GrandChild({});
            assert.strictEqual(instance.TypeA, TA);
            assert.strictEqual(instance.TypeB, TB);
            assert.strictEqual(instance.TypeC, TC);
            assert.strictEqual(instance.TypeD, TD);
            assert.strictEqual(instance.Shared, GC_SHARED);
        });
    });

    describe('contract subcontracting — demands (OR-weakened)', () => {
        test('child demands sufficient when parent demands fail', () => {
            const SharedADT = data(() => ({ D: {} }));
            const Parent = module(
                { demands: ({ x }: { x: number }) => x > 100 },
                () => ({ Parent: SharedADT })
            );
            const Child = module(
                { extend: Parent, demands: ({ x }: { x: number }) => x > 0 },
                ({ x: _x }: { x: number }) => ({ Child: SharedADT })
            );
            // x=5: fails parent (>100) but passes child (>0) → overall passes (OR)
            assert.doesNotThrow(() => Child({ x: 5 }));
        });

        test('parent demands sufficient when child demands fail', () => {
            const SharedADT = data(() => ({ D: {} }));
            const Parent = module(
                { demands: ({ x }: { x: number }) => x > 0 },
                () => ({ Parent: SharedADT })
            );
            const Child = module(
                { extend: Parent, demands: ({ x }: { x: number }) => x > 100 },
                ({ x: _x }: { x: number }) => ({ Child: SharedADT })
            );
            // x=5: fails child (>100) but passes parent (>0) → overall passes (OR)
            assert.doesNotThrow(() => Child({ x: 5 }));
        });

        test('both demands fail → DemandsError', () => {
            const SharedADT = data(() => ({ D: {} }));
            const Parent = module(
                { demands: ({ x }: { x: number }) => x > 100 },
                () => ({ Parent: SharedADT })
            );
            const Child = module(
                { extend: Parent, demands: ({ x }: { x: number }) => x > 50 },
                ({ x: _x }: { x: number }) => ({ Child: SharedADT })
            );
            assert.throws(() => Child({ x: 10 }), DemandsError);
        });

        test('child-only demands respected (no parent demands)', () => {
            const SharedADT = data(() => ({ D: {} }));
            const Parent = module({}, () => ({ Parent: SharedADT }));
            const Child = module(
                { extend: Parent, demands: ({ x }: { x: number }) => x > 0 },
                ({ x: _x }: { x: number }) => ({ Child: SharedADT })
            );
            assert.doesNotThrow(() => Child({ x: 5 }));
            assert.throws(() => Child({ x: -1 }), DemandsError);
        });
    });

    describe('contract subcontracting — ensures (AND-strengthened)', () => {
        test('both ensures must pass', () => {
            const TypeA = data(() => ({ A: {} }));
            const Parent = module(
                { ensures: (exp: { TypeA: unknown }) => 'TypeA' in exp },
                () => ({ TypeA })
            );
            const Child = module(
                { extend: Parent, ensures: (exp: { TypeA: unknown }) => exp.TypeA !== null },
                () => ({})
            );
            assert.doesNotThrow(() => Child({}));
        });

        test('parent ensures fails → EnsuresError', () => {
            const TypeA = data(() => ({ A: {} }));
            const Parent = module(
                { ensures: () => false },
                () => ({ TypeA })
            );
            const Child = module(
                { extend: Parent, ensures: (exp: { TypeA: unknown }) => 'TypeA' in exp },
                () => ({})
            );
            assert.throws(() => Child({}), EnsuresError);
        });

        test('child ensures fails → EnsuresError', () => {
            const TypeA    = data(() => ({ A: {} }));
            const ExtraADT = data(() => ({ Extra: {} }));
            const Parent = module(
                { ensures: (exp: { TypeA: unknown }) => 'TypeA' in exp },
                () => ({ TypeA })
            );
            const Child = module(
                { extend: Parent, ensures: (exp: any) => 'Missing' in exp },
                () => ({ Extra: ExtraADT })
            );
            assert.throws(() => Child({}), EnsuresError);
        });
    });

    describe('contract subcontracting — invariant (AND-strengthened)', () => {
        test('both invariants must hold', () => {
            const SharedADT = data(() => ({ D: {} }));
            const Parent = module(
                { invariant: ({ a }: { a: number; b: number }) => a > 0 },
                () => ({ Data: SharedADT })
            );
            const Child = module(
                { extend: Parent, invariant: ({ b }: { a: number; b: number }) => b > 0 },
                () => ({})
            );
            assert.doesNotThrow(() => Child({ a: 1, b: 2 }));
            assert.throws(() => Child({ a: -1, b: 2 }), InvariantError);
            assert.throws(() => Child({ a: 1, b: -2 }), InvariantError);
        });
    });

    describe('no-contract extension', () => {
        test('parent with contracts, child with none — parent contracts inherited', () => {
            const SharedADT = data(() => ({ D: {} }));
            const Parent = module(
                { demands: ({ x }: { x: number }) => x > 0 },
                () => ({ Data: SharedADT })
            );
            const Child = module(
                { extend: Parent },
                ({ x: _x }: { x: number }) => ({ Extra: SharedADT })
            );
            assert.throws(() => Child({ x: -1 }), DemandsError);
            assert.doesNotThrow(() => Child({ x: 5 }));
        });

        test('parent no contracts, child with contracts — child contracts apply', () => {
            const SharedADT = data(() => ({ D: {} }));
            const Parent = module({}, () => ({ Data: SharedADT }));
            const Child = module(
                { extend: Parent, demands: ({ x }: { x: number }) => x > 0 },
                ({ x: _x }: { x: number }) => ({})
            );
            assert.throws(() => Child({ x: -1 }), DemandsError);
            assert.doesNotThrow(() => Child({ x: 5 }));
        });
    });
});

