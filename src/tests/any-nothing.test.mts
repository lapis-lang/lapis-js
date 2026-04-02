/**
 * Any / Nothing — Type Lattice Bounds
 *
 * Tests for the universal top type (Any) and bottom type (Nothing) as:
 *   1. TypeSpec sentinels in field and operation declarations
 *   2. Formal prototype-chain lattice bounds (instanceof checks)
 *   3. Guards against misuse ([extend]: Any / Nothing)
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, behavior, extend, Any, Nothing, DataAny, BehaviorAny } from '../index.mjs';
import { relation, origin, destination } from '../index.mjs';
import { query } from '../index.mjs';

// ---- 1. Any as a TypeSpec -----------------------------------------------

describe('Any — TypeSpec sentinel', () => {
    test('accepts any primitive value as a field spec', () => {
        const Box = data(() => ({ Wrap: { value: Any } }));

        // numbers
        const n = Box.Wrap({ value: 42 });
        assert.strictEqual(n.value, 42);

        // strings
        const s = Box.Wrap({ value: 'hello' });
        assert.strictEqual(s.value, 'hello');

        // booleans
        const b = Box.Wrap({ value: true });
        assert.strictEqual(b.value, true);

        // objects
        const o = Box.Wrap({ value: { x: 1 } });
        assert.deepStrictEqual(o.value, { x: 1 });
    });

    test('accepts another ADT instance as an Any field', () => {
        const Color = data(() => ({ Red: {} }));
        const Box = data(() => ({ Wrap: { value: Any } }));
        const wrapped = Box.Wrap({ value: Color.Red });
        assert.ok(wrapped.value instanceof Color);
    });

    test('accepts null and undefined as Any fields', () => {
        const Box = data(() => ({ Wrap: { value: Any } }));
        // null and undefined are valid — Any skips all validation
        assert.doesNotThrow(() => Box.Wrap({ value: null }));
        assert.doesNotThrow(() => Box.Wrap({ value: undefined }));
    });

    test('Any in operation out-spec does not throw on any return value', () => {
        const Box = data(() => ({ Wrap: { value: Number } }))
            .ops(({ fold }) => ({
                getAs: fold({ out: Any })({
                    Wrap: ({ value }) => value as unknown
                })
            }));
        const x = Box.Wrap({ value: 7 });
        assert.strictEqual((x as unknown as { getAs: unknown }).getAs, 7);
    });
});

// ---- 2. Nothing as a TypeSpec -------------------------------------------

describe('Nothing — TypeSpec sentinel', () => {
    test('rejects every value in a fold out-spec', () => {
        // Only the *runtime validator* is tested here — the spec is set to
        // Nothing, so the first (and only) fold handler will fire the check.
        const Box = data(() => ({ Wrap: { value: Number } }))
            .ops(({ fold }) => ({
                impossible: fold({ out: Nothing })({
                    Wrap: ({ value }) => value as never
                })
            }));

        const x = Box.Wrap({ value: 3 });
        assert.throws(
            () => { (x as unknown as { impossible: unknown }).impossible; },
            /Nothing is the bottom type/
        );
    });
});

// ---- 3. instanceof Any — data lattice -----------------------------------

describe('instanceof Any — data lattice', () => {
    test('singleton variant instance is instanceof Any', () => {
        const Color = data(() => ({ Red: {}, Blue: {} }));
        assert.ok(Color.Red instanceof Any, 'Color.Red instanceof Any');
        assert.ok(Color.Blue instanceof Any, 'Color.Blue instanceof Any');
    });

    test('structured variant instance is instanceof Any', () => {
        const Point = data(() => ({ Point2D: { x: Number, y: Number } }));
        const p = Point.Point2D({ x: 1, y: 2 });
        assert.ok(p instanceof Any, 'Point2D instance instanceof Any');
    });

    test('extended ADT instances are instanceof Any', () => {
        const Base = data(() => ({ A: {} }));
        const Child = data(() => ({ [extend]: Base, B: {} }));
        assert.ok(Child.A instanceof Any, 'inherited A instanceof Any');
        assert.ok(Child.B instanceof Any, 'new variant B instanceof Any');
    });

    test('recursive ADT instances are instanceof Any', () => {
        const Peano = data(family => ({ Zero: {}, Succ: { pred: family } }));
        const two = Peano.Succ({ pred: Peano.Succ({ pred: Peano.Zero }) });
        assert.ok(two instanceof Any, 'Peano.Succ instance instanceof Any');
        assert.ok(Peano.Zero instanceof Any, 'Peano.Zero instanceof Any');
    });

    test('data ADT instances are instanceof DataAny', () => {
        const X = data(() => ({ Leaf: {} }));
        assert.ok(X.Leaf instanceof DataAny, 'data instance instanceof DataAny');
    });

    test('data ADT instances are NOT instanceof BehaviorAny', () => {
        const X = data(() => ({ Leaf: {} }));
        assert.ok(!(X.Leaf instanceof BehaviorAny), 'data instance is NOT instanceof BehaviorAny');
    });
});

// ---- 4. instanceof Any — behavior lattice -------------------------------

describe('instanceof Any — behavior lattice', () => {
    test('behavior instance is instanceof Any', () => {
        const Counter = behavior(self => ({ count: Number, next: self }))
            .ops(({ unfold, self }) => ({
                From: unfold({ in: Number, out: self })({
                    count: (n) => n,
                    next: (n) => n + 1
                })
            }));
        const c = Counter.From(0);
        assert.ok(c instanceof Any, 'behavior instance instanceof Any');
    });

    test('behavior instance is instanceof BehaviorAny', () => {
        const S = behavior(self => ({ head: Number, tail: self }))
            .ops(({ unfold, self }) => ({
                From: unfold({ in: Number, out: self })({
                    head: (n) => n,
                    tail: (n) => n + 1
                })
            }));
        const s = S.From(0);
        assert.ok(s instanceof BehaviorAny, 'behavior instance instanceof BehaviorAny');
    });

    test('extended behavior instances are instanceof Any', () => {
        const Base = behavior(self => ({ value: Number, next: self }));
        const Child = behavior(self => ({
            [extend]: Base,
            extra: String
        })).ops(({ unfold, self }) => ({
            Build: unfold({ in: Number, out: self })({
                value: (n) => n,
                extra: () => 'x',
                next: (n) => n + 1
            })
        }));
        const inst = Child.Build(1);
        assert.ok(inst instanceof Any, 'extended behavior instanceof Any');
    });

    test('behavior instances are NOT instanceof DataAny', () => {
        const S = behavior(self => ({ value: Number, next: self }))
            .ops(({ unfold, self }) => ({
                Make: unfold({ in: Number, out: self })({
                    value: (n) => n,
                    next: (n) => n
                })
            }));
        const inst = S.Make(0);
        assert.ok(!(inst instanceof DataAny), 'behavior instance is NOT instanceof DataAny');
    });
});

// ---- 5. [extend]: Any / Nothing are disallowed -------------------------

describe('[extend] lattice guard', () => {
    test('[extend]: Any on data() throws', () => {
        assert.throws(
            () => data(() => ({ [extend]: Any, X: {} })).ops(() => ({})),
            /\[extend\]: Any is not permitted/
        );
    });

    test('[extend]: Nothing on data() throws', () => {
        assert.throws(
            () => data(() => ({ [extend]: Nothing, X: {} })).ops(() => ({})),
            /\[extend\]: Nothing is not permitted/
        );
    });

    test('[extend]: Any on behavior() throws', () => {
        assert.throws(
            () => behavior(() => ({ [extend]: Any, value: Number })).ops(() => ({})),
            /\[extend\]: Any is not permitted/
        );
    });

    test('[extend]: Nothing on behavior() throws', () => {
        assert.throws(
            () => behavior(() => ({ [extend]: Nothing, value: Number })).ops(() => ({})),
            /\[extend\]: Nothing is not permitted/
        );
    });
});

// ---- 6. relation() — Nothing guards ------------------------------------

describe('relation() — Nothing guards', () => {
    const R = relation(() => ({
        Direct: { from: String, to: String }
    }));

    test('[origin] fold with out: Nothing throws', () => {
        assert.throws(
            () => R.ops(({ fold, origin, destination }) => ({
                [origin]:      fold({ out: Nothing })({ Direct: ({ from }) => from as never }),
                [destination]: fold({ out: String  })({ Direct: ({ to }) => to })
            })),
            /Nothing is the bottom type/
        );
    });

    test('[destination] fold with out: Nothing throws', () => {
        assert.throws(
            () => R.ops(({ fold, origin, destination }) => ({
                [origin]:      fold({ out: String  })({ Direct: ({ from }) => from }),
                [destination]: fold({ out: Nothing })({ Direct: ({ to }) => to as never })
            })),
            /Nothing is the bottom type/
        );
    });

    test('[origin] and [destination] with valid types do not throw', () => {
        assert.doesNotThrow(() =>
            relation(() => ({ Direct: { from: String, to: String } }))
                .ops(({ fold, origin, destination }) => ({
                    [origin]:      fold({ out: String })({ Direct: ({ from }) => from }),
                    [destination]: fold({ out: String })({ Direct: ({ to }) => to })
                }))
        );
    });
});

// ---- 7. query() — Nothing guards ---------------------------------------

describe('query() — Nothing guards', () => {
    test('[output] referencing a Nothing-typed field throws', () => {
        assert.throws(
            () => query(self => ({
                value: Nothing,
                next: self
            })).ops(({ unfold, output, done, accept, Self }) => ({
                [output]: 'value',
                [done]:   'value',
                [accept]: 'value',
                Step: unfold({ in: Number, out: Self })({
                    value: (_n: number) => { throw new Error('unreachable'); },
                    next: (n: number) => n + 1
                })
            })),
            /Nothing is the bottom type/
        );
    });

    test('[done] referencing a Nothing-typed field throws', () => {
        assert.throws(
            () => query(self => ({
                current: Number,
                flag: Nothing,
                next: self
            })).ops(({ unfold, output, done, accept, Self }) => ({
                [output]: 'current',
                [done]:   'flag',
                [accept]: 'flag',
                Step: unfold({ in: Number, out: Self })({
                    current: (n: number) => n,
                    flag: (_n: number) => { throw new Error('unreachable'); },
                    next: (n: number) => n + 1
                })
            })),
            /Nothing is the bottom type/
        );
    });

    test('[output]/[done]/[accept] with valid types do not throw', () => {
        assert.doesNotThrow(() =>
            query(self => ({
                value:  Number,
                isDone: Boolean,
                isOk:   Boolean,
                next:   self
            })).ops(({ unfold, output, done, accept, Self }) => ({
                [output]: 'value',
                [done]:   'isDone',
                [accept]: 'isOk',
                Step: unfold({ in: Number, out: Self })({
                    value:  (n: number) => n,
                    isDone: (n: number) => n >= 3,
                    isOk:   () => true,
                    next:   (n: number) => n + 1
                })
            }))
        );
    });
});

// ---- 8. Observer variance with Any / Nothing --------------------------------

describe('behavior observer variance — Any/Nothing as lattice bounds', () => {
    test('parent observer Any, child observer Number (covariant narrowing) — allowed', () => {
        const Base = behavior(self => ({ value: Any, next: self }));
        assert.doesNotThrow(() =>
            behavior(self => ({ [extend]: Base, value: Number, next: self }))
        );
    });

    test('parent observer Number, child observer Any (covariant widening) — rejected', () => {
        const Base = behavior(self => ({ value: Number, next: self }));
        assert.throws(
            () => behavior(self => ({ [extend]: Base, value: Any, next: self })),
            /Cannot narrow observer 'value'/
        );
    });

    test('parent observer Any, child observer Nothing (covariant narrowing to bottom) — allowed', () => {
        const Base = behavior(self => ({ value: Any, next: self }));
        assert.doesNotThrow(() =>
            behavior(self => ({ [extend]: Base, value: Nothing, next: self }))
        );
    });

    test('parent observer Nothing, child observer Number (only Nothing ≤ Nothing) — rejected', () => {
        const Base = behavior(self => ({ value: Nothing, next: self }));
        assert.throws(
            () => behavior(self => ({ [extend]: Base, value: Number, next: self })),
            /Cannot narrow observer 'value'/
        );
    });

    test('parent parametric out: Any, child out: Number — allowed', () => {
        const Base = behavior(self => ({ value: { out: Any }, next: self }));
        assert.doesNotThrow(() =>
            behavior(self => ({ [extend]: Base, value: { out: Number }, next: self }))
        );
    });

    test('parent parametric out: Number, child out: Any — rejected', () => {
        const Base = behavior(self => ({ value: { out: Number }, next: self }));
        assert.throws(
            () => behavior(self => ({ [extend]: Base, value: { out: Any }, next: self })),
            /Cannot narrow 'out' of observer 'value'/
        );
    });

    test('parent parametric in: Number, child in: Any (contravariant widening) — allowed', () => {
        const Base = behavior(self => ({ value: { in: Number, out: Number }, next: self }));
        assert.doesNotThrow(() =>
            behavior(self => ({ [extend]: Base, value: { in: Any, out: Number }, next: self }))
        );
    });

    test('parent parametric in: Any, child in: Number (contravariant narrowing) — rejected', () => {
        const Base = behavior(self => ({ value: { in: Any, out: Number }, next: self }));
        assert.throws(
            () => behavior(self => ({ [extend]: Base, value: { in: Number, out: Number }, next: self })),
            /Cannot narrow 'in' of observer 'value'/
        );
    });
});

// ---- 9. data field narrowing — Any/Nothing as lattice bounds ------------------

describe('data field narrowing — Any/Nothing as lattice bounds', () => {

    test('parent field Any, child field Number — allowed (Number ≤ Any)', () => {
        const Base = data(() => ({ Box: { value: Any } }));
        assert.doesNotThrow(() =>
            data(() => ({ [extend]: Base, Box: { value: Number } })).ops(() => ({}))
        );
    });

    test('parent field Number, child field Any — rejected (Any ⊄ Number)', () => {
        const Base = data(() => ({ Box: { value: Number } }));
        assert.throws(
            () => data(() => ({ [extend]: Base, Box: { value: Any } })).ops(() => ({})),
            /Cannot narrow field 'value'/
        );
    });

    test('parent field Any, child field Nothing — allowed (Nothing ≤ Any)', () => {
        const Base = data(() => ({ Box: { value: Any } }));
        assert.doesNotThrow(() =>
            data(() => ({ [extend]: Base, Box: { value: Nothing } })).ops(() => ({}))
        );
    });

    test('parent field Nothing, child field Number — rejected (Number ⊄ Nothing)', () => {
        const Base = data(() => ({ Box: { value: Nothing } }));
        assert.throws(
            () => data(() => ({ [extend]: Base, Box: { value: Number } })).ops(() => ({})),
            /Cannot narrow field 'value'/
        );
    });

    test('parent field Any, child field Any — allowed (identity)', () => {
        const Base = data(() => ({ Box: { value: Any } }));
        assert.doesNotThrow(() =>
            data(() => ({ [extend]: Base, Box: { value: Any } })).ops(() => ({}))
        );
    });

    test('parent field Nothing, child field Nothing — allowed (identity)', () => {
        const Base = data(() => ({ Box: { value: Nothing } }));
        assert.doesNotThrow(() =>
            data(() => ({ [extend]: Base, Box: { value: Nothing } })).ops(() => ({}))
        );
    });
});
