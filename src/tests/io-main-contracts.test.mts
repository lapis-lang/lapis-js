/**
 * Tests for contracts on Main behavior observers.
 *
 * Verifies:
 *   - demands on unfold constructor (seed validation)
 *   - Contracts integrate with the Mealy machine protocol
 *
 * Note: Contracts on behavior are placed on fold/unfold specs,
 * not on observer declarations directly.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior, DemandsError } from '../index.mjs';
import { IORequest } from '../lib/io/request.mjs';
import { IOResponse } from '../lib/io/response.mjs';

describe('Contracts on Main behavior', () => {
    describe('demands on unfold constructor', () => {

        const App: any = behavior(({ Self }) => ({
            request: IORequest,
            respond: { in: IOResponse, out: Self }
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Start: unfold({
                in: { args: Array },
                out: Self,
                demands: (_self: unknown, seed: { args: unknown[] }) =>
                    Array.isArray(seed.args) && seed.args.length > 0
            })({  
                // @ts-expect-error — variant instance not structurally assignable to DataInstance<D>
                request: ({ args }: { args: unknown[] }) =>
                    IORequest.Write({ message: args[0] as string }),
                respond: () => () => ({ args: ['done'] })
            })
        }));

        it('should accept valid seed', () => {
            const main = App.Start({ args: ['hello'] });
            assert.ok(main.request instanceof IORequest);
            assert.strictEqual(main.request.message, 'hello');
        });

        it('should reject empty args with DemandsError', () => {
            assert.throws(() => {
                App.Start({ args: [] });
            }, (err: unknown) => err instanceof DemandsError);
        });
    });

    describe('request observer returns valid IORequest', () => {

        const App: any = behavior(({ Self }) => ({
            request: IORequest,
            respond: { in: IOResponse, out: Self }
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Start: unfold({ in: { phase: String }, out: Self })({
                // @ts-expect-error — variant instance not structurally assignable to DataInstance<D>
                request: ({ phase }: { phase: string }) =>
                    phase === 'write'
                        ? IORequest.Write({ message: 'test' })
                        : IORequest.Done({ code: 0 }),
                respond: () => () => ({ phase: 'done' })
            })
        }));

        it('should return IORequest from request observer', () => {
            const main = App.Start({ phase: 'write' });
            assert.ok(main.request instanceof IORequest);
            assert.strictEqual(main.request.message, 'test');
        });

        it('should return Done from request after transition', () => {
            const main = App.Start({ phase: 'write' });
            const next = main.respond(IOResponse.WriteResult);
            assert.ok(next.request instanceof IORequest);
            assert.strictEqual(next.request.code, 0);
        });
    });

    describe('respond continuation validates through usage', () => {

        const App: any = behavior(({ Self }) => ({
            request: IORequest,
            respond: { in: IOResponse, out: Self }
        })).ops(({ fold, unfold, map, merge, Self }) => ({
            Start: unfold({ in: { step: Number }, out: Self })({
                // @ts-expect-error — variant instance not structurally assignable to DataInstance<D>
                request: ({ step }: { step: number }) =>
                    step === 0
                        ? IORequest.Write({ message: 'step 0' })
                        : IORequest.Done({ code: step }),
                respond: ({ step }: { step: number }) =>
                    () => ({ step: step + 1 })
            })
        }));

        it('should thread state through multiple respond calls', () => {
            const s0 = App.Start({ step: 0 });
            assert.ok(s0.request instanceof IORequest);
            assert.strictEqual(s0.request.message, 'step 0');

            const s1 = s0.respond(IOResponse.WriteResult);
            assert.ok(s1.request instanceof IORequest);
            assert.strictEqual(s1.request.code, 1);
        });
    });
});
