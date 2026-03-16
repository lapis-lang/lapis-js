/**
 * Platform Runtime — Browser reference implementation of the IO loop driver.
 *
 * Drives a MealyMachine (returned by system()) through its IO loop:
 *   1. machine.request(state)         → IORequest value
 *   2. Perform the described IO       → IOResponse value
 *   3. machine.respond(state)(result) → next state
 *   4. Repeat until IORequest.Done is observed
 *
 * This module is inherently impure — it is the boundary between the pure
 * Lapis program and the external world. All user-authored code remains pure;
 * the runtime is the sole interpreter of IORequest descriptions.
 *
 * Usage:
 *   import { system } from '@lapis-lang/lapis-js';
 *   import { IORequest, IOResponse, run } from '@lapis-lang/lapis-js/io';
 *
 *   const app = system({ ... }, (mods) => ({ init, request, respond }));
 *   await run(app);
 *
 * @module
 */

import type { MealyMachine } from '../../index.mjs';
import { validateMealyMachine } from '../../Module.mjs';
import { IORequest } from './request.mjs';
import { IOResponse } from './response.mjs';

// Cast to any for instanceof checks on structured variants
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Req: any = IORequest;

/** Per-run mutable state, scoped to a single `run()` invocation. */
interface RuntimeContext {
    openStreams: Map<string, ReadableStreamDefaultReader<Uint8Array>>;
    streamCounter: number;
}

/** Cancel and release all open stream readers in the context. */
async function cleanup(ctx: RuntimeContext): Promise<void> {
    for (const reader of ctx.openStreams.values())
        try { await reader.cancel(); } catch { /* best-effort */ }

    ctx.openStreams.clear();
}

/**
 * Execute a single IORequest and return the corresponding IOResponse.
 * All IO is performed using browser-native APIs (fetch, console, setTimeout,
 * addEventListener, ReadableStream, etc.).
 *
 * @param request - The IORequest to execute
 * @param ctx - Optional runtime context for stream state. If omitted, streaming
 *              operations (OpenStream, ReadChunk, CloseStream) will return
 *              EndOfStream / None since no stream registry is available.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeRequest(request: any, ctx?: RuntimeContext): Promise<any> {
    if (request instanceof Req.Read) {
        const response = await fetch(request.path);
        const content = await response.text();

        return IOResponse.ReadResult({ content });
    }

    if (request instanceof Req.Write) {
        console.log(request.message);

        return IOResponse.WriteResult;
    }

    if (request instanceof Req.HttpGet) {
        const response = await fetch(request.url),
            body = await response.text();

        return IOResponse.HttpResult({ status: response.status, body });
    }

    if (request === IORequest.GetTime)
        return IOResponse.TimeResult({ now: Date.now() });

    // --- Pull / Multiple — Streaming Reads ---

    if (request instanceof Req.OpenStream) {
        if (!ctx)
            return IOResponse.EndOfStream;

        const response = await fetch(request.path);

        if (!response.body)
            return IOResponse.EndOfStream;

        const handle = `stream-${++ctx.streamCounter}`;
        ctx.openStreams.set(handle, response.body.getReader());

        return IOResponse.StreamOpened({ handle });
    }

    if (request instanceof Req.ReadChunk) {
        const reader = ctx?.openStreams.get(request.handle);

        if (!reader)
            return IOResponse.EndOfStream;

        const { value, done } = await reader.read();

        if (done) {
            ctx!.openStreams.delete(request.handle);

            return IOResponse.EndOfStream;
        }

        const data = new TextDecoder().decode(value);

        return IOResponse.StreamChunk({ data });
    }

    if (request instanceof Req.CloseStream) {
        const reader = ctx?.openStreams.get(request.handle);

        if (reader) {
            await reader.cancel();
            ctx!.openStreams.delete(request.handle);
        }

        return IOResponse.None;
    }

    // --- Push / Single ---

    if (request instanceof Req.Timer) {
        await new Promise(resolve => setTimeout(resolve, request.ms));

        return IOResponse.TimerResult;
    }

    if (request instanceof Req.Listen) {
        const payload = await new Promise<string>(resolve => {
            window.addEventListener(
                request.event,
                (e: Event) => resolve(String((e as CustomEvent).detail ?? '')),
                { once: true }
            );
        });

        return IOResponse.EventResult({ payload });
    }

    if (request instanceof Req.Subscribe) {
        const payload = await new Promise<string>(resolve => {
            window.addEventListener(
                request.source,
                (e: Event) => resolve(String((e as CustomEvent).detail ?? '')),
                { once: true }
            );
        });

        return IOResponse.EventResult({ payload });
    }

    if (request === IORequest.AwaitEvent) {
        // Generic event wait — listens for a single 'lapis-event' CustomEvent
        const payload = await new Promise<string>(resolve => {
            window.addEventListener(
                'lapis-event',
                (e: Event) => resolve(String((e as CustomEvent).detail ?? '')),
                { once: true }
            );
        });

        return IOResponse.EventResult({ payload });
    }

    // Unknown request type — return None
    return IOResponse.None;
}

/**
 * Drive a MealyMachine's IO loop until IORequest.Done is observed.
 *
 * @param machine - A MealyMachine returned by system() with init, request, and respond
 * @returns The exit code from IORequest.Done
 */

async function run(machine: MealyMachine<unknown, unknown, unknown>): Promise<number> {
    validateMealyMachine(machine);


    const ctx: RuntimeContext = {
        openStreams: new Map(),
        streamCounter: 0
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = machine as any;

    try {
        let state: unknown = machine.init;

        while (true) {
            const request = m.request(state);

            if (request instanceof Req.Done)
                return request.code;

            const response = await executeRequest(request, ctx);
            state = m.respond(state)(response);
        }
    } finally {
        await cleanup(ctx);
    }
}

export { run, executeRequest };
