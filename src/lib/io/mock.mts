/**
 * Mock interpreter for MealyMachine — synchronous IO loop driver for testing.
 *
 * `testRun` drives a MealyMachine through a pre-defined sequence of IOResponse
 * values without performing any real IO, collecting the emitted IORequest values
 * at each step. This allows IO programs to be tested synchronously and
 * deterministically, without `async`/`await` or platform APIs.
 *
 * Usage:
 *   import { testRun } from '@lapis-lang/lapis-js/io';
 *
 *   const requests = testRun(app, [
 *       IOResponse.ReadResult({ content: 'hello' }),
 *       IOResponse.WriteResult
 *   ]);
 *   // requests[0] instanceof IORequest.Read  → true
 *   // requests[1] instanceof IORequest.Write → true
 *   // requests[2] instanceof IORequest.Done  → true
 *
 * @module
 */

import type { MealyMachine } from '../../index.mjs';

/**
 * Synchronous mock interpreter — drives a MealyMachine through a pre-defined
 * sequence of IOResponse values and returns all emitted IORequest values.
 *
 * The final element of the returned array is the request produced after the last
 * response is consumed — typically `IORequest.Done`.
 *
 * @param machine   - A MealyMachine returned by system()
 * @param responses - Ordered list of IOResponse values to feed into respond()
 * @returns All IORequest values emitted during the simulated run
 */
function testRun<S, Req, Res>(machine: MealyMachine<S, Req, Res>, responses: Res[]): Req[] {
    let state = machine.init;
    const requests: Req[] = [];

    for (const response of responses) {
        requests.push(machine.request(state));
        state = machine.respond(state)(response);
    }

    // Capture the final request (typically Done)
    requests.push(machine.request(state));

    return requests;
}

export { testRun };
