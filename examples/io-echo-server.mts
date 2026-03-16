/**
 * IO Example — Echo Handler
 *
 * Listens for browser CustomEvents, writes a response, and loops back.
 * Demonstrates the cyclic state machine pattern:
 *   listen → handle → listen → ... → done
 *
 * The handler processes a fixed number of events before shutting down.
 */

import { system } from '../src/index.mjs';
import { IORequest, IOResponse, testRun } from '../src/lib/io/index.mjs';

type State = { phase: string; maxRequests: number; handled: number; lastPayload: string };

const app = system({}, () => {
    const init: State = { phase: 'listen', maxRequests: 2, handled: 0, lastPayload: '' };
    return {
        init,
        request: ({ phase, handled, lastPayload }: State) => {
            if (phase === 'listen')  return IORequest.Listen({ event: 'http-request' });
            if (phase === 'respond') return IORequest.Write({ message: `Echo: ${lastPayload}\n` });

            return IORequest.Done({ code: 0 });
        },
        respond: ({ phase, maxRequests, handled }: State) => (response: any) => {
            if (phase === 'listen') {
                return {
                    phase: 'respond',
                    maxRequests,
                    handled,
                    lastPayload: response.payload ?? ''
                };
            }

            const newHandled = handled + 1;
            if (newHandled >= maxRequests)
                return { phase: 'done', maxRequests, handled: newHandled, lastPayload: '' };

            return { phase: 'listen', maxRequests, handled: newHandled, lastPayload: '' };
        }
    };
});

// --- Demonstration via mock interpreter ---

console.log('=== Echo Server Example ===\n');

console.log('Simulating 2-request echo server:');
const requests = testRun(app, [
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

export { app };

