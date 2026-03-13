/**
 * IO sub-package barrel — re-exports all IO types and the platform runtime.
 *
 * Usage:
 *   import { IORequest, IOResponse, Main, run } from '@lapis-lang/lapis-js/io';
 *
 * @module
 */

export { IORequest } from './request.mjs';
export { IOResponse } from './response.mjs';
export { Main } from './main.mjs';
export { run, executeRequest } from './runtime.mjs';
