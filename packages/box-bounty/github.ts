import { type GitHubPlan, PREVIEW_PUBLIC_NAMES, planGitHub, shownOfPlan, parseNameStatus, neverShipViolations, commitStatuses, EMPTY_TREE } from './publish-plan.js';
import { remoteUrl, invalid, type GitHubChoice, digest, isObject, publicRepository, signedAccount, type GitHubPublication, publicationRef, remoteBranchSha, remoteGit, recoverIssue, ensureLabel, api, issueNumber, pages, number, redact, login, READABLE_LOGIN } from './gh.js';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { resolveProgram } from '../box-package/commands.js';
import { NOTHING_RUN, emitMergeNotice, quoteForeign, showPath } from './notice.js';
import { TOOL_VERSION } from './create.js';
import { BountyRefused } from './errors.js';
import { dryMergeOnto, git, gitBlob, gitBlobs, gitFilteredBlob, gitIndexWrite, gitOutcome, gitProgram, gitRefsWrite, mergeBase, ownerGitOutcome } from './git.js';
import type { DryMerge, IndexChange } from './git.js';
import { checkProjectClaims, publishListed, publishLists, shipRules } from './never-ship.js';
import type { NeverShipRule } from './never-ship.js';
import { allowedByFor, ownerGate, sameShown, waitForOwner } from './gate.js';
import { attemptRefName, attemptsOf, isOpenStage, loadRecord, persistRecord, requireCurrentDelivery, recordScanFinding, retiredRoute, settleScanFindings, transitionTo } from './record.js';
import { assertPromiseRoom, rewardForPost, withPromiseLock } from './money.js';
import type { Attempt, BountyRecord, WaitingFor } from './record.js';
import { repositoryAddress } from './repository.js';
import { binaryPatchPaths, looksBinary, scanPatch, scanText } from './scan.js';
import type { ScanHit } from './scan.js';
import { readDecision, readReward, requireRepository } from './settings.js';
import type { DecisionRead } from './settings.js';
import { boundAmount, formatFact, formatFor, publicText, readFormat, renderFormat } from './format.js';
import { parsePayTo, payToLine, type PayOutcome, type PayToFact } from './pay.js';

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
  if (retired !== null) return invalid(retired, `this bounty used a retired delivery route; end it with box bounty close ${record.id}`);
  if (record.folder === undefined) return invalid('record-corrupt', 'this draft has no public task text');
  let bytes: Buffer;
  try {
    const path = join(record.folder, 'bounty.json');
    if (!lstatSync(path).isFile()) return invalid('legacy-task-unavailable', `the old public task is not a plain file; end it with box bounty close ${record.id}`);
    bytes = readFileSync(path);
  }
  catch { return invalid('legacy-task-unavailable', `the old draft's public task cannot be read; end it with box bounty close ${record.id} and create a new one`); }
  if (record.manifestSha256 !== undefined && digest(bytes) !== record.manifestSha256) return invalid('manifest-tampered', 'the old draft public text changed; nothing was posted');
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return invalid('record-corrupt', 'the old draft public text is unreadable'); }
  const inputText = (item: unknown): item is { file: string; text: string } => isObject(item) && typeof item['file'] === 'string' && typeof item['text'] === 'string';
  if (!isObject(value) || value['id'] !== record.id || !isObject(value['snapshot']) || value['snapshot']['commit'] !== record.snapshot?.commit || record.snapshot === undefined || !inputText(value['task']) || value['note'] !== null && !inputText(value['note'])) return invalid('record-corrupt', 'the old draft public text is unreadable');
  return { task: value['task'], note: value['note'], tool: typeof value['tool'] === 'string' ? value['tool'] : TOOL_VERSION };
}

function listingHistory(record: BountyRecord, repository: string, plan: GitHubPlan, reward: number): { branch: string; title: string; body: string } {
  const content = bountyContent(record);
  // Generated folder notes describe the local snapshot, including work left home.
  // An authored --note is public by choice; automatic job context stays local.
  const note = record.noteSource === 'generated' ? null : content.note;
  const branch = `box-bounty/${record.id}`;
  const title = `[box bounty ${record.id}] ${publicText(record.title)}`;
  const onTop = plan.pushed.length === 0
    ? `it points at that commit — nothing new was published`
    : `it carries the poster's work in progress — ${plan.pushed.length} commit(s) on top of that commit: ${plan.pushed.map(c => `\`${c.sha.slice(0, 12)}\` ${c.subject}`).join(', ')}`;
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
    '## What was already tried', '', note !== null ? publicText(note.text.trim()) : record.noteSource === 'generated' ? 'The note the tool wrote from the local changes is not published.' : 'No public note was supplied.', '',
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
      lines.push(`    ${commit.sha.slice(0, 12)} ${commit.subject}${commit.sha === plan.wipCommit ? ' — the tool\'s work-in-progress commit' : ''}`);
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
    return invalid('not-postable', `bounty ${id} is ${record.stage} — only a drafted or confirmed bounty can be posted`);
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
  if (record.githubApproval !== undefined && record.githubApproval.repository !== repository) return invalid('github-repository-changed', 'origin no longer names the repository the recorded approval was made for; nothing was posted');
  if (record.github !== undefined && record.github.repository !== repository) return invalid('github-repository-changed', 'origin no longer names the repository approved for this bounty; nothing was posted');
  const account = signedAccount(root);
  if (record.github !== undefined && record.github.account !== account) return invalid('github-account-changed', 'sign in to the account that started this post before retrying; nothing was posted');
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
      return invalid('allow-scan-held', `${id} waits on the pre-publish scan — an owner answer cannot release it. The owner decides in box bounty config: the path goes on safe to publish or never publish; or the flagged content is removed and the post run again; nothing was posted`);
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
      return invalid('github-preview-stale', `what would be published changed since this post first waited — the owner's answer was for what they were shown and does not carry over. Run box bounty post ${id} again so the wait records the new state for the owner; nothing was posted`);
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
        'the scan is a stated pattern list, not proof of absence.'
      ].join('\n'));
    }
    if (plan.include.length > 0 && seen !== 'untracked-file') {
      waitForOwner(root, record, { for: 'post', reason: 'untracked-file', at: new Date().toISOString(), to: 'github', choice, shown: shownOfPlan(plan) });
      return invalid('publish-held', [
        `${id} — an untracked file is named for publishing (${plan.include.join(', ')}); this bounty waits for the owner`,
        `the owner answers this one with box bounty allow ${id} — the answer is bound to what would be published now — or ends it with box bounty close ${id}`
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
        return invalid('github-preview-stale', `what the GitHub repository has moved since the preview was approved — ${staleNext}`);
      }
      if (plan.head !== approval.head || plan.pushed.length !== (approval.pushed ?? []).length || plan.pushed.some((commit, index) => commit.sha !== approval.pushed![index]!.sha)) {
        return invalid('github-preview-stale', `the branch moved since the preview was approved — ${staleNext}`);
      }
      if (plan.tip !== approval.tip) {
        return invalid('github-preview-stale', `the uncommitted work or named files changed since the preview was approved — ${staleNext}`);
      }
      // Even work that stays home is part of what the owner was shown: if the
      // tracked or untracked leftovers changed since the preview, it is stale.
      if (plan.leftHome !== approval.leftHome || plan.untracked !== approval.untracked || plan.include.join('') !== (approval.include ?? []).join('')) {
        return invalid('github-preview-stale', `the working state changed since the preview was approved — ${staleNext}`);
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
      return invalid('legacy-delivery-retired', `the recorded approval used a retired route; end it with box bounty close ${id}`);
    } else {
      return invalid('record-corrupt', `the recorded GitHub approval carries only some plan fields (${present.join(', ')}) — it is not a readable approval; nothing was posted`);
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
    return invalid('github-branch-changed', `${record.github.branch} on the remote is ${branchTip}, not the ${record.github.commit} this tool approved — it was changed outside the tool; nothing was posted`);
  }
  const publication = record.github;
  try {
    remoteGit(root, repository, ['push', `${publication.commit}:refs/heads/${publication.branch}`]);
    publication.state = 'branch-pushed';
    persistRecord(root, record);
    if (publication.issue === null) {
      publication.issue = recoverIssue(root, publication) ?? (() => {
        ensureLabel(root, repository);
        const created = api(root, `repos/${repository}/issues`, { title: publication.title, body: publication.body, labels: ['box-bounty'] });
        const labels = isObject(created) && Array.isArray(created['labels']) ? created['labels'] : [];
        if (!labels.some(entry => isObject(entry) && entry['name'] === 'box-bounty')) return invalid('github-response-invalid', 'the box-bounty label did not land on the issue');
        return issueNumber(created, repository);
      })();
    }
    publication.state = 'posted'; publication.pending = null;
    settleScanFindings(root, record, 'went-out');
    if (record.stage !== 'posted') transitionTo(root, record, 'posted', { destination: publication.issue.url });
    else persistRecord(root, record);
    return { record, destination: publication.issue.url };
  } catch {
    publication.pending = `post-incomplete: ${publication.state}; issue ${publication.issue?.url ?? 'not recorded'}; retry box bounty post ${id} or remove with box bounty close ${id}`;
    persistRecord(root, record);
    return invalid('github-post-incomplete', publication.pending);
  }
}

export function listGitHubAnswers(root: string, id: string, record = loadRecord(root, id), shown = true): string {
  if (record.github === undefined) return invalid('not-github-posted', `this bounty has no GitHub post; post it with box bounty post ${id}, or end it with box bounty close ${id}`);
  if (retiredRoute(record) !== null) return `This bounty used a retired delivery route; end it with box bounty close ${id}`;
  const { repository, branch } = record.github;
  const data = pages(root, `repos/${repository}/pulls?state=open&base=${branch}`);
  const lines = [`GitHub answers for ${id} against ${branch}:`];
  const available: NonNullable<GitHubPublication['availablePullRequests']> = [];
  for (const entry of data) {
    if (!isObject(entry) || !isObject(entry['user'])) return invalid('github-response-invalid', 'GitHub returned an unreadable pull request');
    const n = number(entry['number']);
    if (!isObject(entry['head']) || typeof entry['head']['sha'] !== 'string' || !/^[a-f\d]{40}$/.test(entry['head']['sha'])) return invalid('github-response-invalid', 'GitHub returned an unreadable solution commit');
    const commit = entry['head']['sha'];
    const seen = record.github.seenPullRequests?.find(entry => entry.n === n && entry.commit === commit);
    const files = pages(root, `repos/${repository}/pulls/${n}/files`);
    const names = files.map(file => isObject(file) && typeof file['filename'] === 'string' ? redact(quoteForeign(file['filename'])) : invalid('github-response-invalid', 'GitHub returned unreadable changed files'));
    const collected = record.attempts?.find(attempt => attempt.commit === commit);
    const next = collected === undefined ? `collect: box bounty look ${id} ${n} or box bounty apply ${id} ${n}` : `collected as solution ${collected.n}; look: box bounty look ${id} ${collected.n}`;
    // The `pay-to:` line is read only from the pull request description — a
    // comment or a changed file never carries it — and only the fact is kept.
    const payTo = parsePayTo(typeof entry['body'] === 'string' ? entry['body'] : '');
    const paid = boundAmount(record) !== undefined && boundAmount(record)! > 0 ? `; ${payToLine(payTo)}` : '';
    lines.push(`  #${n} by ${login(entry['user']['login'])}: ${names.join(', ')}; ${seen === undefined ? 'new' : `seen since ${seen.at}`}; ${next}${paid}`);
    const fact = { n, commit, at: seen?.at ?? record.github.availablePullRequests?.find(pr => pr.n === n && pr.commit === commit)?.at ?? new Date().toISOString(), author: login(entry['user']['login']), payTo };
    available.push(fact);
    if (shown && seen === undefined) record.github.seenPullRequests = [...record.github.seenPullRequests ?? [], fact];
  }
  if (data.length === 0) lines.push('  none open; wait for one or close the bounty');
  record.github.availablePullRequests = available;
  persistRecord(root, record);
  return lines.join('\n');
}

export function refreshGitHubStatus(root: string, record: BountyRecord): void {
  const publication = record.github;
  if (publication?.state !== 'posted' || publication.issue === null) return;
  try {
    const issue = api(root, `repos/${publication.repository}/issues/${publication.issue.number}`);
    if (!isObject(issue) || issue['state'] !== 'open' && issue['state'] !== 'closed') return invalid('github-response-invalid', 'GitHub returned an unreadable issue state');
    observeIssueFormat(record, publication, issue);
    const answers = listGitHubAnswers(root, record.id, record, false);
    const comments = issueComments(root, record, issue); // the issue read above — status asks GitHub for it once
    const unnamed = comments.filter(comment => comment.author === null).length;
    publication.questions = { count: comments.length, latestAt: comments.map(comment => comment.at).sort().at(-1) ?? null, ...(unnamed > 0 ? { unnamed } : {}) };
    publication.outside = { at: new Date().toISOString(), issueState: issue['state'], answers };
    publication.unavailableAt = null;
    publication.unavailableReason = null;
  } catch (error) {
    publication.unavailableAt = new Date().toISOString();
    // The failure's own name, kept so status can say what went wrong rather
    // than one generic label — and so a reason a rerun cannot fix is told
    // apart from one it can (BT14, F6).
    publication.unavailableReason = error instanceof BountyRefused ? error.reason : 'github-status-unavailable';
  }
  persistRecord(root, record);
}

// `author` is null when GitHub returned an account name the tool will not
// print: the comment still counts and is still shown, marked as such.
function observeIssueFormat(record: BountyRecord, publication: GitHubPublication, issue: unknown): void {
  if (!isObject(issue) || issue['number'] !== publication.issue?.number || typeof issue['body'] !== 'string' || !isObject(issue['user']) || issue['user']['login'] !== publication.account) return invalid('github-issue-mismatch', 'the issue body or author could not be bound to this bounty');
  publication.formatRead = formatFact(issue['body'], formatFor(record));
  publication.formatReadAt = new Date().toISOString();
  publication.formatUnavailableAt = null;
}

export function refreshGitHubFormat(root: string, record: BountyRecord): void {
  const publication = record.github;
  if (publication === undefined || publication.issue === null) return;
  try { observeIssueFormat(record, publication, api(root, `repos/${publication.repository}/issues/${publication.issue.number}`)); }
  catch { publication.formatUnavailableAt = new Date().toISOString(); }
  persistRecord(root, record);
}

export type IssueComment = { readonly author: string | null; readonly body: string; readonly at: string };

function boundIssue(root: string, record: BountyRecord, fetched?: unknown): { repository: string; number: number; account: string } {
  const publication = record.github;
  if (publication === undefined || publication.issue === null) return invalid('not-github-posted', `this bounty has no GitHub issue; next: box bounty status`);
  const issue = fetched ?? api(root, `repos/${publication.repository}/issues/${publication.issue.number}`);
  if (!isObject(issue) || issue['number'] !== publication.issue.number || typeof issue['body'] !== 'string' || !issue['body'].includes(`<!-- box-bounty:${record.id} -->`) || !isObject(issue['user']) || issue['user']['login'] !== publication.account) return invalid('github-issue-mismatch', `the issue is not this bounty's; nothing was read from it; next: box bounty status`);
  return { repository: publication.repository, number: publication.issue.number, account: publication.account };
}

export function issueComments(root: string, record: BountyRecord, fetched?: unknown): IssueComment[] {
  const issue = boundIssue(root, record, fetched);
  return pages(root, `repos/${issue.repository}/issues/${issue.number}/comments`).flatMap(entry => {
    if (!isObject(entry) || !isObject(entry['user']) || entry['user']['login'] === issue.account) return [];
    if (typeof entry['body'] !== 'string' || typeof entry['created_at'] !== 'string' || !Number.isFinite(Date.parse(entry['created_at']))) return invalid('github-response-invalid', 'GitHub returned an unreadable comment; next: box bounty status');
    const author = entry['user']['login'];
    return [{ author: typeof author === 'string' && READABLE_LOGIN.test(author) ? author : null, body: redact(entry['body']), at: entry['created_at'] }];
  });
}

// Reading what other accounts wrote is folded into `status --comments` —
// issueComments above is what it renders, bound to this bounty's own issue
// first, so a record pointed at the wrong issue refuses by name.

// A pull request's change on the real history: the diff against the bounty
// branch tip it descends from, classified changed/added/deleted.
function pullRequestChange(root: string, base: string, head: string): { changed: readonly string[]; added: readonly string[]; deleted: readonly string[] } {
  const diff = gitOutcome(root, ['diff', '--name-status', '-z', '--no-renames', base, head]);
  if (diff.status !== 0) return invalid('github-pr-unreadable', 'Git could not read the pull request change; nothing was collected');
  const changed: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  for (const { status, path } of parseNameStatus(diff.stdout)) {
    if (status === 'A') added.push(path);
    else if (status === 'D') deleted.push(path);
    else changed.push(path);
  }
  return { changed: changed.sort(), added: added.sort(), deleted: deleted.sort() };
}

// Added/removed line counts across the pull request's commits — git's read of
// the delta against the bounty branch tip, numstat only (never patch text, so
// no foreign .gitattributes can select a diff driver).
function pullRequestCounts(root: string, base: string, head: string): { added: number; removed: number; binary: number } {
  const run = gitOutcome(root, ['diff', '--numstat', '-z', base, head]);
  let added = 0; let removed = 0; let binary = 0;
  for (const entry of run.stdout.split('\0')) {
    if (entry === '') continue;
    const [a, d] = entry.split('\t');
    if (a === '-') binary += 1;
    else { added += Number.parseInt(a ?? '0', 10) || 0; removed += Number.parseInt(d ?? '0', 10) || 0; }
  }
  return { added, removed, binary };
}

// The stated test-file rule, for the flag: a path counts as a test when a
// segment is `test`, `tests` or `__tests__`, or the basename matches
// `test_*`, `*_test.*`, `*.test.*` or `*.spec.*` — the same rule the folder
// path states.
const isTestPath = (path: string): boolean => {
  const segments = path.toLowerCase().split('/');
  if (segments.slice(0, -1).some(segment => segment === 'test' || segment === 'tests' || segment === '__tests__')) return true;
  const base = segments[segments.length - 1]!;
  return base.startsWith('test_') || /_test\.[^.]+$/.test(base) || /\.(?:test|spec)\.[^.]+$/.test(base);
};

// Flags are plain observations, deliberately eager — the same stated rules as
// the folder path's report. No flag blocks anything.
const LARGE_FILES = 20;
const LARGE_LINES = 400;
function pullRequestFlags(change: { changed: readonly string[]; added: readonly string[]; deleted: readonly string[] }, counts: { added: number; removed: number }): string[] {
  const flags: string[] = [];
  const touched = [...change.changed, ...change.added, ...change.deleted];
  const testLike = touched.filter(isTestPath);
  if (testLike.length > 0) flags.push(`the solution touches ${testLike.map(showPath).join(', ')}, marked as a test by the stated rule (a test/, tests/ or __tests__/ segment, or a test_*, *_test.*, *.test.* or *.spec.* basename)`);
  if (change.added.length > 0) flags.push(`the solution adds ${change.added.length} file(s)`);
  if (change.deleted.length > 0) flags.push(`the solution deletes ${change.deleted.length} file(s)`);
  if (touched.length > LARGE_FILES || counts.added + counts.removed > LARGE_LINES) {
    flags.push(`the change is above the stated size (${LARGE_FILES} files or ${LARGE_LINES} lines): ${touched.length} files, ${counts.added + counts.removed} lines`);
  }
  return flags;
}

function renderPullRequestReport(record: BountyRecord, n: number, at: string, author: string, commits: number, change: { changed: readonly string[]; added: readonly string[]; deleted: readonly string[] }, merge: DryMerge, counts: { added: number; removed: number; binary: number }, payTo: PayToFact = { state: 'none' }): string[] {
  const lines: string[] = [];
  lines.push(`report — attempt ${n} for ${record.id}`);
  lines.push(`  from: GitHub account ${author} — arrived ${at}`);
  if ((boundAmount(record) ?? 0) > 0) lines.push(`  ${payToLine(payTo)}`);
  lines.push(`  change: ${commits} commit(s) on the bounty branch — ${change.changed.length} changed, ${change.added.length} added, ${change.deleted.length} deleted — ${counts.added} lines added, ${counts.removed} removed${counts.binary > 0 ? ` (${counts.binary} binary file(s))` : ''}`);
  if (merge.kind === 'clean') {
    lines.push('  current code: the solution would merge cleanly onto the current branch');
  } else if (merge.kind === 'conflict') {
    lines.push(`  current code: merging onto the current branch would conflict in ${merge.paths.map(showPath).join(', ')}`);
  } else {
    lines.push(`  current code: cannot tell — ${merge.detail}`);
  }
  const flags = pullRequestFlags(change, counts);
  if (flags.length === 0) lines.push('  flags: none');
  else for (const flag of flags) lines.push(`  flag: ${flag}`);
  lines.push(`  ${NOTHING_RUN}`);
  lines.push(`  next: box bounty look ${record.id} ${n} to read the change; box bounty apply ${record.id} ${n} to merge it; or box bounty close ${record.id} --reason "<why>"`);
  return lines;
}

// Collecting a pull request: the checks the old `answer` command enforced,
// run before anything is written — the same gate `look <id> <n>` and `apply
// <id> <n>` pass through for a number no recorded attempt carries. `via` is
// the driving command's name for the recorded event.
export function answerGitHub(root: string, id: string, pr: number, via?: 'look' | 'apply') {
  const record = loadRecord(root, id);
  requireCurrentDelivery(record);
  if (record.github === undefined || record.github.state !== 'posted') return invalid('not-github-posted', 'this bounty is not posted to GitHub');
  if (!isOpenStage(record.stage)) return invalid('not-posted', `bounty ${id} is ${record.stage} — a solution can only come back to a bounty that is still open`);
  if (!Number.isSafeInteger(pr) || pr < 1) return invalid('github-pr-missing', 'name an existing pull request number');
  const publication = record.github;
  const { repository, branch } = publication;
  let data: unknown;
  try { data = api(root, `repos/${repository}/pulls/${pr}`); }
  catch { return invalid('github-pr-missing', 'that pull request cannot be read in the project repository; nothing was collected'); }
  if (!isObject(data) || !isObject(data['base']) || !isObject(data['base']['repo']) || data['base']['ref'] !== branch || data['base']['repo']['full_name'] !== repository) return invalid('github-pr-wrong-branch', 'the pull request targets another branch or repository; nothing was collected');
  if (!isObject(data['head']) || typeof data['head']['sha'] !== 'string' || !/^[a-f\d]{40}$/.test(data['head']['sha']) || !isObject(data['user'])) return invalid('github-response-invalid', 'GitHub returned unreadable pull request facts');
  const author = login(data['user']['login']);
  // The pull request's head lands on FETCH_HEAD alone — no scratch ref to
  // create and delete around the read.
  remoteGit(root, repository, ['fetch', '--no-tags', '--no-recurse-submodules', `refs/pull/${pr}/head`]);
  const commit = git(root, ['rev-parse', 'FETCH_HEAD']);
  if (commit !== data['head']['sha']) return invalid('github-pr-changed', 'the pull request changed during collection; retry to collect its current version');
  const body = typeof data['body'] === 'string' ? data['body'] : '';
  const payTo = parsePayTo(body);
  requireCurrentDelivery(record);
  const result = collectHistoryPullRequest(root, record, publication, commit, author, pr, via, payTo, redact(body));
  if (publication.seenPullRequests?.some(entry => entry.n === pr && entry.commit === commit) !== true) {
    publication.seenPullRequests = [...publication.seenPullRequests ?? [], { n: pr, commit, at: result.record.attempts?.find(attempt => attempt.commit === commit)?.seenAt ?? new Date().toISOString() }];
    persistRecord(root, result.record);
  }
  return result;
}

// `look <id> <n>` and `apply <id> <n>` accept a pull request's number
// directly: when no recorded attempt carries n and the bounty is posted on
// GitHub, the number collects the pull request first — every check above —
// and the attempt it lands is the one the command proceeds with. `via` is
// the command's own name for the recorded event.
export function resolveAttempt(root: string, record: BountyRecord, n: number, via: 'look' | 'apply'): { record: BountyRecord; attempt: Attempt; collected: boolean } {
  const found = attemptsOf(record).find(candidate => candidate.n === n);
  if (found !== undefined) return { record, attempt: found, collected: false };
  if (record.github?.state === 'posted' && isOpenStage(record.stage)) {
    const collected = answerGitHub(root, record.id, n, via);
    const attempt = attemptsOf(collected.record).find(candidate => candidate.n === collected.attempt);
    if (attempt !== undefined) return { record: collected.record, attempt, collected: true };
  }
  const known = attemptsOf(record).map(candidate => `#${candidate.n}`).join(', ') || 'none yet';
  const way = record.github === undefined
    ? `post to GitHub with box bounty post ${record.id}, or end it with box bounty close ${record.id}`
    : `name one of them or a pull request number — the pull request collects itself`;
  return invalid('unknown-attempt', `solution ${n} does not exist on ${record.id} — the bounty knows ${known}; ${way}`);
}

// The history path: the pull request's commits are the answer. Refusals, each
// changing nothing: its history does not descend from the bounty branch; its
// tree holds a link, a submodule or an unsafe name; a path it carries matches
// never-ship anywhere in its new history; it changes nothing at all.
// `description` is the pull request's own description text, credential-redacted
// by the caller. It is recorded for `look --json`'s `fromOthers` (BT19) — the
// tool never renders it as its own words.
function collectHistoryPullRequest(root: string, record: BountyRecord, publication: GitHubPublication, commit: string, author: string, pr: number, via?: string, payTo: PayToFact = { state: 'none' }, description?: string) {
  if (gitOutcome(root, ['merge-base', '--is-ancestor', publication.commit, commit]).status !== 0) {
    return invalid('github-pr-not-descended', `the pull request's history does not descend from ${publication.branch}, the bounty branch — there is nothing sound to compare it with; nothing was collected`);
  }
  const remoteTip = remoteBranchSha(root, publication.repository, publication.branch);
  if (remoteTip !== publication.commit) {
    return invalid('github-branch-changed', `${publication.branch} on the remote is ${remoteTip ?? 'gone'}, not the ${publication.commit} this tool posted — it was changed outside the tool; nothing was collected`);
  }
  const tree = gitOutcome(root, ['ls-tree', '-rz', commit]);
  if (tree.status !== 0) return invalid('github-pr-unreadable', 'Git could not read the pull request tree');
  for (const entry of tree.stdout.split('\0')) {
    if (entry === '') continue;
    const match = /^(100644|100755) blob ([a-f\d]{40})\t(.+)$/s.exec(entry);
    if (match === null || match[3] === undefined || match[3].split('/').some(segment => segment === '' || segment === '.' || segment === '..') || /[\\:\x00-\x1f]/.test(match[3])) return invalid('answer-unsafe-path', 'the pull request tree holds a link, a submodule or an unsafe path; nothing was collected');
    if (redact(match[3]) !== match[3]) return invalid('github-response-invalid', 'a pull request path contains credential-shaped text; nothing was collected');
  }
  // Never-ship on everything the pull request introduces: a path it touches
  // anywhere in its new history — added, changed or deleted — is refused,
  // so a file planted deep in the history and removed in the last commit
  // still cannot land.
  const rules = shipRules(root);
  // --parents rides the same walk: each new commit's first parent comes back
  // in the same line, so no per-commit `rev-list --parents` is needed.
  const firstParents = new Map<string, string>();
  const newCommits = gitOutcome(root, ['rev-list', '--topo-order', '--parents', `${publication.commit}..${commit}`]).stdout
    .split('\n').map(line => line.trim().split(/\s+/)).filter(fields => /^[a-f\d]{40}$/.test(fields[0] ?? ''))
    .map(fields => {
      if (fields[1] !== undefined) firstParents.set(fields[0]!, fields[1]!);
      return fields[0]!;
    });
  const violations: { path: string; rule: string }[] = [];
  for (const sha of newCommits) {
    violations.push(...neverShipViolations(commitStatuses(root, sha, 'nothing was collected', firstParents.get(sha) ?? EMPTY_TREE), rules));
  }
  if (violations.length > 0) {
    const named = [...new Map(violations.map(v => [v.path, v])).values()];
    return invalid('answer-never-ship', `the pull request touches never-ship paths in its history — refused, nothing was collected: ${named.map(v => `${v.path} (rule '${v.rule}')`).join(', ')}`);
  }
  const change = pullRequestChange(root, publication.commit, commit);
  if (change.changed.length === 0 && change.added.length === 0 && change.deleted.length === 0) {
    return invalid('answer-empty', 'the pull request changes nothing against the bounty branch — a return that changes nothing is no solution');
  }
  // A pull request keeps its own number as its solution number — the outside
  // listing and `look`/`apply <id> <n>` name the same thing. A number already
  // carried by an attempt (this pull request collected before, or a returned
  // folder that took it) falls back to the next free number.
  const n = attemptsOf(record).some(attempt => attempt.n === pr)
    ? attemptsOf(record).reduce((max, attempt) => Math.max(max, attempt.n), 0) + 1
    : pr;
  // Pin the attempt commit before recording anything — a crash between loses
  // nothing the record names.
  git(root, ['update-ref', attemptRefName(record.id, n), commit]);
  transitionTo(root, record, 'taken', { attempt: n, ...(via !== undefined ? { command: via } : {}) });
  transitionTo(root, record, 'answered', { attempt: n });
  record.conflicts = null;

  const at = new Date().toISOString();
  const merge = dryMergeOnto(root, commit);
  const counts = pullRequestCounts(root, publication.commit, commit);
  const report = renderPullRequestReport(record, n, at, author, newCommits.length, change, merge, counts, payTo);
  const attempt: Attempt = {
    n,
    pullRequest: pr,
    at,
    seenAt: publication.seenPullRequests?.find(entry => entry.commit === commit)?.at ?? at,
    author,
    commit,
    changed: change.changed,
    added: change.added,
    deleted: change.deleted,
    outcome: 'answered',
    conflicts: merge.kind === 'conflict' ? merge.paths : null,
    report,
    payTo,
    ...(description !== undefined ? { description } : {})
  };
  record.attempts = [...attemptsOf(record), attempt];
  persistRecord(root, record);
  return { record, outcome: 'answered' as const, attempt: n, report, ...(merge.kind === 'conflict' ? { conflicts: merge.paths } : {}) };
}

// A local decision finishes outside: the decision comments, the issue close
// and the bounty-branch removal — retried runs resume by stable comment
// markers so nothing lands twice. The owner decided on 15 October 2026 that
// this runs whatever the standing answer is; when the answer is not
// 'allowed' and this run actually changed GitHub, one line says so through
// the merge-notice listener.
export function syncGitHubDecision(root: string, record: BountyRecord, opts?: { answered?: boolean; decision?: DecisionRead }): void {
  const publication = record.github;
  if (publication === undefined) return;
  // 'reject', 'withdraw' and 'undo' stay in the list for records written
  // while those commands existed; 'close' carries the same work now.
  const decisions = record.events.filter(entry => ['apply', 'reject', 'withdraw', 'undo', 'merged', 'close'].includes(entry.command ?? ''));
  const event = decisions.at(-1);
  if (event === undefined) return;
  // Whether this run touched GitHub at all — a posted comment, a closed
  // issue or a removed branch. The unasked line below fires only on change.
  let changed = false;
  try {
    if (signedAccount(root) !== publication.account) return invalid('github-account-changed', 'sign in to the account that started this post to finish outside work');
    if (publication.issue === null) {
      publication.issue = recoverIssue(root, publication);
      persistRecord(root, record);
    }
    if (publication.issue !== null) {
      const endpoint = `repos/${publication.repository}/issues/${publication.issue.number}`;
      const snapshot = closingIssue(root, publication);
      const comments = snapshot.comments;
      for (const decision of decisions) {
        const marker = `<!-- box-bounty:${record.id}:${decision.command} -->`;
        const fact = decision.command === 'merged' ? `Solution${decision.attempt !== undefined ? ` #${decision.attempt}` : ''} is merged on the bounty's branch as commit ${decision.merge} (${decision.reason ?? decision.merge}).`
          : decision.stage === 'applied' ? `Applied as commit ${decision.merge}.`
          : decision.stage === 'rejected' ? `Rejected. Recorded reason: ${decision.reason}`
          : decision.stage === 'undone' ? `Undo recorded as commit ${decision.merge}.`
          : 'Withdrawn.';
        const body = `${fact}\n\n${marker}`;
        if (!comments.some(entry => isObject(entry) && entry['body'] === body && isObject(entry['user']) && entry['user']['login'] === publication.account)) {
          const response = api(root, `${endpoint}/comments`, { body });
          if (!isObject(response) || response['body'] !== body || !isObject(response['user']) || response['user']['login'] !== publication.account) return invalid('github-response-invalid', 'GitHub did not confirm the decision comment');
          comments.push(response);
          changed = true;
        }
      }
      // Before the branch goes, name what removing it loses: a history post's
      // branch can carry commits that exist nowhere else — the poster's
      // unpushed commits and the tool's work-in-progress commit. Their shas
      // stay reachable through the record, but a reader of the issue is owed
      // the names. The marker keeps a retry from naming them twice.
      const pushed = publication.pushed ?? [];
      if (publication.kind === 'history' && pushed.length > 0) {
        const marker = `<!-- box-bounty:${record.id}:branch-removed -->`;
        const body = `The bounty branch \`${publication.branch}\` is removed. It carried ${pushed.length} commit(s) that existed only there — their identifiers stay valid in any clone that fetched them: ${pushed.map(commit => `\`${commit.sha}\` ${commit.subject}`).join(', ')}.\n\n${marker}`;
        if (!comments.some(entry => isObject(entry) && entry['body'] === body && isObject(entry['user']) && entry['user']['login'] === publication.account)) {
          const response = api(root, `${endpoint}/comments`, { body });
          if (!isObject(response) || response['body'] !== body || !isObject(response['user']) || response['user']['login'] !== publication.account) return invalid('github-response-invalid', 'GitHub did not confirm the branch-removal comment');
          changed = true;
        }
      }
      const read = readFormat(snapshot.body);
      publication.formatRead = read.kind === 'present' ? 'differs-from-record' : read.kind;
      publication.formatReadAt = new Date().toISOString();
      publication.formatUnavailableAt = null;
      if (read.kind === 'invalid') publication.formatRepair = 'preserved-invalid';
      let closed: unknown;
      if (read.kind === 'present') {
        try {
          // The block already on the issue is the bound public artifact: at
          // close only `state` may change — every other field, the reward
          // among them, keeps the bytes it went public with. Nothing re-read
          // from the record can reach the block here, so it can never be made
          // to disagree with the listing text above it by an edited record
          // (BT11a fix round).
          const body = snapshot.body.slice(0, read.start) + renderFormat({ ...read.value, state: formatFor(record).state });
          closed = api(root, endpoint, { state: 'closed', body }, 'PATCH');
          if (!isObject(closed) || closed['body'] !== body) throw new Error('format update was not confirmed');
          publication.formatRead = formatFact(body, formatFor(record));
          publication.formatRepair = 'updated';
        } catch { publication.formatRepair = 'update-failed'; closed = api(root, endpoint, { state: 'closed' }, 'PATCH'); }
      } else closed = api(root, endpoint, { state: 'closed' }, 'PATCH');
      if (!isObject(closed) || closed['state'] !== 'closed') return invalid('github-response-invalid', 'GitHub did not confirm issue closure');
      // The record not yet showing 'closed' means this run closed it; a
      // body the PATCH rewrote (the format block) is a real change too.
      if (publication.state !== 'closed' || closed['body'] !== snapshot.body) changed = true;
    }
    const tip = remoteBranchSha(root, publication.repository, publication.branch);
    if (tip !== null && tip !== publication.commit) {
      throw new BountyRefused('github-branch-changed', `${publication.branch} on the remote is ${tip}, not the ${publication.commit} this tool posted — it was changed outside the tool; removing it is not this tool's call`);
    }
    if (tip !== null) { remoteGit(root, publication.repository, ['push', `:refs/heads/${publication.branch}`]); changed = true; }
    git(root, ['update-ref', '-d', publicationRef(record.id)]);
    publication.state = 'closed';
    if (publication.kind === 'history' && (publication.pushed?.length ?? 0) > 0) {
      publication.closedNote = `${publication.branch} carried ${publication.pushed!.length} commit(s) published only there — ${publication.pushed!.map(commit => `${commit.sha.slice(0, 12)} ${commit.subject}`).join(', ')} — and is now removed`;
    }
    // A bounty that stated a reward and ends on a merged solution records
    // whom to pay: the pull request description is re-read now — with the
    // account that last edited it — so the pay message the agent relays says
    // what the solver actually left there (BT11b). $0 and non-merged closes
    // record nothing.
    if (event.merge !== undefined && (boundAmount(record) ?? 0) > 0) {
      publication.pay = readPay(root, publication, record, event);
    }
    publication.pending = null;
    delete record.waiting; // the held outside close is done
    // The owner decided the tool may still close up a bounty it opened
    // (15 October 2026) — and says so when the standing answer is not
    // 'allowed'. Only a run that changed GitHub gets the line; a retry that
    // finds it all done, and every run under 'allowed', stays quiet.
    if (changed) {
      let answer = 'not given';
      try {
        const read = opts?.decision ?? readDecision(root);
        if (read.decision === 'allowed') answer = '';
        else if (read.decision === 'ask') answer = 'ask me each time';
        else if (read.denied === true || read.decision === 'off') answer = 'deny';
      } catch { /* a repository whose identity cannot be read counts as not allowed — 'not given' stands */ }
      if (answer !== '') emitMergeNotice(`${record.id} — closed up on GitHub without asking: the issue is closed and the bounty branch removed; your standing answer here is ${answer}`);
    }
  } catch (error) {
    const detail = error instanceof BountyRefused ? ` (${error.reason}: ${error.message})` : '';
    // The retry is `close` whatever the local decision was — on an ended
    // record it retries exactly this outside work. The local word names the
    // recorded decision with today's vocabulary.
    const local = ({ undo: 'revert', reject: 'close', withdraw: 'close' } as Record<string, string>)[event.command ?? ''] ?? event.command;
    publication.pending = `github-decision-pending${detail}: local ${local} stands; retry box bounty close ${record.id} to comment, close the issue and remove ${publication.branch}`;
  }
  persistRecord(root, record);
}

// Acquire the current issue body and every decision comment in one paginated
// GitHub request per page. This replaces the comments-only REST read, so
// preserving an edited visible body costs no extra process on the close path.
function closingIssue(root: string, publication: GitHubPublication): { body: string; comments: unknown[] } {
  const [owner, name] = publication.repository.split('/');
  const comments: unknown[] = [];
  let after: string | null = null;
  let body: string | undefined;
  const seenAfter = new Set<string>();
  for (;;) {
    const data = api(root, 'graphql', {
      query: 'query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){issue(number:$number){body author{login} comments(first:100,after:$after){edges{cursor node{body author{login}}} pageInfo{hasNextPage}}}}}',
      variables: { owner, name, number: publication.issue?.number, after }
    });
    if (!isObject(data) || !isObject(data['data']) || !isObject(data['data']['repository']) || !isObject(data['data']['repository']['issue'])) return invalid('github-response-invalid', 'GitHub returned an unreadable closing issue');
    const issue = data['data']['repository']['issue'];
    if (typeof issue['body'] !== 'string' || !isObject(issue['author']) || issue['author']['login'] !== publication.account || !isObject(issue['comments'])) return invalid('github-issue-mismatch', 'the closing issue body or author did not match this bounty');
    body ??= issue['body'];
    if (body !== issue['body']) return invalid('github-issue-changed', 'the issue body changed while its comments were read; retry closing');
    const connection = issue['comments'];
    if (!Array.isArray(connection['edges']) || !isObject(connection['pageInfo'])) return invalid('github-response-invalid', 'GitHub returned unreadable closing comments');
    let last: string | null = null;
    for (const edge of connection['edges']) {
      if (!isObject(edge) || typeof edge['cursor'] !== 'string' || edge['cursor'] === '' || !isObject(edge['node']) || typeof edge['node']['body'] !== 'string') return invalid('github-response-invalid', 'GitHub returned an unreadable closing comment');
      const node = edge['node'];
      comments.push({ body: node['body'], user: node['author'] });
      last = edge['cursor'];
    }
    const page = connection['pageInfo'];
    if (page['hasNextPage'] === false) return { body, comments };
    if (page['hasNextPage'] !== true || last === null || seenAfter.has(last)) return invalid('github-response-invalid', 'GitHub returned an unreadable comment cursor');
    after = last; seenAfter.add(after);
  }
}

// BT11b — whom a merged solution pays. The description of the merged pull
// request is read again at close, with the account that last edited it, so
// the pay message reflects what the solver actually left there. When the
// read fails, the fact recorded at collection stands and the message says
// the description could not be read again.
function readPay(root: string, publication: GitHubPublication, record: BountyRecord, event: { attempt?: number; reason?: string }): PayOutcome {
  const attempt = event.attempt !== undefined ? attemptsOf(record).find(entry => entry.n === event.attempt) : undefined;
  const pr = attempt?.pullRequest ?? (() => {
    const match = /pull request #(\d+)/.exec(event.reason ?? '');
    return match !== null ? Number(match[1]) : null;
  })();
  const solver = attempt?.author ?? (pr !== null ? publication.seenPullRequests?.find(entry => entry.n === pr)?.author ?? null : null);
  const recorded = attempt?.payTo ?? (pr !== null ? publication.seenPullRequests?.find(entry => entry.n === pr)?.payTo : undefined);
  if (pr === null) return { pr: null, solver, link: null, testMode: false, editedBy: null };
  try {
    const fresh = closingPullRequest(root, publication, pr);
    const fact = parsePayTo(fresh.body);
    const link = fact.state === 'recognised' || fact.state === 'test-mode' ? fact.link : null;
    return { pr, solver, link, testMode: fact.state === 'test-mode', editedBy: fresh.editor !== null && fresh.editor !== solver ? fresh.editor : null };
  } catch {
    const link = recorded?.state === 'recognised' || recorded?.state === 'test-mode' ? recorded.link : null;
    return { pr, solver, link, testMode: recorded?.state === 'test-mode', editedBy: null, readFailed: true };
  }
}

// The pull request's description plus the account that last edited it — one
// GraphQL read. `userContentEdits` is empty when the description was never
// edited after opening, so a null editor means the solver's own text.
function closingPullRequest(root: string, publication: GitHubPublication, pr: number): { body: string; editor: string | null } {
  const [owner, name] = publication.repository.split('/');
  const data = api(root, 'graphql', {
    query: 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){body userContentEdits(last:1){nodes{editor{login}}}}}}',
    variables: { owner, name, number: pr }
  });
  if (!isObject(data) || !isObject(data['data']) || !isObject(data['data']['repository']) || !isObject(data['data']['repository']['pullRequest'])) throw new Error('github-response-invalid: GitHub returned an unreadable pull request');
  const pullRequest = data['data']['repository']['pullRequest'];
  if (typeof pullRequest['body'] !== 'string') throw new Error('github-response-invalid: GitHub returned an unreadable pull request description');
  const edits = pullRequest['userContentEdits'];
  let editor: string | null = null;
  if (isObject(edits) && Array.isArray(edits['nodes'])) {
    const last = edits['nodes'].at(-1);
    if (isObject(last) && isObject(last['editor']) && typeof last['editor']['login'] === 'string') editor = login(last['editor']['login']);
  }
  return { body: pullRequest['body'], editor };
}





export { GH_LEAST, limitGitHubCalls } from './gh.js';
export type { GitHubPublication, GitHubChoice } from './gh.js';
export { shownOfPlan, planGitHub } from './publish-plan.js';
export type { GitHubPlan } from './publish-plan.js';
