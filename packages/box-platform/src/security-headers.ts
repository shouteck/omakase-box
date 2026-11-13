// PF38: the standard security headers on every answer the board gives. One source for both places that set them:
// - the Worker, which answers every address but Next's own files (`run_worker_first` in wrangler.toml), through
//   `secured()` around `handle()`. Cloudflare applies no `_headers` rule to an answer the Worker returns, so this is
//   the only way a page gets them;
// - `public/_headers` (copied into `out/` by the build), for the `/_next/*` files Cloudflare serves without the
//   Worker: the same fixed set, and a test compares the two.
// A page's policy allows exactly its own inline scripts, by hash, computed from the page as it is served: a static
// export has no server to make a nonce, and a hash list fixed at build time would block the scripts of a build that
// forgot to make it. Styles stay `'unsafe-inline'`: the pages carry `style=` attributes, which no hash can allow.

/** The headers every answer carries, whatever it is. Transport security: the live board sent none (read 13 November 2026). */
export const FIXED_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'strict-transport-security': 'max-age=31536000'
};

/** The policy of an answer that is not a page: it may load nothing and be framed by nothing. */
export const NOT_A_PAGE_POLICY = "default-src 'none'; frame-ancestors 'none'";

/** A page's policy: its own origin for everything, its own inline scripts by hash, never framed, forms only to itself.
    No provider is named: Stripe and PayPal are reached by a redirect, which needs no allowance. */
export function pagePolicy(scriptHashes: readonly string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self'${scriptHashes.map(hash => ` '${hash}'`).join('')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ].join('; ');
}

const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi;

/** `sha256-<base64>` of each distinct inline script, as a browser hashes it (the parser has turned CR LF into LF). */
export async function inlineScriptHashes(html: string): Promise<string[]> {
  const hashes = new Set<string>();
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const text = match[1]!.replace(/\r\n?/g, '\n');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    let binary = '';
    for (const byte of digest) binary += String.fromCharCode(byte);
    hashes.add(`sha256-${btoa(binary)}`);
  }
  return [...hashes].sort();
}

/** The same answer with the headers set: a page gets its policy from its own scripts, anything else the closed one. */
export async function secured(response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(FIXED_HEADERS)) headers.set(name, value);
  if (!(headers.get('content-type') ?? '').toLowerCase().startsWith('text/html')) {
    headers.set('content-security-policy', NOT_A_PAGE_POLICY);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  const html = await response.text();
  headers.set('content-security-policy', pagePolicy(await inlineScriptHashes(html)));
  headers.delete('content-length');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}
