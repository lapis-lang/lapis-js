import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { relation, data } from '../index.mjs';

describe('Closure — Empty and Single Fact Edge Cases', () => {
    const Ancestor = relation(({ Family }) => ({
        Direct: { from: String, to: String },
        Transitive: { hop: Family, rest: Family }
    })).ops(({ fold, unfold, map, merge, origin, destination, Family }) => ({
        [origin]: fold({ out: String })({
            Direct: ({ from }) => from,
            Transitive: ({ hop }) => hop
        }),
        [destination]: fold({ out: String })({
            Direct: ({ to }) => to,
            Transitive: ({ rest }) => rest
        })
    }));

    test('empty base facts produce empty closure', () => {
        const closed = Ancestor.closure([]);
        assert.strictEqual(closed.length, 0);
    });

    test('single fact produces singleton closure', () => {
        const closed = Ancestor.closure([Ancestor.Direct('a', 'b')]);
        assert.strictEqual(closed.length, 1);
    });

    test('duplicate base facts are deduplicated', () => {
        const f1 = Ancestor.Direct('a', 'b');
        const f2 = Ancestor.Direct('a', 'b');
        const closed = Ancestor.closure([f1, f2]);

        // Both are structurally equal, so only one should survive
        const directCount = closed.filter(
            f => f.constructor.name === 'Direct'
        ).length;
        assert.strictEqual(directCount, 1,
            'Duplicate base facts should be deduplicated');
    });
});

describe('Closure — Singleton Variants', () => {
    test('singleton variants in closure (data type, not relation)', () => {
        // BoolList is not a relation — it has no relational structure.
        // This test verifies that closure is NOT available on plain data types.
        const BoolList = data(({ Family }) => ({
            Empty: {},
            Entry: { value: Boolean, rest: Family }
        }));

        // data() no longer has closure — verify it's absent
        assert.strictEqual(typeof (BoolList as any).closure, 'undefined',
            'closure should not exist on plain data types');
    });
});
