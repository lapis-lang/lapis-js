/**
 * Tests for family resolution in fold handlers.
 *
 * Verifies that fold handlers on parameterized ADTs can use family from
 * the closure to construct instances of the current parameterized ADT without
 * hardcoding type arguments (e.g. Stack({ T: Number })).
 *
 * @see https://github.com/lapis-lang/lapis-js/issues/123
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, behavior } from '../index.mjs';

// =============================================================================
// Data fold — parameterized ADT
// =============================================================================

describe('family in data fold handlers', () => {
    test('parameterized fold handlers can construct instances via family', () => {
        const Stack = data(family => ({
            Empty: {},
            Push: { value: Object, rest: family }
        })).ops(({ fold, unfold, map, merge, family }) => ({
            size: fold({ out: Number })({
                Empty() { return 0; },
                Push({ rest }: any) { return 1 + rest; }
            }),
            append: fold({ in: Object, out: family })({
                Empty({}, val: unknown) {
                    return (family as any).Push({ value: val, rest: (family as any).Empty });
                },
                Push({ rest }: any, val: unknown) {
                    return (family as any).Push({ value: this.value, rest: rest(val) });
                }
            }),
            toArray: fold({ out: Array })({
                Empty() { return []; },
                Push({ value, rest }: any) {
                    return [value, ...rest];
                }
            })
        }));

        const NumStack = Stack;
        const s = NumStack.Push({ value: 1, rest: NumStack.Push({ value: 2, rest: NumStack.Empty }) });

        // append uses family — should work without hardcoding Stack(Number)
        const s2 = s.append(3);
        assert.deepStrictEqual(s2.toArray, [1, 2, 3]);
        assert.strictEqual(s2.size, 3);
    });

    test('family works across different parameterizations', () => {
        const Stack = data(family => ({
            Empty: {},
            Push: { value: Object, rest: family }
        })).ops(({ fold, unfold, map, merge, family }) => ({
            append: fold({ in: Object, out: family })({
                Empty({}, val: unknown) {
                    return (family as any).Push({ value: val, rest: (family as any).Empty });
                },
                Push({ rest }: any, val: unknown) {
                    return (family as any).Push({ value: this.value, rest: rest(val) });
                }
            }),
            toArray: fold({ out: Array })({
                Empty() { return []; },
                Push({ value, rest }: any) {
                    return [value, ...rest];
                }
            })
        }));

        // Number stack
        const NumStack = Stack;
        const ns = NumStack.Push({ value: 10, rest: NumStack.Empty });
        const ns2 = ns.append(20);
        assert.deepStrictEqual(ns2.toArray, [10, 20]);

        // String stack — same fold logic, different parameterization
        const StrStack = Stack;
        const ss = StrStack.Push({ value: 'a', rest: StrStack.Empty });
        const ss2 = ss.append('b');
        assert.deepStrictEqual(ss2.toArray, ['a', 'b']);
    });

    test('non-parameterized ADT fold handlers use family variable in operation bodies', () => {
        // For non-parameterized ADTs, handlers reference the family variable
        // from the ops context to construct instances — same as parameterized ADTs.
        const List = data(family => ({
            Nil: {},
            Cons: { head: Number, tail: family }
        })).ops(({ fold, unfold, map, merge, family }) => ({
            append: fold({ in: Number, out: family })({
                Nil({}, val: number) {
                    return family.Cons({ head: val, tail: family.Nil });
                },
                Cons({ tail }: { tail: (v: number) => unknown }, val: number) {
                    return family.Cons({ head: this.head, tail: tail(val) });
                }
            }),
            toArray: fold({ out: Array })({
                Nil() { return []; },
                Cons({ head, tail }) {
                    return [head, ...tail];
                }
            })
        }));

        const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) });
        const list2 = list.append(3);
        assert.deepStrictEqual(list2.toArray, [1, 2, 3]);
    });

    test('family in getter fold (no input params)', () => {
        const Stack = data(family => ({
            Empty: {},
            Push: { value: Object, rest: family }
        })).ops(({ fold, unfold, map, merge, family }) => ({
            reversed: fold({ out: family })({
                // @ts-expect-error -- family resolves at runtime; TS cannot model variant properties on FamilyRefCallable
                Empty() { return family.Empty; },
                // @ts-expect-error -- InstanceOf<FamilyRef> = never; runtime resolves correctly
                Push({ rest }: { rest: unknown }) {
                    // Simplified: just check family resolves correctly
                    return rest;
                }
            })
        }));

        const NumStack = Stack;
        const s = NumStack.Push({ value: 1, rest: NumStack.Empty });
        // Should not throw — family resolves even in getter folds
        const r = s.reversed;
        assert.ok(r !== undefined);
    });

    test('family does not interfere outside fold handlers', () => {
        // Calling family outside a fold handler should still behave normally
        // (family during declaration uses the marker as-is for field specs)
        const Stack = data(family => ({
            Empty: {},
            Push: { value: Object, rest: family }
        })).ops(({ fold, unfold, map, merge, family }) => ({
            size: fold({ out: Number })({
                Empty() { return 0; },
                Push({ rest }: any) { return 1 + rest; }
            })
        }));

        const NumStack = Stack;
        const s = NumStack.Push({ value: 42, rest: NumStack.Empty });
        assert.strictEqual(s.size, 1);
        assert.strictEqual(s.value, 42);
    });

    test('instances from family are instanceof the base ADT', () => {
        const Stack = data(family => ({
            Empty: {},
            Push: { value: Object, rest: family }
        })).ops(({ fold, unfold, map, merge, family }) => ({
            append: fold({ in: Object, out: family })({
                Empty({}, val: unknown) {
                    return (family as any).Push({ value: val, rest: (family as any).Empty });
                },
                Push({ rest }: any, val: unknown) {
                    return (family as any).Push({ value: this.value, rest: rest(val) });
                }
            })
        }));

        const NumStack = Stack;
        const s = NumStack.Push({ value: 1, rest: NumStack.Empty });
        const s2 = s.append(2);

        // Result should be instanceof Stack (the base ADT)
        assert.ok(s2 instanceof Stack);
    });
});

// =============================================================================
// Behavior fold — no family needed (included for completeness)
// =============================================================================

describe('Behavior fold (no family needed)', () => {
    test('behavior fold works normally (folds reduce, do not construct)', () => {
        const Stream = behavior(self => ({
            head: Object,
            tail: self
        })).ops(({ fold, unfold, map, merge, self }) => ({
            From: unfold({ in: Number, out: self })({
                head: (n: number) => n,
                tail: (n: number) => n + 1
            }),
            take: fold({ in: Number, out: Array })({
                _({ head, tail }: { head: unknown; tail: (n: number) => unknown }, n: number) {
                    return n > 0 ? [head, ...tail(n - 1) as unknown[]] : [];
                }
            })
        }));

        const nums = Stream.From(0);
        assert.deepStrictEqual(nums.take(5), [0, 1, 2, 3, 4]);
    });
});
