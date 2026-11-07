import { describe, expect, it } from 'vitest';
import { validateStreamUrlConfig } from './config.js';

describe('validateStreamUrlConfig', () => {
  it('defaults the expiry to the proposed 60 seconds', () => {
    const config = validateStreamUrlConfig({
      region: 'us-east-1',
      allowedLanguageCodes: ['en-US'],
    });
    expect(config.expirySeconds).toBe(60);
    expect(config.region).toBe('us-east-1');
    expect(config.allowedLanguageCodes.has('en-US')).toBe(true);
  });

  it('accepts an explicit expiry up to the AWS maximum of 300', () => {
    for (const expirySeconds of [1, 120, 300]) {
      const config = validateStreamUrlConfig({
        region: 'us-east-1',
        expirySeconds,
        allowedLanguageCodes: ['en-US'],
      });
      expect(config.expirySeconds).toBe(expirySeconds);
    }
  });

  it('rejects an expiry that is zero, above 300, or not a whole number', () => {
    for (const expirySeconds of [0, -5, 301, 60.5, Number.NaN]) {
      expect(() =>
        validateStreamUrlConfig({
          region: 'us-east-1',
          expirySeconds,
          allowedLanguageCodes: ['en-US'],
        }),
      ).toThrow('expirySeconds');
    }
  });

  it('rejects a malformed region', () => {
    for (const region of ['', 'us east 1', 'US-EAST-1', 'evil.example.com/x', 'us-east-1.evil']) {
      expect(() => validateStreamUrlConfig({ region, allowedLanguageCodes: ['en-US'] })).toThrow(
        'region',
      );
    }
  });

  it('requires at least one well-formed language code', () => {
    expect(() =>
      validateStreamUrlConfig({ region: 'us-east-1', allowedLanguageCodes: [] }),
    ).toThrow('allowedLanguageCodes');
    expect(() =>
      validateStreamUrlConfig({ region: 'us-east-1', allowedLanguageCodes: ['not a language'] }),
    ).toThrow('allowedLanguageCodes');
  });

  it('never echoes the offending value in its error message', () => {
    const secretLooking = 'AKIA-SECRET-LOOKING-REGION';
    try {
      validateStreamUrlConfig({ region: secretLooking, allowedLanguageCodes: ['en-US'] });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(secretLooking);
    }
  });
});
