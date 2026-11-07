import { createHash, createHmac } from 'node:crypto';
import { streamUrlResponseSchema } from '@live-transcription/contracts';
import { describe, expect, it } from 'vitest';
import { createTranscribeUrlSigner, lambdaRuntimeCredentials } from './transcribe-signer.js';

/** Synthetic fixtures only. Never real credentials. */
const ACCESS_KEY_ID = 'AKIDEXAMPLE0000000000';
const SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';
/** Includes + / = so the percent-encoding rules are exercised. */
const SESSION_TOKEN = 'FwoGZXIvYXdzE+example/session=token+with/special==chars';
const SIGNING_DATE = new Date('2026-11-06T16:00:00Z');

const credentials = () =>
  Promise.resolve({
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
    sessionToken: SESSION_TOKEN,
  });

const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const hmac = (key: string | Buffer, data: string): Buffer =>
  createHmac('sha256', key).update(data, 'utf8').digest();

const UNRESERVED = /[A-Za-z0-9\-_.~]/;

/**
 * Independent percent-encoder written from the AWS rules: leave unreserved
 * characters alone and encode every other UTF-8 byte as %XX with uppercase hex.
 * Deliberately not the same code as the implementation.
 */
function encodeByRules(value: string): string {
  let encoded = '';
  for (const byte of Buffer.from(value, 'utf8')) {
    const character = String.fromCharCode(byte);
    encoded +=
      byte < 128 && UNRESERVED.test(character)
        ? character
        : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return encoded;
}

interface OracleInput {
  readonly region: string;
  readonly languageCode: string;
  readonly expiresIn: number;
  readonly signingDate: Date;
  readonly sessionToken: string | undefined;
}

/**
 * Computes the signature straight from the pseudocode in the official Amazon
 * Transcribe "Setting up a WebSocket stream" guide, using only node:crypto.
 */
function oracleSignature(input: OracleInput): { signature: string; signingKeyHex: string } {
  const host = `transcribestreaming.${input.region}.amazonaws.com:8443`;
  const amzDate = input.signingDate.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const datestamp = amzDate.slice(0, 8);
  const credentialScope = `${datestamp}/${input.region}/transcribe/aws4_request`;

  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${ACCESS_KEY_ID}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(input.expiresIn),
    'X-Amz-SignedHeaders': 'host',
    'language-code': input.languageCode,
    'media-encoding': 'pcm',
    'sample-rate': '16000',
  };
  if (input.sessionToken !== undefined) params['X-Amz-Security-Token'] = input.sessionToken;

  const canonicalQuery = Object.keys(params)
    .sort()
    .map((key) => `${encodeByRules(key)}=${encodeByRules(params[key] ?? '')}`)
    .join('&');
  const canonicalRequest = [
    'GET',
    '/stream-transcription-websocket',
    canonicalQuery,
    `host:${host}\n`,
    'host',
    sha256Hex(''),
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const dateKey = hmac(`AWS4${SECRET_ACCESS_KEY}`, datestamp);
  const regionKey = hmac(dateKey, input.region);
  const serviceKey = hmac(regionKey, 'transcribe');
  const signingKey = hmac(serviceKey, 'aws4_request');
  return {
    signature: hmac(signingKey, stringToSign).toString('hex'),
    signingKeyHex: signingKey.toString('hex'),
  };
}

const baseInput = {
  region: 'us-east-1',
  languageCode: 'en-US',
  expiresInSeconds: 60,
  signingDate: SIGNING_DATE,
};

describe('createTranscribeUrlSigner', () => {
  it('produces the signature the AWS pseudocode specifies', async () => {
    const url = new URL(await createTranscribeUrlSigner(credentials).sign(baseInput));

    const expected = oracleSignature({
      region: 'us-east-1',
      languageCode: 'en-US',
      expiresIn: 60,
      signingDate: SIGNING_DATE,
      sessionToken: SESSION_TOKEN,
    });
    expect(url.searchParams.get('X-Amz-Signature')).toBe(expected.signature);
  });

  it('matches the pseudocode for another region, language, expiry and time', async () => {
    const signingDate = new Date('2027-01-02T03:04:05Z');
    const url = new URL(
      await createTranscribeUrlSigner(credentials).sign({
        region: 'eu-west-2',
        languageCode: 'en-GB',
        expiresInSeconds: 300,
        signingDate,
      }),
    );

    const expected = oracleSignature({
      region: 'eu-west-2',
      languageCode: 'en-GB',
      expiresIn: 300,
      signingDate,
      sessionToken: SESSION_TOKEN,
    });
    expect(url.hostname).toBe('transcribestreaming.eu-west-2.amazonaws.com');
    expect(url.searchParams.get('X-Amz-Signature')).toBe(expected.signature);
  });

  it('builds the documented endpoint, parameters and signed header list', async () => {
    const url = new URL(await createTranscribeUrlSigner(credentials).sign(baseInput));

    expect(url.protocol).toBe('wss:');
    expect(url.hostname).toBe('transcribestreaming.us-east-1.amazonaws.com');
    expect(url.port).toBe('8443');
    expect(url.pathname).toBe('/stream-transcription-websocket');
    const params = url.searchParams;
    expect(params.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(params.get('X-Amz-Credential')).toBe(
      `${ACCESS_KEY_ID}/20261106/us-east-1/transcribe/aws4_request`,
    );
    expect(params.get('X-Amz-Date')).toBe('20261106T160000Z');
    expect(params.get('X-Amz-Expires')).toBe('60');
    expect(params.get('X-Amz-SignedHeaders')).toBe('host');
    expect(params.get('X-Amz-Security-Token')).toBe(SESSION_TOKEN);
    expect(params.get('language-code')).toBe('en-US');
    expect(params.get('media-encoding')).toBe('pcm');
    expect(params.get('sample-rate')).toBe('16000');
  });

  it('percent-encodes the session token so the URL parses back to the exact token', async () => {
    const raw = await createTranscribeUrlSigner(credentials).sign(baseInput);
    expect(raw).not.toContain(SESSION_TOKEN);
    expect(raw).toContain(encodeByRules(SESSION_TOKEN));
  });

  it('never exposes the secret access key or the derived signing key', async () => {
    const raw = await createTranscribeUrlSigner(credentials).sign(baseInput);
    const { signingKeyHex } = oracleSignature({
      region: 'us-east-1',
      languageCode: 'en-US',
      expiresIn: 60,
      signingDate: SIGNING_DATE,
      sessionToken: SESSION_TOKEN,
    });

    expect(raw).not.toContain(SECRET_ACCESS_KEY);
    expect(raw).not.toContain(encodeURIComponent(SECRET_ACCESS_KEY));
    expect(raw).not.toContain(signingKeyHex);
    expect(raw.toLowerCase()).not.toContain('secret');
  });

  it('produces a URL the shared contract schema accepts', async () => {
    const url = await createTranscribeUrlSigner(credentials).sign(baseInput);
    const result = streamUrlResponseSchema.safeParse({
      sessionId: 'sess_1',
      streamEpoch: 1,
      url,
      expiresAt: '2026-11-06T16:01:00Z',
      languageCode: 'en-US',
      mediaEncoding: 'pcm',
      sampleRateHz: 16000,
      channels: 1,
    });
    expect(result.success).toBe(true);
  });

  it('omits the security token and still matches the pseudocode for long-term credentials', async () => {
    const signer = createTranscribeUrlSigner(() =>
      Promise.resolve({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY }),
    );

    const url = new URL(await signer.sign(baseInput));

    expect(url.searchParams.has('X-Amz-Security-Token')).toBe(false);
    const expected = oracleSignature({
      region: 'us-east-1',
      languageCode: 'en-US',
      expiresIn: 60,
      signingDate: SIGNING_DATE,
      sessionToken: undefined,
    });
    expect(url.searchParams.get('X-Amz-Signature')).toBe(expected.signature);
  });

  it('issues a different URL for a different signing time', async () => {
    const signer = createTranscribeUrlSigner(credentials);
    const first = await signer.sign(baseInput);
    const second = await signer.sign({
      ...baseInput,
      signingDate: new Date('2026-11-06T16:00:30Z'),
    });
    expect(second).not.toBe(first);
  });

  it('rejects an expiry that is zero, above the AWS maximum of 300, or fractional', async () => {
    const signer = createTranscribeUrlSigner(credentials);
    for (const expiresInSeconds of [0, 301, 60.5, Number.NaN]) {
      await expect(signer.sign({ ...baseInput, expiresInSeconds })).rejects.toThrow(
        'Invalid signing request.',
      );
    }
  });
});

describe('lambdaRuntimeCredentials', () => {
  it('reads the execution role credentials from the environment', async () => {
    const provider = lambdaRuntimeCredentials({
      AWS_ACCESS_KEY_ID: ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
      AWS_SESSION_TOKEN: SESSION_TOKEN,
    });
    await expect(provider()).resolves.toEqual({
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
      sessionToken: SESSION_TOKEN,
    });
  });

  it('omits the session token when the environment has none', async () => {
    const provider = lambdaRuntimeCredentials({
      AWS_ACCESS_KEY_ID: ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
    });
    const resolved = await provider();
    expect(resolved).toEqual({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY });
    expect(resolved).not.toHaveProperty('sessionToken');
  });

  it('fails with a generic message that never includes environment values', async () => {
    const provider = lambdaRuntimeCredentials({ AWS_ACCESS_KEY_ID: ACCESS_KEY_ID });
    const error = await provider().then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain('Runtime credentials are not available.');
    expect(String(error)).not.toContain(ACCESS_KEY_ID);
  });

  it('fails when there is no environment at all', async () => {
    await expect(lambdaRuntimeCredentials({})()).rejects.toThrow('Runtime credentials');
  });
});
