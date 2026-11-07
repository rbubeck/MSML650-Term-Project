import type { ApiGatewayEvent } from './events.js';
import type { Identity } from '../ports.js';

/** A Cognito `sub` is a UUID; this is a sanity bound, not a format rule. */
export const MAX_OWNER_ID_LENGTH = 128;

/**
 * Derive the caller from validated JWT claims. API Gateway has already verified
 * the token signature, issuer, client and expiry; this only reads the result.
 *
 * - The owner is the `sub` claim. A client-supplied user ID is never consulted.
 * - `token_use`, when present, must be `access`. The contract requires the access
 *   token, and rejecting an ID token catches a misconfigured client or authorizer.
 *
 * Returns `null` when the claims cannot identify a caller.
 */
export function identityFromClaims(claims: unknown): Identity | null {
  if (typeof claims !== 'object' || claims === null) return null;
  const record = claims as Record<string, unknown>;

  const sub = record['sub'];
  if (
    typeof sub !== 'string' ||
    sub.length === 0 ||
    sub.length > MAX_OWNER_ID_LENGTH ||
    sub.trim() !== sub
  ) {
    return null;
  }

  const tokenUse = record['token_use'];
  if (tokenUse !== undefined && tokenUse !== 'access') return null;

  return { ownerId: sub };
}

/** Default resolver: read the claims API Gateway attached to the event. */
export function identityFromEvent(event: ApiGatewayEvent): Identity | null {
  return identityFromClaims(event.requestContext?.authorizer?.jwt?.claims);
}
