import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior } from '../index.mjs';
import { behaviorObservers } from '../BehaviorOps.mjs';

describe('Behavior Stream', () => {
    it('should define Stream behavior type with head and tail observers', () => {
        const Stream = behavior(self => ({
            head: Object,
            tail: self
        }));

        // Verify the behavior type was created
        assert.ok(Stream);

        // Verify observer registry exists
        const observers = behaviorObservers.get(Stream)!;
        assert.ok(observers);
        assert.strictEqual(observers.size, 2);

        // Verify head observer
        const headObserver = observers.get('head')!;
        assert.ok(headObserver);
        assert.strictEqual(headObserver.name, 'head');
        assert.strictEqual(headObserver.isSimple, true);
        assert.strictEqual(headObserver.isParametric, false);
        assert.strictEqual(headObserver.isContinuation, false);

        // Verify tail observer
        const tailObserver = observers.get('tail')!;
        assert.ok(tailObserver);
        assert.strictEqual(tailObserver.name, 'tail');
        assert.strictEqual(tailObserver.isSimple, false);
        assert.strictEqual(tailObserver.isParametric, false);
        assert.strictEqual(tailObserver.isContinuation, true);
    });

    it('should support Stream used as a subtype element type', () => {
        const Stream = behavior(self => ({
            head: Object,
            tail: self
        }));

        // Stream can be used directly — no parameterization needed
        const NumberStream = Stream;

        // Verify behavior type exists
        assert.ok(NumberStream);
    });

    it('should validate observer names are camelCase', () => {
        assert.throws(() => {
            behavior(self => ({
                Head: Object,  // PascalCase - should fail
                tail: self
            }));
        }, {
            name: 'TypeError',
            message: /Observer 'Head' must be camelCase/
        });

        assert.throws(() => {
            behavior(self => ({
                head: Object,
                _tail: self  // Underscore prefix - should fail
            }));
        }, {
            name: 'TypeError',
            message: /Observer '_tail' must be camelCase/
        });
    });

    it('should distinguish simple, parametric, and continuation observers', () => {
        const ComplexBehavior = behavior(self => ({
            simple: Object,                              // Simple observer
            parametric: { in: Number, out: Object },    // Parametric observer
            continuation: self                           // Continuation
        }));

        const observers = behaviorObservers.get(ComplexBehavior)!;

        const simple = observers.get('simple')!;
        assert.strictEqual(simple.isSimple, true);
        assert.strictEqual(simple.isParametric, false);
        assert.strictEqual(simple.isContinuation, false);

        const parametric = observers.get('parametric')!;
        assert.strictEqual(parametric.isSimple, false);
        assert.strictEqual(parametric.isParametric, true);
        assert.strictEqual(parametric.isContinuation, false);

        const continuation = observers.get('continuation')!;
        assert.strictEqual(continuation.isSimple, false);
        assert.strictEqual(continuation.isParametric, false);
        assert.strictEqual(continuation.isContinuation, true);
    });

    it('should have multiple simple observers', () => {
        const BiStream = behavior(self => ({
            headT: Object,
            headU: Object,
            tail: self
        }));

        const observers = behaviorObservers.get(BiStream)!;
        assert.strictEqual(observers.size, 3);
        assert.ok(observers.get('headT')!);
        assert.ok(observers.get('headU')!);
        assert.ok(observers.get('tail')!);
    });

    it('should reject non-function declaration', () => {
        assert.throws(() => {
            behavior({ head: Number } as never);
        }, {
            name: 'TypeError',
            message: /behavior\(\) requires a callback function/
        });
    });

    it('should reject declaration that does not return object', () => {
        assert.throws(() => {
            behavior(self => null as unknown as Record<string, unknown>);
        }, {
            name: 'TypeError',
            message: /behavior\(\) callback must return an object/
        });

        assert.throws(() => {
            behavior(self => "not an object" as unknown as Record<string, unknown>);
        }, {
            name: 'TypeError',
            message: /behavior\(\) callback must return an object/
        });
    });
});
