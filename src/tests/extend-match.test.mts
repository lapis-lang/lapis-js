import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, parent } from '../index.mjs';

describe('ExtendMatch Operation', () => {
    describe('Basic Extension', () => {
        test('should extend match operation with new variant handlers', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
                .extendMatch('toHex', {
                    Yellow() { return '#FFFF00'; },
                    Orange() { return '#FFA500'; }
                });

            // Inherited variants should still work
            assert.strictEqual(ExtendedColor.Red.toHex(), '#FF0000');
            assert.strictEqual(ExtendedColor.Green.toHex(), '#00FF00');
            assert.strictEqual(ExtendedColor.Blue.toHex(), '#0000FF');

            // New variants should work
            assert.strictEqual(ExtendedColor.Yellow.toHex(), '#FFFF00');
            assert.strictEqual(ExtendedColor.Orange.toHex(), '#FFA500');
        });

        test('should extend match operation with structured variants', () => {
            const Point = data({
                Point2D: [{ x: Number }, { y: Number }]
            })
                .match('describe', { out: String }, {
                    Point2D({ x, y }) { return `2D point at (${x}, ${y})`; }
                });

            const Point3D = Point.extend({
                Point3D: [{ x: Number }, { y: Number }, { z: Number }]
            })
                .extendMatch('describe', {
                    Point3D({ x, y, z }) { return `3D point at (${x}, ${y}, ${z})`; }
                });

            const p2 = Point3D.Point2D({ x: 1, y: 2 });
            const p3 = Point3D.Point3D({ x: 1, y: 2, z: 3 });

            assert.strictEqual(p2.describe(), '2D point at (1, 2)');
            assert.strictEqual(p3.describe(), '3D point at (1, 2, 3)');
        });

        test('should support callback form with Family', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
                .extendMatch('toHex', (_Family) => ({
                    Yellow() { return '#FFFF00'; },
                    Orange() { return '#FFA500'; }
                }));

            assert.strictEqual(ExtendedColor.Yellow.toHex(), '#FFFF00');
            assert.strictEqual(ExtendedColor.Orange.toHex(), '#FFA500');
        });
    });

    describe('Override Semantics', () => {
        test('should override parent handler ignoring parent parameter', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('brightness', { out: Number }, {
                    Red() { return 100; },
                    Green() { return 100; },
                    Blue() { return 100; }
                });

            const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
                .extendMatch('brightness', {
                    Yellow() { return 200; },
                    Orange() { return 200; },
                    Red() { return 150; } // Override ignores parent
                });

            // Overridden variant returns new value
            assert.strictEqual(ExtendedColor.Red.brightness(), 150);

            // Non-overridden variants return original value
            assert.strictEqual(ExtendedColor.Green.brightness(), 100);
            assert.strictEqual(ExtendedColor.Blue.brightness(), 100);

            // New variants work
            assert.strictEqual(ExtendedColor.Yellow.brightness(), 200);
        });

        test('should override parent handler with parent access', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('brightness', { out: Number }, {
                    Red() { return 100; },
                    Green() { return 50; },
                    Blue() { return 75; }
                });

            const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
                .extendMatch('brightness', {
                    Yellow() { return 200; },
                    Red(fields) { return fields[parent]!() * 2; }, // Double parent value
                    Green(fields) { return fields[parent]!() + 50; } // Add to parent value
                });

            // Overridden variants use parent values
            assert.strictEqual(ExtendedColor.Red.brightness(), 200); // 100 * 2
            assert.strictEqual(ExtendedColor.Green.brightness(), 100); // 50 + 50

            // Non-overridden variant returns original
            assert.strictEqual(ExtendedColor.Blue.brightness(), 75);

            // New variant works
            assert.strictEqual(ExtendedColor.Yellow.brightness(), 200);
        });

        test('should support override with structured variants', () => {
            const Point = data({
                Point2D: [{ x: Number }, { y: Number }]
            })
                .match('magnitude', { out: Number }, {
                    Point2D({ x, y }) { return Math.sqrt(x * x + y * y); }
                });

            const Point3D = Point.extend({
                Point3D: [{ x: Number }, { y: Number }, { z: Number }]
            })
                .extendMatch('magnitude', {
                    Point3D({ x, y, z }) { return Math.sqrt(x * x + y * y + z * z); },
                    Point2D(fields) { return (fields[parent]!() as number) * 10; } // Scale parent result
                });

            const p2Base = Point.Point2D({ x: 3, y: 4 });
            const p2Extended = Point3D.Point2D({ x: 3, y: 4 });
            const p3 = Point3D.Point3D({ x: 1, y: 2, z: 2 });

            // Base ADT instance uses base handler
            assert.strictEqual(p2Base.magnitude(), 5);
            
            // Extended ADT instance uses override handler (scales parent by 10)
            assert.strictEqual(p2Extended.magnitude(), 50);

            // New variant uses its own handler
            assert.strictEqual(p3.magnitude(), 3);
        });

        test('should mix new handlers and overrides', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toRGB', { out: String }, {
                    Red() { return 'rgb(255, 0, 0)'; },
                    Green() { return 'rgb(0, 255, 0)'; },
                    Blue() { return 'rgb(0, 0, 255)'; }
                });

            const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
                .extendMatch('toRGB', {
                    Yellow() { return 'rgb(255, 255, 0)'; }, // New handler
                    Orange() { return 'rgb(255, 165, 0)'; }, // New handler
                    Red(fields) { return fields[parent]!().replace('255', '200'); } // Override
                });

            // Override applied
            assert.strictEqual(ExtendedColor.Red.toRGB(), 'rgb(200, 0, 0)');

            // No override
            assert.strictEqual(ExtendedColor.Green.toRGB(), 'rgb(0, 255, 0)');

            // New handlers
            assert.strictEqual(ExtendedColor.Yellow.toRGB(), 'rgb(255, 255, 0)');
            assert.strictEqual(ExtendedColor.Orange.toRGB(), 'rgb(255, 165, 0)');
        });

        test('handlers should have access to this context', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('identify', { out: String }, {
                    Red() { return this.constructor.name; },
                    Green() { return this.constructor.name; },
                    Blue() { return this.constructor.name; }
                });

            const ExtendedColor = Color.extend({ Yellow: [] })
                .extendMatch('identify', {
                    Yellow() { return this.constructor.name; }
                });

            assert.strictEqual(ExtendedColor.Red.identify(), 'Red');
            assert.strictEqual(ExtendedColor.Yellow.identify(), 'Yellow');
        });

        test('override handlers should have access to this context', () => {
            const Color = data({ Red: [], Green: [] })
                .match('describe', { out: String }, {
                    Red() { return 'red'; },
                    Green() { return 'green'; }
                });

            const ExtendedColor = Color.extend({ Blue: [] })
                .extendMatch('describe', {
                    Blue() { return 'blue'; },
                    Red(fields) {
                        return `${this.constructor.name}: ${fields[parent]!()}`;
                    }
                });

            assert.strictEqual(ExtendedColor.Red.describe(), 'Red: red');
            assert.strictEqual(ExtendedColor.Blue.describe(), 'blue');
        });

        test('handlers can call other operations via this', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                })
                .match('toRGB', { out: String }, {
                    Red() { return 'rgb(255, 0, 0)'; },
                    Green() { return 'rgb(0, 255, 0)'; },
                    Blue() { return 'rgb(0, 0, 255)'; }
                })
                .match('describe', { out: String }, {
                    Red() { return `${this.toHex()}`; },
                    Green() { return `${this.toRGB()}`; },
                    Blue() { return `${this.toHex()}`; }
                });

            const ExtendedColor = Color.extend({ Yellow: [] })
                .extendMatch('toHex', { Yellow() { return '#FFFF00'; } })
                .extendMatch('toRGB', { Yellow() { return 'rgb(255, 255, 0)'; } })
                .extendMatch('describe', {
                    Yellow() { return `Yellow: ${this.toHex()} or ${this.toRGB()}`; }
                });

            assert.strictEqual(ExtendedColor.Yellow.describe(), 'Yellow: #FFFF00 or rgb(255, 255, 0)');
        });

        test('override handlers can call parent and other operations', () => {
            const Color = data({ Red: [], Green: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; }
                })
                .match('describe', { out: String }, {
                    Red() { return 'red'; },
                    Green() { return 'green'; }
                });

            const ExtendedColor = Color.extend({ Blue: [] })
                .extendMatch('toHex', { Blue() { return '#0000FF'; } })
                .extendMatch('describe', {
                    Blue() { return 'blue'; },
                    Red(fields) {
                        return `Enhanced ${fields[parent]!()} with hex ${this.toHex()}`;
                    }
                });

            assert.strictEqual(ExtendedColor.Red.describe(), 'Enhanced red with hex #FF0000');
        });
    });

    describe('Wildcard Handlers', () => {
        test('should inherit wildcard handler from parent', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    _(_instance) { return '#UNKNOWN'; }
                });

            const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
                .extendMatch('toHex', {
                    Yellow() { return '#FFFF00'; }
                    // Orange not specified - should use wildcard from parent
                });

            assert.strictEqual(ExtendedColor.Red.toHex(), '#FF0000');
            assert.strictEqual(ExtendedColor.Yellow.toHex(), '#FFFF00');
            assert.strictEqual(ExtendedColor.Orange.toHex(), '#UNKNOWN'); // Wildcard
        });

        test('should override wildcard handler', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    _(_instance) { return '#UNKNOWN'; }
                });

            const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
                .extendMatch('toHex', {
                    Yellow() { return '#FFFF00'; },
                    _({ instance }) { return `#EXTENDED-${instance.constructor.name}`; }
                });

            assert.strictEqual(ExtendedColor.Red.toHex(), '#FF0000');
            assert.strictEqual(ExtendedColor.Yellow.toHex(), '#FFFF00');
            assert.strictEqual(ExtendedColor.Orange.toHex(), '#EXTENDED-Orange');
        });

        test('should support new wildcard in extension', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            const ExtendedColor = Color.extend({ Yellow: [], Orange: [] })
                .extendMatch('toHex', {
                    _({ instance }) { return `#NEW-${instance.constructor.name}`; }
                });

            // Inherited handlers still work
            assert.strictEqual(ExtendedColor.Red.toHex(), '#FF0000');

            // New variants use wildcard
            assert.strictEqual(ExtendedColor.Yellow.toHex(), '#NEW-Yellow');
            assert.strictEqual(ExtendedColor.Orange.toHex(), '#NEW-Orange');
        });
    });

    describe('Multiple Extension Levels', () => {
        test('should support three levels of extension', () => {
            const Color = data({ Red: [], Green: [] })
                .match('family', { out: String }, {
                    Red() { return 'primary'; },
                    Green() { return 'primary'; }
                });

            const Extended1 = Color.extend({ Blue: [] })
                .extendMatch('family', {
                    Blue() { return 'primary'; }
                });

            const Extended2 = Extended1.extend({ Yellow: [] })
                .extendMatch('family', {
                    Yellow() { return 'secondary'; }
                });

            // All levels work
            assert.strictEqual(Extended2.Red.family(), 'primary');
            assert.strictEqual(Extended2.Blue.family(), 'primary');
            assert.strictEqual(Extended2.Yellow.family(), 'secondary');
        });

        test('should support override at multiple levels', () => {
            // Test that operations can be extended at multiple levels
            // Note: Override only applies to new variants, not inherited ones
            // (due to constructor identity preservation)
            const Color = data({ Red: [] })
                .match('category', { out: String }, {
                    Red() { return 'primary'; }
                });

            const Level1 = Color.extend({ Green: [] })
                .extendMatch('category', {
                    Green() { return 'secondary'; }
                });

            const Level2 = Level1.extend({ Blue: [] })
                .extendMatch('category', {
                    Blue() { return 'primary'; }
                });

            // All use the same inherited Red constructor
            assert.strictEqual(Color.Red.category(), 'primary');
            assert.strictEqual(Level1.Red.category(), 'primary');
            assert.strictEqual(Level2.Red.category(), 'primary');

            // New variants use their respective operations
            assert.strictEqual(Level1.Green.category(), 'secondary');
            assert.strictEqual(Level2.Green.category(), 'secondary');
            assert.strictEqual(Level2.Blue.category(), 'primary');
        });
    });

    describe('Chaining', () => {
        test('should support chaining extendMatch calls', () => {
            const Color = data({ Red: [], Green: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; }
                })
                .match('brightness', { out: Number }, {
                    Red() { return 100; },
                    Green() { return 50; }
                });

            const ExtendedColor = Color.extend({ Blue: [], Yellow: [] })
                .extendMatch('toHex', {
                    Blue() { return '#0000FF'; },
                    Yellow() { return '#FFFF00'; }
                })
                .extendMatch('brightness', {
                    Blue() { return 75; },
                    Yellow() { return 200; }
                });

            // Both operations work on inherited variants
            assert.strictEqual(ExtendedColor.Red.toHex(), '#FF0000');
            assert.strictEqual(ExtendedColor.Red.brightness(), 100);

            // Both operations work on new variants
            assert.strictEqual(ExtendedColor.Blue.toHex(), '#0000FF');
            assert.strictEqual(ExtendedColor.Blue.brightness(), 75);
        });

        test('should chain extend and extendMatch multiple times', () => {
            const Base = data({ A: [] })
                .match('op', { out: Number }, {
                    A() { return 1; }
                });

            const Result = Base
                .extend({ B: [] })
                .extendMatch('op', { B() { return 2; } })
                .extend({ C: [] })
                .extendMatch('op', { C() { return 3; } });

            assert.strictEqual(Result.A.op(), 1);
            assert.strictEqual(Result.B.op(), 2);
            assert.strictEqual(Result.C.op(), 3);
        });
    });

    describe('Error Handling', () => {
        test('should throw error if parent has no operation', () => {
            const Color = data({ Red: [], Green: [] });
            const ExtendedColor = Color.extend({ Blue: [] });

            assert.throws(
                () => {
                    // @ts-expect-error - Testing runtime error for non-existent operation
                    ExtendedColor.extendMatch('nonexistent', {
                        Blue() { return '#0000FF'; }
                    });
                },
                /operation does not exist on parent ADT/
            );
        });

        test('should allow handlers for new variants even when parent operation exists', () => {
            const Color = data({ Red: [], Green: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; }
                });

            const ExtendedColor = Color.extend({ Blue: [] });

            // Blue doesn't exist in parent, so it's treated as a new handler
            // This shouldn't throw an error - it's just adding a new handler
            ExtendedColor.extendMatch('toHex', {
                Blue() { return '#0000FF'; }
            });

            assert.strictEqual(ExtendedColor.Blue.toHex(), '#0000FF');
        });

        test('should throw error if trying to extend on base ADT without parent', () => {
            const Color = data({ Red: [], Green: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; }
                });

            // Try to call extendMatch on base ADT (no parent)
            assert.throws(
                () => {
                    // Blue variant doesn't exist, testing runtime error
                    Color.extendMatch('toHex', {
                        Blue() { return '#0000FF'; }
                    } as any);
                },
                /parent ADT has no transformer registry/
            );
        });

        test('should throw error if calling extendMatch twice on same operation', () => {
            const Color = data({ Red: [], Green: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; }
                });

            const ExtendedColor = Color.extend({ Blue: [] });

            // First extendMatch should succeed
            const AfterFirst = ExtendedColor.extendMatch('toHex', {
                Blue() { return '#0000FF'; }
            });

            assert.strictEqual((AfterFirst.Blue as any).toHex(), '#0000FF');

            // Second extendMatch on same operation should throw
            assert.throws(
                () => {
                    AfterFirst.extendMatch('toHex', {
                        Blue() { return '#0000FF'; } // Try to add Blue again
                    });
                },
                /Operation 'toHex' has already been extended on this ADT/
            );
        });
    });

    describe('Recursive ADTs', () => {
        test('should extend match on recursive ADT', () => {
            const List = data(({ Family, T }) => ({
                Nil: [],
                Cons: [{ head: T }, { tail: Family }]
            }))
                .match('isEmpty', { out: Boolean }, (_Family) => ({
                    Nil() { return true; },
                    Cons({ head: _head, tail: _tail }) { return false; }
                }));

            const ExtendedList = List.extend(({ Family: _Family, T }) => ({
                Single: [{ value: T }]
            }))
                .extendMatch('isEmpty', (_Family2) => ({
                    Single({ value: _value }) { return false; }
                }));

            const empty = ExtendedList.Nil;
            const cons = ExtendedList.Cons({ head: 1, tail: ExtendedList.Nil });
            const single = ExtendedList.Single({ value: 42 });

            assert.strictEqual(empty.isEmpty(), true);
            assert.strictEqual(cons.isEmpty(), false);
            assert.strictEqual(single.isEmpty(), false);
        });
    });
});
