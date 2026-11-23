import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from './index.mjs';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {},
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: () => ({ send }) },
  GetCommand: class {
    constructor(readonly input: unknown) {}
  },
  PutCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

const segment = {
  sessionId: 'example-session',
  streamId: 'example-stream',
  resultId: 'example-result',
  text: 'Example final segment.',
  startTime: 0,
  endTime: 1.5,
};

const event = {
  version: '2.0',
  requestContext: { authorizer: { jwt: { claims: { sub: 'example-owner' } } } },
  body: JSON.stringify(segment),
  isBase64Encoded: false,
};

beforeEach(() => {
  vi.stubEnv('SESSIONS_TABLE', 'sessions-test');
  vi.stubEnv('SEGMENTS_TABLE', 'segments-test');
  vi.stubEnv('SESSIONS_SORT_KEY', 'sessionKey');
  send.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe('development segment upload', () => {
  it('checks ownership and records the same segment key on identical retries', async () => {
    const ownedSession = { Item: { sessionKey: segment.sessionId, userId: 'example-owner' } };
    send.mockResolvedValueOnce(ownedSession).mockResolvedValueOnce({});
    send.mockResolvedValueOnce(ownedSession).mockResolvedValueOnce({});

    const request = {
      ...event,
      body: Buffer.from(JSON.stringify({ ...segment, userId: 'ignored-body-user' })).toString(
        'base64',
      ),
      isBase64Encoded: true,
    };
    const first = await handler(request);
    const second = await handler(request);

    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.body)).toEqual({ message: 'Segment saved successfully' });
    expect(second).toEqual(first);
    expect(send).toHaveBeenNthCalledWith(1, {
      input: {
        TableName: 'sessions-test',
        Key: { userId: 'example-owner', sessionKey: segment.sessionId },
        ConsistentRead: true,
      },
    });
    const write = {
      input: {
        TableName: 'segments-test',
        Item: {
          ...segment,
          segmentKey: 'example-stream#example-result',
        },
      },
    };
    expect(send).toHaveBeenCalledTimes(4);
    expect(send).toHaveBeenNthCalledWith(2, write);
    expect(send).toHaveBeenNthCalledWith(4, write);
  });

  it('rejects a different owner without writing a segment', async () => {
    send.mockResolvedValueOnce({});
    const result = await handler({
      ...event,
      requestContext: { authorizer: { jwt: { claims: { sub: 'other-owner' } } } },
    });

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toEqual({ message: 'Session access denied' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects a request without an authenticated subject', async () => {
    expect(await handler({ ...event, requestContext: {} })).toEqual({
      statusCode: 401,
      body: JSON.stringify({ message: 'Authentication required' }),
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('accepts a direct invocation with segment fields and JWT claims in the event', async () => {
    send
      .mockResolvedValueOnce({ Item: { sessionKey: segment.sessionId } })
      .mockResolvedValueOnce({});

    expect(await handler({ ...segment, requestContext: event.requestContext })).toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: 'Segment saved successfully' }),
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('returns a JSON parsing error before checking identity', async () => {
    expect(await handler({ version: '2.0', body: '{' })).toEqual({
      statusCode: 400,
      body: JSON.stringify({ message: 'Request body must be valid JSON' }),
    });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['null', 'null'],
    ['empty ID', JSON.stringify({ ...segment, streamId: '' })],
    ['whitespace-only ID', JSON.stringify({ ...segment, resultId: '  ' })],
    ['nonstring text', JSON.stringify({ ...segment, text: false })],
    ['string time', JSON.stringify({ ...segment, startTime: '0' })],
    ['nonfinite time', event.body.replace('1.5', '1e400')],
    ['negative start', JSON.stringify({ ...segment, startTime: -1 })],
    ['reversed interval', JSON.stringify({ ...segment, startTime: 2 })],
  ])('rejects %s without querying DynamoDB', async (_name, body) => {
    expect(await handler({ ...event, body })).toEqual({
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid transcript segment' }),
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('fails the invocation when DynamoDB rejects the write', async () => {
    const error = new Error('DynamoDB write failed');
    send.mockResolvedValueOnce({ Item: {} }).mockRejectedValueOnce(error);

    await expect(handler(event)).rejects.toBe(error);
  });
});
