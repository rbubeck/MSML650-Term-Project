import {
  errorEnvelopeSchema,
  streamUrlResponseSchema,
  type ErrorCode,
} from '@live-transcription/contracts';
import { describe, expect, it, vi } from 'vitest';
import { validateStreamUrlConfig } from './config.js';
import type { ApiGatewayEvent, ApiGatewayResult } from './events.js';
import { ERROR_STATUS } from './responses.js';
import { createStreamUrlHandler } from './stream-url-handler.js';
import { createTranscribeUrlSigner } from './transcribe-signer.js';
import {
  FAKE_TRANSCRIBE_HOST,
  FakeRateLimiter,
  FakeSessionRepository,
  FakeSigner,
  FixedClock,
  RecordingLogger,
  type FakeSession,
} from './testing.js';

const OWNER = 'user-a';
const OTHER_USER = 'user-b';
const SESSION_ID = 'sess_1';
const START = new Date('2026-11-06T16:00:00Z');

function makeEvent(
  overrides: Partial<ApiGatewayEvent> = {},
  sub: string | null = OWNER,
): ApiGatewayEvent {
  return {
    requestContext:
      sub === null
        ? {}
        : { authorizer: { jwt: { claims: { sub, token_use: 'access', client_id: 'client' } } } },
    pathParameters: { sessionId: SESSION_ID },
    body: null,
    ...overrides,
  };
}

function setup(session: Partial<FakeSession> = {}) {
  const repository = new FakeSessionRepository();
  repository.add(SESSION_ID, {
    ownerId: OWNER,
    languageCode: 'en-US',
    state: 'CREATED',
    streamEpoch: 0,
    ...session,
  });
  const signer = new FakeSigner();
  const clock = new FixedClock(START);
  const logger = new RecordingLogger();
  const rateLimiter = new FakeRateLimiter();
  const config = validateStreamUrlConfig({ region: 'us-east-1', allowedLanguageCodes: ['en-US'] });
  const handler = createStreamUrlHandler({
    config,
    repository,
    signer,
    clock,
    logger,
    rateLimiter,
  });
  return { handler, repository, signer, clock, logger, rateLimiter };
}

function parseBody(result: ApiGatewayResult): unknown {
  return JSON.parse(result.body) as unknown;
}

function expectError(result: ApiGatewayResult, code: ErrorCode): void {
  expect(result.statusCode).toBe(ERROR_STATUS[code]);
  const parsed = errorEnvelopeSchema.parse(parseBody(result));
  expect(parsed.error.code).toBe(code);
}

describe('successful issuance', () => {
  it('returns the contract response for the owner, with no-store caching', async () => {
    const { handler, signer } = setup();

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    expect(result.headers['Cache-Control']).toBe('no-store');
    expect(result.headers['Content-Type']).toBe('application/json');
    const body = streamUrlResponseSchema.parse(parseBody(result));
    expect(body).toMatchObject({
      sessionId: SESSION_ID,
      streamEpoch: 1,
      languageCode: 'en-US',
      mediaEncoding: 'pcm',
      sampleRateHz: 16000,
      channels: 1,
      expiresAt: '2026-11-06T16:01:00Z',
    });
    expect(body.url).toContain(FAKE_TRANSCRIBE_HOST);
    expect(signer.calls).toEqual([
      { region: 'us-east-1', languageCode: 'en-US', expiresInSeconds: 60, signingDate: START },
    ]);
  });

  it('rounds the expiry down to whole seconds so it is never later than the real expiry', async () => {
    const { handler, clock } = setup();
    clock.advance(789);

    const result = await handler(makeEvent());

    expect(streamUrlResponseSchema.parse(parseBody(result)).expiresAt).toBe('2026-11-06T16:01:00Z');
  });

  it('accepts an empty, whitespace, empty-object or base64 empty-object body', async () => {
    for (const overrides of [
      { body: '' },
      { body: '   ' },
      { body: '{}' },
      { body: Buffer.from('{}').toString('base64'), isBase64Encoded: true },
    ]) {
      const { handler } = setup();
      const result = await handler(makeEvent(overrides));
      expect(result.statusCode).toBe(200);
    }
  });

  it('moves a CREATED session to STREAMING', async () => {
    const { handler, repository } = setup();
    await handler(makeEvent());
    expect(repository.sessions.get(SESSION_ID)?.state).toBe('STREAMING');
  });
});

describe('stream epochs and reconnects', () => {
  it('allocates 1, then 2, then 3, each with a freshly signed URL', async () => {
    const { handler, signer, clock } = setup();
    const responses = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      clock.advance(30_000);
      responses.push(streamUrlResponseSchema.parse(parseBody(await handler(makeEvent()))));
    }

    expect(responses.map((response) => response.streamEpoch)).toEqual([1, 2, 3]);
    expect(new Set(responses.map((response) => response.url)).size).toBe(3);
    expect(new Set(responses.map((response) => response.expiresAt)).size).toBe(3);
    expect(signer.calls).toHaveLength(3);
  });

  it('keeps issuing for a session that is already STREAMING (a reconnect)', async () => {
    const { handler } = setup({ state: 'STREAMING', streamEpoch: 4 });
    const result = await handler(makeEvent());
    expect(streamUrlResponseSchema.parse(parseBody(result)).streamEpoch).toBe(5);
  });

  it('two back-to-back requests never receive the same epoch', async () => {
    const { handler } = setup();
    const [first, second] = await Promise.all([handler(makeEvent()), handler(makeEvent())]);
    const epochs = [first, second].map(
      (result) => streamUrlResponseSchema.parse(parseBody(result)).streamEpoch,
    );
    expect(new Set(epochs).size).toBe(2);
  });
});

describe('ownership', () => {
  it('makes a foreign session indistinguishable from a missing one', async () => {
    const { handler, repository } = setup();

    const foreign = await handler(makeEvent({}, OTHER_USER));
    const missing = await handler(
      makeEvent({ pathParameters: { sessionId: 'sess_does_not_exist' } }),
    );

    expectError(foreign, 'NOT_FOUND');
    expect(foreign).toEqual(missing);
    expect(repository.sessions.get(SESSION_ID)?.streamEpoch).toBe(0);
  });

  it("never lets one user advance another user's session", async () => {
    const { handler, repository, signer } = setup();
    await handler(makeEvent({}, OTHER_USER));
    await handler(makeEvent({}, OTHER_USER));
    expect(repository.sessions.get(SESSION_ID)).toMatchObject({ streamEpoch: 0, state: 'CREATED' });
    expect(signer.calls).toHaveLength(0);
  });

  it('rejects a client-supplied user ID in the body', async () => {
    const { handler, repository } = setup();
    const result = await handler(
      makeEvent({ body: JSON.stringify({ userId: OWNER }) }, OTHER_USER),
    );
    expectError(result, 'INVALID_INPUT');
    expect(repository.sessions.get(SESSION_ID)?.streamEpoch).toBe(0);
  });

  it('does not let a userId path parameter change who the caller is', async () => {
    const { handler, repository } = setup();
    const result = await handler(
      makeEvent({ pathParameters: { sessionId: SESSION_ID, userId: OWNER } }, OTHER_USER),
    );
    expectError(result, 'NOT_FOUND');
    expect(repository.sessions.get(SESSION_ID)?.streamEpoch).toBe(0);
  });

  it('uses an injected identity resolver instead of reading claims itself', async () => {
    const { repository, signer, clock, logger } = setup();
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
      resolveIdentity: () => ({ ownerId: OWNER }),
    });
    const result = await handler({ pathParameters: { sessionId: SESSION_ID } });
    expect(result.statusCode).toBe(200);
  });
});

describe('authentication', () => {
  it('rejects a request with no claims, a missing or empty subject, or an ID token', async () => {
    const events: ApiGatewayEvent[] = [
      makeEvent({}, null),
      makeEvent({ requestContext: { authorizer: { jwt: { claims: {} } } } }),
      makeEvent({ requestContext: { authorizer: { jwt: { claims: { sub: '' } } } } }),
      makeEvent({
        requestContext: { authorizer: { jwt: { claims: { sub: OWNER, token_use: 'id' } } } },
      }),
    ];
    for (const event of events) {
      const { handler, repository, rateLimiter, signer } = setup();
      expectError(await handler(event), 'UNAUTHORIZED');
      expect(repository.sessions.get(SESSION_ID)?.streamEpoch).toBe(0);
      expect(rateLimiter.checked).toHaveLength(0);
      expect(signer.calls).toHaveLength(0);
    }
  });

  it('checks authentication before validating the request', async () => {
    const { handler } = setup();
    const result = await handler(makeEvent({ pathParameters: {}, body: 'not json' }, null));
    expectError(result, 'UNAUTHORIZED');
  });
});

describe('input validation', () => {
  it('rejects a missing, empty or oversized session ID', async () => {
    for (const pathParameters of [{}, null, { sessionId: '' }, { sessionId: 'a'.repeat(129) }]) {
      const { handler, repository } = setup();
      expectError(await handler(makeEvent({ pathParameters })), 'INVALID_INPUT');
      expect(repository.sessions.get(SESSION_ID)?.streamEpoch).toBe(0);
    }
  });

  it('rejects a body that is not valid JSON, has extra fields, or is too large', async () => {
    const bodies = [
      'not json',
      '[]',
      '"string"',
      JSON.stringify({ streamEpoch: 99 }),
      JSON.stringify({ languageCode: 'fr-FR' }),
      ' '.repeat(2000) + '{}',
      Buffer.from('{"x":1}').toString('base64'),
    ];
    for (const [index, body] of bodies.entries()) {
      const { handler, repository } = setup();
      const isBase64Encoded = index === bodies.length - 1;
      expectError(await handler(makeEvent({ body, isBase64Encoded })), 'INVALID_INPUT');
      expect(repository.sessions.get(SESSION_ID)?.streamEpoch).toBe(0);
    }
  });

  it('rejects a session whose language is not on the allowed list', async () => {
    const { handler } = setup({ languageCode: 'fr-FR' });
    const result = await handler(makeEvent());
    expectError(result, 'INVALID_INPUT');
    expect(errorEnvelopeSchema.parse(parseBody(result)).error.message).toBe(
      'The session language is not supported.',
    );
  });
});

describe('lifecycle', () => {
  it.each(['COMPLETED', 'DELETING', 'FAILED'] as const)(
    'refuses to issue a URL for a %s session',
    async (state) => {
      const { handler, repository, signer } = setup({ state, streamEpoch: 2 });
      expectError(await handler(makeEvent()), 'STATE_CONFLICT');
      expect(repository.sessions.get(SESSION_ID)).toMatchObject({ state, streamEpoch: 2 });
      expect(signer.calls).toHaveLength(0);
    },
  );
});

describe('admission control', () => {
  it('returns RATE_LIMITED without touching the repository or signer', async () => {
    const { handler, rateLimiter, repository, signer } = setup();
    rateLimiter.decision = 'RATE_LIMITED';
    expectError(await handler(makeEvent()), 'RATE_LIMITED');
    expect(rateLimiter.checked).toEqual([OWNER]);
    expect(repository.sessions.get(SESSION_ID)?.streamEpoch).toBe(0);
    expect(signer.calls).toHaveLength(0);
  });

  it('returns CAPACITY_LIMIT when the service is at capacity', async () => {
    const { handler, rateLimiter } = setup();
    rateLimiter.decision = 'CAPACITY_LIMIT';
    expectError(await handler(makeEvent()), 'CAPACITY_LIMIT');
  });
});

describe('signer failures', () => {
  const secretUrl =
    'wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?X-Amz-Signature=super-secret-signature';

  it('returns SIGNING_FAILED when the signer rejects, without leaking its message', async () => {
    const { handler, signer, logger } = setup();
    signer.nextResult = new Error(`boom ${secretUrl} AKIDEXAMPLE`);

    const result = await handler(makeEvent());

    expectError(result, 'SIGNING_FAILED');
    expect(result.body).not.toContain('super-secret-signature');
    expect(result.body).not.toContain('AKIDEXAMPLE');
    expect(JSON.stringify(logger.events)).not.toContain('super-secret-signature');
  });

  it.each([
    ['not a url'],
    ['wss://evil.example.com:8443/stream-transcription-websocket?x=1'],
    ['ws://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?x=1'],
    ['wss://transcribestreaming.us-east-1.amazonaws.com:443/stream-transcription-websocket?x=1'],
    ['wss://transcribestreaming.us-east-1.amazonaws.com:8443/elsewhere?x=super-secret-signature'],
    [''],
  ])('returns SIGNING_FAILED when the signer returns the bad URL %j', async (badUrl) => {
    const { handler, signer, logger } = setup();
    signer.nextResult = badUrl;

    const result = await handler(makeEvent());

    expectError(result, 'SIGNING_FAILED');
    if (badUrl !== '') expect(result.body).not.toContain(badUrl);
    expect(JSON.stringify(logger.events)).not.toContain('super-secret-signature');
  });
});

describe('internal failures', () => {
  it('returns INTERNAL_ERROR when storage throws, without leaking the error', async () => {
    const { handler, repository } = setup();
    repository.failWith = new Error('connection string password=hunter2');

    const result = await handler(makeEvent());

    expectError(result, 'INTERNAL_ERROR');
    expect(result.body).not.toContain('hunter2');
  });
});

describe('response safety', () => {
  it('sends no-store on every outcome, success and failure', async () => {
    const cases: ApiGatewayResult[] = [
      await setup().handler(makeEvent()),
      await setup().handler(makeEvent({}, null)),
      await setup().handler(makeEvent({ pathParameters: {} })),
      await setup().handler(makeEvent({}, OTHER_USER)),
      await setup({ state: 'COMPLETED' }).handler(makeEvent()),
    ];
    for (const result of cases) {
      expect(result.headers['Cache-Control']).toBe('no-store');
    }
  });

  it('never contains a secret-key field or value in the success body', async () => {
    const { handler } = setup();
    const result = await handler(makeEvent());
    const body = parseBody(result) as Record<string, unknown>;
    const forbidden = [
      'secretAccessKey',
      'signingKey',
      'accessKeyId',
      'sessionToken',
      'parameters',
    ];
    for (const key of forbidden) expect(body).not.toHaveProperty(key);
    expect(Object.keys(body).sort()).toEqual(
      [
        'channels',
        'expiresAt',
        'languageCode',
        'mediaEncoding',
        'sampleRateHz',
        'sessionId',
        'streamEpoch',
        'url',
      ].sort(),
    );
  });

  it('never writes the signed URL or identifiers to logs or the console', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const { handler, logger, signer } = setup();

    const success = await handler(makeEvent());
    signer.nextResult = new Error('provider failure with token=abc');
    const failure = await handler(makeEvent());
    const url = streamUrlResponseSchema.parse(parseBody(success)).url;

    const logged = JSON.stringify(logger.events);
    expect(logged).not.toContain(url);
    expect(logged).not.toContain('fake-signature');
    expect(logged).not.toContain(OWNER);
    expect(logged).not.toContain(SESSION_ID);
    expect(failure.body).not.toContain('token=abc');
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it('logs only allow-listed event names and bounded error codes', async () => {
    const { handler, logger, signer } = setup();
    await handler(makeEvent());
    await handler(makeEvent({}, null));
    signer.nextResult = new Error('x');
    await handler(makeEvent());

    expect(logger.events).toEqual([
      { event: 'stream_url_issued' },
      { event: 'stream_url_rejected', code: 'UNAUTHORIZED' },
      { event: 'stream_url_rejected', code: 'SIGNING_FAILED' },
    ]);
  });
});

describe('with the production signer (synthetic credentials, no network)', () => {
  const syntheticSecret = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';

  it('returns a contract-valid response end to end and never exposes the secret key', async () => {
    const { repository, clock, logger } = setup();
    const config = validateStreamUrlConfig({
      region: 'us-east-1',
      allowedLanguageCodes: ['en-US'],
    });
    const handler = createStreamUrlHandler({
      config,
      repository,
      clock,
      logger,
      signer: createTranscribeUrlSigner(() =>
        Promise.resolve({
          accessKeyId: 'AKIDEXAMPLE0000000000',
          secretAccessKey: syntheticSecret,
          sessionToken: 'synthetic-session-token',
        }),
      ),
    });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = streamUrlResponseSchema.parse(parseBody(result));
    expect(body.streamEpoch).toBe(1);
    expect(body.url).toContain('X-Amz-Signature=');
    expect(result.body).not.toContain(syntheticSecret);
    expect(JSON.stringify(logger.events)).not.toContain(body.url);
  });

  it('reports SIGNING_FAILED when runtime credentials are unavailable', async () => {
    const { repository, clock } = setup();
    const config = validateStreamUrlConfig({
      region: 'us-east-1',
      allowedLanguageCodes: ['en-US'],
    });
    const handler = createStreamUrlHandler({
      config,
      repository,
      clock,
      signer: createTranscribeUrlSigner(() => Promise.reject(new Error('no credentials here'))),
    });

    const result = await handler(makeEvent());

    expectError(result, 'SIGNING_FAILED');
    expect(result.body).not.toContain('no credentials here');
  });
});
