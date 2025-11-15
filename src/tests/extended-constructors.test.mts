import { data } from '@lapis-lang/lapis-js'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

describe('Extended Constructors', () => {
    test('supports Array fields', () => {
        const Collection = data({
            Items: { items: Array }
        });

        const col = Collection.Items({ items: [1, 2, 3] });
        assert.ok(Array.isArray(col.items));
        assert.strictEqual(col.items.length, 3);

        assert.throws(
            () => Collection.Items({ items: 'not an array' } as any),
            /Field 'items' must be an array/
        );
    });

    test('supports Date fields', () => {
        const Event = data({
            Scheduled: { name: String, date: Date }
        });

        const now = new Date();
        const event = Event.Scheduled({ name: 'Meeting', date: now });
        assert.strictEqual(event.name, 'Meeting');
        assert.strictEqual(event.date, now);

        assert.throws(
            () => Event.Scheduled({ name: 'Meeting', date: 'not a date' } as any),
            /Field 'date' must be a Date/
        );
    });

    test('supports RegExp fields', () => {
        const Pattern = data({
            Matcher: { pattern: RegExp, flags: String }
        });

        const regex = /test/i;
        const matcher = Pattern.Matcher({ pattern: regex, flags: 'i' });
        assert.strictEqual(matcher.pattern, regex);

        assert.throws(
            () => Pattern.Matcher({ pattern: 'not a regex', flags: 'i' } as any),
            /Field 'pattern' must be a RegExp/
        );
    });

    test('supports Symbol fields', () => {
        const Tagged = data({
            Item: { id: Symbol, name: String }
        });

        const sym = Symbol('unique');
        const item = Tagged.Item({ id: sym, name: 'Test' });
        assert.strictEqual(item.id, sym);

        assert.throws(
            () => Tagged.Item({ id: 'not a symbol', name: 'Test' } as any),
            /Field 'id' must be a symbol/
        );
    });

    test('supports BigInt fields', () => {
        const LargeNumber = data({
            Value: { amount: BigInt }
        });

        const big = 9007199254740991n;
        const value = LargeNumber.Value({ amount: big });
        assert.strictEqual(value.amount, big);

        assert.throws(
            () => LargeNumber.Value({ amount: 123 } as any),
            /Field 'amount' must be a bigint/
        );
    });

    test('supports mixing extended constructors', () => {
        const ComplexData = data({
            Record: {
                id: Symbol,
                count: BigInt,
                tags: Array,
                pattern: RegExp,
                timestamp: Date,
                name: String,
                active: Boolean
            }
        });

        const record = ComplexData.Record({
            id: Symbol('test'),
            count: 100n,
            tags: ['a', 'b'],
            pattern: /test/,
            timestamp: new Date(),
            name: 'Test Record',
            active: true
        });

        assert.strictEqual(typeof record.id, 'symbol');
        assert.strictEqual(typeof record.count, 'bigint');
        assert.ok(Array.isArray(record.tags));
        assert.ok(record.pattern instanceof RegExp);
        assert.ok(record.timestamp instanceof Date);
        assert.strictEqual(typeof record.name, 'string');
        assert.strictEqual(typeof record.active, 'boolean');
    });

    test('Date instances are allowed even though Date constructor is callable', () => {
        const Event = data({
            Scheduled: { name: String, date: Date }
        });

        // Date instances should be allowed
        const now = new Date();
        const event = Event.Scheduled({ name: 'Meeting', date: now });
        assert.ok(event.date instanceof Date);
        assert.strictEqual(event.date, now);
    });

    test('RegExp instances are allowed even though RegExp constructor is callable', () => {
        const Pattern = data({
            Matcher: { pattern: RegExp }
        });

        // RegExp instances should be allowed
        const regex = /test/i;
        const matcher = Pattern.Matcher({ pattern: regex });
        assert.ok(matcher.pattern instanceof RegExp);
        assert.strictEqual(matcher.pattern, regex);
    });

    test('Array instances are allowed even though Array constructor is callable', () => {
        const Collection = data({
            Items: { items: Array }
        });

        // Array instances should be allowed
        const arr = [1, 2, 3];
        const col = Collection.Items({ items: arr });
        assert.ok(Array.isArray(col.items));
        assert.strictEqual(col.items, arr);
    });
});
