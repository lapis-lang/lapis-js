import { data } from '@lapis-lang/lapis-js'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Predicates', () => {
    test('supports predicate validation', () => {
        const isEven = (x) => typeof x === 'number' && x % 2 === 0;

        const EvenPoint = data({
            Point2: { x: isEven , y: isEven }
    });

        const p = EvenPoint.Point2({ x: 2, y: 4 });

        assert.strictEqual(p.x, 2);
        assert.strictEqual(p.y, 4);
    });

    test('throws error when predicate fails', () => {
        const isEven = (x) => typeof x === 'number' && x % 2 === 0;

        const EvenPoint = data({
            Point2: { x: isEven , y: isEven }
    });

        assert.throws(
            () => EvenPoint.Point2({ x: 3, y: 4 }),
            /Field 'x' failed predicate validation/
        );
    });

    test('supports custom predicates for strings', () => {
        const isEmail = (s) =>
            typeof s === 'string' && s.includes('@');

        const User = data({
            RegisteredUser: { email: isEmail , username: String }
    });

        const user = User.RegisteredUser({ email: 'test@example.com', username: 'testuser' });
        assert.strictEqual(user.email, 'test@example.com');

        assert.throws(
            () => User.RegisteredUser({ email: 'invalid', username: 'testuser' }),
            /Field 'email' failed predicate validation/
        );
    });

    test('supports predicates with ranges', () => {
        const inRange = (min, max) =>
            (x) => typeof x === 'number' && x >= min && x <= max;

        const Percentage = data({
            Value: { amount: inRange(0, 100)  }
    });

        const valid = Percentage.Value({ amount: 50 });
        assert.strictEqual(valid.amount, 50);

        assert.throws(
            () => Percentage.Value({ amount: 150 }),
            /Field 'amount' failed predicate validation/
        );
    });

    test('supports mixing predicates and constructors', () => {
        const isPositive = (x) => typeof x === 'number' && x > 0;

        const Product = data({
            Item: { name: String, price: isPositive , quantity: isPositive }
    });

        const item = Product.Item({ name: 'Widget', price: 9.99, quantity: 5 });
        assert.strictEqual(item.name, 'Widget');
        assert.strictEqual(item.price, 9.99);

        assert.throws(
            () => Product.Item({ name: 'Widget', price: -5, quantity: 1 }),
            /Field 'price' failed predicate validation/
        );
    });

    test('supports predicates with ADT fields', () => {
        const Color = data({ Red: {}, Green: {}, Blue: {} });
        const isEven = (x) => typeof x === 'number' && x % 2 === 0;

        const ColorPoint = data({
            EvenPoint: { x: isEven , y: isEven , color: Color }
    });

        const p = ColorPoint.EvenPoint({ x: 2, y: 4, color: Color.Blue });
        assert.strictEqual(p.x, 2);
        assert.strictEqual(p.y, 4);
        assert.strictEqual(p.color, Color.Blue);

        assert.throws(
            () => ColorPoint.EvenPoint({ x: 3, y: 4, color: Color.Red }),
            /Field 'x' failed predicate validation/
        );
    });

    test('supports complex predicate logic', () => {
        const isPrime = (x) => {
            if (typeof x !== 'number' || x < 2) return false;
            for (let i = 2; i <= Math.sqrt(x); i++) {
                if (x % i === 0) return false;
            }
            return true;
        };

        const PrimeNumber = data({
            Prime: { value: isPrime }
    });

        const prime = PrimeNumber.Prime({ value: 7 });
        assert.strictEqual(prime.value, 7);

        assert.throws(
            () => PrimeNumber.Prime({ value: 4 }),
            /Field 'value' failed predicate validation/
        );
    });

    test('supports predicates for non-empty arrays', () => {
        const isNonEmptyArray = (x) =>
            Array.isArray(x) && x.length > 0;

        const Collection = data({
            Items: { items: isNonEmptyArray }
    });

        const collection = Collection.Items({ items: [1, 2, 3] });
        assert.ok(Array.isArray(collection.items));
        assert.strictEqual(collection.items.length, 3);

        assert.throws(
            () => Collection.Items({ items: {} }),
            /Field 'items' failed predicate validation/
        );
    });
});
