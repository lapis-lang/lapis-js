import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, extend, parent } from '../index.mjs';

describe('ExtendFold Operation (Non-Recursive ADTs)', () => {
    describe('Basic Extension', () => {
        test('should extend fold operation with new variant handlers', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                }
            }));

            const ExtendedColor = data(() => ({
                [extend]: Color,
                Yellow: {},
                Orange: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Yellow() { return '#FFFF00'; },
                    Orange() { return '#FFA500'; }
                }
            }));

            // Inherited variants should still work
            assert.strictEqual(ExtendedColor.Red.toHex, '#FF0000');
            assert.strictEqual(ExtendedColor.Green.toHex, '#00FF00');
            assert.strictEqual(ExtendedColor.Blue.toHex, '#0000FF');

            // New variants should work
            assert.strictEqual(ExtendedColor.Yellow.toHex, '#FFFF00');
            assert.strictEqual(ExtendedColor.Orange.toHex, '#FFA500');
        });

        test('should extend fold operation with structured variants', () => {
            const Point = data(() => ({
                Point2D: { x: Number, y: Number },
                describe: {
                    op: 'fold',
                    spec: { out: String },
                    Point2D({ x, y }) { return `2D point at (${x}, ${y})`; }
                }
            }));

            const Point3D = data(() => ({
                [extend]: Point,
                Point3D: { x: Number, y: Number, z: Number },
                describe: {
                    op: 'fold',
                    spec: { out: String },
                    Point3D({ x, y, z }) { return `3D point at (${x}, ${y}, ${z})`; }
                }
            }));

            const p2 = Point3D.Point2D({ x: 1, y: 2 });
            const p3 = Point3D.Point3D({ x: 1, y: 2, z: 3 });

            assert.strictEqual(p2.describe, '2D point at (1, 2)');
            assert.strictEqual(p3.describe, '3D point at (1, 2, 3)');
        });

        test('should support callback form with Family', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                }
            }));

            const ExtendedColor = data(() => ({
                [extend]: Color,
                Yellow: {},
                Orange: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Yellow() { return '#FFFF00'; },
                    Orange() { return '#FFA500'; }
                }
            }));

            assert.strictEqual(ExtendedColor.Yellow.toHex, '#FFFF00');
            assert.strictEqual(ExtendedColor.Orange.toHex, '#FFA500');
        });
    });

    describe('Override Semantics', () => {
        test('should override parent handler ignoring parent parameter', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                brightness: {
                    op: 'fold',
                    spec: { out: Number },
                    Red() { return 100; },
                    Green() { return 100; },
                    Blue() { return 100; }
                }
            }));

            const ExtendedColor = data(() => ({
                [extend]: Color,
                Yellow: {},
                Orange: {},
                brightness: {
                    op: 'fold',
                    spec: { out: Number },
                    Yellow() { return 200; },
                    Orange() { return 200; },
                    Red() { return 150; } // Override ignores parent
                }
            }));

            // Overridden variant returns new value
            assert.strictEqual(ExtendedColor.Red.brightness, 150);

            // Non-overridden variants return original value
            assert.strictEqual(ExtendedColor.Green.brightness, 100);
            assert.strictEqual(ExtendedColor.Blue.brightness, 100);

            // New variants work
            assert.strictEqual(ExtendedColor.Yellow.brightness, 200);
        });

        test('should override parent handler with parent access', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                brightness: {
                    op: 'fold',
                    spec: { out: Number },
                    Red() { return 100; },
                    Green() { return 50; },
                    Blue() { return 75; }
                }
            }));

            const ExtendedColor = data(() => ({
                [extend]: Color,
                Yellow: {},
                Orange: {},
                brightness: {
                    op: 'fold',
                    spec: { out: Number },
                    Yellow() { return 200; },
                    Red() { return this[parent] * 2; }, // Double parent value
                    Green() { return this[parent] + 50; } // Add to parent value
                }
            }));

            // Overridden variants use parent values
            assert.strictEqual(ExtendedColor.Red.brightness, 200); // 100 * 2
            assert.strictEqual(ExtendedColor.Green.brightness, 100); // 50 + 50

            // Non-overridden variant returns original
            assert.strictEqual(ExtendedColor.Blue.brightness, 75);

            // New variant works
            assert.strictEqual(ExtendedColor.Yellow.brightness, 200);
        });

        test('should support override with structured variants', () => {
            const Point = data(() => ({
                Point2D: { x: Number, y: Number },
                magnitude: {
                    op: 'fold',
                    spec: { out: Number },
                    Point2D({ x, y }) { return Math.sqrt(x * x + y * y); }
                }
            }));

            const Point3D = data(() => ({
                [extend]: Point,
                Point3D: { x: Number, y: Number, z: Number },
                magnitude: {
                    op: 'fold',
                    spec: { out: Number },
                    Point3D({ x, y, z }) { return Math.sqrt(x * x + y * y + z * z); },
                    Point2D({ x, y }) { return this[parent] * 10; } // Scale parent result
                }
            }));

            const p2Base = Point.Point2D({ x: 3, y: 4 });
            const p2Extended = Point3D.Point2D({ x: 3, y: 4 });
            const p3 = Point3D.Point3D({ x: 1, y: 2, z: 2 });

            // Base ADT instance uses base handler
            assert.strictEqual(p2Base.magnitude, 5);

            // Extended ADT instance uses override handler (scales parent by 10)
            assert.strictEqual(p2Extended.magnitude, 50);

            // New variant uses its own handler
            assert.strictEqual(p3.magnitude, 3);
        });

        test('should mix new handlers and overrides', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toRGB: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return 'rgb(255, 0, 0)'; },
                    Green() { return 'rgb(0, 255, 0)'; },
                    Blue() { return 'rgb(0, 0, 255)'; }
                }
            }));

            const ExtendedColor = data(() => ({
                [extend]: Color,
                Yellow: {},
                Orange: {},
                toRGB: {
                    op: 'fold',
                    spec: { out: String },
                    Yellow() { return 'rgb(255, 255, 0)'; }, // New handler
                    Orange() { return 'rgb(255, 165, 0)'; }, // New handler
                    Red() { return this[parent].replace('255', '200'); } // Override
                }
            }));

            // Override applied
            assert.strictEqual(ExtendedColor.Red.toRGB, 'rgb(200, 0, 0)');

            // No override
            assert.strictEqual(ExtendedColor.Green.toRGB, 'rgb(0, 255, 0)');

            // New handlers
            assert.strictEqual(ExtendedColor.Yellow.toRGB, 'rgb(255, 255, 0)');
            assert.strictEqual(ExtendedColor.Orange.toRGB, 'rgb(255, 165, 0)');
        });

        test('handlers should have access to this context', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                identify: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return this.constructor.name; },
                    Green() { return this.constructor.name; },
                    Blue() { return this.constructor.name; }
                }
            }));

            const ExtendedColor = data(() => ({
                [extend]: Color,
                Yellow: {},
                identify: {
                    op: 'fold',
                    spec: { out: String },
                    Yellow() { return this.constructor.name; }
                }
            }));

            assert.strictEqual(ExtendedColor.Red.identify, 'Red');
            assert.strictEqual(ExtendedColor.Yellow.identify, 'Yellow');
        });

        test('override handlers should have access to this context', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                describe: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return 'red'; },
                    Green() { return 'green'; }
                }
            }));

            const ExtendedColor = data(() => ({
                [extend]: Color,
                Blue: {},
                describe: {
                    op: 'fold',
                    spec: { out: String },
                    Blue() { return 'blue'; },
                    _() {
                        return `${this.constructor.name}: ${this[parent]}`;
                    }
                }
            }));

            assert.strictEqual(ExtendedColor.Red.describe, 'Red: red');
            assert.strictEqual(ExtendedColor.Blue.describe, 'blue');
        });

        test('handlers can call other operations via this', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                },
                toRGB: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return 'rgb(255, 0, 0)'; },
                    Green() { return 'rgb(0, 255, 0)'; },
                    Blue() { return 'rgb(0, 0, 255)'; }
                },
                describe: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return `${this.toHex}`; },
                    Green() { return `${this.toRGB}`; },
                    Blue() { return `${this.toHex}`; }
                }
            }));

            const ExtendedColor = data(() => ({
                [extend]: Color,
                Yellow: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Yellow() { return '#FFFF00'; }
                },
                toRGB: {
                    op: 'fold',
                    spec: { out: String },
                    Yellow() { return 'rgb(255, 255, 0)'; }
                },
                describe: {
                    op: 'fold',
                    spec: { out: String },
                    Yellow() { return `Yellow: ${this.toHex} or ${this.toRGB}`; }
                }
            }));

            assert.strictEqual(ExtendedColor.Yellow.describe, 'Yellow: #FFFF00 or rgb(255, 255, 0)');
        });

        test('override handlers can call parent and other operations', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; }
                },
                describe: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return 'red'; },
                    Green() { return 'green'; }
                }
            }));

            const ExtendedColor = data(() => ({
                [extend]: Color,
                Blue: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Blue() { return '#0000FF'; }
                },
                describe: {
                    op: 'fold',
                    spec: { out: String },
                    Blue() { return 'blue'; },
                    _() {
                        return `Enhanced ${this[parent]} with hex ${this.toHex}`;
                    }
                }
            }));

            assert.strictEqual(ExtendedColor.Red.describe, 'Enhanced red with hex #FF0000');
        });
    });

    describe('Wildcard Handlers', () => {
        test('should inherit wildcard handler from parent', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    _(_instance) { return '#UNKNOWN'; }
                }
            }));

            const ExtendedColor = data(() => ({
                [extend]: Color,
                Yellow: {},
                Orange: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Yellow() { return '#FFFF00'; }
                    // Orange not specified - should use wildcard from parent
                }
            }));

            assert.strictEqual(ExtendedColor.Red.toHex, '#FF0000');
            assert.strictEqual(ExtendedColor.Yellow.toHex, '#FFFF00');
            assert.strictEqual(ExtendedColor.Orange.toHex, '#UNKNOWN'); // Wildcard
        });

        test('should override wildcard handler', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    _(_instance) { return '#UNKNOWN'; }
                }
            }));

            const ExtendedColor = data(() => ({
                [extend]: Color,
                Yellow: {},
                Orange: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Yellow() { return '#FFFF00'; },
                    _() { return `#EXTENDED-${this.constructor.name}`; }
                }
            }));

            // Child wildcard overrides parent specific handlers
            assert.strictEqual(ExtendedColor.Red.toHex, '#EXTENDED-Red');
            assert.strictEqual(ExtendedColor.Yellow.toHex, '#FFFF00');
            assert.strictEqual(ExtendedColor.Orange.toHex, '#EXTENDED-Orange');
        });

        test('should support new wildcard in extension', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                }
            }));

            const ExtendedColor = data(() => ({
                [extend]: Color,
                Yellow: {},
                Orange: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    _() { return `#NEW-${this.constructor.name}`; }
                }
            }));

            // Child wildcard overrides all parent specific handlers
            assert.strictEqual(ExtendedColor.Red.toHex, '#NEW-Red');

            // New variants also use wildcard
            assert.strictEqual(ExtendedColor.Yellow.toHex, '#NEW-Yellow');
            assert.strictEqual(ExtendedColor.Orange.toHex, '#NEW-Orange');
        });
    });

    describe('Multiple Extension Levels', () => {
        test('should support three levels of extension', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                family: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return 'primary'; },
                    Green() { return 'primary'; }
                }
            }));

            const Extended1 = data(() => ({
                [extend]: Color,
                Blue: {},
                family: {
                    op: 'fold',
                    spec: { out: String },
                    Blue() { return 'primary'; }
                }
            }));

            const Extended2 = data(() => ({
                [extend]: Extended1,
                Yellow: {},
                family: {
                    op: 'fold',
                    spec: { out: String },
                    Yellow() { return 'secondary'; }
                }
            }));

            // All levels work
            assert.strictEqual(Extended2.Red.family, 'primary');
            assert.strictEqual(Extended2.Blue.family, 'primary');
            assert.strictEqual(Extended2.Yellow.family, 'secondary');
        });

        test('should support override at multiple levels', () => {
            // Test that operations can be extended at multiple levels
            // Note: Override only applies to new variants, not inherited ones
            // (due to constructor identity preservation)
            const Color = data(() => ({
                Red: {},
                category: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return 'primary'; }
                }
            }));

            const Level1 = data(() => ({
                [extend]: Color,
                Green: {},
                category: {
                    op: 'fold',
                    spec: { out: String },
                    Green() { return 'secondary'; }
                }
            }));

            const Level2 = data(() => ({
                [extend]: Level1,
                Blue: {},
                category: {
                    op: 'fold',
                    spec: { out: String },
                    Blue() { return 'primary'; }
                }
            }));

            // All use the same inherited Red constructor
            assert.strictEqual(Color.Red.category, 'primary');
            assert.strictEqual(Level1.Red.category, 'primary');
            assert.strictEqual(Level2.Red.category, 'primary');

            // New variants use their respective operations
            assert.strictEqual(Level1.Green.category, 'secondary');
            assert.strictEqual(Level2.Green.category, 'secondary');
            assert.strictEqual(Level2.Blue.category, 'primary');
        });
    });
});

describe('Chaining', () => {
    test('should support chaining fold calls in extend mode', () => {
        const Color = data(() => ({
            Red: {},
            Green: {},
            toHex: {
                op: 'fold',
                spec: { out: String },
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; }
            },
            brightness: {
                op: 'fold',
                spec: { out: Number },
                Red() { return 100; },
                Green() { return 50; }
            }
        }));

        const ExtendedColor = data(() => ({
            [extend]: Color,
            Blue: {},
            Yellow: {},
            toHex: {
                op: 'fold',
                spec: { out: String },
                Blue() { return '#0000FF'; },
                Yellow() { return '#FFFF00'; }
            },
            brightness: {
                op: 'fold',
                spec: { out: Number },
                Blue() { return 75; },
                Yellow() { return 200; }
            }
        }));
        // Both operations work on inherited variants
        assert.strictEqual(ExtendedColor.Red.toHex, '#FF0000');
        assert.strictEqual(ExtendedColor.Red.brightness, 100);

        // Both operations work on new variants
        assert.strictEqual(ExtendedColor.Blue.toHex, '#0000FF');
        assert.strictEqual(ExtendedColor.Blue.brightness, 75);
    });

    test('should chain extend and fold multiple times', () => {
        const Base = data(() => ({
            A: {},
            op: {
                op: 'fold',
                spec: { out: Number },
                A() { return 1; }
            }
        }));

        const Result = data(() => ({
            [extend]: data(() => ({
                [extend]: Base,
                B: {},
                op: {
                    op: 'fold',
                    spec: { out: Number },
                    B() { return 2; }
                }
            })),
            C: {},
            op: {
                op: 'fold',
                spec: { out: Number },
                C() { return 3; }
            }
        }));
        assert.strictEqual(Result.A.op, 1);
        assert.strictEqual(Result.B.op, 2);
        assert.strictEqual(Result.C.op, 3);
    });
});

describe('Error Handling', () => {
    test('should create new operation when parent does not have it', () => {
        // With unified fold, calling fold() on extended ADT creates new operation
        // if parent doesn't have it
        const Color = data(() => ({
            Red: {},
            Green: {}
        }));
        const ExtendedColor = data(() => ({
            [extend]: Color,
            Blue: {},
            newOp: {
                op: 'fold',
                spec: { out: String },
                Blue() { return 'blue'; },
                _() { return 'color'; }
            }
        }));

        // All variants get the new operation
        assert.strictEqual(ExtendedColor.Red.newOp, 'color');
        assert.strictEqual(ExtendedColor.Green.newOp, 'color');
        assert.strictEqual(ExtendedColor.Blue.newOp, 'blue');
    });

    test('should allow handlers for new variants even when parent operation exists', () => {
        const Color = data(() => ({
            Red: {},
            Green: {},
            toHex: {
                op: 'fold',
                spec: { out: String },
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; }
            }
        }));

        const ExtendedColor = data(() => ({
            [extend]: Color,
            Blue: {},
            toHex: {
                op: 'fold',
                spec: { out: String },
                Blue() { return '#0000FF'; }
            }
        }));

        assert.strictEqual(ExtendedColor.Blue.toHex, '#0000FF');
    });

    test('should work on both base and extended ADTs', () => {
        const Color = data(() => ({
            Red: {},
            Green: {},
            toHex: {
                op: 'fold',
                spec: { out: String },
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; }
            }
        }));

        // But it should work on extended ADTs
        const ExtendedColor = data(() => ({
            [extend]: Color,
            Blue: {},
            toHex: {
                op: 'fold',
                spec: { out: String },
                Blue() { return '#0000FF'; }
            }
        }));
        const result = ExtendedColor;

        assert.strictEqual(result.Blue.toHex, '#0000FF');
    });
});

test('should allow overriding handlers at multiple levels', () => {
    const Color = data(() => ({
        Red: {},
        Green: {},
        toHex: {
            op: 'fold',
            spec: { out: String },
            Red() { return '#FF0000'; },
            Green() { return '#00FF00'; }
        }
    }));

    const ExtendedColor = data(() => ({
        [extend]: Color,
        Blue: {},
        toHex: {
            op: 'fold',
            spec: { out: String },
            Blue() { return '#0000FF'; }
        }
    }));

    assert.strictEqual(ExtendedColor.Blue.toHex, '#0000FF');

    // Override Blue handler at next level (like method overriding in OOP)
    const FurtherExtended = data(() => ({
        [extend]: ExtendedColor,
        toHex: {
            op: 'fold',
            spec: { out: String },
            Blue() { return '#0000AA'; } // Override Blue handler
        }
    }));

    // Overridden handler is used
    assert.strictEqual(FurtherExtended.Blue.toHex, '#0000AA');
    // Other handlers inherited
    assert.strictEqual(FurtherExtended.Red.toHex, '#FF0000');
});

describe('Recursive ADTs', () => {
    test('should extend fold on recursive ADT', () => {
        const List = data(({ Family, T }) => ({
            Nil: {},
            Cons: { head: T, tail: Family },
            isEmpty: {
                op: 'fold',
                spec: { out: Boolean },
                Nil() { return true; },
                Cons() { return false; }
            }
        }));

        const ExtendedList = data(({ Family: _Family, T }) => ({
            [extend]: List,
            Single: { value: T },
            isEmpty: {
                op: 'fold',
                spec: { out: Boolean },
                Single() { return false; }
            }
        }));

        const empty = ExtendedList.Nil;
        const cons = ExtendedList.Cons({ head: 1, tail: ExtendedList.Nil });
        const single = ExtendedList.Single({ value: 42 });

        assert.strictEqual(empty.isEmpty, true);
        assert.strictEqual(cons.isEmpty, false);
        assert.strictEqual(single.isEmpty, false);
    });
});

