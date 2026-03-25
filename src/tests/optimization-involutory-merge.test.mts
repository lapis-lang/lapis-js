/**
 * Involutory Self-Cancellation in Merge
 *
 * Tests that `fuseInversePairs` eliminates adjacent identical involutory
 * operations from a merge pipeline at ADT definition time.
 *
 * An operation declaring `properties: ['involutory']` satisfies `f∘f = id`,
 * so consecutive even-count runs of `f` in a pipeline collapse to nothing.
 * The existing `while (changed)` loop handles cascaded cancellations.
 *
 * Important merge constraint: a merge pipeline may contain at most ONE fold
 * operation.  Tests using getter-folds (like `flip`) can therefore only test
 * even-count cancellations that leave a single terminal fold (or no fold).
 * For odd-count / non-adjacent tests we use involutory MAP operations, which
 * have no fold-count restriction.
 *
 * Verification strategy:
 *  - Getter-fold tests: counter closure in the fold handler body confirms the
 *    optimised pipeline never invokes the operation.
 *  - Map tests: counter in the T-transform function confirms call counts.
 *  - Reference equality: collapsed identity pipelines return `this`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

// =============================================================================
// Fixture A: Flag ADT with involutory getter-fold `flip`
// =============================================================================

/**
 * Build a Flag ADT.  `onFlip` is called every time the `flip` handler body
 * executes.  Inject a per-test spy to detect un-optimised invocations.
 *
 * Valid merge pipelines (merge constraint: ≤ 1 fold):
 *   doubleFlipIsOn — merge('flip','flip','isOn') → after cancel: ['isOn']
 *   doubleFlip     — merge('flip','flip')         → after cancel: [] (identity)
 *   tripleFlip     — merge('flip','flip','flip')  → after cancel: ['flip'] (alias)
 *   quadFlipIsOn   — merge('flip','flip','flip','flip','isOn') → ['isOn']
 */
function makeFlag(onFlip: () => void) {
    return data(() => ({
        Off: {},
        On: {}
    })).ops(({ fold, merge, Family }) => ({
        flip: fold({
            out: Family,
            properties: ['involutory']
        })({
            Off() { onFlip(); return Family.On; },
            On()  { onFlip(); return Family.Off; }
        }),
        isOn: fold({ out: Boolean })({
            Off() { return false; },
            On()  { return true; }
        }),
        // Two flips cancel → pipeline reduces to ['isOn']
        doubleFlipIsOn: merge('flip', 'flip', 'isOn'),
        // Two flips cancel → empty pipeline (identity: returns `this`)
        doubleFlip: merge('flip', 'flip'),
        // Three flips: one pair cancelled, one flip remains → alias for flip
        tripleFlip: merge('flip', 'flip', 'flip'),
        // Four flips: two pairs cancelled → empty → then isOn only
        quadFlipIsOn: merge('flip', 'flip', 'flip', 'flip', 'isOn')
    }));
}

// =============================================================================
// 1. Adjacent pair elimination (getter-fold)
// =============================================================================

describe('Involutory: adjacent pair elimination in merge pipeline', () => {

    it('merge(flip, flip, isOn) — flip pair cancelled, isOn only', () => {
        let flipCalls = 0;
        const Flag = makeFlag(() => { flipCalls++; });
        const off = (Flag as any).Off as object;
        const on  = (Flag as any).On  as object;

        flipCalls = 0;
        assert.strictEqual((off as any).doubleFlipIsOn, false,
            'Off.doubleFlipIsOn === false (Off is not On)');
        assert.strictEqual(flipCalls, 0,
            'flip handler must NOT be called — pair was eliminated');

        flipCalls = 0;
        assert.strictEqual((on as any).doubleFlipIsOn, true,
            'On.doubleFlipIsOn === true');
        assert.strictEqual(flipCalls, 0,
            'flip handler must NOT be called — pair was eliminated');
    });

    it('merge(flip, flip) — collapses to identity (returns this)', () => {
        let flipCalls = 0;
        const Flag = makeFlag(() => { flipCalls++; });
        const off = (Flag as any).Off as object;
        const on  = (Flag as any).On  as object;

        flipCalls = 0;
        assert.strictEqual((off as any).doubleFlip, off,
            'Off.doubleFlip === Off (identity)');
        assert.strictEqual(flipCalls, 0, 'flip handler must NOT be called');

        flipCalls = 0;
        assert.strictEqual((on as any).doubleFlip, on,
            'On.doubleFlip === On (identity)');
        assert.strictEqual(flipCalls, 0, 'flip handler must NOT be called');
    });

});

// =============================================================================
// 2. Cascade / partial elimination (getter-fold)
// =============================================================================

describe('Involutory: cascaded / partial cancellation runs', () => {

    it('merge(flip,flip,flip) — one pair cancelled, one flip remains (alias)', () => {
        let flipCalls = 0;
        const Flag = makeFlag(() => { flipCalls++; });
        const off = (Flag as any).Off as object;
        const on  = (Flag as any).On  as object;

        // Pipeline reduction: ['flip','flip','flip'] → one pair cancelled → ['flip'].
        // When a merge collapses to a single op it is registered as an alias:
        // the merged name shares the exact same Transformer object as that op.
        assert.strictEqual(
            (Flag as any)._getTransformer('tripleFlip'),
            (Flag as any)._getTransformer('flip'),
            'tripleFlip shares the same Transformer as flip — pipeline reduced to [\'flip\']'
        );

        flipCalls = 0;
        // tripleFlip = flip (one pair cancelled, one left)
        // Off → flip → On
        assert.strictEqual((off as any).tripleFlip, on,
            'Off.tripleFlip === On (one flip remaining)');
        assert.strictEqual(flipCalls, 1,
            'exactly one flip invocation after pair cancellation');

        flipCalls = 0;
        // On → flip → Off
        assert.strictEqual((on as any).tripleFlip, off,
            'On.tripleFlip === Off (one flip remaining)');
        assert.strictEqual(flipCalls, 1,
            'exactly one flip invocation after pair cancellation');
    });

    it('merge(flip,flip,flip,flip,isOn) — two pairs cancelled, isOn only', () => {
        let flipCalls = 0;
        const Flag = makeFlag(() => { flipCalls++; });
        const off = (Flag as any).Off as object;
        const on  = (Flag as any).On  as object;

        flipCalls = 0;
        assert.strictEqual((off as any).quadFlipIsOn, false,
            'Off.quadFlipIsOn === false (four flips = identity, then isOn)');
        assert.strictEqual(flipCalls, 0,
            'zero flip invocations — both pairs cancelled');

        flipCalls = 0;
        assert.strictEqual((on as any).quadFlipIsOn, true,
            'On.quadFlipIsOn === true');
        assert.strictEqual(flipCalls, 0, 'zero flip invocations');
    });

});

// =============================================================================
// Fixture B: parameterised List ADT with involutory map `negate`
//
// Maps carry no fold-count restriction, so we can test all pipeline shapes
// including odd-count runs and interleaved non-involutory maps.
// =============================================================================

/**
 * Build a `Number`-specialised List ADT.  `onNegate` is injected per test so
 * each test can independently count how many times the negate transform fires.
 *
 * Declared pipelines (both present so a single factory covers all map tests):
 *   doubleNegateSum  — merge('negate','negate','sum')        → after cancel: ['sum']
 *   tripleNegateSum  — merge('negate','negate','negate','sum') → after cancel: ['negate','sum']
 */
function makeNegateList(onNegate: () => void) {
    return data(({ Family, T }) => ({
        Nil:  {},
        Cons: { head: T, tail: Family(T) }
    })).ops(({ fold, map, merge, Family, T }) => ({
        negate: map({ out: Family, properties: ['involutory'] })({
            T: (x: unknown) => { onNegate(); return -(x as number) as unknown; }
        }),
        sum: fold({ out: Number })({
            Nil() { return 0; },
            Cons({ head, tail }: { head: number; tail: number }) {
                return head + tail;
            }
        }),
        doubleNegateSum: merge('negate', 'negate', 'sum'),
        tripleNegateSum: merge('negate', 'negate', 'negate', 'sum')
    }))({ T: Number });
}

// =============================================================================
// 3. Involutory map cancellation
// =============================================================================

describe('Involutory: map-level adjacent pair cancellation', () => {

    it('merge(negate,negate,sum) — negate pair cancelled, sum only', () => {
        let negateCalls = 0;
        const NumList = makeNegateList(() => { negateCalls++; });
        const list = NumList.Cons({
            head: 1,
            tail: NumList.Cons({ head: 2, tail: NumList.Nil })
        });

        negateCalls = 0;
        const result = (list as any).doubleNegateSum;
        assert.strictEqual(result, 3,
            'sum of [1,2] without negation = 3');
        assert.strictEqual(negateCalls, 0,
            'negate must NOT be called — pair was eliminated');
    });

    it('merge(negate,negate,negate,sum) — one pair cancelled, one negate remains', () => {
        let negateCalls = 0;
        const NumList = makeNegateList(() => { negateCalls++; });
        const list = NumList.Cons({
            head: 1,
            tail: NumList.Cons({ head: 2, tail: NumList.Nil })
        });

        negateCalls = 0;
        const result = (list as any).tripleNegateSum;
        assert.strictEqual(result, -3,
            'sum of negated [1,2] = -3 (one negate left)');
        assert.ok(negateCalls > 0,
            'negate IS called once per element (one negate remains in pipeline)');
    });

});

// =============================================================================
// 4. Non-involutory maps are NOT cancelled
// =============================================================================

describe('Involutory: non-involutory ops are not cancelled', () => {

    it('merge(double,double,sum) — double has no involutory, NOT cancelled', () => {
        let doubleCalls = 0;
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, map, merge, Family, T }) => ({
            double: map({ out: Family })({
                T: (x: unknown) => { doubleCalls++; return (x as number) * 2 as unknown; }
            }),
            sum: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ head, tail }: { head: number; tail: number }) {
                    return head + tail;
                }
            }),
            // no involutory property → pair NOT eliminated → double is called
            doubleDoubleSum: merge('double', 'double', 'sum')
        }));
        const NumList = List({ T: Number });
        const list = NumList.Cons({ head: 1, tail: NumList.Nil });

        doubleCalls = 0;
        (list as any).doubleDoubleSum;
        assert.ok(doubleCalls > 0,
            'double IS called (non-involutory pair not eliminated)');
    });

});

// =============================================================================
// 5. Ordinary (explicit) inverse pair — baseline (pre-existing optimisation)
// =============================================================================

describe('Involutory: ordinary inverse pair is still eliminated by existing mechanism', () => {

    it('merge(inc, dec) — explicit inverse pair collapses to identity', () => {
        const Counter = data(({ Family }) => ({
            Zero: {},
            Succ: { pred: Family }
        })).ops(({ fold, map, merge, Family }) => ({
            inc: map({ out: Family, inverse: 'dec' })({
                Family: (x: unknown) => Family.Succ({ pred: x })
            }),
            dec: map({ out: Family })({
                Family: (x: unknown) =>
                    (x as Record<string, unknown>)['pred'] as unknown ?? Family.Zero
            }),
            // inc then dec = identity (explicit inverse, not involutory)
            incDec: merge('inc', 'dec'),
            size: fold({ out: Number })({
                Zero() { return 0; },
                Succ({ pred }: { pred: number }) { return pred + 1; }
            })
        }));

        const one = (Counter as any).Succ({ pred: (Counter as any).Zero });
        assert.strictEqual((one as any).incDec, one,
            'inc∘dec = identity (explicit inverse elimination)');
    });

});
