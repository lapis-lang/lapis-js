/**
 * IO Example — Reactive Counter
 *
 * Demonstrates the Elm-like model/update pattern as a Mealy machine:
 *   render → subscribe → await event → update model → render → ...
 *
 * The counter increments on "increment" events, decrements on "decrement",
 * and exits on "quit".
 */

import { system, data } from '../src/index.mjs';
import { IORequest, IOResponse, testRun } from '../src/lib/io/index.mjs';

// Model for the counter application
const Model = data(() => ({
    Counter: { value: Number }
}));

type State = { phase: string; model: { value: number } };

const app = system({}, () => {
    const init: State = { phase: 'render', model: { value: 0 } };
    return {
        init,
        request: ({ phase, model }: State) => {
            if (phase === 'render')    return IORequest.Write({ message: `Counter: ${model.value}\n` });
            if (phase === 'subscribe') return IORequest.Subscribe({ source: 'user-input' });
            if (phase === 'listen')   return IORequest.AwaitEvent;

            return IORequest.Done({ code: 0 });
        },
        respond: ({ phase, model }: State) => (response: any) => {
            if (phase === 'render')    return { phase: 'subscribe', model };
            if (phase === 'subscribe') return { phase: 'listen', model };

            if (phase === 'listen') {
                const event = response.payload ?? '';
                if (event === 'quit')      return { phase: 'done', model };
                if (event === 'increment') return { phase: 'render', model: { value: model.value + 1 } };
                if (event === 'decrement') return { phase: 'render', model: { value: model.value - 1 } };

                return { phase: 'listen', model };
            }

            return { phase: 'done', model };
        }
    };
});

// --- Demonstration via mock interpreter ---

console.log('=== Reactive Counter Example ===\n');

console.log('Simulating: render → subscribe → increment → render → decrement → quit');
const requests = testRun(app, [
    IOResponse.WriteResult,                                       // render → subscribe
    IOResponse.None,                                              // subscribe → listen
    IOResponse.EventResult({ payload: 'increment' }),             // listen → render (value: 1)
    IOResponse.WriteResult,                                       // render → subscribe
    IOResponse.None,                                              // subscribe → listen
    IOResponse.EventResult({ payload: 'decrement' }),             // listen → render (value: 0)
    IOResponse.WriteResult,                                       // render → subscribe
    IOResponse.None,                                              // subscribe → listen
    IOResponse.EventResult({ payload: 'quit' })                   // listen → done
]);

requests.forEach((req, i) => {
    if (req instanceof IORequest.Write) console.log(`  [${i}] Write("${req.message.trim()}")`);
    else if (req instanceof IORequest.Subscribe) console.log(`  [${i}] Subscribe(source="${req.source}")`);
    else if (req === IORequest.AwaitEvent) console.log(`  [${i}] AwaitEvent`);
    else if (req instanceof IORequest.Done) console.log(`  [${i}] Done(code=${req.code})`);
});

export { app, Model };
