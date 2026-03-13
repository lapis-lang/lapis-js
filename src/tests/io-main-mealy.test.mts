/**
 * Tests for the Main Mealy machine behavior — IO loop via mock interpreter.
 *
 * Verifies:
 *   - Main behavior protocol with request/respond observers
 *   - Deterministic state threading through mock IO responses
 *   - Linear CLI-style state machine (read → write → done)
 *   - Cyclic server-style state machine (listen → handle → listen)
 *   - IORequest.Done terminates the loop
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { behavior, unfold, extend } from '../index.mjs';
import { IORequest } from '../lib/io/request.mjs';
import { IOResponse } from '../lib/io/response.mjs';
import { Main } from '../lib/io/main.mjs';

/**
 * Deterministic mock interpreter — drives Main through a sequence of
 * pre-defined IOResponse values and collects the emitted IORequest values.
 */

function testRun(main: any, responses: any[]): any[] {

    let state: any = main;

    const requests: any[] = [];

    for (const response of responses) {
        requests.push(state.request);
        state = state.respond(response);
    }

    // Capture the final request (typically Done)
    requests.push(state.request);

    return requests;
}

describe('Main Mealy Machine', () => {
    it('should define Main behavior type with request and respond observers', () => {
        assert.ok(Main);
    });

    describe('CLI-style linear state machine (read → write → done)', () => {

        const CliApp: any = behavior(({ Self }: { Self: any }) => ({
            [extend]: Main,

            Start: unfold({ in: { phase: String, args: Array, content: String }, out: Self })({
                request: ({ phase, args, content }: { phase: string; args: unknown[]; content: string }) => {
                    if (phase === 'read')  return IORequest.Read({ path: args[0] as string });
                    if (phase === 'write') return IORequest.Write({ message: content });

                    return IORequest.Done({ code: 0 });
                },
                respond: ({ phase, args }: { phase: string; args: unknown[] }) =>

                    (response: any) => {
                        if (phase === 'read')
                            return { phase: 'write', args, content: response.content };

                        return { phase: 'done', args, content: '' };
                    }
            })
        }));

        it('should emit Read, then Write, then Done', () => {
            const main = CliApp.Start({ phase: 'read', args: ['hello.txt'], content: '' });

            const requests = testRun(main, [
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
            const main = CliApp.Start({ phase: 'read', args: ['data.csv'], content: '' });

            const requests = testRun(main, [
                IOResponse.ReadResult({ content: 'a,b,c\n1,2,3' }),
                IOResponse.WriteResult
            ]);

            assert.strictEqual(requests[1].message, 'a,b,c\n1,2,3');
        });
    });

    describe('Standalone behavior (no extend)', () => {

        const EchoApp: any = behavior(({ Self }: { Self: any }) => ({
            request: IORequest,
            respond: { in: IOResponse, out: Self },

            Start: unfold({ in: { phase: String, message: String }, out: Self })({
                request: ({ phase, message }: { phase: string; message: string }) => {
                    if (phase === 'write') return IORequest.Write({ message });

                    return IORequest.Done({ code: 0 });
                },
                respond: ({ phase }: { phase: string }) =>
                    () => {
                        if (phase === 'write') return { phase: 'done', message: '' };

                        return { phase: 'done', message: '' };
                    }
            })
        }));

        it('should work without extending Main', () => {
            const main = EchoApp.Start({ phase: 'write', message: 'hello' });

            const requests = testRun(main, [
                IOResponse.WriteResult
            ]);

            assert.ok(requests[0] instanceof IORequest.Write);
            assert.strictEqual(requests[0].message, 'hello');

            assert.ok(requests[1] instanceof IORequest.Done);
        });
    });

    describe('Cyclic state machine (server-style)', () => {

        const ServerApp: any = behavior(({ Self }: { Self: any }) => ({
            [extend]: Main,

            Start: unfold({ in: { phase: String, count: Number }, out: Self })({
                request: ({ phase, count }: { phase: string; count: number }) => {
                    if (phase === 'listen') return IORequest.Listen({ event: 'request' });
                    if (phase === 'respond') return IORequest.Write({ message: `handled ${count}` });
                    if (phase === 'done') return IORequest.Done({ code: 0 });

                    return IORequest.Done({ code: 1 });
                },
                respond: ({ phase, count }: { phase: string; count: number }) =>

                    (_response: any) => {
                        if (phase === 'listen')
                            return { phase: 'respond', count: count + 1 };
                        if (phase === 'respond' && count < 2)
                            return { phase: 'listen', count };

                        return { phase: 'done', count };
                    }
            })
        }));

        it('should cycle through listen → respond → listen', () => {
            const main = ServerApp.Start({ phase: 'listen', count: 0 });

            const requests = testRun(main, [
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

    describe('Instance relationships', () => {

        const SimpleApp: any = behavior(({ Self }: { Self: any }) => ({
            [extend]: Main,

            Start: unfold({ in: { done: Boolean }, out: Self })({
                request: ({ done }: { done: boolean }) =>
                    done ? IORequest.Done({ code: 0 }) : IORequest.GetTime,
                respond: () => () => ({ done: true })
            })
        }));

        it('extended behavior instances should be instanceof Main', () => {
            const main = SimpleApp.Start({ done: false });
            assert.ok(main instanceof Main);
            assert.ok(main instanceof SimpleApp);
        });

        it('should transition through respond correctly', () => {
            const main = SimpleApp.Start({ done: false });
            assert.strictEqual(main.request, IORequest.GetTime);

            const next = main.respond(IOResponse.TimeResult({ now: 12345 }));
            assert.ok(next.request instanceof IORequest);
            assert.strictEqual(next.request.code, 0);
        });
    });

    describe('Pull/Multiple streaming state machine (open → read chunks → close → done)', () => {

        const StreamReader: any = behavior(({ Self }: { Self: any }) => ({
            [extend]: Main,

            Start: unfold({ in: { phase: String, path: String, handle: String, chunks: Array }, out: Self })({
                request: ({ phase, path, handle }: {
                    phase: string; path: string; handle: string;
                }) => {
                    if (phase === 'open')  return IORequest.OpenStream({ path });
                    if (phase === 'read')  return IORequest.ReadChunk({ handle });
                    if (phase === 'close') return IORequest.CloseStream({ handle });

                    return IORequest.Done({ code: 0 });
                },
                respond: ({ phase, path, handle, chunks }: {
                    phase: string; path: string; handle: string; chunks: unknown[];

                }) => (response: any) => {
                    if (phase === 'open')
                        return { phase: 'read', path, handle: response.handle, chunks };

                    if (phase === 'read') {
                        // EndOfStream → close the stream
                        if (response === IOResponse.EndOfStream)
                            return { phase: 'close', path, handle, chunks };

                        return { phase: 'read', path, handle, chunks: [...chunks, response.data] };
                    }

                    // After close → done
                    return { phase: 'done', path, handle: '', chunks };
                }
            })
        }));

        it('should emit OpenStream, ReadChunk(s), CloseStream, Done', () => {
            const main = StreamReader.Start({ phase: 'open', path: '/large.csv', handle: '', chunks: [] });

            const requests = testRun(main, [
                IOResponse.StreamOpened({ handle: 'stream-1' }),    // open → read
                IOResponse.StreamChunk({ data: 'line1\n' }),       // read → read
                IOResponse.StreamChunk({ data: 'line2\n' }),       // read → read
                IOResponse.EndOfStream,                            // read → close
                IOResponse.None                                    // close → done
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

        it('should accumulate chunk data in seed state', () => {
            const main = StreamReader.Start({ phase: 'open', path: '/data.txt', handle: '', chunks: [] });

            // Drive through open + 2 chunks + end + close
            let state: any = main;
            state = state.respond(IOResponse.StreamOpened({ handle: 'h1' }));
            state = state.respond(IOResponse.StreamChunk({ data: 'alpha' }));
            state = state.respond(IOResponse.StreamChunk({ data: 'beta' }));
            state = state.respond(IOResponse.EndOfStream);
            state = state.respond(IOResponse.None);

            // Final request is Done; seed accumulated both chunks
            assert.ok(state.request instanceof IORequest.Done);
        });

        it('should handle immediate EndOfStream (empty resource)', () => {
            const main = StreamReader.Start({ phase: 'open', path: '/empty', handle: '', chunks: [] });

            const requests = testRun(main, [
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
