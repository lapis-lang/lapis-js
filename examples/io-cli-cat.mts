/**
 * IO Example — Fetch and Display
 *
 * Fetches a resource by URL and writes its contents to the console.
 * Demonstrates the linear state machine pattern:
 *   read → write → done
 *
 * Usage (conceptual — requires platform runtime):
 *   run(FetchDisplay.Start({ phase: 'read', args: ['/hello.txt'], content: '' }));
 */

import { behavior, unfold, extend } from '../src/index.mjs';
import { IORequest, IOResponse, Main } from '../src/lib/io/index.mjs';

const FetchDisplay: any = behavior(({ Self }: { Self: any }) => ({
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

// --- Demonstration via mock interpreter ---


function testRun(main: any, responses: any[]) {

    let state: any = main;

    const requests: any[] = [];

    for (const response of responses) {
        requests.push(state.request);
        console.log('  request:', state.request.constructor.name,
            state.request.path ?? state.request.message ?? '');
        state = state.respond(response);
    }

    requests.push(state.request);
    console.log('  request:', state.request.constructor.name,
        `code=${state.request.code ?? ''}`);

    return requests;
}

console.log('=== Fetch & Display Example ===\n');

const main = FetchDisplay.Start({ phase: 'read', args: ['/hello.txt'], content: '' });

console.log('Running fetch /hello.txt:');
const requests = testRun(main, [
    IOResponse.ReadResult({ content: 'Hello, world!\nThis is file content.' }),
    IOResponse.WriteResult
]);

console.log('\nRequest sequence:');
console.log(`  [0] ${requests[0] instanceof IORequest.Read ? 'Read' : '?'}(path="${requests[0].path}")`);
console.log(`  [1] ${requests[1] instanceof IORequest.Write ? 'Write' : '?'}(message="${requests[1].message}")`);
console.log(`  [2] ${requests[2] instanceof IORequest.Done ? 'Done' : '?'}(code=${requests[2].code})`);

export { FetchDisplay };
