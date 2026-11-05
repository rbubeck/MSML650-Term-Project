import { extname } from 'node:path';
import {
  AUDIO_CHANNELS,
  AUDIO_PCM_BYTES_PER_FRAME,
  AUDIO_SAMPLE_RATE_HZ,
} from '@live-transcription/contracts';

const WAV_HEADER_MINIMUM_BYTES = 44;
const PCM_FORMAT = 1;
const PCM_BITS_PER_SAMPLE = 16;

export class UnsupportedSmokeAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedSmokeAudioError';
  }
}

function chunkName(bytes: Uint8Array, offset: number): string {
  return Buffer.from(bytes.subarray(offset, offset + 4)).toString('ascii');
}

export function extractPcmFromWave(bytes: Uint8Array): Uint8Array {
  if (
    bytes.byteLength < WAV_HEADER_MINIMUM_BYTES ||
    chunkName(bytes, 0) !== 'RIFF' ||
    chunkName(bytes, 8) !== 'WAVE'
  ) {
    throw new UnsupportedSmokeAudioError('The input is not a valid RIFF/WAVE file.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let formatValidated = false;
  let pcm: Uint8Array | undefined;

  while (offset + 8 <= bytes.byteLength) {
    const name = chunkName(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const contentStart = offset + 8;
    const contentEnd = contentStart + size;
    if (contentEnd > bytes.byteLength) {
      throw new UnsupportedSmokeAudioError(`WAVE chunk ${name} extends beyond the file.`);
    }

    if (name === 'fmt ') {
      if (size < 16) {
        throw new UnsupportedSmokeAudioError('The WAVE format chunk is incomplete.');
      }
      const format = view.getUint16(contentStart, true);
      const channels = view.getUint16(contentStart + 2, true);
      const sampleRate = view.getUint32(contentStart + 4, true);
      const bitsPerSample = view.getUint16(contentStart + 14, true);
      if (
        format !== PCM_FORMAT ||
        channels !== AUDIO_CHANNELS ||
        sampleRate !== AUDIO_SAMPLE_RATE_HZ ||
        bitsPerSample !== PCM_BITS_PER_SAMPLE
      ) {
        throw new UnsupportedSmokeAudioError('WAVE input must be mono 16-bit PCM at 16,000 Hz.');
      }
      formatValidated = true;
    } else if (name === 'data') {
      pcm = bytes.slice(contentStart, contentEnd);
    }

    offset = contentEnd + (size % 2);
  }

  if (!formatValidated || pcm === undefined) {
    throw new UnsupportedSmokeAudioError('WAVE input must contain format and data chunks.');
  }
  return pcm;
}

export function loadSmokePcm(path: string, bytes: Uint8Array): Uint8Array {
  const extension = extname(path).toLowerCase();
  if (extension === '.pcm' || extension === '.raw') {
    return bytes;
  }
  if (extension === '.wav') {
    return extractPcmFromWave(bytes);
  }
  throw new UnsupportedSmokeAudioError('Use a .wav, .pcm, or .raw input file.');
}

export function padFinalPcmFrame(pcm: Uint8Array): Uint8Array {
  const remainder = pcm.byteLength % AUDIO_PCM_BYTES_PER_FRAME;
  if (remainder === 0) {
    return pcm;
  }

  const padded = new Uint8Array(pcm.byteLength + AUDIO_PCM_BYTES_PER_FRAME - remainder);
  padded.set(pcm);
  return padded;
}
