export const AUDIO_FRAME_VERSION = 1 as const;
export const AUDIO_FRAME_FLAGS = 0 as const;
export const AUDIO_FRAME_HEADER_BYTES = 16;
export const AUDIO_SAMPLE_RATE_HZ = 16_000;
export const AUDIO_CHANNELS = 1;
export const AUDIO_BYTES_PER_SAMPLE = 2;
export const AUDIO_FRAME_DURATION_MS = 100;
export const AUDIO_FRAME_DURATION_US = 100_000n;
export const AUDIO_SAMPLES_PER_FRAME = 1_600;
export const AUDIO_PCM_BYTES_PER_FRAME = 3_200;
export const AUDIO_BINARY_MESSAGE_BYTES = 3_216;

const MAX_UINT32 = 0xffff_ffff;
const MAX_UINT64 = 0xffff_ffff_ffff_ffffn;

export type AudioFrameErrorCode =
  | 'FRAME_SIZE_INVALID'
  | 'UNSUPPORTED_FRAME_VERSION'
  | 'INVALID_FRAME_FLAGS'
  | 'INVALID_HEADER_LENGTH'
  | 'INVALID_AUDIO_SEQUENCE'
  | 'INVALID_CAPTURE_TIMESTAMP'
  | 'INVALID_PCM_LENGTH'
  | 'AUDIO_SEQUENCE_GAP'
  | 'AUDIO_TIMESTAMP_GAP';

export class AudioFrameValidationError extends Error {
  readonly code: AudioFrameErrorCode;

  constructor(code: AudioFrameErrorCode, message: string) {
    super(message);
    this.name = 'AudioFrameValidationError';
    this.code = code;
  }
}

export interface AudioFramePosition {
  readonly sequence: number;
  readonly captureStartUs: bigint;
}

export interface AudioFrame extends AudioFramePosition {
  readonly pcm: Uint8Array;
}

function validateSequence(sequence: number): void {
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > MAX_UINT32) {
    throw new AudioFrameValidationError(
      'INVALID_AUDIO_SEQUENCE',
      'Audio sequence must be an unsigned 32-bit integer.',
    );
  }
}

function validateCaptureStart(captureStartUs: bigint): void {
  if (captureStartUs < 0n || captureStartUs > MAX_UINT64) {
    throw new AudioFrameValidationError(
      'INVALID_CAPTURE_TIMESTAMP',
      'Capture start must be an unsigned 64-bit microsecond value.',
    );
  }
}

function validatePcm(pcm: Uint8Array): void {
  if (pcm.byteLength !== AUDIO_PCM_BYTES_PER_FRAME) {
    throw new AudioFrameValidationError(
      'INVALID_PCM_LENGTH',
      `PCM payload must contain exactly ${AUDIO_PCM_BYTES_PER_FRAME} bytes.`,
    );
  }
}

export function encodeAudioFrame(frame: AudioFrame): Uint8Array {
  validateSequence(frame.sequence);
  validateCaptureStart(frame.captureStartUs);
  validatePcm(frame.pcm);

  const encoded = new Uint8Array(AUDIO_BINARY_MESSAGE_BYTES);
  const view = new DataView(encoded.buffer);

  view.setUint8(0, AUDIO_FRAME_VERSION);
  view.setUint8(1, AUDIO_FRAME_FLAGS);
  view.setUint16(2, AUDIO_FRAME_HEADER_BYTES, false);
  view.setUint32(4, frame.sequence, false);
  view.setBigUint64(8, frame.captureStartUs, false);
  encoded.set(frame.pcm, AUDIO_FRAME_HEADER_BYTES);

  return encoded;
}

export function decodeAudioFrame(input: ArrayBuffer | Uint8Array): AudioFrame {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (bytes.byteLength !== AUDIO_BINARY_MESSAGE_BYTES) {
    throw new AudioFrameValidationError(
      'FRAME_SIZE_INVALID',
      `Binary audio message must contain exactly ${AUDIO_BINARY_MESSAGE_BYTES} bytes.`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  const flags = view.getUint8(1);
  const headerBytes = view.getUint16(2, false);

  if (version !== AUDIO_FRAME_VERSION) {
    throw new AudioFrameValidationError(
      'UNSUPPORTED_FRAME_VERSION',
      `Unsupported audio frame version: ${version}.`,
    );
  }
  if (flags !== AUDIO_FRAME_FLAGS) {
    throw new AudioFrameValidationError(
      'INVALID_FRAME_FLAGS',
      `Audio frame flags must be ${AUDIO_FRAME_FLAGS}.`,
    );
  }
  if (headerBytes !== AUDIO_FRAME_HEADER_BYTES) {
    throw new AudioFrameValidationError(
      'INVALID_HEADER_LENGTH',
      `Audio frame header must contain ${AUDIO_FRAME_HEADER_BYTES} bytes.`,
    );
  }

  return {
    sequence: view.getUint32(4, false),
    captureStartUs: view.getBigUint64(8, false),
    pcm: bytes.slice(AUDIO_FRAME_HEADER_BYTES),
  };
}

export function assertAudioFrameContinuity(
  previous: AudioFramePosition | null,
  current: AudioFramePosition,
): void {
  if (previous === null) {
    if (current.sequence !== 0) {
      throw new AudioFrameValidationError(
        'AUDIO_SEQUENCE_GAP',
        `Expected initial audio sequence 0, received ${current.sequence}.`,
      );
    }
    return;
  }

  const expectedSequence = previous.sequence + 1;
  if (expectedSequence > MAX_UINT32 || current.sequence !== expectedSequence) {
    throw new AudioFrameValidationError(
      'AUDIO_SEQUENCE_GAP',
      `Expected audio sequence ${expectedSequence}, received ${current.sequence}.`,
    );
  }

  const expectedCaptureStartUs = previous.captureStartUs + AUDIO_FRAME_DURATION_US;
  if (current.captureStartUs !== expectedCaptureStartUs) {
    throw new AudioFrameValidationError(
      'AUDIO_TIMESTAMP_GAP',
      `Expected capture start ${expectedCaptureStartUs}us, received ${current.captureStartUs}us.`,
    );
  }
}
