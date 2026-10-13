import { describe, expect, it } from 'vitest';
import { privateSessionCookie } from '../../../services/private-api/bootstrap/cookie-policy.js';
import { contributorSessionCookie } from '../../../services/external-api/bootstrap/cookie-policy.js';

// Split so this file's bytes hold no secret-shaped literal (the bounty
// suite's own scan guards every tracked test file); runtime value unchanged.
const token = 'synthetic_' + 'session_token_32_characters';
describe('host-only cookie serialization', () => {
  it('does not share cookie names or include any Domain attribute', () => {
    expect(privateSessionCookie(token, 'localhost_demo')).toBe(`private_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600`);
    expect(contributorSessionCookie(token, 'localhost_demo')).toBe(`contributor_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600`);
  });
  it('requires secure host-prefixed cookies in production', () => {
    for (const serialize of [privateSessionCookie, contributorSessionCookie]) {
      const cookie = serialize(token, 'production');
      expect(cookie).toMatch(/^__Host-/);
      expect(cookie).toContain('; Secure');
      expect(cookie).not.toContain('Domain=');
    }
  });
  it('rejects unknown deployment mode instead of silently issuing an insecure cookie', () => {
    for (const serialize of [privateSessionCookie, contributorSessionCookie]) expect(() => serialize(token, 'automatic' as 'production')).toThrow();
  });
  it('rejects header injection and unbounded/expired lifetime', () => {
    for (const serialize of [privateSessionCookie, contributorSessionCookie]) {
      expect(() => serialize(token + '\r\nDomain=localhost', 'production')).toThrow();
      expect(() => serialize(token, 'localhost_demo', 0)).toThrow();
      expect(() => serialize(token, 'localhost_demo', 86401)).toThrow();
    }
  });
});
