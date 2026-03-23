/**
 * Structured Fold Input Types — Tests
 *
 * Verifies that `fold({ in: { key: Guard, ... }, out: ... })` validates
 * the caller-supplied options bag structurally at runtime.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { data } from '../index.mjs';
import { List } from '../std/data/List.mjs';
import { Maybe } from '../std/data/Maybe.mjs';

// ── List foldMap ──────────────────────────────────────────────────────────────

describe('structured fold input (foldMap)', () => {
    const NumList = List({ T: Number });

    // A monoid that collects values into an array — arrays are Objects,
    // so they pass the `out: Object` return-type guard.
    const ArrayM = {
        Identity: [] as number[],
        combine: function (this: number[], b: number[]) { return [...this, ...b]; }
    };

    it('accepts a well-formed { monoid, f } options bag', () => {
        const list = NumList.Cons({ head: 1, tail: NumList.Cons({ head: 2, tail: NumList.Nil }) });

        const result = (list as any).foldMap({ monoid: ArrayM, f: (x: number) => [x] });
        assert.deepStrictEqual(result, [1, 2]);
    });

    it('throws TypeError when `monoid` key is missing', () => {
        const list = NumList.Cons({ head: 1, tail: NumList.Nil });
        assert.throws(

            () => (list as any).foldMap({ f: (x: number) => x }),
            (err: unknown) => {
                assert.ok(err instanceof TypeError);
                assert.ok(
                    (err as TypeError).message.includes("'monoid'"),
                    `Expected error to mention 'monoid', got: ${(err as TypeError).message}`
                );
                return true;
            }
        );
    });

    it('throws TypeError when `f` key is missing', () => {
        const list = NumList.Cons({ head: 1, tail: NumList.Nil });
        assert.throws(

            () => (list as any).foldMap({ monoid: ArrayM }),
            (err: unknown) => {
                assert.ok(err instanceof TypeError);
                assert.ok(
                    (err as TypeError).message.includes("'f'"),
                    `Expected error to mention 'f', got: ${(err as TypeError).message}`
                );
                return true;
            }
        );
    });

    it('throws TypeError when a non-object is passed instead of options bag', () => {
        const list = NumList.Cons({ head: 1, tail: NumList.Nil });
        assert.throws(

            () => (list as any).foldMap('not-an-object'),
            (err: unknown) => {
                assert.ok(err instanceof TypeError, `Expected TypeError, got ${(err as Error).message}`);
                return true;
            }
        );
    });
});

// ── Maybe foldMap ─────────────────────────────────────────────────────────────

describe('structured fold input (Maybe.foldMap)', () => {
    const NumMaybe = Maybe({ T: Number });

    // Array monoid: Identity is [] (an Object), combine concatenates arrays.
    const ArrayM = {
        Identity: [] as number[],
        combine: function (this: number[], b: number[]) { return [...this, ...b]; }
    };

    it('foldMap on Just returns f(value)', () => {
        const just = NumMaybe.Just({ value: 5 });

        const result = (just as any).foldMap({ monoid: ArrayM, f: (x: number) => [x * 2] });
        assert.deepStrictEqual(result, [10]);
    });

    it('foldMap on Nothing returns monoid.Identity', () => {
        const nothing = NumMaybe.Nothing;

        const result = (nothing as any).foldMap({ monoid: ArrayM, f: (x: number) => [x] });
        assert.deepStrictEqual(result, []);
    });

    it('throws TypeError when `f` is missing', () => {
        const just = NumMaybe.Just({ value: 1 });
        assert.throws(

            () => (just as any).foldMap({ monoid: ArrayM }),
            (err: unknown) => {
                assert.ok(err instanceof TypeError);
                assert.ok(
                    (err as TypeError).message.includes("'f'"),
                    `Expected error to mention 'f', got: ${(err as TypeError).message}`
                );
                return true;
            }
        );
    });
});

// ── Custom fold with object-literal in guard ──────────────────────────────────

describe('structured fold input (custom ADT)', () => {
    const Shape = data(() => ({
        Circle: { radius: Number },
        Rect:   { width: Number, height: Number }
    })).ops(({ fold }) => ({
        // Custom multi-field options bag
        scale: fold({ in: { factor: Number, offset: Number }, out: Number })({
            Circle({ radius }: { radius: number }, opts: unknown) {
                const { factor, offset } = opts as { factor: number; offset: number };
                return radius * factor + offset;
            },
            Rect({ width, height }: { width: number; height: number }, opts: unknown) {
                const { factor, offset } = opts as { factor: number; offset: number };
                return (width + height) * factor + offset;
            }
        })
    }));

    it('validates structured input and returns correct result', () => {
        const c = Shape.Circle({ radius: 3 });

        assert.strictEqual((c as any).scale({ factor: 2, offset: 1 }), 7);
    });

    it('throws TypeError when a required field is missing', () => {
        const c = Shape.Circle({ radius: 3 });
        assert.throws(

            () => (c as any).scale({ factor: 2 }), // missing `offset`
            (err: unknown) => {
                assert.ok(err instanceof TypeError);
                assert.ok(
                    (err as TypeError).message.includes("'offset'"),
                    `Expected error to mention 'offset', got: ${(err as TypeError).message}`
                );
                return true;
            }
        );
    });

    it('throws TypeError when `factor` has wrong type (string instead of Number)', () => {
        const c = Shape.Circle({ radius: 3 });
        assert.throws(

            () => (c as any).scale({ factor: 'two', offset: 0 }),
            (err: unknown) => {
                assert.ok(err instanceof TypeError);
                assert.ok(
                    (err as TypeError).message.includes("'factor'") ||
                    (err as TypeError).message.includes('Number'),
                    `Expected error to mention 'factor' or 'Number', got: ${(err as TypeError).message}`
                );
                return true;
            }
        );
    });

    it('throws TypeError when a non-object is passed', () => {
        const c = Shape.Circle({ radius: 3 });
        assert.throws(

            () => (c as any).scale(42),
            (err: unknown) => {
                assert.ok(err instanceof TypeError);
                return true;
            }
        );
    });
});
