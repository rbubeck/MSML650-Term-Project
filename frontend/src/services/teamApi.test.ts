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
});
