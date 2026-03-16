/**
 * Tests for the system() Mealy machine — IO loop via mock interpreter.
 *
 * Verifies:
 *   - system() returns a valid MealyMachine: { init, request, respond }
 *   - Deterministic state threading through mock IO responses
 *   - Linear CLI-style state machine (read → write → done)
 *   - Cyclic server-style state machine (listen → handle → listen)
 *   - IORequest.Done terminates the loop
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { system } from '../index.mjs';
import { IORequest } from '../lib/io/request.mjs';
import { IOResponse } from '../lib/io/response.mjs';
import { testRun } from '../lib/io/mock.mjs';

describe('system() Mealy Machine', () => {
    it('should return a MealyMachine with init, request, and respond', () => {
        const app = system({}, () => ({
            init: {},
            request: (_s: unknown) => IORequest.Done({ code: 0 }),
            respond: (_s: unknown) => (_r: unknown) => ({})
        }));
        assert.ok('init' in app);
        assert.strictEqual(typeof app.request, 'function');
        assert.strictEqual(typeof app.respond, 'function');
    });

    describe('CLI-style linear state machine (read → write → done)', () => {

        type CliState = { phase: string; args: string[]; content: string };

        const cliApp = system({}, () => ({
            init: { phase: 'read', args: ['hello.txt'], content: '' } as CliState,
            request: ({ phase, args, content }: CliState) => {
                if (phase === 'read')  return IORequest.Read({ path: args[0] });
                if (phase === 'write') return IORequest.Write({ message: content });
                return IORequest.Done({ code: 0 });
            },
            respond: ({ phase, args }: CliState) => (response: any): CliState => {
                if (phase === 'read') return { phase: 'write', args, content: response.content };
                return { phase: 'done', args, content: '' };
            }
        }));

        it('should emit Read, then Write, then Done', () => {
            const requests = testRun(cliApp, [
                IOResponse.ReadResult({ content: 'file contents' }),
                IOResponse.WriteResult
            ]);

            assert.ok(requests[0] instanceof IORequest.Read);
            assert.strictEqual(requests[0].path, 'hello.txt');

            assert.ok(requests[1] instanceof IORequest.Write);
            assert.strictEqual(requests[1].message, 'file contents');

            assert.ok(requests[2] instanceof IORequest.Done);
            assert.strictEqual(requests[2].code, 0);
        });

        it('should propagate file content through state', () => {
            type S = { phase: string; args: string[]; content: string };
            const app = system({}, () => ({
                init: { phase: 'read', args: ['data.csv'], content: '' } as S,
                request: ({ phase, args, content }: S) => {
                    if (phase === 'read')  return IORequest.Read({ path: args[0] });
                    if (phase === 'write') return IORequest.Write({ message: content });
                    return IORequest.Done({ code: 0 });
                },
                respond: ({ phase, args }: S) => (response: any): S => {
                    if (phase === 'read') return { phase: 'write', args, content: response.content };
                    return { phase: 'done', args, content: '' };
                }
            }));

            const requests = testRun(app, [
                IOResponse.ReadResult({ content: 'a,b,c\n1,2,3' }),
                IOResponse.WriteResult
            ]);

            assert.strictEqual((requests[1] as { message: string }).message, 'a,b,c\n1,2,3');
        });
    });

    describe('Cyclic state machine (server-style)', () => {

        type ServerState = { phase: string; count: number };

        const serverApp = system({}, () => ({
            init: { phase: 'listen', count: 0 } as ServerState,
            request: ({ phase, count }: ServerState) => {
                if (phase === 'listen')  return IORequest.Listen({ event: 'request' });
                if (phase === 'respond') return IORequest.Write({ message: `handled ${count}` });
                if (phase === 'done')    return IORequest.Done({ code: 0 });
                return IORequest.Done({ code: 1 });
            },
            respond: ({ phase, count }: ServerState) => (_response: unknown): ServerState => {
                if (phase === 'listen')  return { phase: 'respond', count: count + 1 };
                if (phase === 'respond' && count < 2) return { phase: 'listen', count };
                return { phase: 'done', count };
            }
        }));

        it('should cycle through listen → respond → listen', () => {
            const requests = testRun(serverApp, [
                IOResponse.EventResult({ payload: 'req1' }),       // listen → respond
                IOResponse.WriteResult,                            // respond → listen (count < 2)
                IOResponse.EventResult({ payload: 'req2' }),       // listen → respond
                IOResponse.WriteResult                             // respond → done (count >= 2)
            ]);

            assert.ok(requests[0] instanceof IORequest.Listen);
            assert.ok(requests[1] instanceof IORequest.Write);
            assert.strictEqual(requests[1].message, 'handled 1');

            assert.ok(requests[2] instanceof IORequest.Listen);
            assert.ok(requests[3] instanceof IORequest.Write);
            assert.strictEqual(requests[3].message, 'handled 2');

            assert.ok(requests[4] instanceof IORequest.Done);
        });
    });

    describe('State transitions', () => {

        it('should thread state through multiple respond calls', () => {
            type S = { step: number };
            const app = system({}, () => ({
                init: { step: 0 } as S,
                request: ({ step }: S) =>
                    step === 0 ? IORequest.Write({ message: 'step 0' }) : IORequest.Done({ code: step }),
                respond: ({ step }: S) => (): S => ({ step: step + 1 })
            }));

            let state: any = app.init;
            assert.ok(app.request(state) instanceof IORequest.Write);
            assert.strictEqual((app.request(state) as { message: string }).message, 'step 0');

            state = app.respond(state)(IOResponse.WriteResult);
            assert.ok(app.request(state) instanceof IORequest.Done);
            assert.strictEqual((app.request(state) as { code: number }).code, 1);
        });

        it('GetTime singleton request should be returned correctly', () => {
            type S = { done: boolean };
            const app = system({}, () => ({
                init: { done: false } as S,
                request: ({ done }: S) => done ? IORequest.Done({ code: 0 }) : IORequest.GetTime,
                respond: (_s: S) => (): S => ({ done: true })
            }));

            assert.strictEqual(app.request(app.init), IORequest.GetTime);

            const next = app.respond(app.init)(IOResponse.TimeResult({ now: 12345 }));
            assert.ok(app.request(next) instanceof IORequest.Done);
            assert.strictEqual((app.request(next) as { code: number }).code, 0);
        });
    });

    describe('Pull/Multiple streaming state machine (open → read chunks → close → done)', () => {

        type StreamState = { phase: string; path: string; handle: string; chunks: string[] };

        const streamApp = system({}, () => ({
            init: { phase: 'open', path: '/large.csv', handle: '', chunks: [] } as StreamState,
            request: ({ phase, path, handle }: StreamState) => {
                if (phase === 'open')  return IORequest.OpenStream({ path });
                if (phase === 'read')  return IORequest.ReadChunk({ handle });
                if (phase === 'close') return IORequest.CloseStream({ handle });
                return IORequest.Done({ code: 0 });
            },
            respond: ({ phase, path, handle, chunks }: StreamState) => (response: any): StreamState => {
                if (phase === 'open')
                    return { phase: 'read', path, handle: response.handle, chunks };

                if (phase === 'read') {
                    if (response === IOResponse.EndOfStream)
                        return { phase: 'close', path, handle, chunks };
                    return { phase: 'read', path, handle, chunks: [...chunks, response.data] };
                }

                return { phase: 'done', path, handle: '', chunks };
            }
        }));

        it('should emit OpenStream, ReadChunk(s), CloseStream, Done', () => {
            const requests = testRun(streamApp, [
                IOResponse.StreamOpened({ handle: 'stream-1' }),    // open → read
                IOResponse.StreamChunk({ data: 'line1\n' }),        // read → read
                IOResponse.StreamChunk({ data: 'line2\n' }),        // read → read
                IOResponse.EndOfStream,                             // read → close
                IOResponse.None                                     // close → done
            ]);

            assert.ok(requests[0] instanceof IORequest.OpenStream);
            assert.strictEqual(requests[0].path, '/large.csv');

            assert.ok(requests[1] instanceof IORequest.ReadChunk);
            assert.strictEqual(requests[1].handle, 'stream-1');

            assert.ok(requests[2] instanceof IORequest.ReadChunk);
            assert.ok(requests[3] instanceof IORequest.ReadChunk);

            assert.ok(requests[4] instanceof IORequest.CloseStream);
            assert.strictEqual(requests[4].handle, 'stream-1');

            assert.ok(requests[5] instanceof IORequest.Done);
            assert.strictEqual(requests[5].code, 0);
        });

        it('should accumulate chunk data through state', () => {
            type S = StreamState;
            const app = system({}, () => ({
                init: { phase: 'open', path: '/data.txt', handle: '', chunks: [] } as S,
                request: ({ phase, path, handle }: S) => {
                    if (phase === 'open')  return IORequest.OpenStream({ path });
                    if (phase === 'read')  return IORequest.ReadChunk({ handle });
                    if (phase === 'close') return IORequest.CloseStream({ handle });
                    return IORequest.Done({ code: 0 });
                },
                respond: ({ phase, path, handle, chunks }: S) => (response: any): S => {
                    if (phase === 'open')   return { phase: 'read', path, handle: response.handle, chunks };
                    if (phase === 'read')   {
                        return response === IOResponse.EndOfStream
                            ? { phase: 'close', path, handle, chunks }
                            : { phase: 'read', path, handle, chunks: [...chunks, response.data] };
                    }
                    return { phase: 'done', path, handle: '', chunks };
                }
            }));

            let state: any = app.init;
            state = app.respond(state)(IOResponse.StreamOpened({ handle: 'h1' }));
            state = app.respond(state)(IOResponse.StreamChunk({ data: 'alpha' }));
            state = app.respond(state)(IOResponse.StreamChunk({ data: 'beta' }));
            state = app.respond(state)(IOResponse.EndOfStream);
            state = app.respond(state)(IOResponse.None);

            assert.ok(app.request(state) instanceof IORequest.Done);
        });

        it('should handle immediate EndOfStream (empty resource)', () => {
            const requests = testRun(streamApp, [
                IOResponse.StreamOpened({ handle: 'stream-2' }),
                IOResponse.EndOfStream,                           // read → close immediately
                IOResponse.None                                   // close → done
            ]);

            assert.ok(requests[0] instanceof IORequest.OpenStream);
            assert.ok(requests[1] instanceof IORequest.ReadChunk);
            assert.ok(requests[2] instanceof IORequest.CloseStream);
            assert.ok(requests[3] instanceof IORequest.Done);
        });
    });
});
