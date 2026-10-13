import { asOneCommand } from './git.js';
import { answerBounty as answerBountyCommand, applyBounty as applyBountyCommand } from './answer.js';
import { answerGitHub as answerGitHubCommand, listGitHubAnswers as listGitHubAnswersCommand, previewGitHub as previewGitHubCommand } from './github.js';
import { finalizeBounty as finalizeBountyCommand, planBounty as planBountyCommand } from './create.js';
import { closeBounty as closeBountyCommand, confirmBounty as confirmBountyCommand, postBounty as postBountyCommand, renderStatus as renderStatusCommand } from './record.js';
import { lookBounty as lookBountyCommand } from './look.js';

// Each command the package offers is one command to Git's pins: the names of
// configured filters and merge drivers are read once per repository path for
// its length and forgotten when it returns (see asOneCommand in git.ts).
const command = <A extends unknown[], R>(run: (...args: A) => R) => (...args: A): R => asOneCommand(() => run(...args));
// Collection is not a command of its own: `look` and `apply` reach it through
// their target argument (an attempt or pull-request number, or --from a
// returned folder), running every refusal it had before anything is written.
// The collection primitives are library internals, not commands: `look` and
// `apply` run them through their target, and tests and the GitHub fixture use
// them to stand a solver's answer where the real network would.
export const answerBounty = command(answerBountyCommand);
export const answerGitHub = command(answerGitHubCommand);
export const applyBounty = command(applyBountyCommand);
export const listGitHubAnswers = command(listGitHubAnswersCommand);
export const previewGitHub = command(previewGitHubCommand);
export const finalizeBounty = command(finalizeBountyCommand);
export const planBounty = command(planBountyCommand);
export const confirmBounty = command(confirmBountyCommand);
export const postBounty = command(postBountyCommand);
export const closeBounty = command(closeBountyCommand);
export const renderStatus = command(renderStatusCommand);
export const lookBounty = command(lookBountyCommand);
export type { LookResult, LookTarget } from './look.js';
export { LOOK_DIFF_LIMIT } from './look.js';
export { quoteForeign, showPath } from './answer.js';
export type { GitHubChoice, GitHubPlan, GitHubPublication, IssueComment } from './github.js';
export type { ApplyResult, ApplyTarget } from './answer.js';
export { BountyUsage, parseCreateArgs } from './args.js';
export type { CreateArgs } from './args.js';
export { licenceOf, renderListing, renderPreview, resolveRepoRoot, TOOL_VERSION } from './create.js';
export type { BountyPlan, BountyResult, CreateOptions, PlanFile, RuleRemoval } from './create.js';
export { BountyRefused } from './errors.js';
export { GitFailed, git, gitOutcome, ownerGit, ownerGitOutcome } from './git.js';
export { NOTHING_RUN } from './answer.js';
export type { BountyManifest } from './manifest.js';
export { LIMITS_FILE, loadLimits } from './limits.js';
export type { BountyLimits } from './limits.js';
export { BUILTIN_RULES, loadOwnerList, OWNER_LIST_FILE } from './never-ship.js';
export type { NeverShipRule } from './never-ship.js';
export { applicableAttempts, attemptRefName, attemptsOf, canonicalForNew, isOpenStage, listRecords, loadRecord, persistRecord, recordDir, recordPath, refName, renderHelp, renderOpenLine, renderResume, resolveLimits, transitionTo, writeNewRecord } from './record.js';
export type { AnswerSpec, Attempt, AttemptOutcome, BountyRecord, BountyStage, CloseOutcome, EndedStage, ListedBounty, OpenStage, RecordSeed, ResolvedLimits, StageEvent } from './record.js';
export { renderDescribe, renderRules } from './tell.js';
export { readGitPinsOncePerProcess } from './git.js';
export { DESCRIBE_LINES, renderRulesBlock, RULES_LINES, RULES_MARKERS, rulesBlockInterior } from './wording.js';
export { classifySnapshot, createSnapshot, createSnapshotCommit } from './snapshot.js';
export type { Snapshot, SnapshotFile, SnapshotRemoval } from './snapshot.js';
export { checkMergedSolutions, noticeMergedSolutions, setMergeNoticeListener } from './merged.js';
export { GIT_LEAST } from './git.js';
export { GH_LEAST } from './github.js';
