/**
 * Basic Behavior Tests
 * 
 * Tests for core behavior() function declaration and parsing.
 * Basic infrastructure without unfold/fold/map operations.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior, behaviorObservers } from '../index.mjs';

describe('Behavior - Basic Declaration', () => {
    it('should create a behavior type with simple observers', () => {
        const Point = behavior(() => ({
            x: Number,
            y: Number
        }));

        assert.ok(Point, 'Point behavior should be created');

        // Check that observer definitions are stored
        const observers = behaviorObservers.get(Point);
        assert.ok(observers, 'Observers should be registered');
        assert.equal(observers.size, 2, 'Should have 2 observers');

        // Verify observer metadata
        const xObserver = observers.get('x');
        assert.ok(xObserver, 'x observer should exist');
        assert.equal(xObserver.name, 'x');
        assert.ok(xObserver.isSimple, 'x should be a simple observer');
        assert.ok(!xObserver.isParametric, 'x should not be parametric');
        assert.ok(!xObserver.isContinuation, 'x should not be a continuation');

        const yObserver = observers.get('y');
        assert.ok(yObserver, 'y observer should exist');
        assert.equal(yObserver.name, 'y');
        assert.ok(yObserver.isSimple, 'y should be a simple observer');
    });

    it('should create a behavior type with Self continuations', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self
        }));

        const observers = behaviorObservers.get(Stream);
        assert.equal(observers.size, 2, 'Should have 2 observers');

        const headObserver = observers.get('head');
        assert.ok(headObserver.isSimple, 'head should be a simple observer');

        const tailObserver = observers.get('tail');
        assert.ok(tailObserver.isContinuation, 'tail should be a continuation');
        assert.ok(!tailObserver.isSimple, 'tail should not be simple');
    });

    it('should create a behavior type with parameterized Self', () => {
        const Stream = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T)
        }));

        const observers = behaviorObservers.get(Stream);
        const tailObserver = observers.get('tail');
        assert.ok(tailObserver.isContinuation, 'tail with Self(T) should be a continuation');
    });

    it('should create a behavior type with parametric observers', () => {
        const Console = behavior(() => ({
            log: { in: String, out: undefined },
            read: { out: String }
        }));

        const observers = behaviorObservers.get(Console);

        const logObserver = observers.get('log');
        assert.ok(logObserver.isParametric, 'log should be parametric');
        assert.ok(!logObserver.isSimple, 'log should not be simple');

        const readObserver = observers.get('read');
        assert.ok(readObserver.isParametric, 'read should be parametric');
    });

    it('should reject non-camelCase observer names', () => {
        assert.throws(
            () => behavior(() => ({
                Head: Number  // PascalCase - invalid
            })),
            /Observer 'Head' must be camelCase/,
            'Should reject PascalCase observer names'
        );

        assert.throws(
            () => behavior(() => ({
                _head: Number  // Underscore prefix - invalid
            })),
            /Observer '_head' must be camelCase/,
            'Should reject underscore-prefixed observer names'
        );
    });

    it('should reject non-function arguments', () => {
        assert.throws(
            () => behavior({ head: Number }),
            /behavior\(\) requires a callback function/,
            'Should reject object literals'
        );

        assert.throws(
            () => behavior(null),
            /behavior\(\) requires a callback function/,
            'Should reject null'
        );
    });

    it('should reject callbacks that do not return objects', () => {
        assert.throws(
            () => behavior(() => null),
            /callback must return an object/,
            'Should reject callbacks returning null'
        );

        assert.throws(
            () => behavior(() => 42),
            /callback must return an object/,
            'Should reject callbacks returning primitives'
        );
    });

    it('should extract type parameter names from callback', () => {
        // Single type parameter
        const Stream1 = behavior(({ Self, T }) => ({
            head: T,
            tail: Self(T)
        }));
        assert.ok(Stream1, 'Should create behavior with single type param');

        // Multiple type parameters
        const Pair = behavior(({ Self, T, U }) => ({
            first: T,
            second: U
        }));
        assert.ok(Pair, 'Should create behavior with multiple type params');

        // Custom type parameter names
        const CustomStream = behavior(({ Self, ItemType }) => ({
            current: ItemType,
            next: Self(ItemType)
        }));
        assert.ok(CustomStream, 'Should create behavior with custom type param names');
    });

    it('should support mixed observer types', () => {
        const MixedBehavior = behavior(({ Self, T }) => ({
            simpleField: Number,
            parametricMethod: { in: String, out: Boolean },
            continuation: Self(T)
        }));

        const observers = behaviorObservers.get(MixedBehavior);
        assert.equal(observers.size, 3, 'Should have 3 observers');

        assert.ok(observers.get('simpleField').isSimple);
        assert.ok(observers.get('parametricMethod').isParametric);
        assert.ok(observers.get('continuation').isContinuation);
    });
});
