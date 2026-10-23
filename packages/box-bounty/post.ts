import { type GitHubPlan,PREVIEW_PUBLIC_NAMES,planGitHub,shownOfPlan } from './publish-plan.js';
import { invalid,type GitHubChoice,digest,isObject,publicRepository,signedAccount,type GitHubPublication,publicationRef,remoteBranchSha,remoteGit,recoverIssue,ensureLabel,api,issueNumber } from './gh.js';
import { lstatSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_VERSION } from './create.js';
import { git } from './git.js';
import { checkProjectClaims,shipRules } from './never-ship.js';
import { allowedByFor,ownerGate,sameShown,waitForOwner } from './gate.js';
import { sharePosted } from './chain.js';
import { loadRecord,persistRecord,recordScanFinding,retiredRoute,settleScanFindings,transitionTo } from './record.js';
import { assertPromiseRoom,rewardForPost,withPromiseLock } from './money.js';
import type { BountyRecord } from './record.js';
import { repositoryAddress } from './repository.js';
import { readReward } from './settings.js';
import { boundAmount,formatFor,publicText,renderFormat } from './format.js';
import { showPath } from './notice.js';

// The listing a stranger reads: the task, what was tried, the branch to work
// from (with the base commit as context — never the bare commit to branch
// from, or a branch carrying work in progress would refuse the answer), how
// to answer, the stated reward and the licence fact. No snapshot, no files
// kept out — the code is the repository's real history.
// `reward` is the amount the listing states — the bound amount for a posted
// bounty, the amount in force for a preview — so the words and the format
// block can never disagree.
function bountyContent(record: BountyRecord): NonNullable<BountyRecord['content']> {
  if (record.content !== undefined) return record.content;
  // Only an unposted draft from before BT15 reads its old public text. No
  // source copy or returned folder is consulted, and no folder is changed.
  const retired = retiredRoute(record);
  if (retired !== null) return invalid(retired, `this bounty used a retired delivery route; next: end it with box bounty close ${record.id}`);
  if (record.folder === undefined) return invalid('record-corrupt', `this draft has no public task text; next: end it with box bounty close ${record.id} and create a new one`);
  let bytes: Buffer;
  try {
    const path = join(record.folder, 'bounty.json');
    if (!lstatSync(path).isFile()) return invalid('legacy-task-unavailable', `the old public task is not a plain file; next: end it with box bounty close ${record.id}`);
    bytes = readFileSync(path);
  }
  catch { return invalid('legacy-task-unavailable', `the old draft's public task cannot be read; next: end it with box bounty close ${record.id} and create a new one`); }
  if (record.manifestSha256 !== undefined && digest(bytes) !== record.manifestSha256) return invalid('manifest-tampered', `the old draft public text changed; nothing was posted; next: end it with box bounty close ${record.id} and create a new draft`);
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return invalid('record-corrupt', `the old draft public text is unreadable; next: end it with box bounty close ${record.id} and create a new one`); }
  const inputText = (item: unknown): item is { file: string; text: string } => isObject(item) && typeof item['file'] === 'string' && typeof item['text'] === 'string';
  if (!isObject(value) || value['id'] !== record.id || !isObject(value['snapshot']) || value['snapshot']['commit'] !== record.snapshot?.commit || record.snapshot === undefined || !inputText(value['task']) || value['note'] !== null && !inputText(value['note'])) return invalid('record-corrupt', `the old draft public text is unreadable; next: end it with box bounty close ${record.id} and create a new one`);
  return { task: value['task'], note: value['note'], tool: typeof value['tool'] === 'string' ? value['tool'] : TOOL_VERSION };
}

function listingHistory(record: BountyRecord, repository: string, plan: GitHubPlan, reward: number): { branch: string; title: string; body: string } {
  const content = bountyContent(record);
  // Generated folder notes describe the local snapshot, including work left home.
  // An authored --note is public by choice; automatic job context stays local.
  const note = record.noteSource === 'generated' ? null : content.note;
  const branch = `box-bounty/${record.id}`;
  const title = `[box bounty ${record.id}] ${publicText(record.title)}`;
  // A commit's subject prints quoted (BT43 correction 4): the commits a post
  // publishes for the first time can include a solver's, merged locally by
  // apply, under the subject the solver wrote.
  const onTop = plan.pushed.length === 0
    ? `it points at that commit — nothing new was published`
    : `it carries the poster's work in progress — ${plan.pushed.length} commit(s) on top of that commit: ${plan.pushed.map(c => `\`${c.sha.slice(0, 12)}\` ${showPath(c.subject)}`).join(', ')}`;
  const body = [
    `# Bounty: ${publicText(record.title)}`,
    '',
    `id ${record.id} · created ${record.createdAt} by ${content.tool}`,
    '',
    '## What is wanted',
    '',
    publicText(content.task.text.trim()),
    '',
    // The issue and the create preview agree on the note (BT14, F4): a
    // generated note exists — the preview names it — it is simply not
    // published; only a truly absent note says "none supplied".
    '## What was already tried', '', note !== null ? publicText(note.text.trim()) : record.noteSource === 'generated' ? 'What the poster tried is in the task above — the tool asks agents to put it there.' : 'No public note was supplied.', '',
    '## The code',
    '',
    `Branch from \`${branch}\` — it is the branch pull requests for this bounty target.`,
    publicText(`The branch is based on commit ${plan.base}, the newest commit this repository already had: ${onTop}.`),
    '',
    '## How to answer',
    '',
    `Fork this repository (or push a branch inside it), branch from \`${branch}\`, make the change, and open a pull request against \`${branch}\` in this repository. Collecting an answer runs nothing you wrote — the poster reads the change and decides.`,
    '',
    'Nobody is known to be watching these issues yet. Anyone can read this issue and the branch, and any account may answer.',
    '',
    `reward: $${reward}`,
    ...(reward > 0 ? [
      'to ask for the reward, add one line to your pull request description — `pay-to:` followed by your Stripe payment link and nothing else, for example `pay-to: https://buy.stripe.com/test_0EXAMPLE00000000000000`.',
      'payment is the poster\'s to make by hand — posting an answer does not guarantee it.'
    ] : []),
    'The merged solution earns the whole reward. Other solutions and parts used by hand earn nothing.',
    plan.licence.file !== null
      ? publicText(`licence: ${plan.licence.file}${plan.licence.declared !== null ? ` (package.json declares ${plan.licence.declared})` : ''}`)
      : 'licence: no licence file was found at the branch root',
    '',
    `<!-- box-bounty:${record.id} -->`,
    ''
  ].join('\n');
  const block = renderFormat(formatFor(record, { repository, branch, commit: plan.tip, pushed: plan.pushed }, reward));
  return { branch, title, body: body + block };
}

function renderPlanPreview(repository: string, record: BountyRecord, plan: GitHubPlan, text: { branch: string; title: string; body: string }): string {
  const lines: string[] = [];
  lines.push(`GitHub preview: ${repository}, public. Anyone can read the issue and branch.`);
  lines.push(`Branch: ${text.branch} → ${plan.tip}`);
  lines.push(`Base: commit ${plan.base} — the newest commit on the current branch the repository already has`);
  lines.push('What becomes public that was not:');
  if (plan.pushed.length === 0) {
    lines.push('  nothing new is published');
  } else {
    lines.push(`  commits published for the first time (${plan.pushed.length}):`);
    for (const commit of plan.pushed) {
      lines.push(`    ${commit.sha.slice(0, 12)} ${showPath(commit.subject)}${commit.sha === plan.wipCommit ? ' — the tool\'s work-in-progress commit' : ''}`);
      for (const file of plan.publishedFiles.find(entry => entry.commit === commit.sha)?.files ?? []) lines.push(`      ${file.status} ${JSON.stringify(file.path)}`);
    }
    if (plan.wip !== null) {
      if (plan.wip.changed.length > 0) lines.push(`  files changed in the work-in-progress commit: ${plan.wip.changed.join(', ')}`);
      if (plan.wip.added.length > 0) lines.push(`  files added in the work-in-progress commit: ${plan.wip.added.join(', ')}`);
      if (plan.wip.deleted.length > 0) lines.push(`  files deleted in the work-in-progress commit: ${plan.wip.deleted.join(', ')}`);
    }
  }
  lines.push(`Uncommitted changes to tracked files: ${plan.wipCommit !== null ? 'included as one commit on the branch' : plan.leftHome > 0 ? `${plan.leftHome} file(s) stay home — the task was not said to need them` : 'none present'}`);
  lines.push(`Untracked: ${plan.untracked} entr${plan.untracked === 1 ? 'y' : 'ies'} stay home${plan.include.length > 0 ? `; published by name: ${plan.include.join(', ')}` : ''}`);
  if (plan.publicNeverShip.length > 0) {
    const named = plan.publicNeverShip.slice(0, PREVIEW_PUBLIC_NAMES);
    lines.push(`Already public — this tool cannot take it back: ${plan.publicNeverShip.length} never-ship-named path(s) exist in the public history: ${named.join(', ')}${plan.publicNeverShip.length > PREVIEW_PUBLIC_NAMES ? ` … and ${plan.publicNeverShip.length - PREVIEW_PUBLIC_NAMES} more` : ''}`);
  }
  if (plan.scan.hits.length === 0) {
    // No headline "clean" while flagged content only missed the list — a
    // safe-listed hit says so in its own words instead (BT13, F4).
    lines.push(plan.scan.suppressed > 0
      ? `Pre-publish scan: ${plan.scan.suppressed} secret-shaped hit(s) sit on paths the owner listed safe to publish — not held; ${plan.scan.commitsScanned} first-published commit(s) read${plan.include.length > 0 ? ` plus ${plan.include.length} named file(s)` : ''}`
      : `Pre-publish scan: clean — ${plan.scan.commitsScanned} first-published commit(s) read${plan.include.length > 0 ? ` plus ${plan.include.length} named file(s)` : ''}`);
  } else {
    lines.push(`Pre-publish scan: ${plan.scan.hits.length} secret-shaped hit(s) — a post would wait for the owner:`);
    for (const hit of plan.scan.hits) lines.push(`    ${hit.path}:${hit.line} — ${hit.rule}${hit.commit !== undefined ? ` — in unpushed commit ${hit.commit.slice(0, 12)}` : ''}`);
  }
  if (plan.scan.suppressed > 0 && plan.scan.hits.length > 0) lines.push(`  ${plan.scan.suppressed} hit(s) sit on paths the owner listed safe to publish — not held`);
  if (plan.scan.binary.length > 0) lines.push(`  not scanned — Git treats them as binary: ${plan.scan.binary.join(', ')}`);
  lines.push(`Issue title: ${text.title}`);
  lines.push('Issue body:');
  lines.push(text.body);
  return lines.join('\n');
}

// `--preview` (and, before BT8, `confirm <id>`): compute the plan
// once — base, tip, the first-published commits, the work-in-progress lists,
// the choices and the pre-publish scan — so the printed preview is exactly
// what a post would publish.
export function approveGitHub(root: string, record: BountyRecord, choice: GitHubChoice) {
  const repository = publicRepository(root);
  const rules = shipRules(root);
  const plan = planGitHub(root, repository, record, rules, choice);
  // A preview states the amount a post would bind now; a posted bounty keeps
  // the amount it went out with — read from the posted body, never from the
  // editable `reward` summary — and a recorded approval predates rewards: its
  // frozen body states $0.
  const text = listingHistory(record, repository, plan, boundAmount(record) ?? readReward(repositoryAddress(repository)).amount);
  const preview = renderPlanPreview(repository, record, plan, text);
  return {
    repository,
    preview,
    base: plan.base,
    head: plan.head,
    tip: plan.tip,
    tipTree: plan.tipTree,
    title: text.title,
    body: text.body,
    pushed: plan.pushed,
    ...(plan.wipCommit !== null ? { wipCommit: plan.wipCommit } : {}),
    wip: plan.wip,
    include: choice.include,
    withChanges: choice.withChanges,
    leftHome: plan.leftHome,
    untracked: plan.untracked
  };
}

export function previewGitHub(root: string, id: string, choice: GitHubChoice = { withChanges: false, include: [] }): string {
  const record = loadRecord(root, id);
  return approveGitHub(root, record, choice).preview;
}

export function postGitHub(root: string, id: string, opts?: { answered?: boolean; choice?: GitHubChoice }): { record: BountyRecord; destination: string } {
  const record = loadRecord(root, id);
  const resumable = record.github !== undefined && record.stage === 'posted';
  if (record.stage !== 'confirmed' && record.stage !== 'drafted' && record.stage !== 'waiting' && !resumable) {
    return invalid('not-postable', `bounty ${id} is ${record.stage} — only a drafted or confirmed bounty can be posted; next: box bounty status ${id}`);
  }
  // A project file cannot name money or publish lists — the claim refusal is
  // named before anything else, so a refused post changes nothing (BT11a).
  checkProjectClaims(root);
  // The amount in force at posting is what the record binds and the listing
  // and format block state (BT11a) — checked before any gh probe and before
  // the owner gate writes a wait, so a refused post changes nothing. A
  // recorded approval or a started publication keeps the amount it went out
  // with: none for a pre-BT11a approval, the bound one for a retry.
  const reward = record.github === undefined && record.githubApproval === undefined ? rewardForPost(root) : null;
  // Read local permission before any gh probe. A waiting post publishes
  // nothing; visibility remains a hard stop once permission permits a call.
  // `reused` is true when the gate passed on a recorded one-bounty answer
  // still bound to the same published state (BT8c) — the post then credits
  // that answer, not a standing decision.
  let reusedAnswer = false;
  if (record.stage !== 'confirmed' && opts?.answered !== true && record.github === undefined && record.githubApproval === undefined) {
    reusedAnswer = ownerGate(root, record, { for: 'post', to: 'github', choice: opts?.choice ?? { withChanges: false, include: [] } }).reused === true;
  }
  const repository = publicRepository(root);
  if (record.githubApproval !== undefined && record.githubApproval.repository !== repository) return invalid('github-repository-changed', 'origin no longer names the repository the recorded approval was made for; nothing was posted; next: point origin back at the approved repository, or the owner allows the new one with box bounty allow <owner/name>');
  if (record.github !== undefined && record.github.repository !== repository) return invalid('github-repository-changed', 'origin no longer names the repository approved for this bounty; nothing was posted; next: point origin back at the approved repository, or the owner allows the new one with box bounty allow <owner/name>');
  const account = signedAccount(root);
  if (record.github !== undefined && record.github.account !== account) return invalid('github-account-changed', 'sign in to the account that started this post before retrying; nothing was posted; next: sign in to that account with gh auth login, then run box bounty post again');
  if (record.github === undefined && record.githubApproval === undefined) {
    // The standing-decision path (BT8): no per-bounty approval exists or is
    // needed. The owner's written answer gates the post; the pre-publish
    // scan holds what it finds; a named untracked file always holds.
    const choice = opts?.choice ?? { withChanges: false, include: [] };
    const priorWait = record.waiting;
    const legacyConfirmed = record.stage === 'confirmed';
    // A scan hold is never answered away (BT8c): `allow <bounty>` on one is
    // a named refusal — the owner settles it in `config` (safe to publish /
    // never publish), or the flagged content is removed and the post rerun.
    if (opts?.answered === true && priorWait?.reason === 'secrets') {
      return invalid('allow-scan-held', `${id} waits on the pre-publish scan — an owner answer cannot release it; nothing was posted; next: the owner decides in box bounty config — the path goes on safe to publish or never publish, or the flagged content is removed and the post run again`);
    }
    const plan = planGitHub(root, repository, record, shipRules(root), choice);
    // An owner answer is bound to what the owner was shown would be
    // published: the recorded wait keeps the plan it was made under, and a
    // move since — base, commits published for the first time, work in
    // progress, included files, what stays home — means the answer was for
    // something else and does not carry over. A wait recorded with nothing
    // shown (a remote that could not be read, or an older record) cannot
    // bind — the post's own refusals still apply.
    const shown = priorWait?.shown;
    if (opts?.answered === true && priorWait?.to === 'github' && shown !== undefined && !sameShown(shown, shownOfPlan(plan))) {
      return invalid('github-preview-stale', `what would be published changed since this post first waited — the owner's answer was for what they were shown and does not carry over; nothing was posted; next: run box bounty post ${id} again so the wait records the new state for the owner`);
    }
    // An owner answer clears only what the recorded wait named: a post held
    // for the decision alone can still carry scan hits the owner never saw —
    // those hold again, listing them. Rerunning `post` is never an answer.
    const seen = opts?.answered === true ? priorWait?.reason : undefined;
    if (plan.scan.hits.length > 0) {
      waitForOwner(root, record, { for: 'post', reason: 'secrets', at: new Date().toISOString(), to: 'github', choice, hits: plan.scan.hits, shown: shownOfPlan(plan) });
      recordScanFinding(record, plan.scan.hits, 'post');
      persistRecord(root, record);
      return invalid('publish-held', [
        `${id} — the pre-publish scan found ${plan.scan.hits.length} secret-shaped hit(s); this bounty waits for the owner:`,
        // The owner block first (BT13, F3): what was found, in which file,
        // that nothing was published, and the choices — a question, not a
        // command; no commits, no git words.
        'for the owner — pass this on in these words:',
        ...plan.scan.hits.map(hit => `  Something in your project looks like a password or key: file ${hit.path}, line ${hit.line}.`),
        '  Nothing has been published.',
        '  You can say the file is safe to publish, say it must never be published, or have it changed first — which do you want?',
        plan.scan.hits.some(hit => hit.commit !== undefined)
          // A secret sitting inside an unpushed commit is not helped by a
          // new commit removing the file's content — the commit carrying it
          // would still publish (BT14). Changing that history is the
          // owner's call, never the agent's to make alone.
          ? 'for you — the owner\'s answer lands on the publish lists: box bounty config add safe-to-publish <path> or add never-publish <path>. For a hit inside an unpushed commit a new commit removing the content does not help — the commit carrying it would still be published; changing that history is the owner\'s call, not the agent\'s to make alone. Or end it — nothing was published and the owner\'s files are untouched.'
          : 'for you — the owner\'s answer lands on the publish lists: box bounty config add safe-to-publish <path> or add never-publish <path>; or remove the flagged content and post again — that sends the bounty; or end it — nothing was published and the owner\'s files are untouched.',
        ...plan.scan.hits.map(hit => `  hit: ${hit.path}:${hit.line} — ${hit.rule}${hit.commit !== undefined ? ` — in unpushed commit ${hit.commit.slice(0, 12)} — an ordinary git push would publish it too` : ''}`),
        ...(plan.scan.suppressed > 0 ? [`${plan.scan.suppressed} hit(s) on safe-listed paths are not held`] : []),
        ...(plan.scan.binary.length > 0 ? [`not scanned — Git treats them as binary: ${plan.scan.binary.join(', ')}`] : []),
        'the scan is a stated pattern list, not proof of absence.', `next: pass the owner block on in its words; box bounty status ${id} shows when the answer lands`
      ].join('\n'));
    }
    if (plan.include.length > 0 && seen !== 'untracked-file') {
      waitForOwner(root, record, { for: 'post', reason: 'untracked-file', at: new Date().toISOString(), to: 'github', choice, shown: shownOfPlan(plan) });
      return invalid('publish-held', [
        `${id} — an untracked file is named for publishing (${plan.include.join(', ')}); this bounty waits for the owner`,
        `the owner answers this one with box bounty allow ${id} — the answer is bound to what would be published now — or ends it with box bounty close ${id}`, `next: pass the owner block on in its words; box bounty status ${id} shows when the answer lands`
      ].join('\n'));
    }
    const text = listingHistory(record, repository, plan, reward!.amount);
    const publication: GitHubPublication = {
      repository,
      account,
      kind: 'history',
      branch: `box-bounty/${id}`,
      title: text.title,
      body: text.body,
      commit: plan.tip,
      base: plan.base,
      pushed: plan.pushed,
      ...(plan.wipCommit !== null ? { wipCommit: plan.wipCommit } : {}),
      wip: plan.wip,
      ...(plan.scan.binary.length > 0 ? { scanBinary: plan.scan.binary } : {}),
      state: 'preparing',
      issue: null,
      pending: null
    };
    // The limit gate ran before the waits above; between then and now another
    // process may have bound its own bounty. The re-check and the write that
    // binds the reward run inside the promise lock as one span, so two posts
    // cannot both pass the owner's limit — the second sees the first's bound
    // record and refuses by name, before anything of it was written (BT11a
    // fix round). A $0 post promises nothing, so it never takes the lock.
    const bind = () => {
      assertPromiseRoom(root, reward!.amount);
      record.allowedBy = allowedByFor(root, record, opts?.answered === true || reusedAnswer, legacyConfirmed);
      record.reward = { amount: reward!.amount };
      record.github = publication;
      git(root, ['update-ref', publicationRef(id), publication.commit]);
      persistRecord(root, record);
    };
    if (reward!.amount === 0) bind(); else withPromiseLock(root, bind);
  }
  if (record.github === undefined) {
    const approval = record.githubApproval!;
    // A full plan, or none at all: approvals written before this wave carry
    // only repository and preview, and post the snapshot they approved. Some
    // fields present and others missing is a record no honest write produced —
    // falling back would publish the opposite of what was approved.
    const planFields = ['base', 'head', 'tip', 'tipTree', 'title', 'body', 'pushed', 'wip', 'include', 'withChanges', 'leftHome', 'untracked'] as const;
    const present = planFields.filter(field => approval[field] !== undefined);
    const fullPlan = (value: typeof approval): value is typeof approval & Required<Pick<typeof approval, (typeof planFields)[number]>> => planFields.every(field => value[field] !== undefined);
    let publication: GitHubPublication;
    if (fullPlan(approval)) {
      // Publish exactly what was approved: recompute the plan live and refuse
      // by name when the working state, the branch or the remote moved since
      // the preview — the preview and the push can never disagree.
      const plan = planGitHub(root, repository, record, shipRules(root), {
        withChanges: approval.withChanges === true,
        include: approval.include ?? []
      });
      // The pre-wave approval cannot be refreshed — the command that recorded
      // it is removed — so a stale one ends the bounty rather than guess.
      const staleNext = `the approval recorded before the decision moved to the owner's settings can no longer be refreshed; end this bounty with box bounty close ${id} and create a new one — nothing was posted`;
      if (plan.base !== approval.base) {
        return invalid('github-preview-stale', `what the GitHub repository has moved since the preview was approved; next: ${staleNext}`);
      }
      if (plan.head !== approval.head || plan.pushed.length !== (approval.pushed ?? []).length || plan.pushed.some((commit, index) => commit.sha !== approval.pushed![index]!.sha)) {
        return invalid('github-preview-stale', `the branch moved since the preview was approved; next: ${staleNext}`);
      }
      if (plan.tip !== approval.tip) {
        return invalid('github-preview-stale', `the uncommitted work or named files changed since the preview was approved; next: ${staleNext}`);
      }
      // Even work that stays home is part of what the owner was shown: if the
      // tracked or untracked leftovers changed since the preview, it is stale.
      if (plan.leftHome !== approval.leftHome || plan.untracked !== approval.untracked || plan.include.join('') !== (approval.include ?? []).join('')) {
        return invalid('github-preview-stale', `the working state changed since the preview was approved; next: ${staleNext}`);
      }
      publication = {
        repository,
        account,
        kind: 'history',
        branch: `box-bounty/${id}`,
        title: approval.title,
        body: approval.body,
        commit: approval.tip,
        base: approval.base,
        pushed: approval.pushed ?? [],
        ...(approval.wipCommit !== undefined ? { wipCommit: approval.wipCommit } : {}),
        wip: approval.wip ?? null,
        state: 'preparing',
        issue: null,
        pending: null
      };
    } else if (present.length === 0) {
      return invalid('legacy-delivery-retired', `the recorded approval used a retired route; next: end it with box bounty close ${id}`);
    } else {
      return invalid('record-corrupt', `the recorded GitHub approval carries only some plan fields (${present.join(', ')}) — it is not a readable approval; nothing was posted; next: run box bounty post ${id} again so the owner is shown a fresh approval`);
    }
    // The recorded approval was the owner's own written yes — kept as the
    // answer that allowed this post.
    record.allowedBy = allowedByFor(root, record, opts?.answered === true, true);
    record.github = publication;
    git(root, ['update-ref', publicationRef(id), publication.commit]);
    persistRecord(root, record);
  }
  const branchTip = remoteBranchSha(root, repository, record.github.branch);
  if (branchTip !== null && branchTip !== record.github.commit) {
    return invalid('github-branch-changed', `${record.github.branch} on the remote is ${branchTip}, not the ${record.github.commit} this tool approved — it was changed outside the tool; nothing was posted; next: ask the owner — the remote branch was changed outside the tool`);
  }
  const publication = record.github;
  let destination: string;
  try {
    remoteGit(root, repository, ['push', `${publication.commit}:refs/heads/${publication.branch}`]);
    publication.state = 'branch-pushed';
    persistRecord(root, record);
    if (publication.issue === null) {
      publication.issue = recoverIssue(root, publication) ?? (() => {
        ensureLabel(root, repository);
        const created = api(root, `repos/${repository}/issues`, { title: publication.title, body: publication.body, labels: ['box-bounty'] });
        const labels = isObject(created) && Array.isArray(created['labels']) ? created['labels'] : [];
        if (!labels.some(entry => isObject(entry) && entry['name'] === 'box-bounty')) return invalid('github-response-invalid', 'the box-bounty label did not land on the issue; next: check the issue on GitHub; box bounty status shows what was recorded');
        return issueNumber(created, repository);
      })();
    }
    publication.state = 'posted'; publication.pending = null;
    settleScanFindings(root, record, 'went-out');
    if (record.stage !== 'posted') transitionTo(root, record, 'posted', { destination: publication.issue.url });
    else persistRecord(root, record);
    destination = publication.issue.url;
  } catch {
    publication.pending = `post-incomplete: ${publication.state}; issue ${publication.issue?.url ?? 'not recorded'}; retry box bounty post ${id} or remove with box bounty close ${id}`;
    persistRecord(root, record);
    return invalid('github-post-incomplete', `${publication.pending}; next: retry box bounty post ${id} or remove it with box bounty close ${id}`);
  }
  // BT32: the posted milestone is a shared chain event — scanned, appended,
  // pushed; a push that cannot land is held locally and retried, never a
  // reason the post itself fails.
  sharePosted(root, record, record.content?.task.text ?? record.title);
  return { record, destination };
}
