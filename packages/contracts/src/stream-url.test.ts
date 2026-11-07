import { describe, expect, it } from 'vitest';
import {
  STREAM_URL_MAX_LENGTH,
  requestStreamUrlRequestSchema,
  streamUrlResponseSchema,
} from './stream-url.js';

const validUrl =
  'wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?language-code=en-US';

const validResponse = {
  sessionId: 'sess_abc123',
  streamEpoch: 1,
  url: validUrl,
  expiresAt: '2026-11-06T16:01:00Z',
  languageCode: 'en-US',
  mediaEncoding: 'pcm',
  sampleRateHz: 16000,
  channels: 1,
};

describe('requestStreamUrlRequestSchema', () => {
  it('accepts an empty body', () => {
    expect(requestStreamUrlRequestSchema.safeParse({}).success).toBe(true);
  });

  it('rejects client-supplied fields such as language, epoch or owner', () => {
    expect(requestStreamUrlRequestSchema.safeParse({ languageCode: 'fr-FR' }).success).toBe(false);
    expect(requestStreamUrlRequestSchema.safeParse({ streamEpoch: 99 }).success).toBe(false);
    expect(requestStreamUrlRequestSchema.safeParse({ userId: 'x' }).success).toBe(false);
  });
});

describe('streamUrlResponseSchema', () => {
  it('accepts a valid response with exactly the spec fields', () => {
    expect(streamUrlResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it('rejects the old nested shape and extra expiry field', () => {
    const nested: Record<string, unknown> = {
      ...validResponse,
      parameters: { languageCode: 'en-US', mediaEncoding: 'pcm', sampleRateHertz: 16000 },
    };
    for (const flat of ['languageCode', 'mediaEncoding', 'sampleRateHz', 'channels']) {
      delete nested[flat];
    }
    expect(streamUrlResponseSchema.safeParse(nested).success).toBe(false);
    expect(
      streamUrlResponseSchema.safeParse({ ...validResponse, expiresInSeconds: 60 }).success,
    ).toBe(false);
  });

  it('rejects a URL that is not wss://', () => {
    for (const url of [
      validUrl.replace('wss://', 'ws://'),
      validUrl.replace('wss://', 'https://'),
    ]) {
      expect(streamUrlResponseSchema.safeParse({ ...validResponse, url }).success).toBe(false);
    }
  });

  it('rejects a host that is not Amazon Transcribe streaming', () => {
    for (const url of [
      'wss://evil.example.com:8443/stream-transcription-websocket',
      'wss://transcribestreaming.us-east-1.amazonaws.com.evil.example:8443/stream-transcription-websocket',
      'wss://evil.com:8443/transcribestreaming.us-east-1.amazonaws.com',
      'wss://transcribe.us-east-1.amazonaws.com:8443/stream-transcription-websocket',
    ]) {
      expect(streamUrlResponseSchema.safeParse({ ...validResponse, url }).success).toBe(false);
    }
  });

  it('requires port 8443 and the stream-transcription-websocket path', () => {
    const host = 'wss://transcribestreaming.us-east-1.amazonaws.com';
    for (const url of [
      `${host}/stream-transcription-websocket`,
      `${host}:443/stream-transcription-websocket`,
      `${host}:8443/other-path`,
      `${host}:8443/`,
      `${host}:8443/stream-transcription-websocket/extra`,
    ]) {
      expect(streamUrlResponseSchema.safeParse({ ...validResponse, url }).success).toBe(false);
    }
  });

  it('rejects text that is not a URL, and oversized URLs', () => {
    expect(streamUrlResponseSchema.safeParse({ ...validResponse, url: 'not a url' }).success).toBe(
      false,
    );
    const long = `${validUrl}&q=${'a'.repeat(STREAM_URL_MAX_LENGTH)}`;
    expect(streamUrlResponseSchema.safeParse({ ...validResponse, url: long }).success).toBe(false);
  });

  it('requires an ISO UTC expiry time', () => {
    expect(streamUrlResponseSchema.safeParse({ ...validResponse, expiresAt: 'soon' }).success).toBe(
      false,
    );
    const withoutExpiry: Record<string, unknown> = { ...validResponse };
    delete withoutExpiry['expiresAt'];
    expect(streamUrlResponseSchema.safeParse(withoutExpiry).success).toBe(false);
  });

  it('requires a stream epoch of at least 1', () => {
    expect(streamUrlResponseSchema.safeParse({ ...validResponse, streamEpoch: 0 }).success).toBe(
      false,
    );
    expect(streamUrlResponseSchema.safeParse({ ...validResponse, streamEpoch: 2 }).success).toBe(
      true,
    );
    const withoutEpoch: Record<string, unknown> = { ...validResponse };
    delete withoutEpoch['streamEpoch'];
    expect(streamUrlResponseSchema.safeParse(withoutEpoch).success).toBe(false);
  });

  it('allows only mono PCM at 16 kHz', () => {
    const change = (patch: Record<string, unknown>) =>
      streamUrlResponseSchema.safeParse({ ...validResponse, ...patch }).success;
    expect(change({ mediaEncoding: 'flac' })).toBe(false);
    expect(change({ sampleRateHz: 44100 })).toBe(false);
    expect(change({ channels: 2 })).toBe(false);
    expect(change({ languageCode: '' })).toBe(false);
  });

  it('rejects any field that could carry a secret or credential', () => {
    for (const extra of [
      { secretAccessKey: 'abc' },
      { signingKey: 'abc' },
      { accessKeyId: 'AKIA...' },
      { sessionToken: 'abc' },
    ]) {
      expect(streamUrlResponseSchema.safeParse({ ...validResponse, ...extra }).success).toBe(false);
    }
  });
});
