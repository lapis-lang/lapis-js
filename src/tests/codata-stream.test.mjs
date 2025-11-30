import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { codata } from '../index.mjs';
import { codataObservers } from '../Observer.mjs';

describe('Codata Stream', () => {
    it('should define Stream codata type with head and tail observers', () => {
        const Stream = codata(({ Self, T }) => ({
            head: T,
            tail: Self
        }));

        // Verify the codata type was created
        assert.ok(Stream);

        // Verify observer registry exists
        const observers = codataObservers.get(Stream);
        assert.ok(observers);
        assert.strictEqual(observers.size, 2);

        // Verify head observer
        const headObserver = observers.get('head');
        assert.ok(headObserver);
        assert.strictEqual(headObserver.name, 'head');
        assert.strictEqual(headObserver.isSimple, true);
        assert.strictEqual(headObserver.isParametric, false);
        assert.strictEqual(headObserver.isContinuation, false);

        // Verify tail observer
        const tailObserver = observers.get('tail');
        assert.ok(tailObserver);
        assert.strictEqual(tailObserver.name, 'tail');
        assert.strictEqual(tailObserver.isSimple, false);
        assert.strictEqual(tailObserver.isParametric, false);
        assert.strictEqual(tailObserver.isContinuation, true);
    });

    it('should support parameterized Stream with type argument', () => {
        const Stream = codata(({ Self, T }) => ({
            head: T,
            tail: Self
        }));

        // Create parameterized Stream(Number)
        const NumberStream = Stream(Number);

        // Verify parameterized type exists
        assert.ok(NumberStream);

        // Note: Observer registry is not copied for parameterized instances yet
        // This would be part of the full unfold implementation
    });

    it('should validate observer names are camelCase', () => {
        assert.throws(() => {
            codata(({ Self, T }) => ({
                Head: T,  // PascalCase - should fail
                tail: Self
            }));
        }, {
            name: 'TypeError',
            message: /Observer 'Head' must be camelCase/
        });

        assert.throws(() => {
            codata(({ Self, T }) => ({
                head: T,
                _tail: Self  // Underscore prefix - should fail
            }));
        }, {
            name: 'TypeError',
            message: /Observer '_tail' must be camelCase/
        });
    });

    it('should distinguish simple, parametric, and continuation observers', () => {
        const ComplexCodata = codata(({ Self, T }) => ({
            simple: T,                              // Simple observer
            parametric: { in: Number, out: T },    // Parametric observer
            continuation: Self                      // Continuation
        }));

        const observers = codataObservers.get(ComplexCodata);

        const simple = observers.get('simple');
        assert.strictEqual(simple.isSimple, true);
        assert.strictEqual(simple.isParametric, false);
        assert.strictEqual(simple.isContinuation, false);

        const parametric = observers.get('parametric');
        assert.strictEqual(parametric.isSimple, false);
        assert.strictEqual(parametric.isParametric, true);
        assert.strictEqual(parametric.isContinuation, false);

        const continuation = observers.get('continuation');
        assert.strictEqual(continuation.isSimple, false);
        assert.strictEqual(continuation.isParametric, false);
        assert.strictEqual(continuation.isContinuation, true);
    });

    it('should extract multiple type parameters', () => {
        const BiStream = codata(({ Self, T, U }) => ({
            headT: T,
            headU: U,
            tail: Self
        }));

        const observers = codataObservers.get(BiStream);
        assert.strictEqual(observers.size, 3);
        assert.ok(observers.get('headT'));
        assert.ok(observers.get('headU'));
        assert.ok(observers.get('tail'));
    });

    it('should reject non-function declaration', () => {
        assert.throws(() => {
            codata({ head: Number });
        }, {
            name: 'TypeError',
            message: /codata\(\) requires a callback function/
        });
    });

    it('should reject declaration that does not return object', () => {
        assert.throws(() => {
            codata(({ Self, T }) => null);
        }, {
            name: 'TypeError',
            message: /codata\(\) callback must return an object/
        });

        assert.throws(() => {
            codata(({ Self, T }) => "not an object");
        }, {
            name: 'TypeError',
            message: /codata\(\) callback must return an object/
        });
    });
});
