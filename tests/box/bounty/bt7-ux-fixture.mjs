// Disposable offline recipient repository. This script never contacts GitHub.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../../', import.meta.url));
const cli = join(source, 'packages/box-cli/dist/cli.js');
const [action, target] = process.argv.slice(2);
if (!['create', 'cleanup'].includes(action) || !target) throw new Error('usage: node tests/box/bounty/bt7-ux-fixture.mjs create|cleanup <Projects/kitchen-BT7-name>');
const root = resolve(target);
if (!/^kitchen-BT7-[a-z\d-]+$/i.test(root.split(/[\\/]/).at(-1))) throw new Error('fixture directory must be named kitchen-BT7-<name>');
const marker = join(root, 'BT7-owned.json');
const repo = join(root, 'repo');
const bin = join(root, 'bin');
const stateFile = join(root, 'offline-github.json');
const settingsDir = join(root, 'settings');
const transportPreload = join(root, 'transport-preload.cjs');
const write = (path, content) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
const run = (program, args, cwd = root, env = process.env) => {
  const result = spawnSync(program, args, { cwd, env, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`${program} failed (${result.status}): ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
};
const git = (where, args) => run('git', ['-c', `safe.directory=${where.replaceAll('\\', '/')}`, '-C', where, ...args]);
const invoke = (...args) => run(process.execPath, [join(root, 'invoke.cjs'), 'bounty', ...args]);

function plainComponents(path) {
  let cursor = path;
  while (true) {
    if (lstatSync(cursor, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`refusing link or junction: ${cursor}`);
    const parent = dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
}

function plainTree(path) {
  plainComponents(path);
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`refusing planted link: ${child}`);
    if (entry.isDirectory()) plainTree(child);
  }
}

if (action === 'cleanup') {
  if (!existsSync(marker) || JSON.parse(readFileSync(marker, 'utf8')).root !== root) throw new Error('not an owned BT7 fixture');
  plainTree(root);
  rmSync(root, { recursive: true, force: true });
  console.log(`removed disposable offline fixture ${root}`);
  process.exit(0);
}

if (existsSync(root)) throw new Error('fixture path already exists; never overwritten');
if (!existsSync(cli)) throw new Error('build the repository before creating the fixture');
plainComponents(dirname(root));
mkdirSync(repo, { recursive: true });
write(marker, JSON.stringify({ root, kind: 'BT7-disposable-offline-fixture' }));
write(transportPreload, `const cp = require('node:child_process');\nconst original = cp.spawnSync;\ncp.spawnSync = function(program, args, options) {\n  if (/(^|[\\\\/])git(?:\\.exe)?$/i.test(program) && Array.isArray(args)) args = args.map(arg => arg === 'https://github.com/owner/project.git' ? process.env.BT8A_GIT_REMOTE : arg);\n  return original.call(this, program, args, options);\n};\nrequire('node:module').syncBuiltinESMExports();\n`);
write(join(root, 'invoke.cjs'), `const {spawnSync}=require('node:child_process');\nconst {delimiter}=require('node:path');\nconst env={...process.env,PATH:${JSON.stringify(bin)}+delimiter+(process.env.PATH||''),BT7_UX_STATE:${JSON.stringify(stateFile)},BOX_BOUNTY_SETTINGS_DIR:${JSON.stringify(settingsDir)},BT8A_GIT_REMOTE:${JSON.stringify(join(root, 'remote.git'))},NODE_OPTIONS:(process.env.NODE_OPTIONS||'')+' --require '+${JSON.stringify(transportPreload.replaceAll('\\', '/'))}};\nconst result=spawnSync(${JSON.stringify(process.execPath)},[${JSON.stringify(cli)},...process.argv.slice(2),'--repo',${JSON.stringify(repo)}],{cwd:${JSON.stringify(repo)},env,stdio:'inherit',windowsHide:true});\nprocess.exit(result.status??1);\n`);
write(join(bin, 'box.cmd'), `@"${process.execPath}" "${join(root, 'invoke.cjs')}" %*\r\n`);
write(join(bin, 'box'), `#!/bin/sh\nexec '${process.execPath.replaceAll('\\', '/').replaceAll("'", "'\\''")}' '${join(root, 'invoke.cjs').replaceAll('\\', '/').replaceAll("'", "'\\''")}' "$@"\n`);
chmodSync(join(bin, 'box'), 0o755);
// The fixture's own stand-in GitHub. It answers like the real API (K19):
// one object for a single issue or pull request, `page` selecting the page
// (never the number inside `per_page`), lists filtered by their query,
// comments belonging to their issue, and issues and pull requests sharing
// one number sequence. tests/kitchen/k19-github-standin.test.ts pins this.
const gh = String.raw`
const fs = require('node:fs');
const args = process.argv.slice(2);
const file = process.env.BT7_UX_STATE;
if (!file) throw Error('offline fixture state missing');
if(args[0]==='version'||args[0]==='--version'){console.log('gh version 2.40.0');process.exit(0)}
if(args[0]==='auth'){process.exit(0)}
const state = JSON.parse(fs.readFileSync(file,'utf8'));
const endpoint = args[args.indexOf('--hostname')+2];
const input = args.includes('--input') ? JSON.parse(fs.readFileSync(args[args.indexOf('--input')+1],'utf8')) : null;
const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
const fail=()=>{save();process.exit(1)};
const query=new URLSearchParams(endpoint.split('?')[1] ?? '');
const page=Math.max(1,Number(query.get('page') ?? 1)||1);
const perPage=Math.min(100,Math.max(1,Number(query.get('per_page') ?? 30)||30));
const paged=rows=>rows.slice((page-1)*perPage,page*perPage);
const nextNumber=()=>1+Math.max(0,...state.issues.map(issue=>issue.number),...state.prs.map(pr=>pr.number));
const resource=endpoint.split('?')[0];
let result;
if(endpoint==='user') result={login:'owner'};
else if(endpoint==='repos/owner/project') result={full_name:'owner/project',private:false,visibility:'public'};
else if(endpoint==='graphql'&&input.query&&input.query.includes('pullRequest')){const pr=state.prs.find(pr=>pr.number===input.variables.number);if(!pr)fail();result={data:{repository:{pullRequest:{body:pr.body??'',userContentEdits:{nodes:[]}}}}}}
else if(endpoint==='graphql'){const issue=state.issues.find(issue=>issue.number===input.variables.number);if(!issue)fail();const own=state.comments.filter(c=>c.issue===undefined||c.issue===issue.number);const offset=Number(input.variables.after??0);result={data:{repository:{issue:{body:issue.body,author:{login:'owner'},comments:{edges:own.slice(offset,offset+100).map((c,i)=>({cursor:String(offset+i+1),node:{body:c.body,author:c.user}})),pageInfo:{hasNextPage:offset+100<own.length}}}}}}}
else if(resource.endsWith('/pulls')&&input){const n=nextNumber();result={number:n,html_url:'https://github.com/owner/project/pull/'+n,state:'open',...input,user:{login:input.author??'solver'},base:{ref:input.base,repo:{full_name:'owner/project'}},head:{sha:input.head??'0'.repeat(40)},files:[]};state.prs.push(result);}
else if(endpoint.includes('/pulls/')){const n=Number(endpoint.split('/pulls/')[1].split('/')[0].split('?')[0]);const pr=state.prs.find(pr=>pr.number===n);if(!pr)fail();result=endpoint.includes('/files')?paged(pr.files):pr;}
else if(resource.endsWith('/pulls')){const wanted=query.get('state')??'open';const base=query.get('base');result=paged(state.prs.filter(pr=>(wanted==='all'||(pr.state??'open')===wanted)&&(base===null||pr.base.ref===base)));}
else if(endpoint.includes('/labels/')){result=state.labels.find(label=>endpoint.endsWith(label.name));if(!result)fail();}
else if(endpoint.includes('/labels')){result=input?{name:input.name}:paged(state.labels);if(input)state.labels.push(result);}
else if(endpoint.includes('/comments')){const n=Number(resource.split('/issues/')[1].split('/')[0]);result=input?{...input,issue:n,user:{login:'owner'},created_at:new Date().toISOString()}:paged(state.comments.filter(c=>c.issue===undefined||c.issue===n));if(input)state.comments.push(result);}
else if(endpoint.includes('/issues/')){result=state.issues.find(issue=>issue.number===Number(endpoint.split('/issues/')[1].split('?')[0]));if(!result)fail();if(input)Object.assign(result,input);}
else if(endpoint.includes('/issues')){if(input){result={number:nextNumber(),html_url:'https://github.com/owner/project/issues/'+nextNumber(),...input,labels:input.labels.map(name=>({name})),state:'open',user:{login:'owner'}};state.issues.push(result);}else{const wanted=query.get('state')??'open';result=paged(state.issues.filter(issue=>wanted==='all'||issue.state===wanted));}}
else fail();
save();console.log(JSON.stringify(result));
`;
write(join(bin, 'gh.cjs'), gh);
if (process.platform === 'win32') write(join(bin, 'gh.cmd'), `@"${process.execPath}" "${join(bin, 'gh.cjs')}" %*\r\n`);
else {
  write(join(bin, 'gh'), `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${join(bin, 'gh.cjs').replaceAll("'", "'\\''")}' "$@"\n`);
  chmodSync(join(bin, 'gh'), 0o755);
}
write(stateFile, JSON.stringify({ issues: [], comments: [], prs: [], labels: [] }));
// The fixture owner allowed the tool once for every project — permission
// lives outside the repository in BT8.
write(join(settingsDir, 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', default: { bounty: 'allowed', at: '2026-10-13T00:00:00.000Z', changes: [] }, projects: {} }, null, 2));
git(repo, ['init', '-b', 'main', '-q']);
git(repo, ['config', 'core.autocrlf', 'false']);
write(join(repo, 'greeting.txt'), 'Welcome.\n\nNew shoppers: browse products.\nReturning shoppers: start a new basket.\nGuest checkout: available.\n');
write(join(repo, 'basket-plan.txt'), 'Resume work on checkout: next connect the saved basket to the order form.\n');
git(repo, ['add', '-A']);
git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'customer greeting base']);
const base = git(repo, ['rev-parse', 'HEAD']);
const bare = join(root, 'remote.git');
git(repo, ['init', '--bare', bare]);
git(repo, ['remote', 'add', 'origin', 'git@github.com:owner/project.git']);
git(repo, ['push', bare, 'main']);
write(join(repo, '.box/limits.json'), JSON.stringify({ allowedDestinations: ['github'] }));
const task = 'Complete greeting.txt: welcome new shoppers, let guests check out, tell returning shoppers to resume their saved basket, and say no account is required. Preserve any current accessibility sentence.\n';
write(join(repo, 'TASK.md'), task);
write(join(repo, 'basket-plan.txt'), 'Local job: wire the saved basket to the order form after the greeting is ready.\n');
const created = invoke('create', '--task', join(repo, 'TASK.md'), '--why', 'copywriting handed off while implementing checkout', '--resume', 'Continue wiring the saved basket to the order form; the greeting was the blocker.');
const id = /bt-[a-f\d]{12}/.exec(created)?.[0];
if (!id) throw new Error('create did not name a bounty');
invoke('post', id, '--to', 'github');
const solutions = [
  'Welcome.\n\nNew shoppers: browse products.\nReturning shoppers: sign in to restore your basket.\nGuest checkout: available.\n',
  'Welcome.\n\nNew shoppers: browse products.\nReturning shoppers: start a new basket.\nGuest checkout: available, with no account required.\n',
  'Welcome, new and returning shoppers.\n\nNew shoppers: browse products and check out as a guest.\nReturning shoppers: resume your saved basket.\nGuest checkout: available, with no account required.\n'
];
for (let i = 0; i < solutions.length; i += 1) {
  const solver = join(root, `solver-${i + 1}`);
  git(repo, ['clone', '--single-branch', '--branch', `box-bounty/${id}`, bare, solver]);
  write(join(solver, 'greeting.txt'), solutions[i]);
  git(solver, ['add', 'greeting.txt']);
  git(solver, ['-c', 'user.name=solver', '-c', 'user.email=solver@example.invalid', 'commit', '-qm', `greeting proposal ${i + 1}`]);
  const sha = git(solver, ['rev-parse', 'HEAD']);
  // Pull requests share the issues' number sequence on GitHub — the bounty
  // issue is #1, so the first solution is #2.
  const seeded = JSON.parse(readFileSync(stateFile, 'utf8'));
  const n = 1 + Math.max(0, ...seeded.issues.map(issue => issue.number), ...seeded.prs.map(pr => pr.number));
  git(solver, ['push', 'origin', `HEAD:refs/pull/${n}/head`]);
  seeded.prs.push({ number: n, user: { login: `writer-${i + 1}` }, base: { ref: `box-bounty/${id}`, repo: { full_name: 'owner/project' } }, head: { sha }, files: [{ filename: 'greeting.txt' }] });
  write(stateFile, JSON.stringify(seeded));
}
write(join(repo, 'greeting.txt'), 'Welcome to our store.\nAccessibility: keyboard checkout is available.\nNew shoppers: browse products.\nReturning shoppers: start a new basket.\nGuest checkout: available.\n');
git(repo, ['add', 'greeting.txt']);
git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'retain accessibility notice']);
const state = JSON.parse(readFileSync(stateFile, 'utf8'));
state.comments.push({ body: 'Should returning shoppers sign in, or must saved baskets also work for guests?', user: { login: 'writer-3' }, created_at: '2026-10-11T01:02:03Z' });
write(stateFile, JSON.stringify(state));
// "Seen" means the tool showed a solution to an agent, and the first agent is
// the one this fixture is for. Building it shows nothing to anybody: no status
// is run here, and what the set-up commands above marked while collecting is
// taken back, so the fresh agent's first `status` announces every solution as
// new, once.
const recordFile = join(repo, '.box/bounties', `${id}.json`);
const record = JSON.parse(readFileSync(recordFile, 'utf8'));
record.attempts = (record.attempts ?? []).map(({ seenAt, ...attempt }) => attempt);
if (record.attempts.length === 0) delete record.attempts;
if (record.github !== undefined) delete record.github.seenPullRequests;
write(recordFile, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ root, repository: repo, cli, wrapper: join(bin, 'box.cmd'), bin, id, base, first: 'box bounty status' }, null, 2));
