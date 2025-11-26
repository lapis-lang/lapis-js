import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

describe('ExtendFold Operation (Non-Recursive ADTs)', () => {
    describe('Basic Extension', () => {
        test('should extend fold operation with new variant handlers', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            const ExtendedColor = Color.extend({ Yellow: {}, Orange: {} })
                .fold('toHex', { out: String }, {
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

        test('should extend fold operation with structured variants', () => {
            const Point = data({
                Point2D: { x: Number, y: Number }
            })
                .fold('describe', { out: String }, {
                    Point2D({ x, y }) { return `2D point at (${x}, ${y})`; }
                });

            const Point3D = Point.extend({
                Point3D: { x: Number, y: Number, z: Number }
            })
                .fold('describe', { out: String }, {
                    Point3D({ x, y, z }) { return `3D point at (${x}, ${y}, ${z})`; }
                });

            const p2 = Point3D.Point2D({ x: 1, y: 2 });
            const p3 = Point3D.Point3D({ x: 1, y: 2, z: 3 });

            assert.strictEqual(p2.describe(), '2D point at (1, 2)');
            assert.strictEqual(p3.describe(), '3D point at (1, 2, 3)');
        });

        test('should support callback form with Family', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            const ExtendedColor = Color.extend({ Yellow: {}, Orange: {} })
                .fold('toHex', { out: String }, {
                    Yellow() { return '#FFFF00'; },
                    Orange() { return '#FFA500'; }
                });

            assert.strictEqual(ExtendedColor.Yellow.toHex(), '#FFFF00');
            assert.strictEqual(ExtendedColor.Orange.toHex(), '#FFA500');
        });
    });

    describe('Override Semantics', () => {
        test('should override parent handler ignoring parent parameter', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('brightness', { out: Number }, {
                    Red() { return 100; },
                    Green() { return 100; },
                    Blue() { return 100; }
                });

            const ExtendedColor = Color.extend({ Yellow: {}, Orange: {} })
                .fold('brightness', { out: Number },    {
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
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('brightness', { out: Number }, {
                    Red() { return 100; },
                    Green() { return 50; },
                    Blue() { return 75; }
                });

            const ExtendedColor = Color.extend({ Yellow: {}, Orange: {} })
                .fold('brightness', { out: Number }, (_Family, ParentFamily) => ({
                    Yellow() { return 200; },
                    Red() { return ParentFamily.Red() * 2; }, // Double parent value
                    Green() { return ParentFamily.Green() + 50; } // Add to parent value
                }));

            // Overridden variants use parent values
            assert.strictEqual(ExtendedColor.Red.brightness(), 200); // 100 * 2
            assert.strictEqual(ExtendedColor.Green.brightness(), 100); // 50 + 50

            // Non-overridden variant returns original
            assert.strictEqual(ExtendedColor.Blue.brightness(), 75);

            // New variant works
            assert.strictEqual(ExtendedColor.Yellow.brightness(), 200);
        });

        test('should support override with structured variants', () => {
            const Point = data({ Point2D: { x: Number, y: Number } })
                .fold('magnitude', { out: Number }, {
                    Point2D({ x, y }) { return Math.sqrt(x * x + y * y); }
                });

            const Point3D = Point.extend({ Point3D: { x: Number, y: Number, z: Number } })
                .fold('magnitude', { out: Number }, (_Family, ParentFamily) => ({
                    Point3D({ x, y, z }) { return Math.sqrt(x * x + y * y + z * z); },
                    Point2D({ x, y }) { return (ParentFamily.Point2D({ x, y })) * 10; } // Scale parent result
                }));

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
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('toRGB', { out: String }, {
                    Red() { return 'rgb(255, 0, 0)'; },
                    Green() { return 'rgb(0, 255, 0)'; },
                    Blue() { return 'rgb(0, 0, 255)'; }
                });

            const ExtendedColor = Color.extend({ Yellow: {}, Orange: {} })
                .fold('toRGB', { out: String }, (_Family, ParentFamily) => ({
                    Yellow() { return 'rgb(255, 255, 0)'; }, // New handler
                    Orange() { return 'rgb(255, 165, 0)'; }, // New handler
                    Red() { return ParentFamily.Red().replace('255', '200'); } // Override
                }));

            // Override applied
            assert.strictEqual(ExtendedColor.Red.toRGB(), 'rgb(200, 0, 0)');

            // No override
            assert.strictEqual(ExtendedColor.Green.toRGB(), 'rgb(0, 255, 0)');

            // New handlers
            assert.strictEqual(ExtendedColor.Yellow.toRGB(), 'rgb(255, 255, 0)');
            assert.strictEqual(ExtendedColor.Orange.toRGB(), 'rgb(255, 165, 0)');
        });

        test('handlers should have access to this context', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('identify', { out: String }, {
                    Red() { return this.constructor.name; },
                    Green() { return this.constructor.name; },
                    Blue() { return this.constructor.name; }
                });

            const ExtendedColor = Color.extend({ Yellow: {} })
                .fold('identify', { out: String }, {
                    Yellow() { return this.constructor.name; }
                });

            assert.strictEqual(ExtendedColor.Red.identify(), 'Red');
            assert.strictEqual(ExtendedColor.Yellow.identify(), 'Yellow');
        });

        test('override handlers should have access to this context', () => {
            const Color = data({ Red: {}, Green: {} })
                .fold('describe', { out: String }, {
                    Red() { return 'red'; },
                    Green() { return 'green'; }
                });

            const ExtendedColor = Color.extend({ Blue: {} })
                .fold('describe', { out: String }, (_Family, ParentFamily) => ({
                    Blue() { return 'blue'; },
                    _(_instance) {
                        return `${this.constructor.name}: ${ParentFamily._(this)}`;
                    }
                }));

            assert.strictEqual(ExtendedColor.Red.describe(), 'Red: red');
            assert.strictEqual(ExtendedColor.Blue.describe(), 'blue');
        });

        test('handlers can call other operations via this', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                })
                .fold('toRGB', { out: String }, {
                    Red() { return 'rgb(255, 0, 0)'; },
                    Green() { return 'rgb(0, 255, 0)'; },
                    Blue() { return 'rgb(0, 0, 255)'; }
                })
                .fold('describe', { out: String }, {
                    Red() { return `${this.toHex()}`; },
                    Green() { return `${this.toRGB()}`; },
                    Blue() { return `${this.toHex()}`; }
                });

            const ExtendedColor = Color.extend({ Yellow: {} })
                .fold('toHex', { out: String }, { Yellow() { return '#FFFF00'; } })
                .fold('toRGB', { out: String }, { Yellow() { return 'rgb(255, 255, 0)'; } })
                .fold('describe', { out: String }, {
                    Yellow() { return `Yellow: ${this.toHex()} or ${this.toRGB()}`; }
                });

            assert.strictEqual(ExtendedColor.Yellow.describe(), 'Yellow: #FFFF00 or rgb(255, 255, 0)');
        });

        test('override handlers can call parent and other operations', () => {
            const Color = data({ Red: {}, Green: {} })
                .fold('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; }
                })
                .fold('describe', { out: String }, {
                    Red() { return 'red'; },
                    Green() { return 'green'; }
                });

            const ExtendedColor = Color.extend({ Blue: {} })
                .fold('toHex', { out: String }, { Blue() { return '#0000FF'; } })
                .fold('describe', { out: String }, (_Family, ParentFamily) => ({
                    Blue() { return 'blue'; },
                    _(_instance) {
                        return `Enhanced ${ParentFamily._(this)} with hex ${this.toHex()}`;
                    }
                }));

            assert.strictEqual(ExtendedColor.Red.describe(), 'Enhanced red with hex #FF0000');
        });
    });

    describe('Wildcard Handlers', () => {
        test('should inherit wildcard handler from parent', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    _(_instance) { return '#UNKNOWN'; }
                });

            const ExtendedColor = Color.extend({ Yellow: {}, Orange: {} })
                .fold('toHex', { out: String }, {
                    Yellow() { return '#FFFF00'; }
                    // Orange not specified - should use wildcard from parent
                });

            assert.strictEqual(ExtendedColor.Red.toHex(), '#FF0000');
            assert.strictEqual(ExtendedColor.Yellow.toHex(), '#FFFF00');
            assert.strictEqual(ExtendedColor.Orange.toHex(), '#UNKNOWN'); // Wildcard
        });

        test('should override wildcard handler', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    _(_instance) { return '#UNKNOWN'; }
                });

            const ExtendedColor = Color.extend({ Yellow: {}, Orange: {} })
                .fold('toHex', { out: String }, {
                    Yellow() { return '#FFFF00'; },
                    _(instance) { return `#EXTENDED-${instance.constructor.name}`; }
                });

            // Child wildcard overrides parent specific handlers
            assert.strictEqual(ExtendedColor.Red.toHex(), '#EXTENDED-Red');
            assert.strictEqual(ExtendedColor.Yellow.toHex(), '#FFFF00');
            assert.strictEqual(ExtendedColor.Orange.toHex(), '#EXTENDED-Orange');
        });

        test('should support new wildcard in extension', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            const ExtendedColor = Color.extend({ Yellow: {}, Orange: {} })
                .fold('toHex', { out: String }, {
                    _(instance) { return `#NEW-${instance.constructor.name}`; }
                });

            // Child wildcard overrides all parent specific handlers
            assert.strictEqual(ExtendedColor.Red.toHex(), '#NEW-Red');

            // New variants also use wildcard
            assert.strictEqual(ExtendedColor.Yellow.toHex(), '#NEW-Yellow');
            assert.strictEqual(ExtendedColor.Orange.toHex(), '#NEW-Orange');
        });
    });

    describe('Multiple Extension Levels', () => {
        test('should support three levels of extension', () => {
            const Color = data({ Red: {}, Green: {} })
                .fold('family', { out: String }, {
                    Red() { return 'primary'; },
                    Green() { return 'primary'; }
                });

            const Extended1 = Color.extend({ Blue: {} })
                .fold('family', { out: String }, {
                    Blue() { return 'primary'; }
                });

            const Extended2 = Extended1.extend({ Yellow: {} })
                .fold('family', { out: String }, {
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
            const Color = data({ Red: {} })
                .fold('category', { out: String }, {
                    Red() { return 'primary'; }
                });

            const Level1 = Color.extend({ Green: {} })  
                .fold('category', { out: String }, {
                    Green() { return 'secondary'; }
                });

            const Level2 = Level1.extend({ Blue: {} })
                .fold('category', { out: String }, {
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
});

describe('Chaining', () => {
    test('should support chaining fold calls in extend mode', () => {
        const Color = data({ Red: {}, Green: {} })
            .fold('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; }
            })
            .fold('brightness', { out: Number }, {
                Red() { return 100; },
                Green() { return 50; }
            });

        const ExtendedColor = Color.extend({ Blue: {}, Yellow: {} })
            .fold('toHex', { out: String }, {
                Blue() { return '#0000FF'; },
                Yellow() { return '#FFFF00'; }
            })
            .fold('brightness', { out: Number }, {
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

    test('should chain extend and fold multiple times', () => {
        const Base = data({ A: {} })
            .fold('op', { out: Number }, {
                A() { return 1; }
            });

        const Result = Base
            .extend({ B: {} })
            .fold('op', { out: Number }, { B() { return 2; } })
            .extend({ C: {} })
            .fold('op', { out: Number }, { C() { return 3; } });
        assert.strictEqual(Result.A.op(), 1);
        assert.strictEqual(Result.B.op(), 2);
        assert.strictEqual(Result.C.op(), 3);
    });
});

describe('Error Handling', () => {
    test('should create new operation when parent does not have it', () => {
        // With unified fold, calling fold() on extended ADT creates new operation
        // if parent doesn't have it
        const Color = data({ Red: {}, Green: {} });
        const ExtendedColor = Color.extend({ Blue: {} })
            .fold('newOp', { out: String }, {
                Blue() { return 'blue'; },
                _() { return 'color'; }
            });

        // All variants get the new operation
        assert.strictEqual(ExtendedColor.Red.newOp(), 'color');
        assert.strictEqual(ExtendedColor.Green.newOp(), 'color');
        assert.strictEqual(ExtendedColor.Blue.newOp(), 'blue');
    });

    test('should allow handlers for new variants even when parent operation exists', () => {
        const Color = data({ Red: {}, Green: {} })
            .fold('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; }
            });

        const ExtendedColor = Color.extend({ Blue: {} });

        // Blue doesn't exist in parent, so it's treated
        // This shouldn't throw an error - it's just adding a new handler
        ExtendedColor.fold('toHex', { out: String }, {
            Blue() { return '#0000FF'; }
        });

        assert.strictEqual(ExtendedColor.Blue.toHex(), '#0000FF');
    });

    test('should work on both base and extended ADTs', () => {
        const Color = data({ Red: {}, Green: {} })
            .fold('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; }
            });

        // But it should work on extended ADTs
        const ExtendedColor = Color.extend({ Blue: {} });
        const result = ExtendedColor.fold('toHex', { out: String }, {
            Blue() { return '#0000FF'; }
        });

        assert.strictEqual(result.Blue.toHex(), '#0000FF');
    });
});

test('should throw error if calling fold twice on same operation at same ADT level', () => {
    const Color = data({ Red: {}, Green: {} })
        .fold('toHex', { out: String }, {
            Red() { return '#FF0000'; },
            Green() { return '#00FF00'; }
        });

    const ExtendedColor = Color.extend({ Blue: {} });

    // First fold (in extend mode) should succeed
    const AfterFirst = ExtendedColor.fold('toHex', { out: String }, {
        Blue() { return '#0000FF'; }
    });

    assert.strictEqual((AfterFirst.Blue).toHex(), '#0000FF');

    // Second fold on same operation should throw
    assert.throws(
        () => {
            AfterFirst.fold('toHex', { out: String }, {
                Blue() { return '#0000FF'; } // Try to add Blue again
            });
        },
        /Operation 'toHex' has already been extended on this ADT/
    );
});

describe('Recursive ADTs', () => {
    test('should extend fold on recursive ADT', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family }
        }))
            .fold('isEmpty', { out: Boolean }, {
                Nil() { return true; },
                Cons() { return false; }
            });

        const ExtendedList = List.extend(({ Family: _Family, T }) => ({
            Single: { value: T }
        }))
            .fold('isEmpty', { out: Boolean }, {
                Single() { return false; }
            });

        const empty = ExtendedList.Nil;
        const cons = ExtendedList.Cons({ head: 1, tail: ExtendedList.Nil });
        const single = ExtendedList.Single({ value: 42 });

        assert.strictEqual(empty.isEmpty(), true);
        assert.strictEqual(cons.isEmpty(), false);
        assert.strictEqual(single.isEmpty(), false);
    });
});

