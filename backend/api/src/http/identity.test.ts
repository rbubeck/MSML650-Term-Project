import { describe, expect, it } from 'vitest';
import { MAX_OWNER_ID_LENGTH, identityFromClaims, identityFromEvent } from './identity.js';

describe('identityFromClaims', () => {
  it('uses the sub claim as the owner', () => {
    expect(identityFromClaims({ sub: 'user-123' })).toEqual({ ownerId: 'user-123' });
  });

  it('accepts an access token and ignores unrelated claims such as a client-style userId', () => {
    const identity = identityFromClaims({
      sub: 'user-123',
      token_use: 'access',
      client_id: 'abc',
      userId: 'someone-else',
    });
    expect(identity).toEqual({ ownerId: 'user-123' });
  });

  it('rejects a missing, empty, non-string, padded or oversized subject', () => {
    expect(identityFromClaims({})).toBeNull();
    expect(identityFromClaims({ sub: '' })).toBeNull();
    expect(identityFromClaims({ sub: 42 })).toBeNull();
    expect(identityFromClaims({ sub: ' user ' })).toBeNull();
    expect(identityFromClaims({ sub: 'a'.repeat(MAX_OWNER_ID_LENGTH + 1) })).toBeNull();
  });

  it('rejects an ID token because the contract requires the access token', () => {
    expect(identityFromClaims({ sub: 'user-123', token_use: 'id' })).toBeNull();
  });

  it('rejects claims that are not an object', () => {
    for (const claims of [undefined, null, 'sub', 7, ['sub']]) {
      expect(identityFromClaims(claims)).toBeNull();
    }
  });
});

describe('identityFromEvent', () => {
  it('reads the claims API Gateway attached to the event', () => {
    const event = { requestContext: { authorizer: { jwt: { claims: { sub: 'user-9' } } } } };
    expect(identityFromEvent(event)).toEqual({ ownerId: 'user-9' });
  });

  it('returns null when there is no authorizer context', () => {
    expect(identityFromEvent({})).toBeNull();
    expect(identityFromEvent({ requestContext: {} })).toBeNull();
    expect(identityFromEvent({ requestContext: { authorizer: {} } })).toBeNull();
  });
});
