import { languageCodeSchema, sessionIdSchema } from '@live-transcription/contracts';
import { createTranscribeUrlSigner, lambdaRuntimeCredentials } from './aws/transcribe-signer.js';
import { validateStreamUrlConfig } from './config.js';
import type { ApiGatewayEvent, ApiGatewayResult } from './http/events.js';
import { SingleSessionRepository } from './integration/single-session-repository.js';
import type { Clock, TranscribeUrlSigner } from './ports.js';
import { createStreamUrlHandler, type StreamUrlHandler } from './routes/stream-url.js';

type Environment = Readonly<Record<string, string | undefined>>;

export interface SmokeTestLambdaOverrides {
  readonly signer?: TranscribeUrlSigner;
  readonly clock?: Clock;
}

function required(env: Environment, name: string): string {
  const value = env[name];
  if (!value || value.trim() !== value) {
    throw new Error(`Invalid smoke-test Lambda configuration: ${name}.`);
  }
  return value;
}

/**
 * Compose the real signer/handler with a deliberately non-durable repository.
 * The explicit feature flag prevents accidental use as a production repository.
 */
export function createSmokeTestLambdaHandler(
  env: Environment,
  overrides: SmokeTestLambdaOverrides = {},
): StreamUrlHandler {
  if (env['ENABLE_SMOKE_TEST_SESSION_REPOSITORY'] !== 'true') {
    throw new Error('The smoke-test session repository is not enabled.');
  }

  const sessionId = required(env, 'SMOKE_TEST_SESSION_ID');
  const ownerId = required(env, 'SMOKE_TEST_OWNER_ID');
  const languageCode = required(env, 'SMOKE_TEST_LANGUAGE_CODE');
  if (!sessionIdSchema.safeParse(sessionId).success) {
    throw new Error('Invalid smoke-test Lambda configuration: SMOKE_TEST_SESSION_ID.');
  }
  if (ownerId.length > 128) {
    throw new Error('Invalid smoke-test Lambda configuration: SMOKE_TEST_OWNER_ID.');
  }
  if (!languageCodeSchema.safeParse(languageCode).success) {
    throw new Error('Invalid smoke-test Lambda configuration: SMOKE_TEST_LANGUAGE_CODE.');
  }

  const rawExpiry = env['STREAM_URL_EXPIRY_SECONDS'];
  const config = validateStreamUrlConfig({
    region: required(env, 'AWS_REGION'),
    ...(rawExpiry === undefined ? {} : { expirySeconds: Number(rawExpiry) }),
    allowedLanguageCodes: [languageCode],
  });
  const repository = new SingleSessionRepository({ sessionId, ownerId, languageCode });
  const signer = overrides.signer ?? createTranscribeUrlSigner(lambdaRuntimeCredentials(env));
  const clock = overrides.clock ?? { now: () => new Date() };

  return createStreamUrlHandler({ config, repository, signer, clock });
}

let cachedHandler: StreamUrlHandler | undefined;

/** API Gateway HTTP API payload-v2 Lambda handler for the approved smoke test only. */
export function handler(event: ApiGatewayEvent): Promise<ApiGatewayResult> {
  cachedHandler ??= createSmokeTestLambdaHandler(process.env);
  return cachedHandler(event);
}
