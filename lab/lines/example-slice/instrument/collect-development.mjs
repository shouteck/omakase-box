// Blind public ingestion. Confirmation IDs are rejected before any API call.
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {testPath,safePath} from './core.mjs';
const pool=JSON.parse(readFileSync(new URL('../replay-1/candidate-metadata.json',import.meta.url),'utf8'));
export function authorize(repo,number) {
  const candidate=pool.repositories.find(r=>r.repository===repo)?.candidates.find(c=>c.number===number);
  if (!candidate||candidate.partition!=='development') throw new Error('Development ID required; confirmation content is closed');
  return candidate;
}
export function api(endpoint,jq) {
  const response=spawnSync('gh',['api',endpoint,'--jq',jq],{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
  if (response.status!==0) throw new Error('Public GitHub API request failed: '+response.stderr);
  return JSON.parse(response.stdout);
}
export function collect(repo,number) {
  const candidate=authorize(repo,number);
  const directory=new URL(`../replay-1/development/${repo.replace('/','--')}-${number}/`,import.meta.url);
  if (existsSync(directory)) throw new Error('Snapshot exists: never overwrite');
  const pr=api(`repos/${repo}/pulls/${number}`,'{number,merged,merge_commit_sha,created_at,merged_at}');
  if (!pr.merged||!pr.merge_commit_sha) throw new Error('Not an accepted commit');
  const commit=api(`repos/${repo}/commits/${pr.merge_commit_sha}`,'{sha,parents:[.parents[].sha],committed_at:.commit.committer.date}');
  if (!commit.parents.length) throw new Error('Unresolved provenance');
  // API filtering executes before stdout: production file names and patch text are not emitted.
  const files=acceptedTests(repo,commit.parents[0],commit.sha);
  const overlay=[];
  for (const f of files) {
    safePath(f.filename); if (!testPath(repo,f.filename)) throw new Error('Not test family');
    if (f.previous_filename && !testPath(repo,f.previous_filename)) throw new Error('Cross-family rename needs review');
    if (f.status==='removed') { overlay.push({path:f.filename,action:'delete'}); continue; }
    if (!['added','modified','renamed'].includes(f.status)) throw new Error('Unsupported test change status');
    const blob=api(`repos/${repo}/git/blobs/${f.sha}`,'{sha,encoding,content,size}');
    if (blob.encoding!=='base64') throw new Error('Unsupported blob encoding');
    const bytes=Buffer.from(blob.content,'base64');
    const hash=createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
    if (hash!==f.sha||bytes.length!==blob.size) throw new Error('Blob integrity failed');
    if (f.status==='renamed') overlay.push({path:f.previous_filename,action:'delete'});
    overlay.push({path:f.filename,action:f.status==='added'||f.status==='renamed'?'add':'modify',gitBlob:f.sha,bytes:bytes.length,
      contentBase64:bytes.toString('base64'),...(f.previous_filename?{previousTestPath:f.previous_filename}:{})});
  }
  const snapshot={schema:1,kind:'development test-only ingestion, not admitted task',captured_at:new Date().toISOString(),
    repository:repo,number,candidate,acceptedCommit:commit.sha,baseCommit:commit.parents[0],parentCount:commit.parents.length,
    acceptedCommitDate:commit.committed_at,pr,overlay,request:'not yet collected',admission:'not evaluated',
    limits:['No production paths/diff emitted','Test-only path family is provisional; fixture semantics require review','No project execution','No commands or runtime frozen']};
  mkdirSync(directory,{recursive:true});
  writeFileSync(new URL('test-overlay.json',directory),JSON.stringify(snapshot,null,2)+'\n');
  return {repository:repo,number,tests:overlay.length,baseCommit:snapshot.baseCommit,acceptedCommit:snapshot.acceptedCommit};
}
export function acceptedTests(repo,base,fixed) {
  if (!/^[a-f0-9]{40}$/.test(base)||!/^[a-f0-9]{40}$/.test(fixed)) throw new Error('Invalid commit SHA');
  const predicate=repo==='colinhacks/zod' ? `test(${JSON.stringify('(^|/)(__tests__|tests)/|\\.(test|spec)\\.ts$')})` :
    repo==='sindresorhus/ky' ? 'test("^(test|test-d)/")' : 'startswith("tests/")';
  // Compare API emits at most 300 changed files. An exact boundary is conservatively unsupported.
  // Cross-family renames expose only a boolean refusal, never the previous production path.
  const batch=api(`repos/${repo}/compare/${base}...${fixed}`,
    `{file_count:(.files|length),tests:[.files[]|select(.filename|${predicate})|`+
    `{filename,status,sha,previous_filename:(if (.previous_filename!=null and (.previous_filename|${predicate}|not)) then null else .previous_filename end),`+
    `cross_family:(.previous_filename!=null and (.previous_filename|${predicate}|not))}]}`);
  if (batch.file_count>=300) throw new Error('Accepted diff may be truncated; no snapshot permitted');
  if (batch.tests.some(f=>f.cross_family)) throw new Error('Cross-family rename requires review');
  return batch.tests;
}
if (process.argv[1]===fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(collect(process.argv[2],Number(process.argv[3]))));
}
