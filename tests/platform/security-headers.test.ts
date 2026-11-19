import { expect, it } from 'vitest';
import { secured } from '../../packages/box-platform/src/security-headers.js';

it.each([
  ['text/html; charset=utf-8', 'public, max-age=0, must-revalidate', 'public, max-age=0, must-revalidate, no-transform'],
  ['text/html', null, 'no-transform'],
  ['text/html', 'public, No-Transform', 'public, No-Transform'],
  ['application/javascript', 'public, max-age=31536000, immutable', 'public, max-age=31536000, immutable'],
  ['application/json', null, null],
])('preserves cache directives and prevents transformation of HTML only (%s, %s)', async (type, current, expected) => {
  const headers = new Headers({ 'content-type': type });
  if (current !== null) headers.set('cache-control', current);
  const answer = await secured(new Response(type.startsWith('text/html') ? '<script>abc</script>' : 'body', { headers }));
  expect(answer.headers.get('cache-control')).toBe(expected);
  const policy = answer.headers.get('content-security-policy');
  if (type.startsWith('text/html')) {
    expect(policy?.split('; ').find(part => part.startsWith('script-src'))).toBe("script-src 'self' 'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='");
    expect(policy).toContain("connect-src 'self'");
  } else {
    expect(policy).toBe("default-src 'none'; frame-ancestors 'none'");
  }
});
