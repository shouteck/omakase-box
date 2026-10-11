import { crc32, deflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { validateEvidence } from '../../../services/private-api/requests/media.js';

export function png(emptyData = false) {
  const chunk = (name: string, bytes: Buffer) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
    const body = Buffer.concat([Buffer.from(name), bytes]);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', emptyData ? Buffer.alloc(0) : deflateSync(Buffer.from([0,255,0,0,255]))), chunk('IEND', Buffer.alloc(0))]);
}
it('accepts bounded UTF-8 text as data, preserving HTML-like content without interpretation', () => {
  const text = Buffer.from('<script>syntheticUntrusted()</script>');
  expect(validateEvidence('text/plain', text)).toEqual(text);
  expect(() => validateEvidence('text/html', text)).toThrow('invalid_evidence');
  expect(() => validateEvidence('text/plain', Buffer.from([0xc3, 0x28]))).toThrow();
  expect(() => validateEvidence('text/plain', Buffer.from([0]))).toThrow();
});
it('validates PNG structure, dimensions, CRC and exact end rather than just the prefix', () => {
  const bytes = png();
  expect(validateEvidence('image/png', bytes)).toEqual(bytes);
  for (const bad of [bytes.subarray(0, 24), Buffer.concat([bytes, Buffer.from('<html>')]), Buffer.from('<svg onload="synthetic()"/>')]) expect(() => validateEvidence('image/png', bad)).toThrow();
  const corrupt = Buffer.from(bytes); corrupt[29] = corrupt[29]! ^ 1;
  expect(() => validateEvidence('image/png', corrupt)).toThrow();
  expect(() => validateEvidence('image/jpeg', bytes)).toThrow();
});
it('rejects a PNG with no compressed image data even when its chunk CRCs are valid', () => {
  expect(() => validateEvidence('image/png', png(true))).toThrow('invalid_evidence');
});
it('enforces upload limits before parsing and rejects empty data', () => {
  expect(() => validateEvidence('text/plain', Buffer.alloc(65537, 65))).toThrow();
  expect(() => validateEvidence('image/png', Buffer.alloc(1048577))).toThrow();
  expect(() => validateEvidence('text/plain', Buffer.alloc(0))).toThrow();
});
