/**
 * HTTP/1.1 request parser for the Windows REST server.
 * Pure TypeScript — parses raw HTTP request bytes into a structured object.
 */

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
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType?: string;
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
  500: 'Internal Server Error',
};

export function parseHttpRequest(raw: string): HttpRequest {
  const [headPart, ...bodyParts] = raw.split('\r\n\r\n');
  const body = bodyParts.join('\r\n\r\n');

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
        query[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    }
  }

  return {
    method: method.toUpperCase(),
    path,
    query,
    headers,
    body,
    raw,
  };
}

export function buildHttpResponse(response: HttpResponse): string {
  const statusText = response.statusText || STATUS_TEXTS[response.status] || 'Unknown';
  const headers: string[] = [`HTTP/1.1 ${response.status} ${statusText}`];

  const allHeaders: Record<string, string> = { ...response.headers };
  if (response.contentType && !allHeaders['content-type']) {
    allHeaders['content-type'] = response.contentType;
  }
  if (!allHeaders['content-length']) {
    allHeaders['content-length'] = String(new TextEncoder().encode(response.body).length);
  }
  if (!allHeaders['connection']) {
    allHeaders['connection'] = 'close';
  }

  for (const [key, value] of Object.entries(allHeaders)) {
    headers.push(`${key}: ${value}`);
  }

  headers.push('', '');
  return headers.join('\r\n') + response.body;
}

export function jsonResponse(data: unknown, status = 200): HttpResponse {
  return {
    status,
    statusText: STATUS_TEXTS[status] || 'Unknown',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  };
}

export function errorResponse(status: number, message: string): HttpResponse {
  return {
    status,
    statusText: STATUS_TEXTS[status] || 'Unknown',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

export function textResponse(text: string, status = 200): HttpResponse {
  return {
    status,
    statusText: STATUS_TEXTS[status] || 'Unknown',
    headers: { 'content-type': 'text/plain' },
    body: text,
  };
}

export function bufferResponse(data: Uint8Array, contentType = 'application/octet-stream'): HttpResponse {
  // Convert Uint8Array to binary string for transport
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': contentType },
    body: binary,
  };
}
