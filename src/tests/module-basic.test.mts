import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { module, data, behavior } from '../index.mjs';
import { DemandsError, EnsuresError, InvariantError } from '../index.mjs';

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
            Stream: behavior(({ Self }) => ({
                head: Number,
                tail: Self
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
        test('number export — message quotes string key and reports type: number', () => {
            const M = module({}, () => ({ count: 1 as any }));
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes('"count"') &&
                    err.message.includes('type: number')
            );
        });

        test('string export — message quotes string key and reports type: string', () => {
            const M = module({}, () => ({ label: 'hello' as any }));
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes('"label"') &&
                    err.message.includes('type: string')
            );
        });

        test('boolean export — reports type: boolean', () => {
            const M = module({}, () => ({ flag: true as any }));
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes('"flag"') &&
                    err.message.includes('type: boolean')
            );
        });

        test('null export — reports type: object', () => {
            const M = module({}, () => ({ val: null as any }));
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes('"val"') &&
                    err.message.includes('type: object')
            );
        });

        test('plain object export — reports type: object', () => {
            const M = module({}, () => ({ config: {} as any }));
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes('"config"') &&
                    err.message.includes('type: object')
            );
        });

        test('plain function export (no LapisTypeSymbol) — reports type: function', () => {
            const M = module({}, () => ({ helper: (() => {}) as any }));
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes('"helper"') &&
                    err.message.includes('type: function')
            );
        });

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

        test('extend: string literal throws TypeError with invalid-ModuleDef message', () => {
            const M = module({ extend: 'not-a-module' as any }, () => ({ Tag: data(() => ({ Tag: {} })) }));
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes("spec 'extend' must reference a ModuleDef")
            );
        });

        test('extend: null throws TypeError with invalid-ModuleDef message', () => {
            const M = module({ extend: null as any }, () => ({ Tag: data(() => ({ Tag: {} })) }));
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes("spec 'extend' must reference a ModuleDef")
            );
        });

        test('extend: plain object throws TypeError with invalid-ModuleDef message', () => {
            const M = module({ extend: {} as any }, () => ({ Tag: data(() => ({ Tag: {} })) }));
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes("spec 'extend' must reference a ModuleDef")
            );
        });

        test('extend: plain function (no _body/_spec) throws TypeError with invalid-ModuleDef message', () => {
            const M = module({ extend: (() => {}) as any }, () => ({ Tag: data(() => ({ Tag: {} })) }));
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes("spec 'extend' must reference a ModuleDef")
            );
        });
    });

    describe('body return validation', () => {
        test('body returning null throws TypeError with descriptive message', () => {
            const M = module({}, () => null as any);
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes('body must return a plain object') &&
                    err.message.includes('null')
            );
        });

        test('body returning a string throws TypeError with descriptive message', () => {
            const M = module({}, () => 'oops' as any);
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes('body must return a plain object') &&
                    err.message.includes('string')
            );
        });

        test('body returning a number throws TypeError with descriptive message', () => {
            const M = module({}, () => 42 as any);
            assert.throws(
                () => M({}),
                (err: unknown) =>
                    err instanceof TypeError &&
                    err.message.includes('body must return a plain object') &&
                    err.message.includes('number')
            );
        });
    });
});

