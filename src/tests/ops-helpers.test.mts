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
        const List = data(({ family }) => ({
            Nil: {},
            Cons: { head: Number, tail: family }
        })).ops(({ fold, unfold, map, merge, family }) => ({
            Range: unfold({ in: Number, out: family })({
                // n is number — inferred, not any
                Nil:  (n) => n <= 0 ? {} : null,
                Cons: (n) => n > 0  ? { head: n, tail: n - 1 } : null
            })
        }));

        const list = List.Range(3) as { head: number };
        assert.strictEqual(list.head, 3);
    });

    test('parameterless unfold: handlers receive no argument', () => {
        const Singleton = data(({ family }) => ({
            Only: {}
        })).ops(({ fold, unfold, map, merge, family }) => ({
            Once: unfold({ out: family })({
                Only: () => ({})
            })
        }));

        const s = Singleton.Once;
        assert.ok(s);
    });

    test('multiple unfold operations on same ADT: each n is typed', () => {
        const List = data(({ family }) => ({
            Nil: {},
            Cons: { head: Number, tail: family }
        })).ops(({ fold, unfold, map, merge, family }) => ({
            Range: unfold({ in: Number, out: family })({
                Nil:  (n) => n <= 0 ? {} : null,
                Cons: (n) => n > 0  ? { head: n, tail: n - 1 } : null
            }),
            Repeat: unfold({ in: Number, out: family })({
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
        const List = data(({ family }) => ({
            Nil: {},
            Cons: { head: Number, tail: family }
        })).ops(({ fold, unfold, map, merge, family }) => ({
            sum: fold({ out: Number })({
                Nil:  () => 0,
                Cons: ({ head, tail }) => head + tail
            })
        }));

        const list = List.Cons({ head: 3, tail: List.Cons({ head: 2, tail: List.Nil }) });
        assert.strictEqual(list.sum, 5);
    });

    test('parametric fold: input param n is inferred from spec.in', () => {
        const List = data(({ family }) => ({
            Nil: {},
            Cons: { head: Number, tail: family }
        })).ops(({ fold, unfold, map, merge, family }) => ({
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
        const List = data(family => ({
            Nil: {},
            Cons: { head: Object, tail: family }
        })).ops(({ fold, unfold, map, merge, family }) => ({
            double: map({ out: family })({
                head: (x) => x * 2
            })
        }));

        const NumList = List;
        const list = NumList.Cons({ head: 3, tail: NumList.Cons({ head: 2, tail: NumList.Nil }) });
        const doubled = list.double as { head: number };
        assert.strictEqual(doubled.head, 6);
    });

    test('map recurses through direct family fields before applying atom transforms', () => {
        const List = data(family => ({
            Nil: {},
            Cons: { head: Number, tail: family }
        })).ops(({ map, family }) => ({
            increment: map({ out: family })({
                head: (x) => x + 1,
                tail: () => {
                    throw new Error('direct family fields should recurse structurally');
                }
            })
        }));

        const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) });
        const incremented = list.increment as {
            head: number;
            tail: { head: number; tail: unknown };
        };

        assert.strictEqual(incremented.head, 2);
        assert.strictEqual(incremented.tail.head, 3);
        assert.strictEqual(incremented.tail.tail, List.Nil);
    });

    test('merge composes two operations', () => {
        const List = data(({ family }) => ({
            Nil: {},
            Cons: { head: Number, tail: family }
        })).ops(({ fold, unfold, map, merge, family }) => ({
            sum: fold({ out: Number })({
                Nil:  () => 0,
                Cons: ({ head, tail }) => head + tail
            }),
            Range: unfold({ in: Number, out: family })({
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
        const Stream = behavior(({ self }) => ({
            head: Number,
            tail: self
        })).ops(({ fold, unfold, map, merge, self }) => ({
            From: unfold({ in: Number, out: self })({
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
        const Ones = behavior(({ self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Create: unfold({ out: self })({
                value: () => 1
            })
        }));

        const s = Ones.Create;
        assert.strictEqual(s.value, 1);
    });

    test('parameterless behavior: no type params needed', () => {
        const Stream = behavior(self => ({
            head: Object,
            tail: self
        })).ops(({ fold, unfold, map, merge, self }) => ({
            From: unfold({ in: Number, out: self })({
                head: (n) => n,
                tail: (n) => n + 1
            })
        }));

        const NumStream = Stream;
        const s: any = NumStream.From(5);
        assert.strictEqual(s.head, 5);
        assert.strictEqual(s.tail.head, 6);
    });
});

// ---- behavior() — fold input param inferred ---------------------------------

describe('ops helpers — behavior() fold', () => {
    test('parametric behavior fold: n inferred from spec.in', () => {
        const Stream = behavior(({ self }) => ({
            head: Number,
            tail: self
        })).ops(({ fold, unfold, map, merge, self }) => ({
            From: unfold({ in: Number, out: self })({
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
        const Base = behavior(({ self }) => ({
            value: Number
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Create: unfold({ in: Number, out: self })({
                value: (n) => n
            })
        }));

        const Child = behavior(({ self }) => ({
            [extend]: Base
        })).ops(({ fold, unfold, map, merge, self }) => ({
            Double: unfold({ in: Number, out: self })({
                value: (n) => n * 2
            })
        }));

        const s = Child.Double(5);
        assert.strictEqual(s.value, 10);
        assert.ok(s instanceof (Base as any));
    });
});
