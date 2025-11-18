import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../index.mjs';

describe('Match Exhaustiveness Checking', () => {
    describe('Compile-time exhaustiveness', () => {
        test('should require all handlers when wildcard is not provided', () => {
            const Color = data({ Red: [], Green: [], Blue: [] });

            // This should compile - all handlers provided
            Color.match('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; }
            });

            // This should NOT compile - missing handlers
            // @ts-expect-error - Green and Blue handlers are missing
            Color.match('toHex2', { out: String }, {
                Red() { return '#FF0000'; }
            });
        });

        test('should allow partial handlers when wildcard is provided', () => {
            const Color = data({ Red: [], Green: [], Blue: [] });

            // This should compile - wildcard handles missing cases
            Color.match('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                _() { return '#UNKNOWN'; }
            });

            // This should also compile - only wildcard
            Color.match('toHex2', { out: String }, {
                _() { return '#UNKNOWN'; }
            });
        });

        test('wildcard is allowed but redundant when all cases are handled', () => {
            const Color = data({ Red: [], Green: [], Blue: [] });

            // Wildcard is allowed (TypeScript doesn't reject extra properties)
            // but it will never be called since all cases are explicitly handled
            const C = Color.match('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; },
                _() { return '#UNKNOWN'; }  // Redundant but allowed
            });

            // All explicit handlers are used
            assert.strictEqual(C.Red.toHex(), '#FF0000');
            assert.strictEqual(C.Green.toHex(), '#00FF00');
            assert.strictEqual(C.Blue.toHex(), '#0000FF');
        });

        test('should work with structured variants', () => {
            const Shape = data({
                Circle: [{ radius: Number }],
                Square: [{ side: Number }]
            });

            // This should compile - all handlers provided
            Shape.match('area', { out: Number }, {
                Circle({ radius }) { return Math.PI * radius * radius; },
                Square({ side }) { return side * side; }
            });

            // This should NOT compile - missing Square handler
            // @ts-expect-error - Square handler is missing
            Shape.match('area2', { out: Number }, {
                Circle({ radius }) { return Math.PI * radius * radius; }
            });
        });

        test('should work with callback form', () => {
            const Color = data({ Red: [], Green: [], Blue: [] });

            // This should compile - all handlers provided
            Color.match('toHex', { out: String }, (_Family) => ({
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; }
            }));

            // This should NOT compile - missing handlers
            // @ts-expect-error - Green and Blue handlers are missing
            Color.match('toHex2', { out: String }, (_Family) => ({
                Red() { return '#FF0000'; }
            }));

            // This should compile - wildcard provided
            Color.match('toHex3', { out: String }, (_Family) => ({
                Red() { return '#FF0000'; },
                _() { return '#UNKNOWN'; }
            }));
        });

        test('should work with recursive ADTs', () => {
            const List = data(({ Family }) => ({
                Nil: [],
                Cons: [{ head: Number }, { tail: Family }]
            }));

            // This should compile - all handlers provided
            List.match('isEmpty', { out: Boolean }, {
                Nil() { return true; },
                Cons() { return false; }
            });

            // This should NOT compile - missing Cons handler
            // @ts-expect-error - Cons handler is missing
            List.match('isEmpty2', { out: Boolean }, {
                Nil() { return true; }
            });

            // This should compile - wildcard provided
            List.match('isEmpty3', { out: Boolean }, {
                Nil() { return true; },
                _() { return false; }
            });
        });
    });

    describe('Runtime behavior with exhaustiveness', () => {
        test('should work correctly when all handlers provided', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                });

            assert.strictEqual(Color.Red.toHex(), '#FF0000');
            assert.strictEqual(Color.Green.toHex(), '#00FF00');
            assert.strictEqual(Color.Blue.toHex(), '#0000FF');
        });

        test('should throw when handler missing and no wildcard at runtime', () => {
            // TypeScript prevents this, but testing runtime behavior when bypassed
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; }
                } as any);  // Bypass TypeScript checking

            assert.strictEqual(Color.Red.toHex(), '#FF0000');
            assert.throws(
                () => Color.Green.toHex(),
                /No handler for variant 'Green'/
            );
        });

        test('should use wildcard for all unhandled cases', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('toHex', { out: String }, {
                    Red() { return '#FF0000'; },
                    _() { return '#UNKNOWN'; }
                });

            assert.strictEqual(Color.Red.toHex(), '#FF0000');
            assert.strictEqual(Color.Green.toHex(), '#UNKNOWN');
            assert.strictEqual(Color.Blue.toHex(), '#UNKNOWN');
        });

        test('should work with only wildcard handler', () => {
            const Color = data({ Red: [], Green: [], Blue: [] })
                .match('getName', { out: String }, {
                    _(instance) { return instance.constructor.name; }
                });

            assert.strictEqual(Color.Red.getName(), 'Red');
            assert.strictEqual(Color.Green.getName(), 'Green');
            assert.strictEqual(Color.Blue.getName(), 'Blue');
        });
    });

    describe('Extended ADTs and exhaustiveness', () => {
        test('should require all handlers including extended variants', () => {
            const BaseColor = data({ Red: [], Green: [], Blue: [] });
            const ExtendedColor = BaseColor.extend({ Yellow: [], Orange: [] });

            // This should compile - all 5 handlers provided
            ExtendedColor.match('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; },
                Yellow() { return '#FFFF00'; },
                Orange() { return '#FFA500'; }
            });

            // This should NOT compile - missing Yellow and Orange
            // @ts-expect-error - Yellow and Orange handlers are missing
            ExtendedColor.match('toHex2', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; }
            });
        });

        test('extended ADT can use wildcard for new variants', () => {
            const BaseColor = data({ Red: [], Green: [], Blue: [] });
            const ExtendedColor = BaseColor.extend({ Yellow: [], Orange: [] });

            // This should compile - wildcard covers new variants
            const Color = ExtendedColor.match('toHex', { out: String }, {
                Red() { return '#FF0000'; },
                Green() { return '#00FF00'; },
                Blue() { return '#0000FF'; },
                _() { return '#UNKNOWN'; }
            });

            assert.strictEqual(Color.Yellow.toHex(), '#UNKNOWN');
            assert.strictEqual(Color.Orange.toHex(), '#UNKNOWN');
        });
    });

    describe('Mixed scenarios', () => {
        test('should handle complex ADT with many variants', () => {
            const HttpStatus = data({
                OK: [],
                Created: [],
                BadRequest: [],
                Unauthorized: [],
                NotFound: [],
                InternalServerError: []
            });

            // All handlers required
            HttpStatus.match('toCode', { out: Number }, {
                OK() { return 200; },
                Created() { return 201; },
                BadRequest() { return 400; },
                Unauthorized() { return 401; },
                NotFound() { return 404; },
                InternalServerError() { return 500; }
            });

            // Wildcard for common cases
            const Status = HttpStatus.match('isError', { out: Boolean }, {
                OK() { return false; },
                Created() { return false; },
                _() { return true; }
            });

            assert.strictEqual(Status.OK.isError(), false);
            assert.strictEqual(Status.BadRequest.isError(), true);
            assert.strictEqual(Status.NotFound.isError(), true);
        });
    });
});
