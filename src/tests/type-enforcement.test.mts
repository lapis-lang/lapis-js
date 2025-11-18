import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

describe('Type Enforcement for { out: R } Spec', () => {
    describe('Fold Operations', () => {
        test('should enforce Number return type at compile time', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
                .fold('length', { out: Number }, {
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                });

            const list = List.Cons({ head: 1, tail: List.Nil });
            const result = list.length();

            // ✅ Should compile - correct type
            const _correctType: number = result;
            assert.strictEqual(typeof _correctType, 'number');

            // ❌ Should NOT compile - wrong type
            // @ts-expect-error - Type 'number' is not assignable to type 'string'
            const _wrongType1: string = result;

            // @ts-expect-error - Type 'number' is not assignable to type 'boolean'
            const _wrongType2: boolean = result;

            // Suppress unused variable warnings
            void _wrongType1;
            void _wrongType2;
        });

        test('should enforce Boolean return type at compile time', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
                .fold('isEmpty', { out: Boolean }, {
                    Nil() { return true; },
                    Cons() { return false; }
                });

            const result = List.Nil.isEmpty();

            // ✅ Should compile - correct type
            const _correctType: boolean = result;
            assert.strictEqual(typeof _correctType, 'boolean');

            // ❌ Should NOT compile - wrong type
            // @ts-expect-error - Type 'boolean' is not assignable to type 'number'
            const _wrongType: number = result;

            void _wrongType;
        });

        test('should enforce String return type at compile time', () => {
            const Tree = data(({ Family }) => ({
                Leaf: [{ value: Number }],
                Node: [{ left: Family }, { right: Family }]
            }))
                .fold('describe', { out: String }, {
                    Leaf({ value }) { return 'Leaf(' + value + ')'; },
                    Node() { return 'Node'; }
                });

            const result = Tree.Leaf({ value: 42 }).describe();

            // ✅ Should compile - correct type
            const _correctType: string = result;
            assert.strictEqual(typeof _correctType, 'string');

            // ❌ Should NOT compile - wrong type
            // @ts-expect-error - Type 'string' is not assignable to type 'number'
            const _wrongType: number = result;

            void _wrongType;
        });

        test('should enforce custom class return type at compile time', () => {
            class Result {
                constructor(public value: number) { }
            }

            const Peano = data(({ Family }) => ({
                Zero: [],
                Succ: [{ pred: Family }]
            }))
                .fold('toResult', { out: Result }, {
                    Zero() { return new Result(0); },
                    Succ({ pred }) { return new Result(pred.value + 1); }
                });

            const result = Peano.Zero.toResult();

            // ✅ Should compile - correct type
            const _correctType: Result = result;
            assert.ok(_correctType instanceof Result);

            // ❌ Should NOT compile - wrong type
            // @ts-expect-error - Type 'Result' is not assignable to type 'number'
            const _wrongType: number = result;

            void _wrongType;
        });
    });

    describe('Match Operations', () => {
        test('should enforce Boolean return type at compile time', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('isPrimary', { out: Boolean }, {
                    Red() { return true; },
                    Green() { return true; },
                    Blue() { return true; }
                });

            const result = Color.Red.isPrimary();

            // ✅ Should compile - correct type
            const _correctType: boolean = result;
            assert.strictEqual(typeof _correctType, 'boolean');

            // ❌ Should NOT compile - wrong type
            // @ts-expect-error - Type 'boolean' is not assignable to type 'string'
            const _wrongType: string = result;

            void _wrongType;
        });

        test('should enforce String return type at compile time', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            const result = Color.Red.toHex();

            // ✅ Should compile - correct type
            const _correctType: string = result;
            assert.strictEqual(typeof _correctType, 'string');

            // ❌ Should NOT compile - wrong type
            // @ts-expect-error - Type 'string' is not assignable to type 'number'
            const _wrongType: number = result;

            void _wrongType;
        });

        test('should enforce Number return type at compile time', () => {
            const Point = data({
                Point2D: [{ x: Number }, { y: Number }]
            })
                .match('magnitude', { out: Number }, {
                    Point2D({ x, y }) { return Math.sqrt(x * x + y * y); }
                });

            const result = Point.Point2D({ x: 3, y: 4 }).magnitude();

            // ✅ Should compile - correct type
            const _correctType: number = result;
            assert.strictEqual(typeof _correctType, 'number');

            // ❌ Should NOT compile - wrong type
            // @ts-expect-error - Type 'number' is not assignable to type 'boolean'
            const _wrongType: boolean = result;

            void _wrongType;
        });
    });

    describe('Multiple Operations Type Enforcement', () => {
        test('should enforce different return types for different operations', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
                .match('isEmpty', { out: Boolean }, {
                    Nil() { return true; },
                    Cons() { return false; }
                })
                .fold('length', { out: Number }, {
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                })
                .fold('describe', { out: String }, {
                    Nil() { return 'empty list'; },
                    Cons({ head, tail }) { return head + ', ' + tail; }
                });

            const list = List.Cons({ head: 1, tail: List.Nil });

            // ✅ All correct types
            const isEmpty: boolean = list.isEmpty();
            const length: number = list.length();
            const description: string = list.describe();

            assert.strictEqual(typeof isEmpty, 'boolean');
            assert.strictEqual(typeof length, 'number');
            assert.strictEqual(typeof description, 'string');

            // ❌ Cross-type assignments should fail
            // @ts-expect-error - Type 'boolean' is not assignable to type 'number'
            const _wrong1: number = list.isEmpty();

            // @ts-expect-error - Type 'number' is not assignable to type 'boolean'
            const _wrong2: boolean = list.length();

            // @ts-expect-error - Type 'string' is not assignable to type 'number'
            const _wrong3: number = list.describe();

            void _wrong1;
            void _wrong2;
            void _wrong3;
        });
    });

    describe('Fold Only Available for Recursive ADTs', () => {
        test('fold should not be available on non-recursive ADTs', () => {
            const Color = data({ Red: [], Green: [], Blue: [] });

            // TypeScript should not allow calling fold on non-recursive ADT
            // @ts-expect-error - Property 'fold' does not exist on non-recursive ADT
            Color.fold('toValue', { out: Number }, {
                Red() { return 1; },
                Green() { return 2; },
                Blue() { return 3; }
            });
        });

        test('fold should be available on recursive ADTs', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }))
                .fold('length', { out: Number }, {
                    Nil() { return 0; },
                    Cons({ tail }) { return 1 + tail; }
                });

            // Should work fine
            const result = List.Cons({ head: 1, tail: List.Nil }).length();
            assert.strictEqual(result, 1);
        });
    });

    describe('ExtendMatch Only Available for Extended ADTs', () => {
        test('extendMatch should not be available on base ADTs', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            // TypeScript should not allow calling extendMatch on base ADT
            // We can't actually call it since it's a compile-time error
            // @ts-expect-error - Property 'extendMatch' does not exist on base ADT
            const _preventCompile = Color.extendMatch;
            void _preventCompile; // Suppress unused warning
        });

        test('extendMatch should be available on extended ADTs', () => {
            const Color = data({ Red: [], Green: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; }
                });

            const ExtendedColor = Color.extend({ Blue: [] });

            // Should work fine on extended ADT
            const result = ExtendedColor.extendMatch('toHex', {
                Blue() { return '#0000FF'; }
            });

            assert.strictEqual(result.Blue.toHex(), '#0000FF');
        });
    });

    describe('Primitive Constructor Mapping', () => {
        test('Number constructor should map to number primitive type', () => {
            const ADT = data({ Value: [] })
                .match('getValue', { out: Number }, {
                    Value() { return 42; }
                });

            const result = ADT.Value.getValue();

            // Should infer as 'number' primitive type
            const _primitiveType: number = result;
            assert.strictEqual(typeof _primitiveType, 'number');

            // Verify it's the primitive, not the wrapper
            assert.strictEqual(typeof result, 'number');
            assert.ok(typeof result !== 'object');
        });

        test('String constructor should map to string primitive type', () => {
            const ADT = data({ Value: [] })
                .match('getValue', { out: String }, {
                    Value() { return 'hello'; }
                });

            const result = ADT.Value.getValue();

            // Should infer as 'string' primitive type
            const _primitiveType: string = result;
            assert.strictEqual(typeof _primitiveType, 'string');

            // Verify it's the primitive, not the wrapper
            assert.strictEqual(typeof result, 'string');
            assert.ok(typeof result !== 'object');
        });

        test('Boolean constructor should map to boolean primitive type', () => {
            const ADT = data({ Value: [] })
                .match('getValue', { out: Boolean }, {
                    Value() { return true; }
                });

            const result = ADT.Value.getValue();

            // Should infer as 'boolean' primitive type
            const _primitiveType: boolean = result;
            assert.strictEqual(typeof _primitiveType, 'boolean');

            // Verify it's the primitive, not the wrapper
            assert.strictEqual(typeof result, 'boolean');
            assert.ok(typeof result !== 'object');
        });
    });
});
