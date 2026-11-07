import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamApi } from './teamApi';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Option A API transport', () => {
  it('sends a Cognito access token only to the configured API and uses no-store', async () => {
    const mock = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [] }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = mock as typeof fetch;
    const api = new TeamApi(
      'https://example.execute-api.us-east-1.amazonaws.com',
      async () => 'test-token',
    );
    await api.listSessions();
    expect(mock).toHaveBeenCalledWith(
      'https://example.execute-api.us-east-1.amazonaws.com/v1/sessions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        cache: 'no-store',
      }),
    );
  });

  it('refuses insecure API endpoints', async () => {
    const api = new TeamApi('http://untrusted.example', async () => 'test-token');
    await expect(api.listSessions()).rejects.toThrow('HTTPS');
  });

  it('validates the stream capability and sends no client-selected stream settings', async () => {
    const capability = {
      sessionId: 'session-1',
      streamEpoch: 2,
      url: 'wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?X-Amz-Signature=test',
      expiresAt: '2026-11-07T18:01:00Z',
      languageCode: 'en-US',
      mediaEncoding: 'pcm',
      sampleRateHz: 16_000,
      channels: 1,
    };
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify(capability), {
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = mock as typeof fetch;
    const api = new TeamApi('https://api.example', async () => 'test-token');

    await expect(api.requestStreamCapability('session-1')).resolves.toEqual(capability);
    expect(mock).toHaveBeenCalledWith(
      'https://api.example/v1/sessions/session-1/stream-url',
      expect.objectContaining({ method: 'POST', cache: 'no-store' }),
    );
    const request = mock.mock.calls[0]?.[1];
    expect(request?.body).toBeUndefined();
  });

  it('rejects a malformed or mismatched stream capability without exposing its URL', async () => {
    const sensitiveUrl =
      'wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?X-Amz-Signature=sensitive';
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ sessionId: 'another-session', url: sensitiveUrl }), {
          headers: { 'content-type': 'application/json' },
        }),
    ) as typeof fetch;
    const api = new TeamApi('https://api.example', async () => 'test-token');

    const error = await api.requestStreamCapability('session-1').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toBe('Error: The stream authorization response was invalid.');
    expect(String(error)).not.toContain(sensitiveUrl);
  });
});
