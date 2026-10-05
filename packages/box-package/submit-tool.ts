// The submission tool every exported Box carries at box/submit.mjs. It is emitted as a
// constant string so the folder is self-contained: the recipient runs it with plain
// `node`, no box-cli, no repository, no install beyond what the Box already declares.
// The script seals the editable files into submission.json (format "editable-overlay"),
// bound to the Box identity, version, base commit and agreement hash it reads out of
// box.json, and it refuses to run when a recorded read-only file was modified.
// Owner-side validation of the artifact lives in ./submission.ts.

export const SUBMIT_TOOL_PATH = 'box/submit.mjs';

export const SUBMIT_TOOL = `// box/submit.mjs -- emitted into every exported Box by the owner-side export.
// Seals the recipient's work into a submission artifact bound to this Box's identity,
// version, base commit and agreement hash. Self-contained: Node.js built-ins only.
// Usage: node box/submit.mjs [output-file]   (default: submission.json at the Box root)
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const newline = String.fromCharCode(10);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const refuse = (message) => {
  console.error('submit refused: ' + message);
  process.exit(1);
};

let manifestBytes;
try {
  manifestBytes = readFileSync(join(root, 'box.json'));
} catch {
  refuse('box.json is missing from this Box folder');
}
let manifest;
try {
  manifest = JSON.parse(manifestBytes.toString('utf8'));
} catch (error) {
  refuse('box.json is not valid JSON: ' + (error && error.message ? error.message : error));
}
const editable = manifest && manifest.submission && Array.isArray(manifest.submission.editable)
  ? manifest.submission.editable
  : manifest && manifest.editable;
if (
  !manifest ||
  !manifest.box || typeof manifest.box.id !== 'string' || typeof manifest.box.name !== 'string' ||
  typeof manifest.box.version !== 'number' ||
  typeof manifest.baseCommit !== 'string' || typeof manifest.agreementSha256 !== 'string' ||
  !Array.isArray(manifest.files) || !Array.isArray(editable)
) {
  refuse('box.json is missing the fields this tool needs (box, baseCommit, agreementSha256, files, editable)');
}

// Integrity seal: every recorded file that is not editable must still hash to the value
// export recorded in box.json. A modified read-only file means the folder was edited
// outside the editable surface, so no honest submission can come from it.
const editableBoxes = new Set(editable.map((entry) => entry.box));
for (const file of manifest.files) {
  let bytes;
  try {
    bytes = readFileSync(join(root, file.box));
  } catch {
    refuse('recorded file ' + file.box + ' is missing from the folder');
  }
  if (!editableBoxes.has(file.box) && sha256(bytes) !== file.sha256) {
    refuse('read-only file ' + file.box + ' was modified; only the editable paths in box.json may change');
  }
}

const files = [];
for (const entry of editable) {
  let bytes;
  try {
    bytes = readFileSync(join(root, entry.box));
  } catch {
    refuse('editable file ' + entry.box + ' is missing from the folder');
  }
  const record = manifest.files.find((file) => file.box === entry.box);
  files.push({
    box: entry.box,
    owner: entry.owner,
    baselineSha256: record ? record.sha256 : null,
    sha256: sha256(bytes),
    content: bytes.toString('utf8')
  });
}

const artifact = {
  schemaVersion: 1,
  format: 'editable-overlay',
  box: { id: manifest.box.id, name: manifest.box.name, version: manifest.box.version },
  baseCommit: manifest.baseCommit,
  agreementSha256: manifest.agreementSha256,
  boxJsonSha256: sha256(manifestBytes),
  files
};
const out = process.argv[2] ? resolve(process.argv[2]) : join(root, 'submission.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(artifact, null, 2) + newline);
const changed = files.filter((file) => file.sha256 !== file.baselineSha256).length;
console.log(JSON.stringify({
  submission: out,
  box: artifact.box.id,
  version: artifact.box.version,
  baseCommit: artifact.baseCommit,
  files: files.length,
  changed: changed
}, null, 2));
`;
