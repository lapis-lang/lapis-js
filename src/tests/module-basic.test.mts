import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { module, data, behavior } from '../index.mjs';
import { DemandsError, EnsuresError, InvariantError } from '../index.mjs';

function isTypeErrorWithMessageParts(err: unknown, parts: string[]): boolean {
    return err instanceof TypeError && parts.every(part => err.message.includes(part));
}

describe('module() — core definition and instantiation', () => {
    test('no deps, no contracts — exports a data type', () => {
        const Counter = data(() => ({ Zero: {}, Succ: { pred: Number } }));
        const M = module({}, () => ({ Counter }));
        const { Counter: CounterADT } = M({});
        assert.strictEqual(CounterADT, Counter);
        assert.ok(CounterADT.Zero instanceof CounterADT);
    });

    test('exports are frozen', () => {
        const Tag = data(() => ({ Tag: {} }));
        const M = module({}, () => ({ Tag }));
        const instance = M({});
        assert.throws(
            () => { (instance as Record<string, unknown>).Tag = null; },
            TypeError
        );
    });

    test('exports cannot have new properties added', () => {
        const Tag = data(() => ({ Tag: {} }));
        const M = module({}, () => ({ Tag }));
        const instance = M({});
        assert.throws(
            () => { (instance as Record<string, unknown>).extra = 'new'; },
            TypeError
        );
    });

    test('body receives injected dependencies', () => {
        const received: Array<{ kind: string }> = [];
        const M = module({}, (deps: { kind: string }) => {
            received.push(deps);
            return { Tag: data(() => ({ Tag: {} })) };
        });
        M({ kind: 'alpha' });
        M({ kind: 'beta' });
        assert.strictEqual(received[0].kind, 'alpha');
        assert.strictEqual(received[1].kind, 'beta');
    });

    test('multiple instantiations produce fresh ADT classes', () => {
        const M = module({}, () => ({
            Event: data(() => ({ Tick: {}, Reset: {} }))
        }));
        const a = M({});
        const b = M({});
        assert.notStrictEqual(a.Event, b.Event);
    });

    test('module body can export a behavior type', () => {
        const M = module({}, () => ({
            Stream: behavior(({ self }) => ({
                head: Number,
                tail: self
            }))
        }));
        const { Stream } = M({});
        assert.ok(typeof Stream === 'function');
    });

    test('demands — passing value does not throw', () => {
        const M = module(
            { demands: ({ ok }: { ok: boolean }) => ok },
            ({ ok: _ok }: { ok: boolean }) => ({ Tag: data(() => ({ Tag: {} })) })
        );
        assert.doesNotThrow(() => M({ ok: true }));
    });

    test('demands — violation throws DemandsError', () => {
        const M = module(
            { demands: ({ ok }: { ok: boolean }) => ok },
            ({ ok: _ok }: { ok: boolean }) => ({ Tag: data(() => ({ Tag: {} })) })
        );
        assert.throws(() => M({ ok: false }), DemandsError);
    });

    test('ensures — passing result does not throw', () => {
        const M = module(
            { ensures: (exp: { Counter: unknown }) => 'Counter' in exp },
            () => ({ Counter: data(() => ({ Zero: {}, Succ: { pred: Number } })) })
        );
        assert.doesNotThrow(() => M({}));
    });

    test('ensures — violation throws EnsuresError', () => {
        const M = module(
            { ensures: () => false },
            () => ({ Counter: data(() => ({ Zero: {} })) })
        );
        assert.throws(() => M({}), EnsuresError);
    });

    test('invariant — passing deps does not throw', () => {
        const M = module(
            { invariant: ({ a, b }: { a: number; b: number }) => a < b },
            ({ a: _a, b: _b }: { a: number; b: number }) => ({ Tag: data(() => ({ Tag: {} })) })
        );
        assert.doesNotThrow(() => M({ a: 1, b: 3 }));
    });

    test('invariant — violation throws InvariantError', () => {
        const M = module(
            { invariant: ({ a, b }: { a: number; b: number }) => a < b },
            ({ a: _a, b: _b }: { a: number; b: number }) => ({ Tag: data(() => ({ Tag: {} })) })
        );
        assert.throws(() => M({ a: 5, b: 3 }), InvariantError);
    });

    test('all three contracts — all pass', () => {
        const M = module(
            {
                demands:   ({ kind }: { kind: string }) => kind.length > 0,
                ensures:   (exp: { Tag: unknown }) => 'Tag' in exp,
                invariant: ({ kind }: { kind: string }) => kind !== 'forbidden'
            },
            ({ kind: _kind }: { kind: string }) => ({ Tag: data(() => ({ Tag: {} })) })
        );
        assert.doesNotThrow(() => M({ kind: 'valid' }));
    });

    test('demands checked before ensures', () => {
        const log: string[] = [];
        const M = module(
            {
                demands: ({ ok }: { ok: boolean }) => { log.push('demands'); return ok; },
                ensures: () => { log.push('ensures'); return true; }
            },
            ({ ok: _ok }: { ok: boolean }) => ({ Tag: data(() => ({ Tag: {} })) })
        );
        assert.throws(() => M({ ok: false }), DemandsError);
        assert.deepStrictEqual(log, ['demands']);
    });

    test('_spec and _body are accessible for [extend]', () => {
        const spec = { demands: ({ ok }: { ok: boolean }) => ok };
        const body = () => ({ Counter: data(() => ({ Zero: {} })) });
        const M = module(spec, body);
        assert.strictEqual((M as { _spec?: unknown })._spec, spec);
        assert.strictEqual((M as { _body?: unknown })._body, body);
    });

    test('non-Lapis export throws TypeError at instantiation', () => {
        const M = module({}, () => ({ value: 42 as any }));
        assert.throws(() => M({}), TypeError);
    });

    describe('isLapisValue — invalid export rejection', () => {
        const badStringKeyExports = [
            { key: 'count', value: 1, typeName: 'number' },
            { key: 'label', value: 'hello', typeName: 'string' },
            { key: 'flag', value: true, typeName: 'boolean' },
            { key: 'val', value: null, typeName: 'object' },
            { key: 'config', value: {}, typeName: 'object' },
            { key: 'helper', value: (() => {}), typeName: 'function' }
        ] as const;

        for (const c of badStringKeyExports) {
            test(`${c.typeName} export reports quoted key and type`, () => {
                const M = module({}, () => ({ [c.key]: c.value } as any));
                assert.throws(
                    () => M({}),
                    (err: unknown) => isTypeErrorWithMessageParts(err, [`"${c.key}"`, `type: ${c.typeName}`])
                );
            });
        }

        test('symbol key with invalid export — message shows Symbol(...) not quoted key', () => {
            const sym = Symbol('myKey');
            const M = module({}, () => ({ [sym]: 42 } as any));
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes('Symbol(myKey)') &&
                    err.message.includes('type: number') &&
                    !err.message.includes('"Symbol(myKey)"')
            );
        });

        test('error message always starts with the standard prefix', () => {
            const M = module({}, () => ({ x: 'bad' as any }));
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.startsWith(
                        'module() exports may only be Lapis types (data, behavior, relation, or observer).'
                    )
            );
        });
    });

    describe('extend safety', () => {
        test('self-extend throws TypeError with cycle message', () => {
            // Spec is mutated after definition to introduce the self-reference.
            // extend in spec is resolved lazily at instantiation time, so
            // the cycle is only detected when A({}) is called.
            const specA: any = {};
            const A = module(specA, () => ({ Tag: data(() => ({ Tag: {} })) }));
            specA.extend = A;
            assert.throws(
                () => A({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes('cycle detected')
            );
        });

        test('mutual cycle (A extends B, B extends A) throws TypeError with cycle message', () => {
            // Specs are mutated after both modules are defined so each can
            // reference the other. The cycle is detected at instantiation time.
            const specA: any = {};
            const specB: any = {};
            const A = module(specA, () => ({ Tag: data(() => ({ Tag: {} })) }));
            const B = module(specB, () => ({ OtherTag: data(() => ({ OtherTag: {} })) }));
            specA.extend = B;
            specB.extend = A;
            assert.throws(
                () => B({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes('cycle detected')
            );
        });

        const invalidExtendValues = [
            { label: 'string', value: 'not-a-module' },
            { label: 'null', value: null },
            { label: 'plain object', value: {} },
            { label: 'plain function', value: () => {} }
        ];

        for (const c of invalidExtendValues) {
            test(`extend: ${c.label} throws TypeError with invalid-ModuleDef message`, () => {
                const M = module({ extend: c.value as any }, () => ({ Tag: data(() => ({ Tag: {} })) }));
                assert.throws(
                    () => M({}),
                    (err: unknown) =>
                        err instanceof TypeError &&
                        err.message.includes("spec 'extend' must reference a ModuleDef")
                );
            });
        }
    });

    describe('body return validation', () => {
        const badBodyReturns = [
            { value: null, typeName: 'null' },
            { value: 'oops', typeName: 'string' },
            { value: 42, typeName: 'number' }
        ] as const;

        for (const c of badBodyReturns) {
            test(`body returning ${c.typeName} throws TypeError with descriptive message`, () => {
                const M = module({}, () => c.value as any);
                assert.throws(
                    () => M({}),
                    (err: unknown) =>
                        err instanceof TypeError &&
                        err.message.includes('body must return a plain object') &&
                        err.message.includes(c.typeName)
                );
            });
        }
    });
});

