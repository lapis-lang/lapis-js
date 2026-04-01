/**
 * Tests for IORequest and IOResponse data types.
 *
 * Verifies:
 *   - Variant construction (singleton and structured)
 *   - instanceof checks against ADT family and individual variants
 *   - Field access on structured variants
 *   - Guard validation (wrong types rejected)
 *   - All variants from all four IO quadrants
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IORequest } from '../lib/io/request.mjs';
import { IOResponse } from '../lib/io/response.mjs';

type StructuredCtorCase = {
    name: string;
    ctor: (arg: Record<string, unknown>) => any;
    variantCtor: abstract new (...args: any[]) => any;
    validArg: Record<string, unknown>;
    field: string;
    expected: unknown;
};

type SingletonCtorCase = {
    name: string;
    value: any;
    sourceValue: () => any;
    familyCtor: abstract new (...args: any[]) => any;
};

type GuardCase = {
    name: string;
    invoke: () => unknown;
};

// =============================================================================
// IORequest
// =============================================================================

describe('IORequest', () => {
    const structuredCases: StructuredCtorCase[] = [
        {
            name: 'Read',
            ctor: IORequest.Read,
            variantCtor: IORequest.Read,
            validArg: { path: '/tmp/test.txt' },
            field: 'path',
            expected: '/tmp/test.txt'
        },
        {
            name: 'Write',
            ctor: IORequest.Write,
            variantCtor: IORequest.Write,
            validArg: { message: 'hello world' },
            field: 'message',
            expected: 'hello world'
        },
        {
            name: 'HttpGet',
            ctor: IORequest.HttpGet,
            variantCtor: IORequest.HttpGet,
            validArg: { url: 'https://example.com' },
            field: 'url',
            expected: 'https://example.com'
        },
        {
            name: 'OpenStream',
            ctor: IORequest.OpenStream,
            variantCtor: IORequest.OpenStream,
            validArg: { path: '/data.csv' },
            field: 'path',
            expected: '/data.csv'
        },
        {
            name: 'ReadChunk',
            ctor: IORequest.ReadChunk,
            variantCtor: IORequest.ReadChunk,
            validArg: { handle: 'stream-1' },
            field: 'handle',
            expected: 'stream-1'
        },
        {
            name: 'CloseStream',
            ctor: IORequest.CloseStream,
            variantCtor: IORequest.CloseStream,
            validArg: { handle: 'stream-1' },
            field: 'handle',
            expected: 'stream-1'
        },
        {
            name: 'Listen',
            ctor: IORequest.Listen,
            variantCtor: IORequest.Listen,
            validArg: { event: 'click' },
            field: 'event',
            expected: 'click'
        },
        {
            name: 'Timer',
            ctor: IORequest.Timer,
            variantCtor: IORequest.Timer,
            validArg: { ms: 1000 },
            field: 'ms',
            expected: 1000
        },
        {
            name: 'Subscribe',
            ctor: IORequest.Subscribe,
            variantCtor: IORequest.Subscribe,
            validArg: { source: 'keyboard' },
            field: 'source',
            expected: 'keyboard'
        },
        {
            name: 'Done',
            ctor: IORequest.Done,
            variantCtor: IORequest.Done,
            validArg: { code: 0 },
            field: 'code',
            expected: 0
        }
    ];

    const singletonCases: SingletonCtorCase[] = [
        { name: 'GetTime', value: IORequest.GetTime, sourceValue: () => IORequest.GetTime, familyCtor: IORequest },
        { name: 'AwaitEvent', value: IORequest.AwaitEvent, sourceValue: () => IORequest.AwaitEvent, familyCtor: IORequest }
    ];

    const guardCases: GuardCase[] = [
        {
            name: 'Read with non-string path',
            invoke: () => {
                // @ts-expect-error intentionally wrong type to test runtime guard
                IORequest.Read({ path: 42 });
            }
        },
        {
            name: 'Write with non-string message',
            invoke: () => {
                // @ts-expect-error intentionally wrong type to test runtime guard
                IORequest.Write({ message: true });
            }
        },
        {
            name: 'Done with non-number code',
            invoke: () => {
                // @ts-expect-error intentionally wrong type to test runtime guard
                IORequest.Done({ code: 'zero' });
            }
        },
        {
            name: 'Timer with non-number ms',
            invoke: () => {
                // @ts-expect-error intentionally wrong type to test runtime guard
                IORequest.Timer({ ms: '1000' });
            }
        },
        {
            name: 'OpenStream with non-string path',
            invoke: () => {
                // @ts-expect-error intentionally wrong type to test runtime guard
                IORequest.OpenStream({ path: 123 });
            }
        },
        {
            name: 'ReadChunk with non-string handle',
            invoke: () => {
                // @ts-expect-error intentionally wrong type to test runtime guard
                IORequest.ReadChunk({ handle: 42 });
            }
        },
        {
            name: 'CloseStream with non-string handle',
            invoke: () => {
                // @ts-expect-error intentionally wrong type to test runtime guard
                IORequest.CloseStream({ handle: true });
            }
        }
    ];

    describe('structured variants', () => {
        for (const c of structuredCases) {
            it(`constructs ${c.name} with expected field/type`, () => {
                const req = c.ctor(c.validArg);
                assert.ok(req instanceof c.variantCtor);
                assert.ok(req instanceof IORequest);
                assert.strictEqual(req[c.field], c.expected);
            });
        }

        it('constructs Done with non-zero exit code', () => {
            const req = IORequest.Done({ code: 1 });
            assert.strictEqual(req.code, 1);
        });
    });

    describe('singleton variants', () => {
        for (const c of singletonCases) {
            it(`constructs ${c.name} as singleton`, () => {
                assert.strictEqual(c.value, c.sourceValue());
                assert.ok(c.value instanceof c.familyCtor);
            });
        }
    });

    describe('guard validation', () => {
        for (const c of guardCases)
            it(`rejects ${c.name}`, () => assert.throws(() => c.invoke(), TypeError));
    });

    describe('Cross-variant instanceof', () => {
        it('Read should not be instanceof Write', () => {
            const req = IORequest.Read({ path: '/tmp/test.txt' });
            assert.ok(!(req instanceof IORequest.Write));
            assert.ok(!(req instanceof IORequest.Done));
        });

        it('Done should not be instanceof Read', () => {
            const req = IORequest.Done({ code: 0 });
            assert.ok(!(req instanceof IORequest.Read));
        });
    });
});

// =============================================================================
// IOResponse
// =============================================================================

describe('IOResponse', () => {
    const structuredCases: StructuredCtorCase[] = [
        {
            name: 'ReadResult',
            ctor: IOResponse.ReadResult,
            variantCtor: IOResponse.ReadResult,
            validArg: { content: 'file contents' },
            field: 'content',
            expected: 'file contents'
        },
        {
            name: 'HttpResult',
            ctor: IOResponse.HttpResult,
            variantCtor: IOResponse.HttpResult,
            validArg: { status: 200, body: '<html>' },
            field: 'status',
            expected: 200
        },
        {
            name: 'TimeResult',
            ctor: IOResponse.TimeResult,
            variantCtor: IOResponse.TimeResult,
            validArg: { now: 1700000000000 },
            field: 'now',
            expected: 1700000000000
        },
        {
            name: 'StreamOpened',
            ctor: IOResponse.StreamOpened,
            variantCtor: IOResponse.StreamOpened,
            validArg: { handle: 'stream-1' },
            field: 'handle',
            expected: 'stream-1'
        },
        {
            name: 'StreamChunk',
            ctor: IOResponse.StreamChunk,
            variantCtor: IOResponse.StreamChunk,
            validArg: { data: 'chunk of text' },
            field: 'data',
            expected: 'chunk of text'
        },
        {
            name: 'EventResult',
            ctor: IOResponse.EventResult,
            variantCtor: IOResponse.EventResult,
            validArg: { payload: '{"key":"value"}' },
            field: 'payload',
            expected: '{"key":"value"}'
        }
    ];

    const singletonCases: SingletonCtorCase[] = [
        { name: 'WriteResult', value: IOResponse.WriteResult, sourceValue: () => IOResponse.WriteResult, familyCtor: IOResponse },
        { name: 'TimerResult', value: IOResponse.TimerResult, sourceValue: () => IOResponse.TimerResult, familyCtor: IOResponse },
        { name: 'EndOfStream', value: IOResponse.EndOfStream, sourceValue: () => IOResponse.EndOfStream, familyCtor: IOResponse },
        { name: 'None', value: IOResponse.None, sourceValue: () => IOResponse.None, familyCtor: IOResponse }
    ];

    const guardCases: GuardCase[] = [
        {
            name: 'ReadResult with non-string content',
            invoke: () => {
                // @ts-expect-error intentionally wrong type to test runtime guard
                IOResponse.ReadResult({ content: 42 });
            }
        },
        {
            name: 'HttpResult with non-number status',
            invoke: () => {
                // @ts-expect-error intentionally wrong type to test runtime guard
                IOResponse.HttpResult({ status: 'ok', body: '' });
            }
        },
        {
            name: 'StreamOpened with non-string handle',
            invoke: () => {
                // @ts-expect-error intentionally wrong type to test runtime guard
                IOResponse.StreamOpened({ handle: 123 });
            }
        },
        {
            name: 'StreamChunk with non-string data',
            invoke: () => {
                // @ts-expect-error intentionally wrong type to test runtime guard
                IOResponse.StreamChunk({ data: 42 });
            }
        }
    ];

    describe('structured variants', () => {
        for (const c of structuredCases) {
            it(`constructs ${c.name} with expected field/type`, () => {
                const res = c.ctor(c.validArg);
                assert.ok(res instanceof c.variantCtor);
                assert.ok(res instanceof IOResponse);
                assert.strictEqual(res[c.field], c.expected);
            });
        }

        it('constructs HttpResult with expected body', () => {
            const res = IOResponse.HttpResult({ status: 200, body: '<html>' });
            assert.strictEqual(res.body, '<html>');
        });
    });

    describe('singleton variants', () => {
        for (const c of singletonCases) {
            it(`constructs ${c.name} as singleton`, () => {
                assert.strictEqual(c.value, c.sourceValue());
                assert.ok(c.value instanceof c.familyCtor);
            });
        }
    });

    describe('guard validation', () => {
        for (const c of guardCases)
            it(`rejects ${c.name}`, () => assert.throws(() => c.invoke(), TypeError));
    });
});
