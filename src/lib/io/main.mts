/**
 * Main — the Mealy machine behavior type for program entry points.
 *
 * A Lapis program is a `Main` behavior with two observers:
 *   - `request`: a pure query projecting an IORequest from the current state
 *   - `respond`: a continuation accepting an IOResponse, returning the next state
 *
 * The platform runtime drives the IO loop:
 *   1. Construct Main via an unfold constructor (e.g., Main.Start(seed))
 *   2. Read main.request           → IORequest value
 *   3. Perform the described IO    → IOResponse value
 *   4. Call main.respond(response) → next Main state
 *   5. Repeat until IORequest.Done is observed
 *
 * Usage:
 *   import { behavior, unfold } from '@lapis-lang/lapis-js';
 *   import { IORequest, IOResponse, Main } from '@lapis-lang/lapis-js/io';
 *
 *   const MyApp = behavior(({ Self }) => ({
 *       [extend]: Main,
 *       Start: unfold({ in: { args: Array }, out: Self })({
 *           request: ({ args }) => IORequest.Write({ message: args[0] }),
 *           respond: ({ args }) => (_response) => ({ args, phase: 'done' })
 *       })
 *   }));
 *
 * Or define a standalone behavior with the same protocol:
 *
 *   const MyApp = behavior(({ Self }) => ({
 *       request: IORequest,
 *       respond: { in: IOResponse, out: Self },
 *       Start: unfold({ in: { args: Array }, out: Self })({
 *           request: ({ args }) => IORequest.Read({ path: args[0] }),
 *           respond: ({ args }) => (response) => ({
 *               phase: 'write', args, content: response.content
 *           })
 *       })
 *   }));
 *
 * @module
 */

import { behavior } from '../../index.mjs';
import { IORequest } from './request.mjs';
import { IOResponse } from './response.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Main: any = behavior(({ Self }: { Self: any }) => ({
    request: IORequest,
    respond: { in: IOResponse, out: Self }
}));

export { Main };
