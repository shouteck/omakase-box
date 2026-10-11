import { crc32 } from 'node:zlib';
import { MAX_UPLOAD_BYTES } from './types.js';

function dimensions(width: number, height: number) {
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16777216) throw new Error('invalid_evidence');
}
function png(bytes: Buffer) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('invalid_evidence');
  let offset = 8, header = false, data = false, dataEnded = false, ended = false, dataBytes = 0;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (end > bytes.length) throw new Error('invalid_evidence');
    const name = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(name) || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new Error('invalid_evidence');
    if (!header && name !== 'IHDR') throw new Error('invalid_evidence');
    if (name === 'IHDR') {
      if (header || length !== 13) throw new Error('invalid_evidence');
      dimensions(bytes.readUInt32BE(offset + 8), bytes.readUInt32BE(offset + 12));
      const depth = bytes[offset + 16]!, colour = bytes[offset + 17]!;
      const allowedDepths: Record<number, readonly number[]> = { 0: [1,2,4,8,16], 2: [8,16], 3: [1,2,4,8], 4: [8,16], 6: [8,16] };
      if (!allowedDepths[colour]?.includes(depth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || ![0,1].includes(bytes[offset + 20]!)) throw new Error('invalid_evidence');
      header = true;
    } else if (name === 'IDAT') {
      if (dataEnded) throw new Error('invalid_evidence');
      data = true; dataBytes += length;
    } else {
      if (data) dataEnded = true;
      if (name === 'IEND') { if (length !== 0 || !data || dataBytes < 6 || end !== bytes.length) throw new Error('invalid_evidence'); ended = true; break; }
      if (name[0] === name[0]!.toUpperCase() && name !== 'PLTE') throw new Error('invalid_evidence');
    }
    offset = end;
  }
  if (!ended) throw new Error('invalid_evidence');
}
function jpeg(bytes: Buffer) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('invalid_evidence');
  let offset = 2, frame = false, scan = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error('invalid_evidence');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) { if (!frame || !scan || offset !== bytes.length) throw new Error('invalid_evidence'); return; }
    if (marker === undefined || marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > bytes.length) throw new Error('invalid_evidence');
    const length = bytes.readUInt16BE(offset), end = offset + length;
    if (length < 2 || end > bytes.length) throw new Error('invalid_evidence');
    if ([0xc0,0xc1,0xc2].includes(marker)) {
      if (frame || length < 8 || bytes[offset + 2] !== 8) throw new Error('invalid_evidence');
      dimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
      const components = bytes[offset + 7]!;
      if (![1,3,4].includes(components) || length !== 8 + 3 * components) throw new Error('invalid_evidence');
      frame = true;
    }
    offset = end;
    if (marker === 0xda) {
      const components = bytes[end - length + 2]!;
      if (!frame || ![1,3,4].includes(components) || length !== 6 + 2 * components) throw new Error('invalid_evidence');
      scan = true;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const next = bytes[offset + 1];
        if (next === 0 || (next !== undefined && next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
        break;
      }
    }
  }
  throw new Error('invalid_evidence');
}
export function validateEvidence(mediaType: unknown, input: Buffer): Buffer {
  try {
    if (!Buffer.isBuffer(input) || input.length === 0 || input.length > MAX_UPLOAD_BYTES) throw new Error();
    const bytes = Buffer.from(input);
    if (mediaType === 'text/plain') {
      if (bytes.length > 65536 || new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).includes('\0')) throw new Error();
    } else if (mediaType === 'image/png') png(bytes);
    else if (mediaType === 'image/jpeg') jpeg(bytes);
    else throw new Error();
    return bytes;
  } catch { throw new Error('invalid_evidence'); }
}
