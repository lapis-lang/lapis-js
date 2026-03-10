/**
 * Tests for Family(T) resolution in fold handlers.
 *
 * Verifies that fold handlers on parameterized ADTs can use Family(T) from
 * the closure to construct instances of the current parameterized ADT without
 * hardcoding type arguments (e.g. Stack(Number)).
 *
 * @see https://github.com/lapis-lang/lapis-js/issues/123
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, fold, unfold, behavior } from '../index.mjs';

// =============================================================================
// Data fold — parameterized ADT
// =============================================================================

describe('Family(T) in data fold handlers', () => {
    test('parameterized fold handlers can construct instances via Family(T)', () => {
        const Stack = data(({ Family, T }) => ({
            Empty: {},
            Push: { value: T, rest: Family(T) },

            size: fold({ out: Number })({
                Empty() { return 0; },
                Push({ rest }: { rest: number }) { return 1 + rest; }
            }),

            append: fold({ in: T, out: Family })({
                // @ts-expect-error -- Family(T) resolves at runtime; TS cannot model variant properties on FamilyRefCallable
                Empty({}, val: unknown) {
                    return (Family(T) as any).Push({ value: val, rest: (Family(T) as any).Empty });
                },
                // @ts-expect-error -- Family(T) resolves at runtime; TS cannot model variant properties on FamilyRefCallable
                Push({ rest }: { rest: (v: unknown) => unknown }, val: unknown) {
                    return (Family(T) as any).Push({ value: this.value, rest: rest(val) });
                }
            }),

            toArray: fold({ out: Array })({
                Empty() { return []; },
                Push({ value, rest }: { value: unknown; rest: unknown[] }) {
                    return [value, ...rest];
                }
            })
        }));

        const NumStack = Stack(Number);
        const s = NumStack.Push({ value: 1, rest: NumStack.Push({ value: 2, rest: NumStack.Empty }) });

        // append uses Family(T) — should work without hardcoding Stack(Number)
        const s2 = s.append(3);
        assert.deepStrictEqual(s2.toArray, [1, 2, 3]);
        assert.strictEqual(s2.size, 3);
    });

    test('Family(T) works across different parameterizations', () => {
        const Stack = data(({ Family, T }) => ({
            Empty: {},
            Push: { value: T, rest: Family(T) },

            append: fold({ in: T, out: Family })({
                // @ts-expect-error -- Family(T) resolves at runtime; TS cannot model variant properties on FamilyRefCallable
                Empty({}, val: unknown) {
                    return (Family(T) as any).Push({ value: val, rest: (Family(T) as any).Empty });
                },
                // @ts-expect-error -- Family(T) resolves at runtime; TS cannot model variant properties on FamilyRefCallable
                Push({ rest }: { rest: (v: unknown) => unknown }, val: unknown) {
                    return (Family(T) as any).Push({ value: this.value, rest: rest(val) });
                }
            }),

            toArray: fold({ out: Array })({
                Empty() { return []; },
                Push({ value, rest }: { value: unknown; rest: unknown[] }) {
                    return [value, ...rest];
                }
            })
        }));

        // Number stack
        const NumStack = Stack(Number);
        const ns = NumStack.Push({ value: 10, rest: NumStack.Empty });
        const ns2 = ns.append(20);
        assert.deepStrictEqual(ns2.toArray, [10, 20]);

        // String stack — same fold logic, different parameterization
        const StrStack = Stack(String);
        const ss = StrStack.Push({ value: 'a', rest: StrStack.Empty });
        const ss2 = ss.append('b');
        assert.deepStrictEqual(ss2.toArray, ['a', 'b']);
    });

    test('non-parameterized ADT fold handlers use ADT variable directly', () => {
        // For non-parameterized ADTs, handlers reference the ADT variable
        // from outer scope — no Family(T) needed.
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },

            append: fold({ in: Number, out: Family })({
                // @ts-expect-error -- InstanceOf<FamilyRef> = never; runtime resolves correctly
                Nil({}, val: number) {
                    return List.Cons({ head: val, tail: List.Nil });
                },
                // @ts-expect-error -- InstanceOf<FamilyRef> = never; runtime resolves correctly
                Cons({ tail }: { tail: (v: number) => unknown }, val: number) {
                    return List.Cons({ head: this.head, tail: tail(val) });
                }
            }),

            toArray: fold({ out: Array })({
                Nil() { return []; },
                Cons({ head, tail }: { head: number; tail: number[] }) {
                    return [head, ...tail];
                }
            })
        }));

        const list = List.Cons({ head: 1, tail: List.Cons({ head: 2, tail: List.Nil }) });
        const list2 = list.append(3);
        assert.deepStrictEqual(list2.toArray, [1, 2, 3]);
    });

    test('Family(T) in getter fold (no input params)', () => {
        const Stack = data(({ Family, T }) => ({
            Empty: {},
            Push: { value: T, rest: Family(T) },

            reversed: fold({ out: Family })({
                // @ts-expect-error -- Family(T) resolves at runtime; TS cannot model variant properties on FamilyRefCallable
                Empty() { return Family(T).Empty; },
                // @ts-expect-error -- InstanceOf<FamilyRef> = never; runtime resolves correctly
                Push({ rest }: { rest: unknown }) {
                    // Simplified: just check Family(T) resolves correctly
                    return rest;
                }
            })
        }));

        const NumStack = Stack(Number);
        const s = NumStack.Push({ value: 1, rest: NumStack.Empty });
        // Should not throw — Family(T) resolves even in getter folds
        const r = s.reversed;
        assert.ok(r !== undefined);
    });

    test('Family(T) does not interfere outside fold handlers', () => {
        // Calling Family(T) outside a fold handler should still behave normally
        // (Family(T) during declaration uses the marker as-is for field specs)
        const Stack = data(({ Family, T }) => ({
            Empty: {},
            Push: { value: T, rest: Family(T) },

            size: fold({ out: Number })({
                Empty() { return 0; },
                Push({ rest }: { rest: number }) { return 1 + rest; }
            })
        }));

        const NumStack = Stack(Number);
        const s = NumStack.Push({ value: 42, rest: NumStack.Empty });
        assert.strictEqual(s.size, 1);
        assert.strictEqual(s.value, 42);
    });

    test('instances from Family(T) are instanceof the base ADT', () => {
        const Stack = data(({ Family, T }) => ({
            Empty: {},
            Push: { value: T, rest: Family(T) },

            append: fold({ in: T, out: Family })({
                // @ts-expect-error -- Family(T) resolves at runtime; TS cannot model variant properties on FamilyRefCallable
                Empty({}, val: unknown) {
                    return (Family(T) as any).Push({ value: val, rest: (Family(T) as any).Empty });
                },
                // @ts-expect-error -- Family(T) resolves at runtime; TS cannot model variant properties on FamilyRefCallable
                Push({ rest }: { rest: (v: unknown) => unknown }, val: unknown) {
                    return (Family(T) as any).Push({ value: this.value, rest: rest(val) });
                }
            })
        }));

        const NumStack = Stack(Number);
        const s = NumStack.Push({ value: 1, rest: NumStack.Empty });
        const s2 = s.append(2);

        // Result should be instanceof Stack (the base ADT)
        assert.ok(s2 instanceof Stack);
    });
});

// =============================================================================
// Behavior fold — no Family(T) needed (included for completeness)
// =============================================================================

describe('Behavior fold (no Family(T) needed)', () => {
    test('behavior fold works normally (folds reduce, do not construct)', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T),
            From: unfold({ in: Number, out: Self })({
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
