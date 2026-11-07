import { streamUrlResponseSchema } from '@live-transcription/contracts';
import { describe, expect, it } from 'vitest';
import type { TranscribeUrlSigner } from './ports.js';
import { createSmokeTestLambdaHandler } from './smoke-test-lambda.js';

const env = {
  ENABLE_SMOKE_TEST_SESSION_REPOSITORY: 'true',
  AWS_REGION: 'us-east-1',
  SMOKE_TEST_SESSION_ID: 'session-1',
  SMOKE_TEST_OWNER_ID: 'owner-1',
  SMOKE_TEST_LANGUAGE_CODE: 'en-US',
  STREAM_URL_EXPIRY_SECONDS: '60',
};

const signer: TranscribeUrlSigner = {
  sign: () =>
    Promise.resolve(
      'wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?X-Amz-Signature=synthetic',
    ),
};

function event(ownerId = 'owner-1') {
  return {
    requestContext: { authorizer: { jwt: { claims: { sub: ownerId, token_use: 'access' } } } },
    pathParameters: { sessionId: 'session-1' },
  };
}

describe('smoke-test Lambda composition', () => {
  it('issues schema-valid capabilities with increasing warm-process epochs', async () => {
    const handler = createSmokeTestLambdaHandler(env, {
      signer,
      clock: { now: () => new Date('2026-11-07T18:00:00Z') },
    });

    const first = await handler(event());
    const second = await handler(event());
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(streamUrlResponseSchema.parse(JSON.parse(first.body)).streamEpoch).toBe(1);
    expect(streamUrlResponseSchema.parse(JSON.parse(second.body)).streamEpoch).toBe(2);
  });

  it('preserves owner isolation', async () => {
    const handler = createSmokeTestLambdaHandler(env, { signer });
    const result = await handler(event('another-owner'));
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({
      error: { code: 'NOT_FOUND', message: 'Session not found.' },
    });
  });

  it('cannot start unless the smoke-test repository is explicitly enabled', () => {
    expect(() =>
      createSmokeTestLambdaHandler({ ...env, ENABLE_SMOKE_TEST_SESSION_REPOSITORY: 'false' }),
    ).toThrow('not enabled');
  });

  it('rejects missing or invalid configuration without echoing values', () => {
    expect(() => createSmokeTestLambdaHandler({ ...env, SMOKE_TEST_OWNER_ID: '' })).toThrow(
      'SMOKE_TEST_OWNER_ID',
    );
    expect(() =>
      createSmokeTestLambdaHandler({ ...env, STREAM_URL_EXPIRY_SECONDS: 'invalid' }),
    ).toThrow('expirySeconds');
  });
});
