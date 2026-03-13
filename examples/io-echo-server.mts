/**
 * IO Example — Echo Handler
 *
 * Listens for browser CustomEvents, writes a response, and loops back.
 * Demonstrates the cyclic state machine pattern:
 *   listen → handle → listen → ... → done
 *
 * The handler processes a fixed number of events before shutting down.
 */

import { behavior, unfold, extend } from '../src/index.mjs';
import { IORequest, IOResponse, Main } from '../src/lib/io/index.mjs';


const EchoServer: any = behavior(({ Self }: { Self: any }) => ({
    [extend]: Main,

    Start: unfold({ in: { phase: String, maxRequests: Number, handled: Number, lastPayload: String }, out: Self })({
        request: ({ phase, handled, lastPayload }: { phase: string; handled: number; lastPayload: string }) => {
            if (phase === 'listen') return IORequest.Listen({ event: 'http-request' });
            if (phase === 'respond')
                return IORequest.Write({ message: `Echo: ${lastPayload}\n` });

            return IORequest.Done({ code: 0 });
        },
        respond: ({ phase, maxRequests, handled, lastPayload }: {
            phase: string; maxRequests: number; handled: number; lastPayload: string
        }) => (response: any) => {
            if (phase === 'listen') {
                return {
                    phase: 'respond',
                    maxRequests,
                    handled,
                    lastPayload: response.payload ?? ''
                };
            }

            // After responding, loop or done
            const newHandled = handled + 1;
            if (newHandled >= maxRequests)
                return { phase: 'done', maxRequests, handled: newHandled, lastPayload: '' };

            return { phase: 'listen', maxRequests, handled: newHandled, lastPayload: '' };
        }
    })
}));

// --- Demonstration via mock interpreter ---


function testRun(main: any, responses: any[]) {

    let state: any = main;

    const requests: any[] = [];

    for (const response of responses) {
        requests.push(state.request);
        state = state.respond(response);
    }

    requests.push(state.request);

    return requests;
}

console.log('=== Echo Server Example ===\n');

const server = EchoServer.Start({
    phase: 'listen', maxRequests: 2, handled: 0, lastPayload: ''
});

console.log('Simulating 2-request echo server:');
const requests = testRun(server, [
    IOResponse.EventResult({ payload: 'GET /hello' }),   // listen → respond
    IOResponse.WriteResult,                                // respond → listen
    IOResponse.EventResult({ payload: 'GET /world' }),    // listen → respond
    IOResponse.WriteResult                                 // respond → done
]);

requests.forEach((req, i) => {
    if (req instanceof IORequest.Listen) console.log(`  [${i}] Listen(event="${req.event}")`);
    else if (req instanceof IORequest.Write) console.log(`  [${i}] Write(message="${req.message.trim()}")`);
    else if (req instanceof IORequest.Done) console.log(`  [${i}] Done(code=${req.code})`);
});

export { EchoServer };
