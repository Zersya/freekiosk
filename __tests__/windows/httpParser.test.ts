/**
 * Tests for the Windows HTTP parser and response helpers.
 */

import {
  parseHttpRequest,
  jsonSuccess,
  jsonError,
  imageResponse,
  mjpegResponse,
  serializeHead,
  bodyByteLength,
  CORS_HEADERS,
} from '../../src/platform/windows/rest/httpParser';
import { bytesToBinaryString, utf8Encode } from '../../src/platform/windows/net/bytes';

describe('parseHttpRequest', () => {
  it('parses a simple GET request', () => {
    const raw = 'GET /api/status HTTP/1.1\r\nHost: localhost\r\n\r\n';
    const req = parseHttpRequest(raw);

    expect(req.method).toBe('GET');
    expect(req.path).toBe('/api/status');
    expect(req.headers['host']).toBe('localhost');
    expect(req.body).toBe('');
  });

  it('parses a POST request with a UTF-8 JSON body', () => {
    const body = '{"text":"é"}';
    const raw =
      'POST /api/remote/text HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n\r\n' +
      bytesToBinaryString(utf8Encode(body));
    const req = parseHttpRequest(raw);

    expect(req.method).toBe('POST');
    expect(req.body).toBe(body);
  });

  it('parses query parameters', () => {
    const raw = 'GET /api/search?q=test&page=2 HTTP/1.1\r\nHost: localhost\r\n\r\n';
    const req = parseHttpRequest(raw);

    expect(req.path).toBe('/api/search');
    expect(req.query['q']).toBe('test');
    expect(req.query['page']).toBe('2');
  });

  it('decodes percent-encoded and + query values', () => {
    const raw = 'GET /api/remote/keyboard?map=ctrl%2Bc&a=b+c HTTP/1.1\r\nHost: x\r\n\r\n';
    const req = parseHttpRequest(raw);

    expect(req.query['map']).toBe('ctrl+c');
    expect(req.query['a']).toBe('b c');
  });

  it('parses headers case-insensitively', () => {
    const raw = 'GET /api/test HTTP/1.1\r\nHOST: localhost\r\nContent-Type: application/json\r\n\r\n';
    const req = parseHttpRequest(raw);

    expect(req.headers['host']).toBe('localhost');
    expect(req.headers['content-type']).toBe('application/json');
  });
});

describe('response helpers', () => {
  it('jsonSuccess wraps data in the MDM envelope', () => {
    const resp = jsonSuccess({ a: 1 });
    const body = JSON.parse(resp.body!);

    expect(resp.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ a: 1 });
    expect(Number.isInteger(body.timestamp)).toBe(true);
    expect(body.timestamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it('jsonError emits the error envelope', () => {
    const resp = jsonError(404, 'Endpoint not found');
    const body = JSON.parse(resp.body!);

    expect(resp.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Endpoint not found');
    expect(Number.isInteger(body.timestamp)).toBe(true);
  });

  it('imageResponse carries base64 with the given content type', () => {
    const resp = imageResponse('QUJD', 'image/jpeg');
    expect(resp.bodyBase64).toBe('QUJD');
    expect(resp.headers['content-type']).toBe('image/jpeg');
  });

  it('mjpegResponse marks the stream kind', () => {
    const resp = mjpegResponse();
    expect(resp.stream).toBe('mjpeg');
    expect(resp.headers['content-type']).toContain('multipart/x-mixed-replace');
    expect(resp.headers['content-type']).toContain('freekiosk-frame');
  });
});

describe('serializeHead', () => {
  it('includes status line, headers, content-length and CORS', () => {
    const resp = jsonSuccess({ ok: true });
    const head = serializeHead(resp, bodyByteLength(resp));

    expect(head).toContain('HTTP/1.1 200 OK');
    expect(head).toContain('content-type: application/json');
    expect(head).toContain('access-control-allow-headers: Content-Type, X-Api-Key');
    expect(head).toContain('access-control-allow-origin: *');
    expect(head).toContain('connection: close');
    expect(head).toContain(`content-length: ${bodyByteLength(resp)}`);
    expect(head.endsWith('\r\n\r\n')).toBe(true);
  });

  it('omits content-length when null', () => {
    const head = serializeHead(mjpegResponse(), null);
    expect(head).not.toContain('content-length');
    expect(head).toContain('connection: close');
  });

  it('exports the CORS headers', () => {
    expect(CORS_HEADERS['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
  });
});
