/**
 * Tests for Windows HTTP parser.
 */

import {
  parseHttpRequest,
  buildHttpResponse,
  jsonResponse,
  errorResponse,
  textResponse,
  bufferResponse,
} from '../../src/platform/windows/rest/httpParser';

describe('parseHttpRequest', () => {
  it('parses a simple GET request', () => {
    const raw = 'GET /api/status HTTP/1.1\r\nHost: localhost\r\n\r\n';
    const req = parseHttpRequest(raw);

    expect(req.method).toBe('GET');
    expect(req.path).toBe('/api/status');
    expect(req.headers['host']).toBe('localhost');
    expect(req.body).toBe('');
  });

  it('parses a POST request with body', () => {
    const raw = 'POST /api/brightness HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 15\r\n\r\n{"level": 50}';
    const req = parseHttpRequest(raw);

    expect(req.method).toBe('POST');
    expect(req.path).toBe('/api/brightness');
    expect(req.headers['content-type']).toBe('application/json');
    expect(req.body).toBe('{"level": 50}');
  });

  it('parses query parameters', () => {
    const raw = 'GET /api/search?q=test&page=2 HTTP/1.1\r\nHost: localhost\r\n\r\n';
    const req = parseHttpRequest(raw);

    expect(req.path).toBe('/api/search');
    expect(req.query['q']).toBe('test');
    expect(req.query['page']).toBe('2');
  });

  it('parses headers case-insensitively', () => {
    const raw = 'GET /api/test HTTP/1.1\r\nHOST: localhost\r\nContent-Type: application/json\r\n\r\n';
    const req = parseHttpRequest(raw);

    expect(req.headers['host']).toBe('localhost');
    expect(req.headers['content-type']).toBe('application/json');
  });

  it('handles empty body', () => {
    const raw = 'GET /api/test HTTP/1.1\r\nHost: localhost\r\n\r\n';
    const req = parseHttpRequest(raw);

    expect(req.body).toBe('');
  });
});

describe('buildHttpResponse', () => {
  it('builds a JSON response', () => {
    const resp = jsonResponse({ status: 'ok' });
    const raw = buildHttpResponse(resp);

    expect(raw).toContain('HTTP/1.1 200 OK');
    expect(raw).toContain('content-type: application/json');
    expect(raw).toContain('{"status":"ok"}');
  });

  it('builds an error response', () => {
    const resp = errorResponse(404, 'Not Found');
    const raw = buildHttpResponse(resp);

    expect(raw).toContain('HTTP/1.1 404 Not Found');
    expect(raw).toContain('{"error":"Not Found"}');
  });

  it('builds a text response', () => {
    const resp = textResponse('Hello World');
    const raw = buildHttpResponse(resp);

    expect(raw).toContain('HTTP/1.1 200 OK');
    expect(raw).toContain('content-type: text/plain');
    expect(raw).toContain('Hello World');
  });

  it('includes content-length header', () => {
    const resp = jsonResponse({ test: 'data' });
    const raw = buildHttpResponse(resp);

    expect(raw).toContain('content-length:');
  });

  it('includes connection close header', () => {
    const resp = jsonResponse({ test: 'data' });
    const raw = buildHttpResponse(resp);

    expect(raw).toContain('connection: close');
  });
});

describe('response helpers', () => {
  it('jsonResponse sets correct status', () => {
    const resp = jsonResponse({ ok: true }, 201);
    expect(resp.status).toBe(201);
    expect(resp.statusText).toBe('Created');
  });

  it('errorResponse sets correct status', () => {
    const resp = errorResponse(400, 'Bad Request');
    expect(resp.status).toBe(400);
    expect(resp.statusText).toBe('Bad Request');
  });

  it('bufferResponse sets binary content type', () => {
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const resp = bufferResponse(data, 'image/png');
    expect(resp.headers['content-type']).toBe('image/png');
  });
});
