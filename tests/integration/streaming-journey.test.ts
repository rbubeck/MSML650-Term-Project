import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  encodeEventStreamMessage,
  TranscribeStreamClient,
} from '@live-transcription/stream-client';

import { validateStreamUrlConfig } from '../../backend/api/src/config';
import type { ApiGatewayEvent, ApiGatewayResult } from '../../backend/api/src/http/events';
import { createStreamUrlHandler } from '../../backend/api/src/routes/stream-url';
import {
  FakeSessionRepository,
  FakeSigner,
  FixedClock,
  RecordingLogger,
  FakeRateLimiter,
} from '../../backend/api/src/testing/fakes';

import { TeamApi } from '../../frontend/src/services/teamApi';
import { DirectStreamAdapter } from '../../frontend/src/services/directStreamAdapter';
import { FakeTranscribeSocket } from '../../frontend/src/services/fakeTranscribeSocket';
import type { LiveCaptionEvent } from '../../frontend/src/services/streamPort';

const API_URL = 'https://api.integration.example';
const OWNER = 'integration-user-a';
const OTHER_USER = 'integration-user-b';
const SESSION_ID = 'integration-session-1';
const OTHER_SESSION_ID = 'integration-session-2';

const OWNER_TOKEN = 'synthetic-access-token-a';
const OTHER_TOKEN = 'synthetic-access-token-b';

const START = new Date('2026-11-06T16:00:00Z');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Connect the real frontend API client to the real backend
 * handler using deterministic, local-only dependencies.
 */
function setup() {
  const repository = new FakeSessionRepository();

  repository.add(SESSION_ID, {
    ownerId: OWNER,
    languageCode: 'en-US',
    state: 'CREATED',
    streamEpoch: 0,
  });

  repository.add(OTHER_SESSION_ID, {
    ownerId: OTHER_USER,
    languageCode: 'en-US',
    state: 'CREATED',
    streamEpoch: 0,
  });

  const signer = new FakeSigner();
  const clock = new FixedClock(START);
  const logger = new RecordingLogger();
  const rateLimiter = new FakeRateLimiter();

  const config = validateStreamUrlConfig({
    region: 'us-east-1',
    allowedLanguageCodes: ['en-US'],
  });

  const handler = createStreamUrlHandler({
    config,
    repository,
    signer,
    clock,
    logger,
    rateLimiter,
  });

  const responses: ApiGatewayResult[] = [];

  const identities = new Map([
    [`Bearer ${OWNER_TOKEN}`, OWNER],
    [`Bearer ${OTHER_TOKEN}`, OTHER_USER],
  ]);

  /**
   * Simulates the HTTP/API Gateway boundary.
   * Only the implemented stream-url route is supported.
   * No real network requests are allowed.
   */
  const fetchBridge = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);
      const url = new URL(request.url);

      if (url.origin !== API_URL) {
        throw new Error('Unexpected integration API origin.');
      }

      const route = /^\/v1\/sessions\/([^/]+)\/stream-url$/.exec(url.pathname);

      if (request.method !== 'POST' || !route?.[1]) {
        throw new Error('Unexpected integration API route.');
      }

      const authorization = request.headers.get('authorization') ?? '';

      const ownerId = identities.get(authorization);

      const event: ApiGatewayEvent = {
        requestContext:
          ownerId === undefined
            ? {}
            : {
                authorizer: {
                  jwt: {
                    claims: {
                      sub: ownerId,
                      token_use: 'access',
                      client_id: 'integration-client',
                    },
                  },
                },
              },
        pathParameters: {
          sessionId: decodeURIComponent(route[1]),
        },
        body: request.body === null ? null : await request.text(),
      };

      const result = await handler(event);
      responses.push(result);

      return new Response(result.body, {
        status: result.statusCode,
        headers: result.headers,
      });
    },
  );

  vi.stubGlobal('fetch', fetchBridge);

  const ownerApi = new TeamApi(API_URL, async () => OWNER_TOKEN);

  const otherApi = new TeamApi(API_URL, async () => OTHER_TOKEN);

  const unauthenticatedApi = new TeamApi(API_URL, async () => '');

  return {
    repository,
    signer,
    clock,
    logger,
    rateLimiter,
    responses,
    fetchBridge,
    ownerApi,
    otherApi,
    unauthenticatedApi,
  };
}

describe('Option A cross-package streaming integration', () => {
  it('INT-001: issues a valid capability through the real frontend and backend', async () => {
    const test = setup();

    const capability = await test.ownerApi.requestStreamCapability(SESSION_ID);

    expect(capability).toMatchObject({
      sessionId: SESSION_ID,
      streamEpoch: 1,
      languageCode: 'en-US',
      mediaEncoding: 'pcm',
      sampleRateHz: 16_000,
      channels: 1,
      expiresAt: '2026-11-06T16:01:00Z',
    });

    expect(capability.url).toContain('fake-signature-1');

    expect(test.repository.sessions.get(SESSION_ID)).toMatchObject({
      ownerId: OWNER,
      state: 'STREAMING',
      streamEpoch: 1,
    });

    expect(test.signer.calls).toHaveLength(1);
    expect(test.rateLimiter.checked).toEqual([OWNER]);

    expect(test.responses[0]?.statusCode).toBe(200);
    expect(test.responses[0]?.headers['Cache-Control']).toBe('no-store');

    expect(test.fetchBridge).toHaveBeenCalledWith(
      `${API_URL}/v1/sessions/${SESSION_ID}/stream-url`,
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.objectContaining({
          Authorization: `Bearer ${OWNER_TOKEN}`,
        }),
      }),
    );

    expect(test.logger.events).toEqual([{ event: 'stream_url_issued' }]);
  });

  it('INT-002: isolates sessions belonging to two different users', async () => {
    const test = setup();

    await expect(test.otherApi.requestStreamCapability(SESSION_ID)).rejects.toThrow(
      'API request failed (404).',
    );

    await expect(test.ownerApi.requestStreamCapability(OTHER_SESSION_ID)).rejects.toThrow(
      'API request failed (404).',
    );

    await expect(test.otherApi.requestStreamCapability('missing-session')).rejects.toThrow(
      'API request failed (404).',
    );

    expect(test.responses[0]).toEqual(test.responses[1]);
    expect(test.responses[0]).toEqual(test.responses[2]);

    expect(test.signer.calls).toHaveLength(0);

    expect(test.repository.sessions.get(SESSION_ID)).toMatchObject({
      state: 'CREATED',
      streamEpoch: 0,
    });

    expect(test.repository.sessions.get(OTHER_SESSION_ID)).toMatchObject({
      state: 'CREATED',
      streamEpoch: 0,
    });

    const ownerCapability = await test.ownerApi.requestStreamCapability(SESSION_ID);

    const otherCapability = await test.otherApi.requestStreamCapability(OTHER_SESSION_ID);

    expect(ownerCapability.sessionId).toBe(SESSION_ID);
    expect(otherCapability.sessionId).toBe(OTHER_SESSION_ID);

    expect(ownerCapability.streamEpoch).toBe(1);
    expect(otherCapability.streamEpoch).toBe(1);

    expect(ownerCapability.url).not.toBe(otherCapability.url);
    expect(test.signer.calls).toHaveLength(2);
  });

  it('INT-003: rejects missing authentication before signing', async () => {
    const test = setup();

    await expect(test.unauthenticatedApi.requestStreamCapability(SESSION_ID)).rejects.toThrow(
      'API request failed (401).',
    );

    expect(test.responses[0]?.statusCode).toBe(401);

    expect(test.signer.calls).toHaveLength(0);
    expect(test.rateLimiter.checked).toHaveLength(0);

    expect(test.repository.sessions.get(SESSION_ID)).toMatchObject({
      state: 'CREATED',
      streamEpoch: 0,
    });

    expect(test.logger.events).toEqual([
      {
        event: 'stream_url_rejected',
        code: 'UNAUTHORIZED',
      },
    ]);
  });

  it('INT-004: propagates signing failures without exposing sensitive details', async () => {
    const test = setup();

    const sensitiveMarker = 'synthetic-secret-signature';

    test.signer.nextResult = new Error(`Provider signing failed: ${sensitiveMarker}`);

    const failure = await test.ownerApi
      .requestStreamCapability(SESSION_ID)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toMatch(/^Error: API request failed \(\d{3}\)\.$/);

    expect(String(failure)).not.toContain(sensitiveMarker);

    expect(test.responses).toHaveLength(1);
    expect(test.responses[0]?.statusCode).toBeGreaterThanOrEqual(400);

    expect(test.responses[0]?.body).not.toContain(sensitiveMarker);

    expect(JSON.parse(test.responses[0]!.body)).toMatchObject({
      error: {
        code: 'SIGNING_FAILED',
      },
    });

    expect(JSON.stringify(test.logger.events)).not.toContain(sensitiveMarker);

    expect(test.logger.events).toEqual([
      {
        event: 'stream_url_rejected',
        code: 'SIGNING_FAILED',
      },
    ]);

    expect(test.signer.calls).toHaveLength(1);

    // The failed signing attempt consumes an epoch.
    // A later successful request must not reuse it.
    expect(test.repository.sessions.get(SESSION_ID)?.streamEpoch).toBe(1);

    test.signer.nextResult = null;

    const retry = await test.ownerApi.requestStreamCapability(SESSION_ID);

    expect(retry.streamEpoch).toBe(2);
    expect(test.signer.calls).toHaveLength(2);
  });

  it('INT-006: streams synthetic PCM through the complete available local pipeline', async () => {
    const test = setup();

    const captions: LiveCaptionEvent[] = [];
    const onFailure = vi.fn();
    const onDisconnected = vi.fn();

    const openedUrls: string[] = [];
    const sockets: FakeTranscribeSocket[] = [];

    const captureStarted = vi.fn();
    const captureStopped = vi.fn();

    const adapter = new DirectStreamAdapter({
      requestCapability: (sessionId) => test.ownerApi.requestStreamCapability(sessionId),

      createTransport: (handlers) =>
        new TranscribeStreamClient(handlers, {
          webSocketFactory: (url) => {
            openedUrls.push(url);

            const socket = new FakeTranscribeSocket();
            sockets.push(socket);

            return socket;
          },
        }),

      createCapture: (onChunk) => ({
        async start() {
          captureStarted();

          for (let frame = 0; frame < 10; frame += 1) {
            const pcm = new ArrayBuffer(3_200);

            new Uint8Array(pcm).fill(1);

            onChunk({
              pcm,
              sequence: frame,
              startSample: frame * 1_600,
              validSamples: 1_600,
              final: false,
            });
          }
        },

        async stop() {
          captureStopped();
        },
      }),
    });

    try {
      await adapter.start(SESSION_ID, {
        onCaption: (caption) => captions.push(caption),
        onFailure,
        onDisconnected,
      });

      await vi.waitFor(() => {
        expect(captions).toHaveLength(2);
      });

      expect(test.fetchBridge).toHaveBeenCalledTimes(1);
      expect(test.signer.calls).toHaveLength(1);

      expect(openedUrls).toHaveLength(1);
      expect(openedUrls[0]).toContain('fake-signature-1');

      expect(captureStarted).toHaveBeenCalledOnce();

      expect(captions).toEqual([
        {
          streamEpoch: 1,
          resultId: 'local-fake-1',
          text: 'Microphone PCM reached the local stream…',
          startMs: 0,
          endMs: 1_000,
          phase: 'partial',
        },
        {
          streamEpoch: 1,
          resultId: 'local-fake-1',
          text: 'Microphone PCM reached the local stream client.',
          startMs: 0,
          endMs: 1_000,
          phase: 'final-observed',
        },
      ]);

      expect(test.repository.sessions.get(SESSION_ID)).toMatchObject({
        state: 'STREAMING',
        streamEpoch: 1,
      });

      expect(onFailure).not.toHaveBeenCalled();
      expect(onDisconnected).not.toHaveBeenCalled();
    } finally {
      await adapter.stop();
    }

    expect(captureStopped).toHaveBeenCalledOnce();
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.readyState).toBe(3);

    expect(onFailure).not.toHaveBeenCalled();
    expect(onDisconnected).not.toHaveBeenCalled();

    // The stream was stopped, but durable session completion
    // is not implemented and must not be claimed here.
    expect(test.repository.sessions.get(SESSION_ID)?.state).toBe('STREAMING');
  });
});

/**
 * Creates a valid provider transcript frame for reconnect
 * and stale-message integration testing.
 */
function createTranscriptFrame(resultId: string, text: string): Uint8Array {
  return encodeEventStreamMessage({
    headers: {
      ':content-type': {
        type: 'string',
        value: 'application/json',
      },
      ':event-type': {
        type: 'string',
        value: 'TranscriptEvent',
      },
      ':message-type': {
        type: 'string',
        value: 'event',
      },
    },
    payload: new TextEncoder().encode(
      JSON.stringify({
        Transcript: {
          Results: [
            {
              ResultId: resultId,
              IsPartial: false,
              StartTime: 0,
              EndTime: 1,
              Alternatives: [{ Transcript: text }],
            },
          ],
        },
      }),
    ),
  });
}

/**
 * Creates a provider exception containing synthetic sensitive
 * information that must never appear in user-facing errors.
 */
function createProviderExceptionFrame(sensitiveMarker: string): Uint8Array {
  return encodeEventStreamMessage({
    headers: {
      ':content-type': {
        type: 'string',
        value: 'application/json',
      },
      ':exception-type': {
        type: 'string',
        value: 'LimitExceededException',
      },
      ':message-type': {
        type: 'string',
        value: 'exception',
      },
    },
    payload: new TextEncoder().encode(
      JSON.stringify({
        Message: sensitiveMarker,
      }),
    ),
  });
}

/**
 * Extends the existing local provider simulation with
 * controlled server-side message injection.
 */
class ControlledTranscribeSocket extends FakeTranscribeSocket {
  receive(frame: Uint8Array): void {
    this.onmessage?.(
      new MessageEvent('message', {
        data: frame.slice().buffer,
      }),
    );
  }

  serverDisconnect(): void {
    this.close();
  }
}

/**
 * Reuses the real API handler, frontend client, adapter,
 * stream client, and EventStream protocol.
 *
 * Only HTTP transport, provider sockets, signing,
 * repository storage, and audio capture are simulated.
 */
function setupStreamingJourney(identity: 'owner' | 'other' | 'unauthenticated' = 'owner') {
  const backend = setup();

  const api =
    identity === 'owner'
      ? backend.ownerApi
      : identity === 'other'
        ? backend.otherApi
        : backend.unauthenticatedApi;

  const captions: LiveCaptionEvent[] = [];
  const sockets: ControlledTranscribeSocket[] = [];
  const clients: TranscribeStreamClient[] = [];
  const openedUrls: string[] = [];

  const captureStarted = vi.fn();
  const captureStopped = vi.fn();
  const onFailure = vi.fn();
  const onDisconnected = vi.fn();

  const adapter = new DirectStreamAdapter({
    requestCapability: (sessionId) => api.requestStreamCapability(sessionId),

    createTransport: (handlers) => {
      const client = new TranscribeStreamClient(handlers, {
        webSocketFactory: (url) => {
          openedUrls.push(url);

          const socket = new ControlledTranscribeSocket();
          sockets.push(socket);

          return socket;
        },
      });

      clients.push(client);

      return client;
    },

    createCapture: (onChunk) => ({
      async start() {
        captureStarted();

        for (let frame = 0; frame < 10; frame += 1) {
          const pcm = new ArrayBuffer(3_200);
          new Uint8Array(pcm).fill(1);

          onChunk({
            pcm,
            sequence: frame,
            startSample: frame * 1_600,
            validSamples: 1_600,
            final: false,
          });
        }
      },

      async stop() {
        captureStopped();
      },
    }),
  });

  const handlers = {
    onCaption: (caption: LiveCaptionEvent) => captions.push(caption),
    onFailure,
    onDisconnected,
  };

  return {
    ...backend,
    adapter,
    handlers,
    captions,
    sockets,
    clients,
    openedUrls,
    captureStarted,
    captureStopped,
    onFailure,
    onDisconnected,
  };
}

describe('Option A streaming failure and recovery integration', () => {
  it('INT-005: issues fresh capabilities with increasing stream epochs', async () => {
    const test = setup();

    const first = await test.ownerApi.requestStreamCapability(SESSION_ID);

    const second = await test.ownerApi.requestStreamCapability(SESSION_ID);

    const third = await test.ownerApi.requestStreamCapability(SESSION_ID);

    expect([first.streamEpoch, second.streamEpoch, third.streamEpoch]).toEqual([1, 2, 3]);

    expect(new Set([first.url, second.url, third.url]).size).toBe(3);

    expect(first.sessionId).toBe(SESSION_ID);
    expect(second.sessionId).toBe(SESSION_ID);
    expect(third.sessionId).toBe(SESSION_ID);

    expect(test.signer.calls).toHaveLength(3);
    expect(test.fetchBridge).toHaveBeenCalledTimes(3);

    expect(test.repository.sessions.get(SESSION_ID)).toMatchObject({
      state: 'STREAMING',
      streamEpoch: 3,
    });
  });

  it('INT-007: handles provider exceptions and releases capture resources', async () => {
    const test = setupStreamingJourney();

    try {
      await test.adapter.start(SESSION_ID, test.handlers);

      await vi.waitFor(() => {
        expect(test.captions).toHaveLength(2);
      });

      expect(test.captureStarted).toHaveBeenCalledOnce();
      expect(test.clients[0]?.state).toBe('open');

      test.sockets[0]!.receive(
        createProviderExceptionFrame('synthetic-private-provider-diagnostics'),
      );

      await vi.waitFor(() => {
        expect(test.captureStopped).toHaveBeenCalledOnce();
        expect(test.clients[0]?.state).toBe('closed');
      });

      expect(test.onFailure).toHaveBeenCalledExactlyOnceWith(
        'The transcription service capacity limit was reached.',
      );

      expect(test.sockets[0]?.readyState).toBe(3);
      expect(test.clients[0]?.queuedAudioBytes).toBe(0);

      expect(test.captions).toHaveLength(2);
      expect(test.signer.calls).toHaveLength(1);

      // Failure must not falsely complete the logical session.
      expect(test.repository.sessions.get(SESSION_ID)?.state).toBe('STREAMING');
    } finally {
      await test.adapter.stop();
    }

    expect(test.captureStopped).toHaveBeenCalledOnce();
  });

  it('INT-008: reconnects after an unexpected disconnect using a fresh capability', async () => {
    const test = setupStreamingJourney();

    try {
      await test.adapter.start(SESSION_ID, test.handlers);

      await vi.waitFor(() => {
        expect(test.captions).toHaveLength(2);
      });

      expect(test.clients[0]?.streamEpoch).toBe(1);

      test.sockets[0]!.serverDisconnect();

      await vi.waitFor(() => {
        expect(test.captureStopped).toHaveBeenCalledOnce();
        expect(test.clients[0]?.state).toBe('closed');
      });

      expect(test.onFailure).toHaveBeenCalledExactlyOnceWith(
        'The transcription connection was interrupted.',
      );

      // Allow asynchronous adapter cleanup to settle.
      await Promise.resolve();

      // Explicit restart of the same logical session.
      await test.adapter.start(SESSION_ID, test.handlers);

      await vi.waitFor(() => {
        expect(test.captions).toHaveLength(4);
      });

      expect(test.sockets).toHaveLength(2);
      expect(test.clients).toHaveLength(2);
      expect(test.signer.calls).toHaveLength(2);
      expect(test.fetchBridge).toHaveBeenCalledTimes(2);

      expect(test.openedUrls[0]).not.toBe(test.openedUrls[1]);

      expect(test.clients[1]?.streamEpoch).toBe(2);
      expect(test.clients[1]?.state).toBe('open');

      expect(test.captions.map((caption) => caption.streamEpoch)).toEqual([1, 1, 2, 2]);

      expect(test.captions.map((caption) => caption.phase)).toEqual([
        'partial',
        'final-observed',
        'partial',
        'final-observed',
      ]);

      expect(test.repository.sessions.get(SESSION_ID)).toMatchObject({
        state: 'STREAMING',
        streamEpoch: 2,
      });

      expect(test.captureStarted).toHaveBeenCalledTimes(2);
    } finally {
      await test.adapter.stop();
    }

    expect(test.captureStopped).toHaveBeenCalledTimes(2);
    expect(test.sockets[0]?.readyState).toBe(3);
    expect(test.sockets[1]?.readyState).toBe(3);
    expect(test.onFailure).toHaveBeenCalledTimes(1);
  });

  it('INT-009: excludes sensitive provider and authorization details from errors and backend logs', async () => {
    const test = setupStreamingJourney();

    const sensitiveMarker = 'synthetic-confidential-provider-response';

    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await test.adapter.start(SESSION_ID, test.handlers);

      await vi.waitFor(() => {
        expect(test.captions).toHaveLength(2);
      });

      test.sockets[0]!.receive(createProviderExceptionFrame(sensitiveMarker));

      await vi.waitFor(() => {
        expect(test.captureStopped).toHaveBeenCalledOnce();
      });

      expect(test.onFailure).toHaveBeenCalledOnce();

      expect(test.logger.events).toEqual([{ event: 'stream_url_issued' }]);

      const observedDiagnostics = JSON.stringify({
        backendLogs: test.logger.events,
        userFacingFailures: test.onFailure.mock.calls,
        consoleLogs: consoleLog.mock.calls,
        consoleErrors: consoleError.mock.calls,
        consoleWarnings: consoleWarn.mock.calls,
      });

      expect(observedDiagnostics).not.toContain(sensitiveMarker);

      expect(observedDiagnostics).not.toContain(OWNER_TOKEN);
      expect(observedDiagnostics).not.toContain(OTHER_TOKEN);
      expect(observedDiagnostics).not.toContain(OWNER);
      expect(observedDiagnostics).not.toContain(SESSION_ID);

      expect(observedDiagnostics).not.toContain('fake-signature-1');

      expect(observedDiagnostics).not.toContain(test.openedUrls[0]!);

      expect(observedDiagnostics).not.toContain('Microphone PCM reached the local stream client.');
    } finally {
      await test.adapter.stop();
    }
  });

  it('INT-010: rejects corrupted EventStream frames and cleans up the stream', async () => {
    const test = setupStreamingJourney();

    try {
      await test.adapter.start(SESSION_ID, test.handlers);

      await vi.waitFor(() => {
        expect(test.captions).toHaveLength(2);
      });

      const corruptFrame = createTranscriptFrame(
        'corrupted-result',
        'synthetic-private-transcript',
      );

      // Corrupt the EventStream prelude CRC.
      corruptFrame[8] = corruptFrame[8]! ^ 0xff;

      test.sockets[0]!.receive(corruptFrame);

      await vi.waitFor(() => {
        expect(test.captureStopped).toHaveBeenCalledOnce();
        expect(test.clients[0]?.state).toBe('closed');
      });

      expect(test.onFailure).toHaveBeenCalledExactlyOnceWith(
        'The transcription service returned an invalid message.',
      );

      expect(JSON.stringify(test.onFailure.mock.calls)).not.toContain(
        'synthetic-private-transcript',
      );

      expect(test.sockets[0]?.readyState).toBe(3);
      expect(test.clients[0]?.queuedAudioBytes).toBe(0);

      expect(test.captions).toHaveLength(2);

      expect(test.captions.some((caption) => caption.resultId === 'corrupted-result')).toBe(false);
    } finally {
      await test.adapter.stop();
    }
  });

  it('INT-012: prevents provider connection and capture when authorization is rejected', async () => {
    const test = setupStreamingJourney('other');

    try {
      await expect(test.adapter.start(SESSION_ID, test.handlers)).rejects.toThrow(
        'API request failed (404).',
      );

      expect(test.fetchBridge).toHaveBeenCalledOnce();
      expect(test.responses[0]?.statusCode).toBe(404);

      expect(test.signer.calls).toHaveLength(0);

      expect(test.sockets).toHaveLength(0);
      expect(test.openedUrls).toHaveLength(0);

      expect(test.captureStarted).not.toHaveBeenCalled();
      expect(test.captureStopped).not.toHaveBeenCalled();

      expect(test.captions).toHaveLength(0);

      expect(test.repository.sessions.get(SESSION_ID)).toMatchObject({
        state: 'CREATED',
        streamEpoch: 0,
      });
    } finally {
      await test.adapter.stop();
    }
  });

  it('INT-013: ignores stale provider messages after reconnecting', async () => {
    const test = setupStreamingJourney();

    try {
      await test.adapter.start(SESSION_ID, test.handlers);

      await vi.waitFor(() => {
        expect(test.captions).toHaveLength(2);
      });

      const firstSocket = test.sockets[0]!;

      firstSocket.serverDisconnect();

      await vi.waitFor(() => {
        expect(test.captureStopped).toHaveBeenCalledOnce();
        expect(test.clients[0]?.state).toBe('closed');
      });

      await Promise.resolve();

      await test.adapter.start(SESSION_ID, test.handlers);

      await vi.waitFor(() => {
        expect(test.captions).toHaveLength(4);
      });

      const secondSocket = test.sockets[1]!;

      firstSocket.receive(
        createTranscriptFrame('stale-result', 'This belongs to the previous stream.'),
      );

      secondSocket.receive(
        createTranscriptFrame('current-result', 'This belongs to the current stream.'),
      );

      await vi.waitFor(() => {
        expect(test.captions).toHaveLength(5);
      });

      expect(test.captions.some((caption) => caption.resultId === 'stale-result')).toBe(false);

      expect(test.captions.at(-1)).toEqual({
        streamEpoch: 2,
        resultId: 'current-result',
        text: 'This belongs to the current stream.',
        startMs: 0,
        endMs: 1_000,
        phase: 'final-observed',
      });

      expect(test.signer.calls).toHaveLength(2);
      expect(test.clients[0]?.state).toBe('closed');
      expect(test.clients[1]?.state).toBe('open');
    } finally {
      await test.adapter.stop();
    }

    expect(test.captureStopped).toHaveBeenCalledTimes(2);
  });
});

describe('Option A repository failure integration', () => {
  it('INT-011: rejects repository failures safely and recovers without consuming an epoch', async () => {
    const test = setupStreamingJourney();

    const sensitiveMarker = 'synthetic-private-repository-diagnostics';

    test.repository.failWith = new Error(`Repository unavailable: ${sensitiveMarker}`);

    try {
      const failure = await test.adapter
        .start(SESSION_ID, test.handlers)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toBe('Error: API request failed (500).');

      expect(String(failure)).not.toContain(sensitiveMarker);

      expect(test.responses).toHaveLength(1);
      expect(test.responses[0]?.statusCode).toBe(500);

      expect(JSON.parse(test.responses[0]!.body)).toMatchObject({
        error: {
          code: 'INTERNAL_ERROR',
        },
      });

      expect(test.responses[0]?.body).not.toContain(sensitiveMarker);

      expect(test.logger.events).toEqual([
        {
          event: 'stream_url_rejected',
          code: 'INTERNAL_ERROR',
        },
      ]);

      expect(JSON.stringify(test.logger.events)).not.toContain(sensitiveMarker);

      // Repository allocation failed before signing.
      expect(test.signer.calls).toHaveLength(0);
      expect(test.sockets).toHaveLength(0);
      expect(test.openedUrls).toHaveLength(0);

      expect(test.captureStarted).not.toHaveBeenCalled();
      expect(test.captureStopped).not.toHaveBeenCalled();
      expect(test.captions).toHaveLength(0);

      expect(test.repository.sessions.get(SESSION_ID)).toMatchObject({
        state: 'CREATED',
        streamEpoch: 0,
      });

      // Simulate repository recovery.
      test.repository.failWith = null;

      // Retry through the same frontend adapter.
      await test.adapter.start(SESSION_ID, test.handlers);

      await vi.waitFor(() => {
        expect(test.captions).toHaveLength(2);
      });

      expect(test.fetchBridge).toHaveBeenCalledTimes(2);
      expect(test.signer.calls).toHaveLength(1);

      expect(test.responses.map((response) => response.statusCode)).toEqual([500, 200]);

      expect(test.sockets).toHaveLength(1);
      expect(test.captureStarted).toHaveBeenCalledOnce();

      expect(test.repository.sessions.get(SESSION_ID)).toMatchObject({
        state: 'STREAMING',
        streamEpoch: 1,
      });

      expect(test.captions.map((caption) => caption.streamEpoch)).toEqual([1, 1]);

      expect(test.captions.map((caption) => caption.phase)).toEqual(['partial', 'final-observed']);

      expect(test.logger.events).toEqual([
        {
          event: 'stream_url_rejected',
          code: 'INTERNAL_ERROR',
        },
        {
          event: 'stream_url_issued',
        },
      ]);
    } finally {
      await test.adapter.stop();
    }

    expect(test.captureStopped).toHaveBeenCalledOnce();
    expect(test.sockets[0]?.readyState).toBe(3);
    expect(test.clients.at(-1)?.state).toBe('closed');
  });
});
