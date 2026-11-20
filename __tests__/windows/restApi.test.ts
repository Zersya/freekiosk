/**
 * Tests for Windows REST API and command execution.
 */

import { executeCommand, getCommandHandler, getAllCommands, isValidCommand } from '../../src/platform/windows/commands/executeCommand';
import { handleRestRequest } from '../../src/platform/windows/rest/restApi';
import { HttpRequest } from '../../src/platform/windows/rest/httpParser';

describe('executeCommand', () => {
  it('executes brightness command', async () => {
    const result = await executeCommand('/api/brightness', { level: 75 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ brightness: 75 });
  });

  it('executes volume command', async () => {
    const result = await executeCommand('/api/volume', { level: 50 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ volume: 50 });
  });

  it('executes screen command', async () => {
    const result = await executeCommand('/api/screen', { on: false });
    expect(result.success).toBe(true);
  });

  it('executes kiosk command', async () => {
    const result = await executeCommand('/api/kiosk', { enabled: true });
    expect(result.success).toBe(true);
  });

  it('returns error for unknown command', async () => {
    const result = await executeCommand('/api/unknown', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown command');
  });

  it('clamps brightness to valid range', async () => {
    const result = await executeCommand('/api/brightness', { level: 150 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ brightness: 100 });
  });

  it('clamps volume to valid range', async () => {
    const result = await executeCommand('/api/volume', { level: -10 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ volume: 0 });
  });
});

describe('command registry', () => {
  it('returns handler for valid command', () => {
    const handler = getCommandHandler('/api/brightness');
    expect(handler).toBeDefined();
    expect(handler?.execute).toBeDefined();
  });

  it('returns undefined for invalid command', () => {
    const handler = getCommandHandler('/api/unknown');
    expect(handler).toBeUndefined();
  });

  it('lists all commands', () => {
    const commands = getAllCommands();
    expect(commands).toContain('/api/brightness');
    expect(commands).toContain('/api/volume');
    expect(commands).toContain('/api/screen');
    expect(commands.length).toBeGreaterThan(0);
  });

  it('validates command existence', () => {
    expect(isValidCommand('/api/brightness')).toBe(true);
    expect(isValidCommand('/api/unknown')).toBe(false);
  });
});

describe('handleRestRequest', () => {
  function createRequest(method: string, path: string, body = ''): HttpRequest {
    return {
      method,
      path,
      query: {},
      headers: {},
      body,
      raw: `${method} ${path} HTTP/1.1\r\n\r\n${body}`,
    };
  }

  it('handles GET /api/health', async () => {
    const req = createRequest('GET', '/api/health');
    const resp = await handleRestRequest(req);

    expect(resp.status).toBe(200);
    expect(resp.body).toContain('ok');
  });

  it('handles GET /api/status', async () => {
    const req = createRequest('GET', '/api/status');
    const resp = await handleRestRequest(req);

    expect(resp.status).toBe(200);
    const data = JSON.parse(resp.body);
    expect(data.platform).toBe('windows');
  });

  it('handles POST /api/brightness', async () => {
    const req = createRequest('POST', '/api/brightness', '{"level": 80}');
    const resp = await handleRestRequest(req);

    expect(resp.status).toBe(200);
    const data = JSON.parse(resp.body);
    expect(data.brightness).toBe(80);
  });

  it('handles POST /api/volume', async () => {
    const req = createRequest('POST', '/api/volume', '{"level": 30}');
    const resp = await handleRestRequest(req);

    expect(resp.status).toBe(200);
    const data = JSON.parse(resp.body);
    expect(data.volume).toBe(30);
  });

  it('returns 404 for unknown endpoint', async () => {
    const req = createRequest('GET', '/api/unknown');
    const resp = await handleRestRequest(req);

    expect(resp.status).toBe(404);
  });

  it('returns 405 for wrong method', async () => {
    const req = createRequest('DELETE', '/api/health');
    const resp = await handleRestRequest(req);

    expect(resp.status).toBe(405);
  });
});
