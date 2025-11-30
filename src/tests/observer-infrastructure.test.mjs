/**
 * Tests for Observer infrastructure
 * Validates the Observer class and composition functions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    createObserver,
    composeObservers,
    composeMultipleObservers,
    createFoldObserver,
    codataObservers
} from '../Observer.mjs';

describe('Observer Infrastructure', () => {
    describe('createObserver', () => {
        it('should create a valid observer with required fields', () => {
            const observer = createObserver({
                name: 'testOp',
                type: 'unfold',
                generator: () => 42
            });

            assert.equal(observer.name, 'testOp');
            assert.equal(observer.type, 'unfold');
            assert.equal(typeof observer.generator, 'function');
        });

        it('should throw error if name is missing', () => {
            assert.throws(
                () => createObserver({ type: 'unfold', generator: () => 42 }),
                { message: /Observer must have a name/ }
            );
        });

        it('should throw error if type is missing', () => {
            assert.throws(
                () => createObserver({ name: 'test', generator: () => 42 }),
                { message: /must specify a type/ }
            );
        });

        it('should throw error if type is invalid', () => {
            assert.throws(
                () => createObserver({ name: 'test', type: 'invalid', generator: () => 42 }),
                { message: /invalid type/ }
            );
        });

        it('should throw error if no transformation is provided', () => {
            assert.throws(
                () => createObserver({ name: 'test', type: 'map' }),
                { message: /must provide at least one/ }
            );
        });

        it('should validate fold operations have Done and Step cases', () => {
            assert.throws(
                () => createObserver({
                    name: 'test',
                    type: 'fold',
                    cases: { Done: () => true }
                }),
                { message: /missing required 'Step' case/ }
            );

            assert.throws(
                () => createObserver({
                    name: 'test',
                    type: 'fold',
                    cases: { Step: () => ({}) }
                }),
                { message: /missing required 'Done' case/ }
            );
        });

        it('should accept valid fold operation with Done and Step', () => {
            const observer = createObserver({
                name: 'testFold',
                type: 'fold',
                cases: {
                    Done: (self, n) => n <= 0,
                    Step: (self, n) => ({ emit: self.head, nextState: n - 1, nextSelf: self.tail })
                }
            });

            assert.equal(observer.name, 'testFold');
            assert.equal(observer.type, 'fold');
            assert.ok(observer.cases.Done);
            assert.ok(observer.cases.Step);
        });
    });

    describe('createFoldObserver', () => {
        it('should create fold observer with validated cases', () => {
            const observer = createFoldObserver(
                'take',
                {
                    Done: (self, n) => n <= 0,
                    Step: (self, n) => ({ emit: self.head, nextState: n - 1, nextSelf: self.tail })
                },
                Array,
                Number
            );

            assert.equal(observer.name, 'take');
            assert.equal(observer.type, 'fold');
            assert.equal(observer.outSpec, Array);
            assert.equal(observer.inSpec, Number);
        });

        it('should throw error if cases are missing', () => {
            assert.throws(
                () => createFoldObserver('bad', null, Array),
                { message: /requires cases object/ }
            );
        });

        it('should throw error if Done case is missing', () => {
            assert.throws(
                () => createFoldObserver('bad', { Step: () => ({}) }, Array),
                { message: /requires 'Done' case/ }
            );
        });

        it('should throw error if Step case is missing', () => {
            assert.throws(
                () => createFoldObserver('bad', { Done: () => true }, Array),
                { message: /requires 'Step' case/ }
            );
        });
    });

    describe('composeObservers', () => {
        it('should compose two observers', () => {
            const o1 = createObserver({
                name: 'unfold1',
                type: 'unfold',
                generator: () => 0
            });

            const o2 = createObserver({
                name: 'map1',
                type: 'map',
                getObserverTransform: (obs) => (x) => x * 2
            });

            const composed = composeObservers(o1, o2);

            assert.equal(composed.name, 'unfold1_map1');
            assert.ok(composed.generator);
            assert.ok(composed.getObserverTransform);
        });

        it('should throw error when composing multiple unfolds', () => {
            const o1 = createObserver({
                name: 'unfold1',
                type: 'unfold',
                generator: () => 0
            });

            const o2 = createObserver({
                name: 'unfold2',
                type: 'unfold',
                generator: () => 1
            });

            assert.throws(
                () => composeObservers(o1, o2),
                { message: /both have generators/ }
            );
        });

        it('should throw error when composing multiple folds', () => {
            const o1 = createFoldObserver(
                'fold1',
                {
                    Done: () => true,
                    Step: () => ({ emit: 1, nextState: 0, nextSelf: null })
                }
            );

            const o2 = createFoldObserver(
                'fold2',
                {
                    Done: () => true,
                    Step: () => ({ emit: 2, nextState: 0, nextSelf: null })
                }
            );

            assert.throws(
                () => composeObservers(o1, o2),
                { message: /both have fold cases/ }
            );
        });
    });

    describe('composeMultipleObservers', () => {
        it('should compose single observer (rename)', () => {
            const observer = createObserver({
                name: 'original',
                type: 'unfold',
                generator: () => 0
            });

            const composed = composeMultipleObservers([observer], 'renamed');

            assert.equal(composed.name, 'renamed');
            assert.equal(composed.type, 'unfold');
            assert.ok(composed.generator);
        });

        it('should compose unfold + map', () => {
            const unfold = createObserver({
                name: 'From',
                type: 'unfold',
                generator: (n) => n,
                inSpec: Number
            });

            const map = createObserver({
                name: 'double',
                type: 'map',
                getObserverTransform: (obs) => (x) => x * 2
            });

            const composed = composeMultipleObservers([unfold, map], 'FromDoubled');

            assert.equal(composed.name, 'FromDoubled');
            assert.ok(composed.generator);
            assert.ok(composed.getObserverTransform);
        });

        it('should compose unfold + map + fold', () => {
            const unfold = createObserver({
                name: 'From',
                type: 'unfold',
                generator: (n) => n,
                inSpec: Number
            });

            const map = createObserver({
                name: 'double',
                type: 'map',
                getObserverTransform: (obs) => (x) => x * 2
            });

            const fold = createFoldObserver(
                'sum',
                {
                    Done: (self, count) => count <= 0,
                    Step: (self, count) => ({
                        emit: self.head,
                        nextState: count - 1,
                        nextSelf: self.tail
                    })
                },
                Number,
                Number
            );

            const composed = composeMultipleObservers([unfold, map, fold], 'SumOfDoubles');

            assert.equal(composed.name, 'SumOfDoubles');
            assert.ok(composed.generator);
            assert.ok(composed.getObserverTransform);
            assert.ok(composed.cases);
        });

        it('should throw error with empty array', () => {
            assert.throws(
                () => composeMultipleObservers([], 'empty'),
                { message: /Cannot compose empty observer array/ }
            );
        });

        it('should throw error with multiple unfolds', () => {
            const o1 = createObserver({
                name: 'unfold1',
                type: 'unfold',
                generator: () => 0
            });

            const o2 = createObserver({
                name: 'unfold2',
                type: 'unfold',
                generator: () => 1
            });

            assert.throws(
                () => composeMultipleObservers([o1, o2], 'invalid'),
                { message: /multiple unfolds detected/ }
            );
        });

        it('should throw error with multiple folds', () => {
            const o1 = createFoldObserver('fold1', {
                Done: () => true,
                Step: () => ({ emit: 1, nextState: 0, nextSelf: null })
            });

            const o2 = createFoldObserver('fold2', {
                Done: () => true,
                Step: () => ({ emit: 2, nextState: 0, nextSelf: null })
            });

            assert.throws(
                () => composeMultipleObservers([o1, o2], 'invalid'),
                { message: /multiple folds detected/ }
            );
        });
    });

    describe('codataObservers WeakMap', () => {
        it('should be a WeakMap', () => {
            assert.ok(codataObservers instanceof WeakMap);
        });

        it('should allow storing and retrieving observers', () => {
            class TestCodata {}
            const registry = new Map();
            
            const observer = createObserver({
                name: 'test',
                type: 'unfold',
                generator: () => 0
            });

            registry.set('test', observer);
            codataObservers.set(TestCodata, registry);

            const retrieved = codataObservers.get(TestCodata);
            assert.equal(retrieved.get('test').name, 'test');
        });
    });
});
