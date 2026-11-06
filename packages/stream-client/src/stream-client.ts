import { EventStreamDecodeError, ProviderMessageError } from './errors.js';
import { decodeEventStreamMessage } from './eventstream/codec.js';
import {
  encodeAudioEvent,
  encodeEndAudioEvent,
  type AudioBytes,
} from './transcribe/audio-event.js';
import {
  parseTranscribeMessage,
  type ProviderException,
  type ProviderTranscriptResult,
} from './transcribe/provider-message.js';

const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;
const NORMAL_CLOSE_CODE = 1000;

export type StreamConnectionState = 'idle' | 'connecting' | 'open' | 'stopping' | 'closed';

export interface StreamResult extends ProviderTranscriptResult {
  readonly streamEpoch: number;
}

export type StreamClientErrorCode =
  | 'CONNECTION_FAILED'
  | 'DISCONNECTED'
  | 'INVALID_AUDIO'
  | 'BUFFER_OVERFLOW'
  | 'PROTOCOL_ERROR'
  | 'PROVIDER_REJECTED'
  | 'STOP_TIMEOUT';

export interface StreamClientError {
  readonly code: StreamClientErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export interface StreamClientHandlers {
  readonly onStateChange?: (state: StreamConnectionState) => void;
  readonly onPartial?: (result: StreamResult) => void;
  readonly onFinal?: (result: StreamResult) => void;
  readonly onError?: (error: StreamClientError) => void;
  readonly onDisconnected?: (event: {
    readonly streamEpoch: number;
    readonly expected: boolean;
  }) => void;
}

export interface StreamStartOptions {
  /** Sensitive bearer capability. The client uses but never logs or includes it in errors. */
  readonly url: string;
  readonly streamEpoch: number;
}

export interface StreamClientOptions {
  readonly maximumBufferedAmount?: number;
  readonly maximumQueuedBytes?: number;
  readonly drainIntervalMs?: number;
  readonly connectTimeoutMs?: number;
  readonly stopTimeoutMs?: number;
  readonly webSocketFactory?: WebSocketFactory;
}

export interface StreamWebSocket {
  binaryType: BinaryType;
  readonly bufferedAmount: number;
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string | BufferSource | Blob): void;
  close(code?: number): void;
}

export type WebSocketFactory = (url: string) => StreamWebSocket;

interface PendingStart {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

interface PendingStop {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function defaultWebSocketFactory(url: string): StreamWebSocket {
  return new WebSocket(url);
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function safeError(code: StreamClientErrorCode): StreamClientError {
  switch (code) {
    case 'CONNECTION_FAILED':
      return {
        code,
        message: 'The transcription connection could not be opened.',
        retryable: true,
      };
    case 'DISCONNECTED':
      return { code, message: 'The transcription connection was interrupted.', retryable: true };
    case 'INVALID_AUDIO':
      return { code, message: 'The audio chunk is not valid 16-bit PCM.', retryable: false };
    case 'BUFFER_OVERFLOW':
      return { code, message: 'The connection is too slow to accept more audio.', retryable: true };
    case 'PROTOCOL_ERROR':
      return {
        code,
        message: 'The transcription service returned an invalid message.',
        retryable: true,
      };
    case 'PROVIDER_REJECTED':
      return { code, message: 'The transcription service rejected the stream.', retryable: false };
    case 'STOP_TIMEOUT':
      return {
        code,
        message: 'The transcription stream did not finish before the stop deadline.',
        retryable: false,
      };
  }
}

function providerError(exception: ProviderException): StreamClientError {
  return {
    code: 'PROVIDER_REJECTED',
    message: exception.message,
    retryable: exception.retryable,
  };
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError(`${name} must be a positive integer.`);
}

function validateNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be a non-negative integer.`);
}

function validateUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TypeError('A valid secure WebSocket URL is required.');
  }
  if (url.protocol !== 'wss:') throw new TypeError('A valid secure WebSocket URL is required.');
}

/** Direct browser-to-Amazon Transcribe transport. It does not capture audio, sign URLs, or save text. */
export class TranscribeStreamClient {
  private readonly maximumBufferedAmount: number;
  private readonly maximumQueuedBytes: number;
  private readonly drainIntervalMs: number;
  private readonly connectTimeoutMs: number;
  private readonly stopTimeoutMs: number;
  private readonly webSocketFactory: WebSocketFactory;
  private readonly queue: Uint8Array[] = [];
  private stateValue: StreamConnectionState = 'idle';
  private socket: StreamWebSocket | undefined;
  private streamEpochValue: number | undefined;
  private queuedBytes = 0;
  private drainTimer: ReturnType<typeof setTimeout> | undefined;
  private connectTimer: ReturnType<typeof setTimeout> | undefined;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingStart: PendingStart | undefined;
  private pendingStop: PendingStop | undefined;
  private inputEnded = false;
  private expectedClose = false;
  private terminalErrorEmitted = false;
  private generation = 0;

  constructor(
    private readonly handlers: StreamClientHandlers = {},
    options: StreamClientOptions = {},
  ) {
    this.maximumBufferedAmount = options.maximumBufferedAmount ?? 65_536;
    this.maximumQueuedBytes = options.maximumQueuedBytes ?? 65_536;
    this.drainIntervalMs = options.drainIntervalMs ?? 20;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5_000;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 5_000;
    this.webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory;
    validateNonNegativeInteger(this.maximumBufferedAmount, 'maximumBufferedAmount');
    validatePositiveInteger(this.maximumQueuedBytes, 'maximumQueuedBytes');
    validatePositiveInteger(this.drainIntervalMs, 'drainIntervalMs');
    validatePositiveInteger(this.connectTimeoutMs, 'connectTimeoutMs');
    validatePositiveInteger(this.stopTimeoutMs, 'stopTimeoutMs');
  }

  get state(): StreamConnectionState {
    return this.stateValue;
  }

  get streamEpoch(): number | undefined {
    return this.streamEpochValue;
  }

  get queuedAudioBytes(): number {
    return this.queuedBytes;
  }

  start(options: StreamStartOptions): Promise<void> {
    if (this.stateValue !== 'idle' && this.stateValue !== 'closed') {
      return Promise.reject(new Error('The transcription stream is already active.'));
    }
    validateUrl(options.url);
    validatePositiveInteger(options.streamEpoch, 'streamEpoch');

    this.resetForStart(options.streamEpoch);
    const generation = this.generation;
    let socket: StreamWebSocket;
    try {
      socket = this.webSocketFactory(options.url);
    } catch {
      this.transition('closed');
      this.emitError('CONNECTION_FAILED');
      return Promise.reject(new Error(safeError('CONNECTION_FAILED').message));
    }

    this.socket = socket;
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => this.handleOpen(socket, generation);
    socket.onmessage = (event) => this.handleMessage(socket, generation, event.data);
    socket.onerror = () => this.handleSocketError(socket, generation);
    socket.onclose = () => this.handleClose(socket, generation);

    return new Promise<void>((resolve, reject) => {
      this.pendingStart = { resolve, reject };
      this.connectTimer = setTimeout(() => {
        if (!this.isCurrent(socket, generation) || this.stateValue !== 'connecting') return;
        this.terminalErrorEmitted = true;
        this.emitError('CONNECTION_FAILED');
        this.rejectPendingStart(safeError('CONNECTION_FAILED').message);
        this.closeImmediately(false);
      }, this.connectTimeoutMs);
    });
  }

  /** Returns false only when the chunk was rejected and a safe error was emitted. */
  sendAudio(audio: AudioBytes): boolean {
    if (this.stateValue !== 'open' || !this.socket) return false;
    const byteLength = audio.byteLength;
    if (byteLength === 0 || byteLength % 2 !== 0) {
      this.fail('INVALID_AUDIO');
      return false;
    }
    const frame = encodeAudioEvent(audio);
    if (this.queue.length === 0 && this.socket.bufferedAmount <= this.maximumBufferedAmount) {
      return this.sendFrame(this.socket, frame);
    }
    if (this.queuedBytes + frame.byteLength > this.maximumQueuedBytes) {
      this.fail('BUFFER_OVERFLOW');
      return false;
    }
    this.queue.push(frame);
    this.queuedBytes += frame.byteLength;
    this.scheduleDrain();
    return true;
  }

  stop(): Promise<void> {
    if (this.stateValue === 'idle' || this.stateValue === 'closed') return Promise.resolve();
    if (this.pendingStop) {
      return this.pendingStop.promise;
    }
    if (this.stateValue === 'connecting') {
      this.expectedClose = true;
      this.rejectPendingStart('The transcription connection was cancelled.');
      this.closeImmediately();
      return Promise.resolve();
    }

    this.expectedClose = true;
    this.transition('stopping');
    let resolveStop: (() => void) | undefined;
    const promise = new Promise<void>((resolve) => {
      resolveStop = resolve;
    });
    this.pendingStop = { promise, resolve: () => resolveStop?.() };
    this.stopTimer = setTimeout(() => {
      if (this.stateValue !== 'stopping') return;
      this.emitError('STOP_TIMEOUT');
      this.closeImmediately();
    }, this.stopTimeoutMs);
    this.drainQueue();
    return promise;
  }

  /** Cancels immediately without sending the provider end frame. */
  cancel(): void {
    if (this.stateValue === 'idle' || this.stateValue === 'closed') return;
    this.expectedClose = true;
    this.rejectPendingStart('The transcription connection was cancelled.');
    this.closeImmediately();
  }

  private resetForStart(streamEpoch: number): void {
    this.clearTimers();
    this.queue.length = 0;
    this.queuedBytes = 0;
    this.streamEpochValue = streamEpoch;
    this.inputEnded = false;
    this.expectedClose = false;
    this.terminalErrorEmitted = false;
    this.pendingStart = undefined;
    this.pendingStop = undefined;
    this.generation += 1;
    this.transition('connecting');
  }

  private handleOpen(socket: StreamWebSocket, generation: number): void {
    if (!this.isCurrent(socket, generation) || this.stateValue !== 'connecting') return;
    if (this.connectTimer !== undefined) clearTimeout(this.connectTimer);
    this.connectTimer = undefined;
    this.transition('open');
    this.pendingStart?.resolve();
    this.pendingStart = undefined;
  }

  private handleMessage(socket: StreamWebSocket, generation: number, data: unknown): void {
    if (!this.isCurrent(socket, generation)) return;
    if (this.stateValue !== 'open' && this.stateValue !== 'stopping') return;
    if (!(data instanceof ArrayBuffer)) {
      this.fail('PROTOCOL_ERROR');
      return;
    }
    let providerMessage: ReturnType<typeof parseTranscribeMessage>;
    try {
      providerMessage = parseTranscribeMessage(decodeEventStreamMessage(new Uint8Array(data)));
    } catch (error: unknown) {
      if (error instanceof EventStreamDecodeError || error instanceof ProviderMessageError) {
        this.fail('PROTOCOL_ERROR');
        return;
      }
      this.fail('PROTOCOL_ERROR');
      return;
    }
    if (providerMessage.type === 'exception') {
      this.terminalErrorEmitted = true;
      this.handlers.onError?.(providerError(providerMessage));
      this.closeImmediately(false);
      return;
    }
    for (const result of providerMessage.results) this.emitResult(result);
  }

  private handleSocketError(socket: StreamWebSocket, generation: number): void {
    if (!this.isCurrent(socket, generation)) return;
    const code = this.stateValue === 'connecting' ? 'CONNECTION_FAILED' : 'DISCONNECTED';
    this.terminalErrorEmitted = true;
    this.emitError(code);
    if (this.stateValue === 'connecting') this.rejectPendingStart(safeError(code).message);
    this.closeImmediately(false);
  }

  private handleClose(socket: StreamWebSocket, generation: number): void {
    if (!this.isCurrent(socket, generation)) return;
    const wasConnecting = this.stateValue === 'connecting';
    const expected = this.expectedClose || this.stateValue === 'stopping';
    if (wasConnecting && !this.terminalErrorEmitted) {
      this.emitError('CONNECTION_FAILED');
      this.rejectPendingStart(safeError('CONNECTION_FAILED').message);
    } else if (!expected && !this.terminalErrorEmitted) {
      this.emitError('DISCONNECTED');
    }
    this.finishClosed(expected);
  }

  private emitResult(result: ProviderTranscriptResult): void {
    const streamEpoch = this.streamEpochValue;
    if (streamEpoch === undefined) return;
    const streamResult: StreamResult = { ...result, streamEpoch };
    if (result.isPartial) this.handlers.onPartial?.(streamResult);
    else this.handlers.onFinal?.(streamResult);
  }

  private drainQueue(): void {
    this.drainTimer = undefined;
    const socket = this.socket;
    if (!socket || socket.readyState !== SOCKET_OPEN) return;
    while (this.queue.length > 0 && socket.bufferedAmount <= this.maximumBufferedAmount) {
      const frame = this.queue.shift();
      if (!frame) break;
      this.queuedBytes -= frame.byteLength;
      if (!this.sendFrame(socket, frame)) return;
    }
    if (this.queue.length > 0) {
      this.scheduleDrain();
      return;
    }
    if (this.stateValue === 'stopping' && !this.inputEnded) {
      this.inputEnded = true;
      this.sendFrame(socket, encodeEndAudioEvent());
    }
  }

  private scheduleDrain(): void {
    if (this.drainTimer !== undefined) return;
    this.drainTimer = setTimeout(() => this.drainQueue(), this.drainIntervalMs);
  }

  private fail(code: StreamClientErrorCode): void {
    this.terminalErrorEmitted = true;
    this.emitError(code);
    this.closeImmediately(false);
  }

  private emitError(code: StreamClientErrorCode): void {
    this.handlers.onError?.(safeError(code));
  }

  private sendFrame(socket: StreamWebSocket, frame: Uint8Array): boolean {
    try {
      socket.send(copyToArrayBuffer(frame));
      return true;
    } catch {
      this.fail('DISCONNECTED');
      return false;
    }
  }

  private closeImmediately(expected = true): void {
    const socket = this.socket;
    this.expectedClose = expected;
    if (socket && (socket.readyState === SOCKET_CONNECTING || socket.readyState === SOCKET_OPEN)) {
      socket.close(NORMAL_CLOSE_CODE);
    }
    if (this.socket === socket) this.finishClosed(expected);
  }

  private finishClosed(expected: boolean): void {
    const epoch = this.streamEpochValue;
    this.clearTimers();
    this.queue.length = 0;
    this.queuedBytes = 0;
    this.socket = undefined;
    this.inputEnded = false;
    this.transition('closed');
    this.pendingStop?.resolve();
    this.pendingStop = undefined;
    if (epoch !== undefined) this.handlers.onDisconnected?.({ streamEpoch: epoch, expected });
  }

  private rejectPendingStart(message: string): void {
    this.pendingStart?.reject(new Error(message));
    this.pendingStart = undefined;
  }

  private transition(state: StreamConnectionState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    this.handlers.onStateChange?.(state);
  }

  private clearTimers(): void {
    if (this.drainTimer !== undefined) clearTimeout(this.drainTimer);
    if (this.connectTimer !== undefined) clearTimeout(this.connectTimer);
    if (this.stopTimer !== undefined) clearTimeout(this.stopTimer);
    this.drainTimer = undefined;
    this.connectTimer = undefined;
    this.stopTimer = undefined;
  }

  private isCurrent(socket: StreamWebSocket, generation: number): boolean {
    return this.socket === socket && this.generation === generation;
  }
}
