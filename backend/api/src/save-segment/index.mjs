import { Buffer } from 'node:buffer';
import process from 'node:process';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event) => {
  let payload = event;

  if (event?.version === '2.0') {
    try {
      const body = event.isBase64Encoded
        ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
        : (event.body ?? '');

      payload = JSON.parse(body);
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Request body must be valid JSON' }),
      };
    }
  }

  const { sessionId, streamId, resultId, text, startTime, endTime } = payload ?? {};
  const validIds = [sessionId, streamId, resultId].every(
    (id) => typeof id === 'string' && id.trim().length > 0,
  );

  const validTimes =
    Number.isFinite(startTime) &&
    Number.isFinite(endTime) &&
    startTime >= 0 &&
    endTime >= startTime;

  if (!validIds || typeof text !== 'string' || !validTimes) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid transcript segment' }),
    };
  }

  const userId = event?.requestContext?.authorizer?.jwt?.claims?.sub;

  if (typeof userId !== 'string' || !userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Authentication required' }),
    };
  }

  const session = await dynamodb.send(
    new GetCommand({
      TableName: process.env.SESSIONS_TABLE,
      Key: {
        userId,
        [process.env.SESSIONS_SORT_KEY]: sessionId,
      },
      ConsistentRead: true,
    }),
  );

  if (!session.Item) {
    return {
      statusCode: 403,
      body: JSON.stringify({ message: 'Session access denied' }),
    };
  }

  await dynamodb.send(
    new PutCommand({
      TableName: process.env.SEGMENTS_TABLE,
      Item: {
        sessionId,
        segmentKey: `${streamId}#${resultId}`,
        streamId,
        resultId,
        text,
        startTime,
        endTime,
      },
    }),
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Segment saved successfully' }),
  };
};
