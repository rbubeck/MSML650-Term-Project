import { describe, expect, it } from 'vitest';
import { TranscribeStreamClient } from '@live-transcription/stream-client';
import { FakeTranscribeSocket } from './fakeTranscribeSocket';

describe('local fake Transcribe integration', () => {
  it('routes PCM through the real stream client and returns clearly simulated captions', async () => {
    const partials: string[] = [];
    const finals: string[] = [];
    const client = new TranscribeStreamClient(
      {
        onPartial: (result) => partials.push(result.text),
        onFinal: (result) => finals.push(result.text),
      },
      { webSocketFactory: () => new FakeTranscribeSocket() },
    );

    await client.start({ url: 'wss://local-fake.invalid/stream', streamEpoch: 1 });
    for (let frame = 0; frame < 10; frame += 1) {
      expect(client.sendAudio(new Uint8Array(3_200))).toBe(true);
    }
    await Promise.resolve();

    expect(partials).toEqual(['Microphone PCM reached the local stream…']);
    expect(finals).toEqual(['Microphone PCM reached the local stream client.']);
    await client.stop();
    expect(client.state).toBe('closed');
  });
});
