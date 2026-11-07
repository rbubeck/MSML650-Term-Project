import { describe, expect, it } from 'vitest';
import { ProviderMessageError } from '../errors.js';
import {
  decodeEventStreamMessage,
  encodeEventStreamMessage,
  type EventStreamHeaderValue,
} from '../eventstream/codec.js';
import { parseTranscribeMessage } from './provider-message.js';

const encoder = new TextEncoder();

function expectProviderError(code: ProviderMessageError['code'], operation: () => unknown): void {
  try {
    operation();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ProviderMessageError);
    expect((error as ProviderMessageError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ProviderMessageError ${code}.`);
}

function providerFrame(headers: Readonly<Record<string, EventStreamHeaderValue>>, body: unknown) {
  return decodeEventStreamMessage(
    encodeEventStreamMessage({
      headers,
      payload: encoder.encode(JSON.stringify(body)),
    }),
  );
}

describe('Amazon Transcribe provider message parser', () => {
  it('maps partial and final results to the small provider model', () => {
    const message = providerFrame(
      {
        ':content-type': { type: 'string', value: 'application/json' },
        ':event-type': { type: 'string', value: 'TranscriptEvent' },
        ':message-type': { type: 'string', value: 'event' },
      },
      {
        Transcript: {
          Results: [
            {
              ResultId: 'partial-1',
              IsPartial: true,
              StartTime: 0.25,
              EndTime: 1.125,
              Alternatives: [{ Transcript: 'hello wor' }],
            },
            {
              ResultId: 'final-1',
              IsPartial: false,
              StartTime: 0.25,
              EndTime: 1.5,
              Alternatives: [{ Transcript: 'hello world' }],
            },
          ],
        },
      },
    );

    expect(parseTranscribeMessage(message)).toEqual({
      type: 'transcript',
      results: [
        {
          resultId: 'partial-1',
          text: 'hello wor',
          isPartial: true,
          startMs: 250,
          endMs: 1_125,
        },
        {
          resultId: 'final-1',
          text: 'hello world',
          isPartial: false,
          startMs: 250,
          endMs: 1_500,
        },
      ],
    });
  });

  it('returns safe bounded provider errors without exposing the response body', () => {
    const secretProviderBody = 'internal provider diagnostics must not escape';
    const message = providerFrame(
      {
        ':content-type': { type: 'string', value: 'application/json' },
        ':exception-type': { type: 'string', value: 'BadRequestException' },
        ':message-type': { type: 'string', value: 'exception' },
      },
      { Message: secretProviderBody },
    );

    const parsed = parseTranscribeMessage(message);
    expect(parsed).toEqual({
      type: 'exception',
      code: 'BAD_REQUEST',
      retryable: false,
      message: 'The transcription request was rejected.',
    });
    expect(JSON.stringify(parsed)).not.toContain(secretProviderBody);
  });

  it('rejects malformed transcript JSON with a content-free error', () => {
    const message = decodeEventStreamMessage(
      encodeEventStreamMessage({
        headers: {
          ':content-type': { type: 'string', value: 'application/json' },
          ':event-type': { type: 'string', value: 'TranscriptEvent' },
          ':message-type': { type: 'string', value: 'event' },
        },
        payload: encoder.encode('{secret broken json'),
      }),
    );
    expectProviderError('INVALID_JSON', () => parseTranscribeMessage(message));
  });

  it('rejects unexpected provider event types', () => {
    const message = providerFrame(
      {
        ':content-type': { type: 'string', value: 'application/json' },
        ':event-type': { type: 'string', value: 'UnexpectedEvent' },
        ':message-type': { type: 'string', value: 'event' },
      },
      {},
    );
    expectProviderError('UNEXPECTED_EVENT_TYPE', () => parseTranscribeMessage(message));
  });
});
