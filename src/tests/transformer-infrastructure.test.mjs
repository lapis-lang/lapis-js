import { data } from '@lapis-lang/lapis-js';
import { createTransformer, composeTransformers } from '@lapis-lang/lapis-js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Transformer Infrastructure', () => {
    describe('createTransformer', () => {
        test('creates transformer with all components', () => {
            const transformer = createTransformer({
                name: 'testOp',
                generator: (_ctors) => (seed) => seed,
                getCtorTransform: (_ctor) => () => 42,
                getParamTransform: (_param) => (x) => x,
                getAtomTransform: (_ctor) => (x) => x
            });

            assert.strictEqual(transformer.name, 'testOp');
            assert.ok(transformer.generator);
            assert.ok(transformer.getCtorTransform);
            assert.ok(transformer.getParamTransform);
            assert.ok(transformer.getAtomTransform);
        });

        test('creates transformer with only generator', () => {
            const transformer = createTransformer({
                name: 'unfoldOp',
                generator: (_ctors) => (seed) => seed
            });

            assert.strictEqual(transformer.name, 'unfoldOp');
            assert.ok(transformer.generator);
            assert.strictEqual(transformer.getCtorTransform, undefined);
            assert.strictEqual(transformer.getParamTransform, undefined);
            assert.strictEqual(transformer.getAtomTransform, undefined);
        });

        test('creates transformer with only getCtorTransform', () => {
            const transformer = createTransformer({
                name: 'foldOp',
                getCtorTransform: (_ctor) => () => 42
            });

            assert.strictEqual(transformer.name, 'foldOp');
            assert.strictEqual(transformer.generator, undefined);
            assert.ok(transformer.getCtorTransform);
            assert.strictEqual(transformer.getParamTransform, undefined);
            assert.strictEqual(transformer.getAtomTransform, undefined);
        });

        test('throws error if name is missing', () => {
            assert.throws(
                () => createTransformer({ name: '', getCtorTransform: () => () => 42 }),
                /Transformer must have a name/
            );
        });

        test('throws error if no transformations provided', () => {
            assert.throws(
                () => createTransformer({ name: 'empty' }),
                /must provide at least one of/
            );
        });
    });

    describe('composeTransformers', () => {
        test('composes two transformers with different components', () => {
            const unfold = createTransformer({
                name: 'counter',
                generator: (_ctors) => (n) => n
            });

            const fold = createTransformer({
                name: 'product',
                getCtorTransform: (_ctor) => () => 1
            });

            const composed = composeTransformers(unfold, fold);

            assert.strictEqual(composed.name, 'counter_product');
            assert.ok(composed.generator);
            assert.ok(composed.getCtorTransform);
        });

        test('throws error if both transformers have generators', () => {
            const unfold1 = createTransformer({
                name: 'counter1',
                generator: (_ctors) => (n) => n
            });

            const unfold2 = createTransformer({
                name: 'counter2',
                generator: (_ctors) => (n) => n * 2
            });

            assert.throws(
                () => composeTransformers(unfold1, unfold2),
                /only one unfold allowed/
            );
        });

        test('composes constructor transforms', () => {
            const t1 = createTransformer({
                name: 't1',
                getCtorTransform: (_ctor) => (x) => x + 1
            });

            const t2 = createTransformer({
                name: 't2',
                getCtorTransform: (_ctor) => (x) => x * 2
            });

            const composed = composeTransformers(t1, t2);
            const transform = composed.getCtorTransform({});

            // Should apply t1 then t2: t2(t1(5)) = (5 + 1) * 2 = 12
            assert.ok(transform);
            assert.strictEqual(transform(5), 12);
        });
    });

    describe('ADT Transformer Registry', () => {
        test('ADT can register and retrieve transformers', () => {
            const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));

            const transformer = createTransformer({
                name: 'toHex',
                getCtorTransform: (ctor) => {
                    if (ctor.name === 'Red') return () => '#FF0000';
                    if (ctor.name === 'Green') return () => '#00FF00';
                    if (ctor.name === 'Blue') return () => '#0000FF';
                    return undefined;
                }
            });

            // @ts-expect-error - accessing internal API
            Color._registerTransformer('toHex', transformer);

            // @ts-expect-error - accessing internal API
            const retrieved = Color._getTransformer('toHex');

            assert.strictEqual(retrieved?.name, 'toHex');
            assert.ok(retrieved?.getCtorTransform);
        });

        test('can register multiple transformers', () => {
            const Point = data(() => ({
                Point2D: { x: Number, y: Number }
            }));

            const distance = createTransformer({
                name: 'distance',
                getCtorTransform: () => ({ x, y }) =>
                    Math.sqrt(x * x + y * y)
            });

            const scale = createTransformer({
                name: 'scale',
                getCtorTransform: () => ({ x, y }) => ({ x: x * 2, y: y * 2 })
            });

            // @ts-expect-error - accessing internal API
            Point._registerTransformer('distance', distance);
            // @ts-expect-error - accessing internal API
            Point._registerTransformer('scale', scale);

            // @ts-expect-error - accessing internal API
            const names = Point._getTransformerNames();

            assert.ok(names.includes('distance'));
            assert.ok(names.includes('scale'));
            assert.strictEqual(names.length, 2);
        });

        test('extended ADT inherits parent transformers', () => {
            const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));

            const toHex = createTransformer({
                name: 'toHex',
                getCtorTransform: (ctor) => {
                    if (ctor.name === 'Red') return () => '#FF0000';
                    return undefined;
                }
            });

            // @ts-expect-error - accessing internal API
            Color._registerTransformer('toHex', toHex);

            const ExtendedColor = Color.extend(() => ({ Yellow: {} }));

            // Extended ADT should be able to access parent transformer
            // @ts-expect-error - accessing internal API
            const retrieved = ExtendedColor._getTransformer('toHex');

            assert.strictEqual(retrieved?.name, 'toHex');
        });

        test('extended ADT can have its own transformers', () => {
            const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));

            const toHex = createTransformer({
                name: 'toHex',
                getCtorTransform: (_ctor) => () => '#000000'
            });

            // @ts-expect-error - accessing internal API
            Color._registerTransformer('toHex', toHex);

            const ExtendedColor = Color.extend(() => ({ Yellow: {} }));

            const brightness = createTransformer({
                name: 'brightness',
                getCtorTransform: (_ctor) => () => 50
            });

            // @ts-expect-error - accessing internal API
            ExtendedColor._registerTransformer('brightness', brightness);

            // ExtendedColor should have both transformers
            // @ts-expect-error - accessing internal API
            assert.ok(ExtendedColor._getTransformer('toHex'));
            // @ts-expect-error - accessing internal API
            assert.ok(ExtendedColor._getTransformer('brightness'));

            // Parent should only have toHex
            // @ts-expect-error - accessing internal API
            assert.ok(Color._getTransformer('toHex'));
            // @ts-expect-error - accessing internal API
            assert.strictEqual(Color._getTransformer('brightness'), undefined);
        });

        test('throws error on name collision with variant field', () => {
            const Point = data(() => ({
                Point2D: { x: Number, y: Number }
            }));

            const transformer = createTransformer({
                name: 'x', // Collides with field 'x'
                getCtorTransform: () => () => 42
            });

            assert.throws(
                // @ts-expect-error - accessing internal API
                () => Point._registerTransformer('x', transformer),
                /Operation name 'x' conflicts with field 'x' in variant 'Point2D'/
            );
        });

        test('transformer registry is isolated between different ADTs', () => {
            const Color = data(() => ({ Red: {}, Green: {}, Blue: {} }));
            const Point = data(() => ({ Point2D: { x: Number, y: Number } }));

            const colorTransformer = createTransformer({
                name: 'toHex',
                getCtorTransform: () => () => '#000000'
            });

            const pointTransformer = createTransformer({
                name: 'distance',
                getCtorTransform: () => () => 0
            });

            // @ts-expect-error - accessing internal API
            Color._registerTransformer('toHex', colorTransformer);
            // @ts-expect-error - accessing internal API
            Point._registerTransformer('distance', pointTransformer);

            // Color should only have toHex
            // @ts-expect-error - accessing internal API
            assert.ok(Color._getTransformer('toHex'));
            // @ts-expect-error - accessing internal API
            assert.strictEqual(Color._getTransformer('distance'), undefined);

            // Point should only have distance
            // @ts-expect-error - accessing internal API
            assert.ok(Point._getTransformer('distance'));
            // @ts-expect-error - accessing internal API
            assert.strictEqual(Point._getTransformer('toHex'), undefined);
        });
    });

    describe('Transformer with Recursive ADTs', () => {
        test('can register transformer on recursive ADT', () => {
            const Peano = data(({ Family }) => ({
                Zero: {},
                Succ: { pred: Family }
            }));

            const toValue = createTransformer({
                name: 'toValue',
                getCtorTransform: (ctor) => {
                    if (ctor.name === 'Zero') return () => 0;
                    if (ctor.name === 'Succ') return ({ pred }) => 1 + pred;
                    return undefined;
                }
            });

            // @ts-expect-error - accessing internal API
            Peano._registerTransformer('toValue', toValue);

            // @ts-expect-error - accessing internal API
            const retrieved = Peano._getTransformer('toValue');

            assert.strictEqual(retrieved?.name, 'toValue');
        });

        test('can register transformer on parameterized ADT', () => {
            const List = data(({ Family, T }) => ({
                Nil: {},
                Cons: { head: T, tail: Family }
            }));

            const length = createTransformer({
                name: 'length',
                getCtorTransform: (ctor) => {
                    if (ctor.name === 'Nil') return () => 0;
                    if (ctor.name === 'Cons') return ({ tail }) => 1 + tail;
                    return undefined;
                }
            });

            // @ts-expect-error - accessing internal API
            List._registerTransformer('length', length);

            // @ts-expect-error - accessing internal API
            const retrieved = List._getTransformer('length');

            assert.strictEqual(retrieved?.name, 'length');
        });
    });
});
