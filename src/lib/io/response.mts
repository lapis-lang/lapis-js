/**
 * IOResponse — algebraic data type describing IO operation results.
 *
 * The platform runtime constructs IOResponse values after performing IO
 * operations and delivers them to Main via the `respond` continuation.
 *
 * Each IOResponse variant corresponds to one or more IORequest variants:
 *   ReadResult     ← Read
 *   WriteResult    ← Write
 *   HttpResult     ← HttpGet
 *   TimeResult     ← GetTime
 *   StreamOpened   ← OpenStream
 *   StreamChunk    ← ReadChunk
 *   EventResult    ← Listen, Subscribe, AwaitEvent
 *   TimerResult    ← Timer
 *   EndOfStream    ← ReadChunk (stream exhausted)
 *   None           ← CloseStream, fallback / acknowledgement
 *
 * @module
 */

import { data } from '../../index.mjs';

const IOResponse = data(() => ({
    ReadResult:    { content: String },
    WriteResult:   {},
    HttpResult:    { status: Number, body: String },
    TimeResult:    { now: Number },
    StreamOpened:  { handle: String },
    StreamChunk:   { data: String },
    EventResult:   { payload: String },
    TimerResult:   {},
    EndOfStream:   {},
    None:          {}
}));

export { IOResponse };
