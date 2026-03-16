/**
 * IO Example — Fetch and Display
 *
 * Fetches a resource by URL and writes its contents to the console.
 * Demonstrates the linear state machine pattern:
 *   read → write → done
 *
 * Usage (conceptual — requires platform runtime):
 *   await run(app);
 */

import { system } from '../src/index.mjs';
import { IORequest, IOResponse, run, testRun } from '../src/lib/io/index.mjs';

type State = { phase: string; args: string[]; content: string };

const app = system({}, () => {
    const init: State = { phase: 'read', args: ['/hello.txt'], content: '' };
    return {
        init,
        request: ({ phase, args, content }: State) => {
            if (phase === 'read')  return IORequest.Read({ path: args[0] });
            if (phase === 'write') return IORequest.Write({ message: content });

            return IORequest.Done({ code: 0 });
        },
        respond: ({ phase, args }: State) => (response: any) => {
            if (phase === 'read')
                return { phase: 'write', args, content: response.content };

            return { phase: 'done', args, content: '' };
        }
    };
});

// --- Demonstration via mock interpreter ---

console.log('=== Fetch & Display Example ===\n');

console.log('Running fetch /hello.txt:');
const requests = testRun(app, [
    IOResponse.ReadResult({ content: 'Hello, world!\nThis is file content.' }),
    IOResponse.WriteResult
]);

console.log('\nRequest sequence:');
const [r0, r1, r2] = requests;
console.log(`  [0] ${r0 instanceof IORequest.Read  ? `Read(path="${r0.path}")`         : `?(unknown)`}`);
console.log(`  [1] ${r1 instanceof IORequest.Write ? `Write(message="${r1.message}")` : `?(unknown)`}`);
console.log(`  [2] ${r2 instanceof IORequest.Done  ? `Done(code=${r2.code})`           : `?(unknown)`}`);

export { app };
