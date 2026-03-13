/**
 * IORequest — algebraic data type describing IO operations.
 *
 * Programs emit IORequest values from their Main behavior's `request` observer.
 * The platform runtime interprets these descriptions and performs the actual IO.
 *
 * Covers all four IO quadrants:
 *   Pull/Single:    Read, Write, HttpGet, GetTime
 *   Pull/Multiple:  OpenStream, ReadChunk, CloseStream
 *   Push/Single:    Listen, Timer
 *   Push/Multiple:  Subscribe, AwaitEvent
 *   Terminal:       Done
 *
 * Platform-specific capabilities can extend IORequest via the [extend] mechanism.
 *
 * @module
 */

import { data } from '../../index.mjs';

const IORequest = data(() => ({
    // Pull / Single — Request-Response
    Read:         { path: String },
    Write:        { message: String },
    HttpGet:      { url: String },
    GetTime:      {},

    // Pull / Multiple — Streaming Reads
    OpenStream:   { path: String },
    ReadChunk:    { handle: String },
    CloseStream:  { handle: String },

    // Push / Single — One-Time Notification
    Listen:       { event: String },
    Timer:        { ms: Number },

    // Push / Multiple — Event Streams
    Subscribe:    { source: String },
    AwaitEvent:   {},

    // Terminal
    Done:         { code: Number }
}));

export { IORequest };
