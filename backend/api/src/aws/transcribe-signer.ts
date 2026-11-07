import { Sha256 } from '@aws-crypto/sha256-js';
import {
  AUDIO_SAMPLE_RATE_HZ,
  STREAM_URL_MAX_EXPIRY_SECONDS,
  TRANSCRIBE_STREAM_URL_PATH,
  TRANSCRIBE_STREAM_URL_PORT,
} from '@live-transcription/contracts';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import type { SignTranscribeUrlInput, TranscribeUrlSigner } from '../ports.js';

/**
 * AWS credentials used to sign. In Lambda these are the execution role's
 * temporary credentials. They are only ever used inside the signer; nothing
 * here returns them, and the produced URL carries the access key ID and session
 * token but never the secret access key or the derived signing key.
 */
export interface SigningCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

export type CredentialsProvider = () => Promise<SigningCredentials>;

/**
 * Read the Lambda runtime's IAM credentials from the environment. The error
 * message never includes any value from the environment.
 */
export function lambdaRuntimeCredentials(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CredentialsProvider {
  return () => {
    const accessKeyId = env['AWS_ACCESS_KEY_ID'];
    const secretAccessKey = env['AWS_SECRET_ACCESS_KEY'];
    const sessionToken = env['AWS_SESSION_TOKEN'];
    if (!accessKeyId || !secretAccessKey) {
      return Promise.reject(new Error('Runtime credentials are not available.'));
    }
    return Promise.resolve(
      sessionToken
        ? { accessKeyId, secretAccessKey, sessionToken }
        : { accessKeyId, secretAccessKey },
    );
  };
}

/**
 * Percent-encode per RFC 3986 and the SigV4 rules: leave A-Z a-z 0-9 - _ . ~
 * alone and encode everything else, including the characters that
 * `encodeURIComponent` leaves behind (! ' ( ) *).
 */
function escapeQueryComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function formatUrl(host: string, query: Readonly<Record<string, string>>): string {
  const queryString = Object.keys(query)
    .sort()
    .map((key) => `${escapeQueryComponent(key)}=${escapeQueryComponent(query[key] ?? '')}`)
    .join('&');
  return `wss://${host}${TRANSCRIBE_STREAM_URL_PATH}?${queryString}`;
}

/**
 * Create the production signer. It builds the Amazon Transcribe WebSocket
 * request described in the official "Setting up a WebSocket stream" guide
 * (GET, service `transcribe`, host including port 8443, empty payload, only the
 * `host` header signed) and has the AWS-maintained `@smithy/signature-v4`
 * library presign it.
 *
 * This runs no network calls and needs no AWS account. Whether AWS accepts the
 * result can only be confirmed against the real service.
 */
export function createTranscribeUrlSigner(credentials: CredentialsProvider): TranscribeUrlSigner {
  return {
    async sign(input: SignTranscribeUrlInput): Promise<string> {
      if (
        !Number.isInteger(input.expiresInSeconds) ||
        input.expiresInSeconds < 1 ||
        input.expiresInSeconds > STREAM_URL_MAX_EXPIRY_SECONDS
      ) {
        throw new Error('Invalid signing request.');
      }

      const hostname = `transcribestreaming.${input.region}.amazonaws.com`;
      const host = `${hostname}:${TRANSCRIBE_STREAM_URL_PORT}`;

      const request = new HttpRequest({
        protocol: 'wss:',
        method: 'GET',
        hostname,
        port: Number(TRANSCRIBE_STREAM_URL_PORT),
        path: TRANSCRIBE_STREAM_URL_PATH,
        headers: { host },
        query: {
          'language-code': input.languageCode,
          'media-encoding': 'pcm',
          'sample-rate': String(AUDIO_SAMPLE_RATE_HZ),
        },
      });

      const signer = new SignatureV4({
        service: 'transcribe',
        region: input.region,
        credentials,
        sha256: Sha256,
      });

      const presigned = await signer.presign(request, {
        expiresIn: input.expiresInSeconds,
        signingDate: input.signingDate,
      });

      const query: Record<string, string> = {};
      for (const [key, value] of Object.entries(presigned.query ?? {})) {
        if (typeof value === 'string') query[key] = value;
      }
      return formatUrl(host, query);
    },
  };
}
