/**
 * HTTP/1.1 request parser for the Windows REST server.
 * Pure TypeScript — parses raw HTTP request bytes (a binary string) into a
 * structured object. Response bodies are serialized by httpServer.
 */

import {
  base64ByteLength,
  binaryStringToBytes,
  utf8Decode,
  utf8Encode,
} from '../net/bytes';

export interface HttpRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  raw: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body?: string;
  bodyBase64?: string;
  stream?: 'mjpeg';
}

const STATUS_TEXTS: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  413: 'Payload Too Large',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  503: 'Service Unavailable',
};

export const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, X-Api-Key',
};

export function parseHttpRequest(raw: string): HttpRequest {
  const headEnd = raw.indexOf('\r\n\r\n');
  const headPart = headEnd === -1 ? raw : raw.slice(0, headEnd);
  const bodyPart = headEnd === -1 ? '' : raw.slice(headEnd + 4);

  const lines = headPart.split('\r\n');
  const [method, fullPath] = lines[0].split(' ');

  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      headers[key] = value;
    }
  }

  const query: Record<string, string> = {};
  let path = fullPath;
  const queryIndex = fullPath.indexOf('?');
  if (queryIndex >= 0) {
    path = fullPath.slice(0, queryIndex);
    const queryString = fullPath.slice(queryIndex + 1);
    for (const pair of queryString.split('&')) {
      const [key, value] = pair.split('=');
      if (key) {
        const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '));
        query[decode(key)] = decode(value || '');
      }
    }
  }

  return {
    method: method.toUpperCase(),
    path,
    query,
    headers,
    body: utf8Decode(binaryStringToBytes(bodyPart)),
    raw,
  };
}

function unixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function jsonSuccess(data: unknown): HttpResponse {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ success: true, data, timestamp: unixSeconds() }),
  };
}

export function jsonError(status: number, message: string): HttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ success: false, error: message, timestamp: unixSeconds() }),
  };
}

export function imageResponse(base64: string, contentType: string): HttpResponse {
  return {
    status: 200,
    headers: { 'content-type': contentType },
    bodyBase64: base64,
  };
}

export function mjpegResponse(): HttpResponse {
  return {
    status: 200,
    headers: {
      'content-type': 'multipart/x-mixed-replace; boundary=freekiosk-frame',
      'cache-control': 'no-cache, no-store, must-revalidate',
      pragma: 'no-cache',
    },
    stream: 'mjpeg',
  };
}

/**
 * Serialize the status line + headers (plus CORS). Content-Length is omitted
 * for streaming responses (contentLength === null).
 */
export function serializeHead(response: HttpResponse, contentLength: number | null): string {
  const statusText = STATUS_TEXTS[response.status] || 'Unknown';
  const lines: string[] = [`HTTP/1.1 ${response.status} ${statusText}`];

  const allHeaders: Record<string, string> = {
    ...CORS_HEADERS,
    ...response.headers,
    connection: 'close',
  };
  if (contentLength !== null && !allHeaders['content-length']) {
    allHeaders['content-length'] = String(contentLength);
  }

  for (const [key, value] of Object.entries(allHeaders)) {
    lines.push(`${key}: ${value}`);
  }

  return lines.join('\r\n') + '\r\n\r\n';
}

/** Byte length of a response body (UTF-8 for text, decoded for base64). */
export function bodyByteLength(response: HttpResponse): number {
  if (response.bodyBase64 !== undefined) {
    return base64ByteLength(response.bodyBase64);
  }
  return response.body === undefined ? 0 : utf8Encode(response.body).length;
}
