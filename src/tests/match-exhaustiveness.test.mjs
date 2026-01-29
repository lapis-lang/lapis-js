import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { data, extend } from '../index.mjs';

describe('Match Exhaustiveness Checking', () => {
    describe('Compile-time exhaustiveness', () => {
        test('should require all handlers when wildcard is not provided', () => {
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
                toHex2: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; }
                }
            }));
        });

        test('should allow partial handlers when wildcard is provided', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    _() { return '#UNKNOWN'; }
                },
                toHex2: {
                    op: 'fold',
                    spec: { out: String },
                    _() { return '#UNKNOWN'; }
                }
            }));
        });

        test('wildcard is allowed but redundant when all cases are handled', () => {
            const C = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; },
                    _() { return '#UNKNOWN'; }  // Redundant but allowed
                }
            }));

            // All explicit handlers are used
            assert.strictEqual(C.Red.toHex, '#FF0000');
            assert.strictEqual(C.Green.toHex, '#00FF00');
            assert.strictEqual(C.Blue.toHex, '#0000FF');
        });

        test('should work with structured variants', () => {
            const Shape = data(() => ({
                Circle: { radius: Number },
                Square: { side: Number },
                area: {
                    op: 'fold',
                    spec: { out: Number },
                    Circle({ radius }) { return Math.PI * radius * radius; },
                    Square({ side }) { return side * side; }
                },
                area2: {
                    op: 'fold',
                    spec: { out: Number },
                    Circle({ radius }) { return Math.PI * radius * radius; }
                }
            }));
        });

        test('should work with callback form', () => {
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
                toHex2: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; }
                },
                toHex3: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    _() { return '#UNKNOWN'; }
                }
            }));
        });

        test('should work with recursive ADTs', () => {
            const List = data(({ Family }) => ({
                Nil: {},
                Cons: { head: Number, tail: Family },
                isEmpty: {
                    op: 'fold',
                    spec: { out: Boolean },
                    Nil() { return true; },
                    Cons() { return false; }
                },
                isEmpty2: {
                    op: 'fold',
                    spec: { out: Boolean },
                    Nil() { return true; }
                },
                isEmpty3: {
                    op: 'fold',
                    spec: { out: Boolean },
                    Nil() { return true; },
                    _() { return false; }
                }
            }));
        });
    });

    describe('Runtime behavior with exhaustiveness', () => {
        test('should work correctly when all handlers provided', () => {
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

            assert.strictEqual(Color.Red.toHex, '#FF0000');
            assert.strictEqual(Color.Green.toHex, '#00FF00');
            assert.strictEqual(Color.Blue.toHex, '#0000FF');
        });

        test('should throw when handler missing and no wildcard at runtime', () => {
            // TypeScript prevents this, but testing runtime behavior when bypassed
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; }
                }
            }));

            assert.strictEqual(Color.Red.toHex, '#FF0000');
            assert.throws(
                () => Color.Green.toHex,
                /No handler for variant 'Green'/
            );
        });

        test('should use wildcard for all unhandled cases', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    _() { return '#UNKNOWN'; }
                }
            }));

            assert.strictEqual(Color.Red.toHex, '#FF0000');
            assert.strictEqual(Color.Green.toHex, '#UNKNOWN');
            assert.strictEqual(Color.Blue.toHex, '#UNKNOWN');
        });

        test('should work with only wildcard handler', () => {
            const Color = data(() => ({
                Red: {},
                Green: {},
                Blue: {},
                getName: {
                    op: 'fold',
                    spec: { out: String },
                    _() { return this.constructor.name; }
                }
            }));

            assert.strictEqual(Color.Red.getName, 'Red');
            assert.strictEqual(Color.Green.getName, 'Green');
            assert.strictEqual(Color.Blue.getName, 'Blue');
        });
    });

    describe('Extended ADTs and exhaustiveness', () => {
        test('should require all handlers including extended variants', () => {
            const BaseColor = data(() => ({ Red: {}, Green: {}, Blue: {} }));
            const ExtendedColor = data(() => ({
                [extend]: BaseColor,
                Yellow: {},
                Orange: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; },
                    Yellow() { return '#FFFF00'; },
                    Orange() { return '#FFA500'; }
                },
                toHex2: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; }
                }
            }));
        });

        test('extended ADT can use wildcard for new variants', () => {
            const BaseColor = data(() => ({ Red: {}, Green: {}, Blue: {} }));
            const Color = data(() => ({
                [extend]: BaseColor,
                Yellow: {},
                Orange: {},
                toHex: {
                    op: 'fold',
                    spec: { out: String },
                    Red() { return '#FF0000'; },
                    Green() { return '#00FF00'; },
                    Blue() { return '#0000FF'; },
                    _() { return '#UNKNOWN'; }
                }
            }));

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
                InternalServerError: {},
                toCode: {
                    op: 'fold',
                    spec: { out: Number },
                    OK() { return 200; },
                    Created() { return 201; },
                    BadRequest() { return 400; },
                    Unauthorized() { return 401; },
                    NotFound() { return 404; },
                    InternalServerError() { return 500; }
                },
                isError: {
                    op: 'fold',
                    spec: { out: Boolean },
                    OK() { return false; },
                    Created() { return false; },
                    _() { return true; }
                }
            }));

            assert.strictEqual(HttpStatus.OK.isError, false);
            assert.strictEqual(HttpStatus.BadRequest.isError, true);
            assert.strictEqual(HttpStatus.NotFound.isError, true);
        });
    });
});
