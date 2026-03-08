import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, extend , fold } from '../index.mjs';

describe('LSP Enforcement', () => {
    test('should prevent changing parameterless to parameterized', () => {
        const Point = data(() => ({
            Point2D: { x: Number, y: Number },
            magnitude: fold({ out: Number })({
                Point2D({ x, y }) { return Math.sqrt(x * x + y * y); }
            })
        }));

        assert.throws(
            () => {
                data(() => ({
                    [extend]: Point,
                    Point3D: { x: Number, y: Number, z: Number },
                    magnitude: fold({ in: String, out: Number })({
                        Point3D({ x, y, z }, _unit) { return Math.sqrt(x * x + y * y + z * z); },
                        Point2D({ x, y }, _unit) { return Math.sqrt(x * x + y * y); }
                    })
                }));
            },
            {
                name: 'Error',
                message: /Cannot change operation 'magnitude' from parameterless \(getter\) to parameterized \(method\)/
            }
        );
    });

    test('should prevent changing parameterized to parameterless', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },
            append: fold({ in: Number })({
                Nil({}, val) { return List.Cons({ head: val, tail: List.Nil }); },
                Cons({ head, tail }, val) { return List.Cons({ head, tail: tail(val) }); }
            })
        }));

        // Try to override ALL handlers with parameterless versions
        assert.throws(
            () => {
                data(({ Family }) => ({
                    [extend]: List,
                    append: fold({ out: Family })({
                        // @ts-expect-error -- intentional type violation for test
                        Nil({}) { return List.Nil; },
                        // @ts-expect-error -- intentional type violation for test
                        Cons({ head, tail }) { return List.Cons({ head, tail }); }
                    })
                }));
            },
            {
                name: 'Error',
                message: /Cannot change operation 'append' from parameterized \(method\) to parameterless \(getter\)/
            }
        );
    });

    test('should allow extending with same parameterization (parameterless)', () => {
        const Color = data(() => ({
            Red: {},
            Green: {},
            toHex: fold({ out: String })({
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; }
            })
        }));

        // This should work - same parameterization
        const ExtendedColor = data(() => ({
            [extend]: Color,
            Blue: {},
            toHex: fold({})({
                Blue() { return '#0000FF'; }
            })
        }));

        assert.strictEqual(ExtendedColor.Blue.toHex, '#0000FF');
        assert.strictEqual(ExtendedColor.Red.toHex, '#FF0000');
    });

    test('should allow extending with same parameterization (parameterized)', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },
            append: fold({ in: Number })({
                Nil({}, val) { return List.Cons({ head: val, tail: List.Nil }); },
                Cons({ head, tail }, val) { return List.Cons({ head, tail: tail(val) }); }
            })
        }));

        // This should work - same parameterization (all handlers take 2 params)
        const ExtendedList = data(({ Family }) => ({
            [extend]: List,
            Special: { value: Number },
            append: fold({})({
                // @ts-expect-error -- intentional type violation for test
                Special({ value }, val) { 
                    // Just return a simple list with the Special's value and appended val
                    const tailList = List.Cons({ head: val, tail: List.Nil });
                    return List.Cons({ head: value, tail: tailList }); 
                }
            })
        }));

        const special = ExtendedList.Special({ value: 42 });
        const result = special.append(99);
        
        assert.strictEqual(result.constructor.name, 'Cons');
        assert.strictEqual(result.head, 42);
        assert.strictEqual(result.tail.head, 99);
    });

    test('should prevent changing input spec when extending', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },
            append: fold({ in: Number })({
                Nil({}, val) { return List.Cons({ head: val, tail: List.Nil }); },
                Cons({ head, tail }, val) { return List.Cons({ head, tail: tail(val) }); }
            })
        }));

        // Try to change the input spec
        assert.throws(
            () => {
                data(({ Family }) => ({
                    [extend]: List,
                    Special: { value: Number },
                    append: fold({ in: String })({
                        Special({ value }, val) { 
                            return List.Cons({ head: value, tail: List.Nil }); 
                        }
                    })
                }));
            },
            {
                name: 'Error',
                message: /Cannot change operation 'append' input specification when extending/
            }
        );
    });

    test('should prevent changing output spec when extending', () => {
        const Color = data(() => ({
            Red: {},
            Green: {},
            Blue: {},
            toHex: fold({ out: String })({
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; }
            })
        }));

        // Try to change the output spec
        assert.throws(
            () => {
                data(() => ({
                    [extend]: Color,
                    Yellow: {},
                    toHex: fold({ out: Number })({
                        Yellow() { return 0xFFFF00; }
                    })
                }));
            },
            {
                name: 'Error',
                message: /Cannot change operation 'toHex' output specification when extending/
            }
        );
    });

    test('should allow extending without changing specs', () => {
        const List = data(({ Family }) => ({
            Nil: {},
            Cons: { head: Number, tail: Family },
            sum: fold({ out: Number })({
                Nil() { return 0; },
                Cons({ head, tail }) { return head + tail; }
            })
        }));

        // This should work - same output spec
        const ExtendedList = data(({ Family }) => ({
            [extend]: List,
            Special: { value: Number },
            sum: fold({ out: Number })({
                Special({ value }) { return value; }
            })
        }));

        const special = ExtendedList.Special({ value: 42 });
        assert.strictEqual(special.sum, 42);
    });
});
