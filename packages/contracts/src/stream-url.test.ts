import { describe, expect, it } from 'vitest';
import {
  STREAM_URL_MAX_EXPIRY_SECONDS,
  STREAM_URL_MAX_LENGTH,
  STREAM_URL_PROPOSED_EXPIRY_SECONDS,
  requestStreamUrlRequestSchema,
  streamUrlResponseSchema,
} from './stream-url.js';

const validResponse = {
  sessionId: 'sess_abc123',
  url: 'wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?language-code=en-US',
  expiresAt: '2026-11-06T16:01:00Z',
  expiresInSeconds: STREAM_URL_PROPOSED_EXPIRY_SECONDS,
  streamEpoch: 1,
  parameters: { languageCode: 'en-US', mediaEncoding: 'pcm', sampleRateHertz: 16000 },
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
  it('accepts a valid response', () => {
    expect(streamUrlResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it('rejects a URL that is not wss://', () => {
    for (const url of [
      'ws://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket',
      'https://transcribestreaming.us-east-1.amazonaws.com/stream-transcription-websocket',
    ]) {
      expect(streamUrlResponseSchema.safeParse({ ...validResponse, url }).success).toBe(false);
    }
  });

  it('rejects a host that is not Amazon Transcribe streaming', () => {
    for (const url of [
      'wss://evil.example.com/stream-transcription-websocket',
      'wss://transcribestreaming.us-east-1.amazonaws.com.evil.example/x',
      'wss://evil.com/transcribestreaming.us-east-1.amazonaws.com',
      'wss://transcribe.us-east-1.amazonaws.com/x',
    ]) {
      expect(streamUrlResponseSchema.safeParse({ ...validResponse, url }).success).toBe(false);
    }
  });

  it('rejects text that is not a URL, and oversized URLs', () => {
    expect(streamUrlResponseSchema.safeParse({ ...validResponse, url: 'not a url' }).success).toBe(
      false,
    );
    const long = `wss://transcribestreaming.us-east-1.amazonaws.com/x?q=${'a'.repeat(STREAM_URL_MAX_LENGTH)}`;
    expect(streamUrlResponseSchema.safeParse({ ...validResponse, url: long }).success).toBe(false);
  });

  it('bounds the expiry to between 1 and the AWS maximum', () => {
    const at = (expiresInSeconds: number) =>
      streamUrlResponseSchema.safeParse({ ...validResponse, expiresInSeconds }).success;
    expect(at(0)).toBe(false);
    expect(at(1)).toBe(true);
    expect(at(STREAM_URL_MAX_EXPIRY_SECONDS)).toBe(true);
    expect(at(STREAM_URL_MAX_EXPIRY_SECONDS + 1)).toBe(false);
    expect(at(30.5)).toBe(false);
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

  it('allows only PCM at 16 kHz', () => {
    const withParameters = (parameters: Record<string, unknown>) =>
      streamUrlResponseSchema.safeParse({
        ...validResponse,
        parameters: { ...validResponse.parameters, ...parameters },
      }).success;
    expect(withParameters({ mediaEncoding: 'flac' })).toBe(false);
    expect(withParameters({ sampleRateHertz: 44100 })).toBe(false);
    expect(withParameters({ languageCode: '' })).toBe(false);
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
