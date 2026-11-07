import {
  STREAM_URL_MAX_EXPIRY_SECONDS,
  STREAM_URL_PROPOSED_EXPIRY_SECONDS,
  languageCodeSchema,
} from '@live-transcription/contracts';

/** Validated, immutable configuration for the stream-URL handler. */
export interface StreamUrlConfig {
  /** AWS Region for the Transcribe endpoint. NOT a deployed team decision. */
  readonly region: string;
  /** Connection-start expiry. This is not a stream-duration limit. */
  readonly expirySeconds: number;
  /** Languages a session may stream in. The approved list is still undecided. */
  readonly allowedLanguageCodes: ReadonlySet<string>;
}

export interface StreamUrlConfigInput {
  readonly region: string;
  /** Defaults to the proposed 60 seconds. Must be a whole number from 1 to 300. */
  readonly expirySeconds?: number;
  readonly allowedLanguageCodes: Iterable<string>;
}

const REGION_PATTERN = /^[a-z]{2}(?:-[a-z]+)+-\d{1,2}$/;

/**
 * Validate configuration once, at startup, so a mistake fails loudly before any
 * request is served. Error messages never echo the offending values.
 */
export function validateStreamUrlConfig(input: StreamUrlConfigInput): StreamUrlConfig {
  if (!REGION_PATTERN.test(input.region)) {
    throw new Error('Invalid stream URL configuration: region.');
  }

  const expirySeconds = input.expirySeconds ?? STREAM_URL_PROPOSED_EXPIRY_SECONDS;
  if (
    !Number.isInteger(expirySeconds) ||
    expirySeconds < 1 ||
    expirySeconds > STREAM_URL_MAX_EXPIRY_SECONDS
  ) {
    throw new Error('Invalid stream URL configuration: expirySeconds.');
  }

  const allowedLanguageCodes = new Set(input.allowedLanguageCodes);
  if (allowedLanguageCodes.size === 0) {
    throw new Error('Invalid stream URL configuration: allowedLanguageCodes.');
  }
  for (const code of allowedLanguageCodes) {
    if (!languageCodeSchema.safeParse(code).success) {
      throw new Error('Invalid stream URL configuration: allowedLanguageCodes.');
    }
  }

  return { region: input.region, expirySeconds, allowedLanguageCodes };
}
