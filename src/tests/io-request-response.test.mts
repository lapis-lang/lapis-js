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

// =============================================================================
// IORequest
// =============================================================================

describe('IORequest', () => {
    describe('Pull/Single variants', () => {
        it('should construct Read with path field', () => {
            const req = IORequest.Read({ path: '/tmp/test.txt' });
            assert.ok(req instanceof IORequest.Read);
            assert.ok(req instanceof IORequest);
            assert.strictEqual(req.path, '/tmp/test.txt');
        });

        it('should construct Write with message field', () => {
            const req = IORequest.Write({ message: 'hello world' });
            assert.ok(req instanceof IORequest.Write);
            assert.ok(req instanceof IORequest);
            assert.strictEqual(req.message, 'hello world');
        });

        it('should construct HttpGet with url field', () => {
            const req = IORequest.HttpGet({ url: 'https://example.com' });
            assert.ok(req instanceof IORequest.HttpGet);
            assert.ok(req instanceof IORequest);
            assert.strictEqual(req.url, 'https://example.com');
        });

        it('should construct GetTime as singleton', () => {
            const req = IORequest.GetTime;
            assert.strictEqual(req, IORequest.GetTime);
            assert.ok(req instanceof IORequest);
        });
    });

    describe('Pull/Multiple variants', () => {
        it('should construct OpenStream with path field', () => {
            const req = IORequest.OpenStream({ path: '/data.csv' });
            assert.ok(req instanceof IORequest.OpenStream);
            assert.ok(req instanceof IORequest);
            assert.strictEqual(req.path, '/data.csv');
        });

        it('should construct ReadChunk with handle field', () => {
            const req = IORequest.ReadChunk({ handle: 'stream-1' });
            assert.ok(req instanceof IORequest.ReadChunk);
            assert.ok(req instanceof IORequest);
            assert.strictEqual(req.handle, 'stream-1');
        });

        it('should construct CloseStream with handle field', () => {
            const req = IORequest.CloseStream({ handle: 'stream-1' });
            assert.ok(req instanceof IORequest.CloseStream);
            assert.ok(req instanceof IORequest);
            assert.strictEqual(req.handle, 'stream-1');
        });
    });

    describe('Push/Single variants', () => {
        it('should construct Listen with event field', () => {
            const req = IORequest.Listen({ event: 'click' });
            assert.ok(req instanceof IORequest.Listen);
            assert.ok(req instanceof IORequest);
            assert.strictEqual(req.event, 'click');
        });

        it('should construct Timer with ms field', () => {
            const req = IORequest.Timer({ ms: 1000 });
            assert.ok(req instanceof IORequest.Timer);
            assert.ok(req instanceof IORequest);
            assert.strictEqual(req.ms, 1000);
        });
    });

    describe('Push/Multiple variants', () => {
        it('should construct Subscribe with source field', () => {
            const req = IORequest.Subscribe({ source: 'keyboard' });
            assert.ok(req instanceof IORequest.Subscribe);
            assert.ok(req instanceof IORequest);
            assert.strictEqual(req.source, 'keyboard');
        });

        it('should construct AwaitEvent as singleton', () => {
            const req = IORequest.AwaitEvent;
            assert.strictEqual(req, IORequest.AwaitEvent);
            assert.ok(req instanceof IORequest);
        });
    });

    describe('Terminal variant', () => {
        it('should construct Done with code field', () => {
            const req = IORequest.Done({ code: 0 });
            assert.ok(req instanceof IORequest.Done);
            assert.ok(req instanceof IORequest);
            assert.strictEqual(req.code, 0);
        });

        it('should construct Done with non-zero exit code', () => {
            const req = IORequest.Done({ code: 1 });
            assert.strictEqual(req.code, 1);
        });
    });

    describe('Guard validation', () => {
        it('should reject Read with non-string path', () => {
            assert.throws(() => {
                IORequest.Read({ path: 42 });
            }, TypeError);
        });

        it('should reject Write with non-string message', () => {
            assert.throws(() => {
                IORequest.Write({ message: true });
            }, TypeError);
        });

        it('should reject Done with non-number code', () => {
            assert.throws(() => {
                IORequest.Done({ code: 'zero' });
            }, TypeError);
        });

        it('should reject Timer with non-number ms', () => {
            assert.throws(() => {
                IORequest.Timer({ ms: '1000' });
            }, TypeError);
        });

        it('should reject OpenStream with non-string path', () => {
            assert.throws(() => {
                IORequest.OpenStream({ path: 123 });
            }, TypeError);
        });

        it('should reject ReadChunk with non-string handle', () => {
            assert.throws(() => {
                IORequest.ReadChunk({ handle: 42 });
            }, TypeError);
        });

        it('should reject CloseStream with non-string handle', () => {
            assert.throws(() => {
                IORequest.CloseStream({ handle: true });
            }, TypeError);
        });
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
    it('should construct ReadResult with content field', () => {
        const res = IOResponse.ReadResult({ content: 'file contents' });
        assert.ok(res instanceof IOResponse.ReadResult);
        assert.ok(res instanceof IOResponse);
        assert.strictEqual(res.content, 'file contents');
    });

    it('should construct WriteResult as singleton', () => {
        const res = IOResponse.WriteResult;
        assert.strictEqual(res, IOResponse.WriteResult);
        assert.ok(res instanceof IOResponse);
    });

    it('should construct HttpResult with status and body', () => {
        const res = IOResponse.HttpResult({ status: 200, body: '<html>' });
        assert.ok(res instanceof IOResponse.HttpResult);
        assert.ok(res instanceof IOResponse);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body, '<html>');
    });

    it('should construct TimeResult with now field', () => {
        const res = IOResponse.TimeResult({ now: 1700000000000 });
        assert.ok(res instanceof IOResponse.TimeResult);
        assert.strictEqual(res.now, 1700000000000);
    });

    it('should construct StreamOpened with handle field', () => {
        const res = IOResponse.StreamOpened({ handle: 'stream-1' });
        assert.ok(res instanceof IOResponse.StreamOpened);
        assert.ok(res instanceof IOResponse);
        assert.strictEqual(res.handle, 'stream-1');
    });

    it('should construct StreamChunk with data field', () => {
        const res = IOResponse.StreamChunk({ data: 'chunk of text' });
        assert.ok(res instanceof IOResponse.StreamChunk);
        assert.ok(res instanceof IOResponse);
        assert.strictEqual(res.data, 'chunk of text');
    });

    it('should construct EventResult with payload field', () => {
        const res = IOResponse.EventResult({ payload: '{"key":"value"}' });
        assert.ok(res instanceof IOResponse.EventResult);
        assert.strictEqual(res.payload, '{"key":"value"}');
    });

    it('should construct TimerResult as singleton', () => {
        const res = IOResponse.TimerResult;
        assert.strictEqual(res, IOResponse.TimerResult);
        assert.ok(res instanceof IOResponse);
    });

    it('should construct EndOfStream as singleton', () => {
        const res = IOResponse.EndOfStream;
        assert.strictEqual(res, IOResponse.EndOfStream);
        assert.ok(res instanceof IOResponse);
    });

    it('should construct None as singleton', () => {
        const res = IOResponse.None;
        assert.strictEqual(res, IOResponse.None);
        assert.ok(res instanceof IOResponse);
    });

    describe('Guard validation', () => {
        it('should reject ReadResult with non-string content', () => {
            assert.throws(() => {
                IOResponse.ReadResult({ content: 42 });
            }, TypeError);
        });

        it('should reject HttpResult with non-number status', () => {
            assert.throws(() => {
                IOResponse.HttpResult({ status: 'ok', body: '' });
            }, TypeError);
        });

        it('should reject StreamOpened with non-string handle', () => {
            assert.throws(() => {
                IOResponse.StreamOpened({ handle: 123 });
            }, TypeError);
        });

        it('should reject StreamChunk with non-string data', () => {
            assert.throws(() => {
                IOResponse.StreamChunk({ data: 42 });
            }, TypeError);
        });
    });
});
