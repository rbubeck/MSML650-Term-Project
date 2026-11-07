import { EventStreamDecodeError } from '../errors.js';
import { crc32 } from './crc32.js';

const PRELUDE_BYTES = 8;
const PRELUDE_CRC_BYTES = 4;
const MESSAGE_CRC_BYTES = 4;
const MESSAGE_OVERHEAD_BYTES = PRELUDE_BYTES + PRELUDE_CRC_BYTES + MESSAGE_CRC_BYTES;
const DEFAULT_MAX_MESSAGE_BYTES = 1_048_576;

const HEADER_TYPE_TRUE = 0;
const HEADER_TYPE_FALSE = 1;
const HEADER_TYPE_BYTE = 2;
const HEADER_TYPE_SHORT = 3;
const HEADER_TYPE_INTEGER = 4;
const HEADER_TYPE_LONG = 5;
const HEADER_TYPE_BYTE_ARRAY = 6;
const HEADER_TYPE_STRING = 7;
const HEADER_TYPE_TIMESTAMP = 8;
const HEADER_TYPE_UUID = 9;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export type EventStreamHeaderValue =
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'byte'; readonly value: number }
  | { readonly type: 'short'; readonly value: number }
  | { readonly type: 'integer'; readonly value: number }
  | { readonly type: 'long'; readonly value: bigint }
  | { readonly type: 'byte-array'; readonly value: Uint8Array }
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'timestamp'; readonly value: bigint }
  | { readonly type: 'uuid'; readonly value: Uint8Array };

export interface EventStreamMessage {
  readonly headers: Readonly<Record<string, EventStreamHeaderValue>>;
  readonly payload: Uint8Array;
}

export interface DecodeEventStreamOptions {
  readonly maximumMessageBytes?: number;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function encodeUnsignedShort(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, false);
  return bytes;
}

function encodeFixedNumber(byteLength: 1 | 2 | 4, value: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);
  if (byteLength === 1) view.setInt8(0, value);
  else if (byteLength === 2) view.setInt16(0, value, false);
  else view.setInt32(0, value, false);
  return bytes;
}

function encodeBigInt(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, value, false);
  return bytes;
}

function requireIntegerInRange(value: number, minimum: number, maximum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `EventStream header number must be an integer from ${minimum} to ${maximum}.`,
    );
  }
}

function encodeHeaderValue(header: EventStreamHeaderValue): Uint8Array {
  switch (header.type) {
    case 'boolean':
      return Uint8Array.of(header.value ? HEADER_TYPE_TRUE : HEADER_TYPE_FALSE);
    case 'byte':
      requireIntegerInRange(header.value, -128, 127);
      return concatBytes([Uint8Array.of(HEADER_TYPE_BYTE), encodeFixedNumber(1, header.value)]);
    case 'short':
      requireIntegerInRange(header.value, -32_768, 32_767);
      return concatBytes([Uint8Array.of(HEADER_TYPE_SHORT), encodeFixedNumber(2, header.value)]);
    case 'integer':
      requireIntegerInRange(header.value, -2_147_483_648, 2_147_483_647);
      return concatBytes([Uint8Array.of(HEADER_TYPE_INTEGER), encodeFixedNumber(4, header.value)]);
    case 'long':
      return concatBytes([Uint8Array.of(HEADER_TYPE_LONG), encodeBigInt(header.value)]);
    case 'timestamp':
      return concatBytes([Uint8Array.of(HEADER_TYPE_TIMESTAMP), encodeBigInt(header.value)]);
    case 'byte-array': {
      if (header.value.byteLength > 65_535)
        throw new RangeError('EventStream byte-array header is too long.');
      return concatBytes([
        Uint8Array.of(HEADER_TYPE_BYTE_ARRAY),
        encodeUnsignedShort(header.value.byteLength),
        header.value,
      ]);
    }
    case 'string': {
      const bytes = textEncoder.encode(header.value);
      if (bytes.byteLength > 65_535) throw new RangeError('EventStream string header is too long.');
      return concatBytes([
        Uint8Array.of(HEADER_TYPE_STRING),
        encodeUnsignedShort(bytes.byteLength),
        bytes,
      ]);
    }
    case 'uuid':
      if (header.value.byteLength !== 16)
        throw new RangeError('EventStream UUID header must be 16 bytes.');
      return concatBytes([Uint8Array.of(HEADER_TYPE_UUID), header.value]);
  }
}

function encodeHeaders(headers: Readonly<Record<string, EventStreamHeaderValue>>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [name, value] of Object.entries(headers)) {
    const nameBytes = textEncoder.encode(name);
    if (nameBytes.byteLength === 0 || nameBytes.byteLength > 255) {
      throw new RangeError('EventStream header name must contain 1 to 255 UTF-8 bytes.');
    }
    parts.push(Uint8Array.of(nameBytes.byteLength), nameBytes, encodeHeaderValue(value));
  }
  return concatBytes(parts);
}

export function encodeEventStreamMessage(message: EventStreamMessage): Uint8Array {
  const headerBytes = encodeHeaders(message.headers);
  const totalLength = MESSAGE_OVERHEAD_BYTES + headerBytes.byteLength + message.payload.byteLength;
  if (totalLength > 0xffffffff)
    throw new RangeError('EventStream message exceeds the 32-bit length field.');

  const result = new Uint8Array(totalLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, totalLength, false);
  view.setUint32(4, headerBytes.byteLength, false);
  view.setUint32(8, crc32(result.subarray(0, PRELUDE_BYTES)), false);
  result.set(headerBytes, PRELUDE_BYTES + PRELUDE_CRC_BYTES);
  result.set(message.payload, PRELUDE_BYTES + PRELUDE_CRC_BYTES + headerBytes.byteLength);
  view.setUint32(
    totalLength - MESSAGE_CRC_BYTES,
    crc32(result.subarray(0, -MESSAGE_CRC_BYTES)),
    false,
  );
  return result;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return textDecoder.decode(bytes);
  } catch {
    throw new EventStreamDecodeError('INVALID_UTF8');
  }
}

function requireAvailable(offset: number, byteLength: number, end: number): void {
  if (byteLength < 0 || offset < 0 || offset + byteLength > end) {
    throw new EventStreamDecodeError('MALFORMED_HEADER');
  }
}

function decodeHeaders(bytes: Uint8Array): Readonly<Record<string, EventStreamHeaderValue>> {
  const headers: Record<string, EventStreamHeaderValue> = Object.create(null) as Record<
    string,
    EventStreamHeaderValue
  >;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  while (offset < bytes.byteLength) {
    requireAvailable(offset, 1, bytes.byteLength);
    const nameLength = view.getUint8(offset);
    offset += 1;
    if (nameLength === 0) throw new EventStreamDecodeError('MALFORMED_HEADER');
    requireAvailable(offset, nameLength + 1, bytes.byteLength);
    const name = decodeUtf8(bytes.subarray(offset, offset + nameLength));
    offset += nameLength;
    if (Object.hasOwn(headers, name)) throw new EventStreamDecodeError('DUPLICATE_HEADER');
    const type = view.getUint8(offset);
    offset += 1;

    let header: EventStreamHeaderValue;
    switch (type) {
      case HEADER_TYPE_TRUE:
        header = { type: 'boolean', value: true };
        break;
      case HEADER_TYPE_FALSE:
        header = { type: 'boolean', value: false };
        break;
      case HEADER_TYPE_BYTE:
        requireAvailable(offset, 1, bytes.byteLength);
        header = { type: 'byte', value: view.getInt8(offset) };
        offset += 1;
        break;
      case HEADER_TYPE_SHORT:
        requireAvailable(offset, 2, bytes.byteLength);
        header = { type: 'short', value: view.getInt16(offset, false) };
        offset += 2;
        break;
      case HEADER_TYPE_INTEGER:
        requireAvailable(offset, 4, bytes.byteLength);
        header = { type: 'integer', value: view.getInt32(offset, false) };
        offset += 4;
        break;
      case HEADER_TYPE_LONG:
        requireAvailable(offset, 8, bytes.byteLength);
        header = { type: 'long', value: view.getBigInt64(offset, false) };
        offset += 8;
        break;
      case HEADER_TYPE_TIMESTAMP:
        requireAvailable(offset, 8, bytes.byteLength);
        header = { type: 'timestamp', value: view.getBigInt64(offset, false) };
        offset += 8;
        break;
      case HEADER_TYPE_BYTE_ARRAY:
      case HEADER_TYPE_STRING: {
        requireAvailable(offset, 2, bytes.byteLength);
        const valueLength = view.getUint16(offset, false);
        offset += 2;
        requireAvailable(offset, valueLength, bytes.byteLength);
        const valueBytes = bytes.slice(offset, offset + valueLength);
        offset += valueLength;
        header =
          type === HEADER_TYPE_STRING
            ? { type: 'string', value: decodeUtf8(valueBytes) }
            : { type: 'byte-array', value: valueBytes };
        break;
      }
      case HEADER_TYPE_UUID:
        requireAvailable(offset, 16, bytes.byteLength);
        header = { type: 'uuid', value: bytes.slice(offset, offset + 16) };
        offset += 16;
        break;
      default:
        throw new EventStreamDecodeError('UNSUPPORTED_HEADER_TYPE');
    }
    headers[name] = header;
  }

  return Object.freeze(headers);
}

export function decodeEventStreamMessage(
  input: Uint8Array,
  options: DecodeEventStreamOptions = {},
): EventStreamMessage {
  if (input.byteLength < MESSAGE_OVERHEAD_BYTES) {
    throw new EventStreamDecodeError('MESSAGE_TOO_SMALL');
  }
  const maximumMessageBytes = options.maximumMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
  if (!Number.isSafeInteger(maximumMessageBytes) || maximumMessageBytes < MESSAGE_OVERHEAD_BYTES) {
    throw new RangeError('maximumMessageBytes must be a safe integer of at least 16.');
  }
  if (input.byteLength > maximumMessageBytes) {
    throw new EventStreamDecodeError('MESSAGE_TOO_LARGE');
  }

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const totalLength = view.getUint32(0, false);
  const headersLength = view.getUint32(4, false);
  if (totalLength !== input.byteLength) throw new EventStreamDecodeError('LENGTH_MISMATCH');
  if (headersLength > totalLength - MESSAGE_OVERHEAD_BYTES) {
    throw new EventStreamDecodeError('INVALID_HEADERS_LENGTH');
  }
  if (view.getUint32(8, false) !== crc32(input.subarray(0, PRELUDE_BYTES))) {
    throw new EventStreamDecodeError('PRELUDE_CRC_MISMATCH');
  }
  if (
    view.getUint32(totalLength - MESSAGE_CRC_BYTES, false) !==
    crc32(input.subarray(0, totalLength - MESSAGE_CRC_BYTES))
  ) {
    throw new EventStreamDecodeError('MESSAGE_CRC_MISMATCH');
  }

  const headersStart = PRELUDE_BYTES + PRELUDE_CRC_BYTES;
  const payloadStart = headersStart + headersLength;
  return {
    headers: decodeHeaders(input.subarray(headersStart, payloadStart)),
    payload: input.slice(payloadStart, totalLength - MESSAGE_CRC_BYTES),
  };
}

export function getStringHeader(
  headers: Readonly<Record<string, EventStreamHeaderValue>>,
  name: string,
): string | undefined {
  const header = headers[name];
  return header?.type === 'string' ? header.value : undefined;
}
