/**
 * Proof of concept: curried operation helpers (unfold/fold/map/merge)
 *
 * Demonstrates that handler parameters are fully typed without explicit
 * annotations when operations are declared with the helper API.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, behavior, extend } from '../index.mjs';

// ---- data() — unfold input param inferred -----------------------------------

describe('ops helpers — data() unfold', () => {
    test('handler input param is inferred from spec.in', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family }
        })).ops(({ fold, unfold, map, merge, Family }) => ({
            Range: unfold({ in: Number, out: Family })({
                // n is number — inferred, not any
                Nil:  (n) => n <= 0 ? {} : null,
                Cons: (n) => n > 0  ? { head: n, tail: n - 1 } : null
            })
        }));

        const list = List.Range(3) as { head: number };
        assert.strictEqual(list.head, 3);
    });

    test('parameterless unfold: handlers receive no argument', () => {
        const Singleton = data(({ Family }) => ({
            Only: {}
        })).ops(({ fold, unfold, map, merge, Family }) => ({
            Once: unfold({ out: Family })({
                Only: () => ({})
            })
        }));

        const s = Singleton.Once;
        assert.ok(s);
    });

    test('multiple unfold operations on same ADT: each n is typed', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family }
        })).ops(({ fold, unfold, map, merge, Family }) => ({
            Range: unfold({ in: Number, out: Family })({
                Nil:  (n) => n <= 0 ? {} : null,
                Cons: (n) => n > 0  ? { head: n, tail: n - 1 } : null
            }),
            Repeat: unfold({ in: Number, out: Family })({
                Nil:  (n) => n <= 0 ? {} : null,
                Cons: (n) => n > 0  ? { head: 42, tail: n - 1 } : null
            })
        }));

        const fwd = List.Range(3) as { head: number };
        assert.strictEqual(fwd.head, 3);
        const rep = List.Repeat(2) as { head: number };
        assert.strictEqual(rep.head, 42);
    });
});

// ---- data() — fold input param and return type inferred ---------------------

describe('ops helpers — data() fold', () => {
    test('parameterless fold: return type inferred from spec.out', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family }
        })).ops(({ fold, unfold, map, merge, Family }) => ({
            sum: fold({ out: Number })({
                Nil:  () => 0,
                Cons: ({ head, tail }) => head + tail
            })
        }));

        const list = List.Cons({ head: 3, tail: List.Cons({ head: 2, tail: List.Nil }) });
        assert.strictEqual(list.sum, 5);
    });

    test('parametric fold: input param n is inferred from spec.in', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family }
        })).ops(({ fold, unfold, map, merge, Family }) => ({
            contains: fold({ in: Number, out: Boolean })({
                Nil:  (_ctx, _n) => false,
                Cons: ({ head, tail }, n) => head === n || tail(n)
            })
        }));

        const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) });
        assert.strictEqual(list.contains(2), true);
        assert.strictEqual(list.contains(5), false);
    });

    test('wildcard fold handler', () => {
        const Color = data(() => ({
            Red: {},
            Green: {},
            Blue: {}
        })).ops(({ fold, unfold, map, merge }) => ({
            name: fold({ out: String })({
                Red:  () => 'red',
                _:    () => 'other'
            })
        }));

        assert.strictEqual(Color.Red.name,   'red');
        assert.strictEqual(Color.Green.name, 'other');
        assert.strictEqual(Color.Blue.name,  'other');
    });
});

// ---- data() — map and merge -------------------------------------------------

describe('ops helpers — data() map + merge', () => {
    test('map handler', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family(T) }
        })).ops(({ fold, unfold, map, merge, Family, T }) => ({
            double: map({ out: Family })({
                T: (x) => x * 2
            })
        }));

        const NumList = List({ T: Number });
        const list = NumList.Cons({ head: 3, tail: NumList.Cons({ head: 2, tail: NumList.Nil }) });
        const doubled = list.double as { head: number };
        assert.strictEqual(doubled.head, 6);
    });

    test('merge composes two operations', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family }
        })).ops(({ fold, unfold, map, merge, Family }) => ({
            sum: fold({ out: Number })({
                Nil:  () => 0,
                Cons: ({ head, tail }) => head + tail
            }),
            Range: unfold({ in: Number, out: Family })({
                Nil:  (n) => n <= 0 ? {} : null,
                Cons: (n) => n > 0  ? { head: n, tail: n - 1 } : null
            }),
            RangeSum: merge('Range', 'sum')
        }));

        // Range(4) → [4,3,2,1], sum → 10
        assert.strictEqual(List.RangeSum(4), 10);
    });
});

// ---- behavior() — unfold input param inferred -------------------------------

describe('ops helpers — behavior() unfold', () => {
    test('handler input param is inferred from spec.in', () => {
        const Stream = behavior(({ Self }) => ({
            head: Number,
            tail: Self
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            From: unfold({ in: Number, out: Self })({
                // n is number — inferred, not any
                head: (n) => n,
                tail: (n) => n + 1
            })
        }));

        const s = Stream.From(10);
        assert.strictEqual(s.head, 10);
        assert.strictEqual(s.tail.head, 11);
    });

    test('parameterless behavior unfold', () => {
        const Ones = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Create: unfold({ out: Self })({
                value: () => 1
            })
        }));

        const s = Ones.Create;
        assert.strictEqual(s.value, 1);
    });

    test('parameterized behavior: type param T flows through', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self
        })).ops(({ fold, unfold, map, merge, Self, T }) => ({
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            })
        }));

        const NumStream = Stream({ T: Number });
        const s = NumStream.From(5);
        assert.strictEqual(s.head, 5);
        assert.strictEqual(s.tail.head, 6);
    });
});

// ---- behavior() — fold input param inferred ---------------------------------

describe('ops helpers — behavior() fold', () => {
    test('parametric behavior fold: n inferred from spec.in', () => {
        const Stream = behavior(({ Self }) => ({
            head: Number,
            tail: Self
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            From: unfold({ in: Number, out: Self })({
                head: (n) => n,
                tail: (n) => n + 1
            }),
            sum: fold({ in: Number, out: Number })({
                _: ({ head, tail }, n) => {
                    if (n <= 0) return 0;
                    return head + tail(n - 1);
                }
            })
        }));

        const s = Stream.From(1);
        assert.strictEqual(s.sum(4), 1 + 2 + 3 + 4);
    });
});

// ---- extend: helpers work with behavior [extend] ----------------------------

describe('ops helpers — behavior [extend]', () => {
    test('child behavior uses helpers and inherits parent', () => {
        const Base = behavior(({ Self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Create: unfold({ in: Number, out: Self })({
                value: (n) => n
            })
        }));

        const Child = behavior(({ Self }) => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Double: unfold({ in: Number, out: Self })({
                value: (n) => n * 2
            })
        }));

        const s = Child.Double(5);
        assert.strictEqual(s.value, 10);
        assert.ok(s instanceof Base);
    });
});
