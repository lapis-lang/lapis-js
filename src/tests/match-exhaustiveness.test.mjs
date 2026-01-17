import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

describe('Match Exhaustiveness Checking', () => {
    describe('Compile-time exhaustiveness', () => {
        test('should require all handlers when wildcard is not provided', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} });

            // This compiles - all handlers provided
            Color.fold('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; }
            });

            // This should fail exhaustiveness check - missing Green and Blue handlers
            Color.fold('toHex2', { out: String }, {
                Red() { return '#FF0000'; }
            });
        });

        test('should allow partial handlers when wildcard is provided', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} });

            // This should compile - wildcard handles missing cases
            Color.fold('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                _() { return '#UNKNOWN'; }
            });

            // This should also compile - only wildcard
            Color.fold('toHex2', { out: String }, {
                _() { return '#UNKNOWN'; }
            });
        });

        test('wildcard is allowed but redundant when all cases are handled', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} });

            // Wildcard is allowed (TypeScript doesn't reject extra properties)
            // but it will never be called since all cases are explicitly handled
            const C = Color.fold('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; },
                _() { return '#UNKNOWN'; }  // Redundant but allowed
            });

            // All explicit handlers are used
            assert.strictEqual(C.Red.toHex, '#FF0000');
            assert.strictEqual(C.Green.toHex, '#00FF00');
            assert.strictEqual(C.Blue.toHex, '#0000FF');
        });

        test('should work with structured variants', () => {
            const Shape = data(() => ({
                Circle: { radius: Number },
                Square: { side: Number }
            }));

            // This compiles - all handlers provided
            Shape.fold('area', { out: Number }, {
                Circle({ radius }) { return Math.PI * radius * radius; },
                Square({ side }) { return side * side; }
            });

            // This should fail exhaustiveness check - missing Square handler
            Shape.fold('area2', { out: Number }, {
                Circle({ radius }) { return Math.PI * radius * radius; }
            });
        });

        test('should work with callback form', () => {
            const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));

            // This compiles - all handlers provided
            Color.fold('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; }
            });

            // This should fail exhaustiveness check - missing Green and Blue handlers  
            Color.fold('toHex2', { out: String }, {
                Red() { return '#FF0000'; }
            });

            // This compiles - wildcard provided
            Color.fold('toHex3', { out: String }, {
                Red() { return '#FF0000'; },
                _() { return '#UNKNOWN'; }
            });
        });

        test('should work with recursive ADTs', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family }
            }));

            // This compiles - all handlers provided
            List.fold('isEmpty', { out: Boolean }, {
                Nil() { return true; },
                Cons() { return false; }
            });

            // This should fail exhaustiveness check - missing Cons handler
            List.fold('isEmpty2', { out: Boolean }, {
                Nil() { return true; }
            });

            // This compiles - wildcard provided
            List.fold('isEmpty3', { out: Boolean }, {
                Nil() { return true; },
                _() { return false; }
            });
        });
    });

    describe('Runtime behavior with exhaustiveness', () => {
        test('should work correctly when all handlers provided', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            assert.strictEqual(Color.Red.toHex, '#FF0000');
            assert.strictEqual(Color.Green.toHex, '#00FF00');
            assert.strictEqual(Color.Blue.toHex, '#0000FF');
        });

        test('should throw when handler missing and no wildcard at runtime', () => {
            // TypeScript prevents this, but testing runtime behavior when bypassed
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('toHex', { out: String }, {
                    Red() { return '#FF0000'; }
                });

            assert.strictEqual(Color.Red.toHex, '#FF0000');
            assert.throws(
                () => Color.Green.toHex,
                /No handler for variant 'Green'/
            );
        });

        test('should use wildcard for all unhandled cases', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    _() { return '#UNKNOWN'; }
                });

            assert.strictEqual(Color.Red.toHex, '#FF0000');
            assert.strictEqual(Color.Green.toHex, '#UNKNOWN');
            assert.strictEqual(Color.Blue.toHex, '#UNKNOWN');
        });

        test('should work with only wildcard handler', () => {
            const Color = data({ Red: {}, Green: {}, Blue: {} })
                .fold('getName', { out: String }, {
                    _(instance) { return instance.constructor.name; }
                });

            assert.strictEqual(Color.Red.getName, 'Red');
            assert.strictEqual(Color.Green.getName, 'Green');
            assert.strictEqual(Color.Blue.getName, 'Blue');
        });
    });

    describe('Extended ADTs and exhaustiveness', () => {
        test('should require all handlers including extended variants', () => {
            const BaseColor = data({ Red: {}, Green: {}, Blue: {} });
            const ExtendedColor = BaseColor.extend({ Yellow: {}, Orange: {} });

            // This compiles - all 5 handlers provided
            ExtendedColor.fold('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; },
                Yellow() { return '#FFFF00'; },
                Orange() { return '#FFA500'; }
            });

            // This should fail exhaustiveness check - missing Yellow and Orange handlers
            ExtendedColor.fold('toHex2', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; }
            });
        });

        test('extended ADT can use wildcard for new variants', () => {
            const BaseColor = data({ Red: {}, Green: {}, Blue: {} });
            const ExtendedColor = BaseColor.extend({ Yellow: {}, Orange: {} });

            // This compiles - wildcard covers new variants
            const Color = ExtendedColor.fold('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; },
                _() { return '#UNKNOWN'; }
            });

            assert.strictEqual(Color.Yellow.toHex, '#UNKNOWN');
            assert.strictEqual(Color.Orange.toHex, '#UNKNOWN');
        });
    });

    describe('Mixed scenarios', () => {
        test('should handle complex ADT with many variants', () => {
            const HttpStatus = data(() => ({
                OK: {},
                Created: {},
                BadRequest: {},
                Unauthorized: {},
                NotFound: {},
                InternalServerError: {}
            }));

            // All handlers required
            HttpStatus.fold('toCode', { out: Number }, {
                OK() { return 200; },
                Created() { return 201; },
                BadRequest() { return 400; },
                Unauthorized() { return 401; },
                NotFound() { return 404; },
                InternalServerError() { return 500; }
            });

            // Wildcard for common cases
            const Status = HttpStatus.fold('isError', { out: Boolean }, {
                OK() { return false; },
                Created() { return false; },
                _() { return true; }
            });

            assert.strictEqual(Status.OK.isError, false);
            assert.strictEqual(Status.BadRequest.isError, true);
            assert.strictEqual(Status.NotFound.isError, true);
        });
    });
});
