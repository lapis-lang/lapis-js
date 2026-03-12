import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { relation, fold, origin, destination } from '../index.mjs';

describe('Closure — Fixpoint Properties', () => {
    const Ancestor = relation(({ Family }) => ({
        Direct: { from: String, to: String },
        Transitive: { hop: Family, rest: Family },

        [origin]: fold({ out: String })({
            Direct: ({ from }) => from,
            Transitive: ({ hop }) => hop
        }),
        [destination]: fold({ out: String })({
            Direct: ({ to }) => to,
            Transitive: ({ rest }) => rest
        })
    }));

    test('closure terminates and reaches fixpoint', () => {
        const facts = [
            Ancestor.Direct('a', 'b'),
            Ancestor.Direct('b', 'c'),
            Ancestor.Direct('c', 'd')
        ];

        const closed = Ancestor.closure(facts);
        assert.ok(closed.length >= 3);
        assert.ok(closed.length < 100, 'Should not produce unbounded results');
    });

    test('running closure twice produces same result (idempotence)', () => {
        const facts = [
            Ancestor.Direct('a', 'b'),
            Ancestor.Direct('b', 'c')
        ];

        const closed1 = Ancestor.closure(facts);
        const closed2 = Ancestor.closure(closed1);

        assert.strictEqual(closed1.length, closed2.length,
            'Second closure should not add new facts');
    });

    test('no duplicate entries in closure result', () => {
        const facts = [
            Ancestor.Direct('a', 'b'),
            Ancestor.Direct('b', 'c')
        ];

        const closed = Ancestor.closure(facts);

        for (let i = 0; i < closed.length; i++) {
            for (let j = i + 1; j < closed.length; j++) {
                const a = closed[i], b = closed[j];
                const sameConstructor = a.constructor === b.constructor;
                if (sameConstructor && a.constructor.name === 'Direct') {
                    assert.ok(
                        a.from !== b.from || a.to !== b.to,
                        `Duplicate found: Direct(${a.from}, ${a.to})`
                    );
                }
            }
        }
    });

    test('custom key function for deduplication', () => {
        const facts = [
            Ancestor.Direct('a', 'b'),
            Ancestor.Direct('b', 'c')
        ];

        const closed = Ancestor.closure(facts, {
            key: (inst) => `custom:${inst.origin}->${inst.destination}`
        });

        assert.ok(closed.length >= 3);
    });
});
