import { asOneCommand } from './git.js';
import { applyBounty as applyBountyCommand } from './answer.js';
import { answerGitHub as answerGitHubCommand, listGitHubAnswers as listGitHubAnswersCommand, previewGitHub as previewGitHubCommand } from './github.js';
import { createBounty as createBountyCommand, finalizeBounty as finalizeBountyCommand, planBounty as planBountyCommand } from './create.js';
import { closeBounty as closeBountyCommand, postBounty as postBountyCommand, renderStatus as renderStatusCommand } from './record.js';
import { lookBounty as lookBountyCommand } from './look.js';
import { statusDocument as statusDocumentCommand, configDocument as configDocumentCommand } from './json.js';

// Each command the package offers is one command to Git's pins: the names of
// configured filters and merge drivers are read once per repository path for
// its length and forgotten when it returns (see asOneCommand in git.ts).
const command = <A extends unknown[], R>(run: (...args: A) => R) => (...args: A): R => asOneCommand(() => run(...args));
// Collection is not a command of its own: `look` and `apply` reach it through
// returned folder), running every refusal it had before anything is written.
// The collection primitives are library internals, not commands: `look` and
// `apply` run them through their target, and tests and the GitHub fixture use
// them to stand a solver's answer where the real network would.
export const answerGitHub = command(answerGitHubCommand);
export const applyBounty = command(applyBountyCommand);
export const listGitHubAnswers = command(listGitHubAnswersCommand);
export const previewGitHub = command(previewGitHubCommand);
export const createBounty = command(createBountyCommand);
export const finalizeBounty = command(finalizeBountyCommand);
export const planBounty = command(planBountyCommand);
export const postBounty = command(postBountyCommand);
export const closeBounty = command(closeBountyCommand);
export const renderStatus = command(renderStatusCommand);
export const lookBounty = command(lookBountyCommand);
// The --json documents (BT19): same reads the text views make, so the same
// pin-window treatment. `lookDocument` is a pure map of the LookResult —
// no reads — and rides unwrapped.
export const statusDocument = command(statusDocumentCommand);
export const configDocument = command(configDocumentCommand);
export { lookDocument } from './json.js';
export type { StatusDocumentOptions } from './json.js';
export type { LookResult, LookTarget } from './look.js';
export { LOOK_DIFF_LIMIT } from './look.js';
export { quoteForeign, showPath } from './answer.js';
export type { GitHubChoice, GitHubPlan, GitHubPublication, IssueComment } from './github.js';
export type { ApplyResult, ApplyTarget } from './answer.js';
export { BountyUsage, parseCreateArgs, parseOptions, commandHelp, BOUNTY_COMMANDS, OPTIONS_NOTE } from './args.js';
export type { CreateArgs, ParsedOptions } from './args.js';
export { deriveTitle, renderPreview, resolveRepoRoot, TITLE_LIMIT, TOOL_VERSION } from './create.js';
export type { BountyPlan, BountyResult, CreateOptions, PlanFile, RuleRemoval } from './create.js';
export { BountyRefused } from './errors.js';
export { GitFailed, git, gitOutcome, ownerGit, ownerGitOutcome } from './git.js';
export { NOTHING_RUN } from './answer.js';
export { BUILTIN_RULES, changePublishList, loadOwnerList, OWNER_LIST_FILE, publishListed, publishLists, shipRules } from './never-ship.js';
export type { NeverShipRule, PublishLists } from './never-ship.js';
export { applicableAttempts, assertPromiseRoom, attemptRefName, attemptsOf, canonicalForNew, firstUseBlock, isOpenStage, listRecords, loadRecord, mergeWaitLines, ownerBlock, ownerGate, ownerWaitLines, persistRecord, promisedTotal, recordDir, recordPath, refName, requireCurrentDelivery, renderHelp, renderOpenLine, renderResume, renderOverview, rewardForPost, setInstructionNoticeListener, transitionTo, waitForOwner, waitingSummary, withPromiseLock, writeNewRecord } from './record.js';
export { boundAmount } from './format.js';
export type { AllowedBy, AnswerSpec, Attempt, AttemptOutcome, BountyRecord, BountyStage, CloseOutcome, EndedStage, ListedBounty, OpenStage, RecordSeed, StageEvent, WaitingFor } from './record.js';
export { allowRepository, allowBounty, denyRepository, renderConfig, changeConfig, renderSummary } from './owner.js';
export { actingOn, askMergeNoticeLine, loadSettings, loadState, projectKey, readDecision, readReward, repoReward, repositoryIdentity, requireRepository, rewardNoticeLine, saveState, settingsDir, settingsFile, stateFile, unlistedRemotes, writeDecision, SETTINGS_ENV, STATE_FILE_NAME } from './settings.js';
export type { DecisionRead, OwnerDecision, OwnerSettings, ToolState } from './settings.js';
export { chooseRepository, githubRemotes, repositoryAddress, repositoryChoiceLines } from './repository.js';
export type { RemoteCandidate, RepositoryChoice } from './repository.js';
export { shownOfPlan } from './github.js';
export { binaryPatchPaths, looksBinary, SECRET_RULES, scanPatch, scanText } from './scan.js';
export type { ScanHit, SecretRule } from './scan.js';
export { recordScanFinding, settleScanFindings } from './record.js';
export type { ScanFinding } from './record.js';
export { renderDescribe, renderRules } from './tell.js';
export { readGitPinsOncePerProcess } from './git.js';
export { DESCRIBE_LINES, renderRulesBlock, RULES_LINES, RULES_MARKERS, rulesBlockInterior } from './wording.js';
export { classifySnapshot, createSnapshot, createSnapshotCommit } from './snapshot.js';
export type { Snapshot, SnapshotFile, SnapshotRemoval } from './snapshot.js';
export { checkMergedSolutions, noticeMergedSolutions, setMergeNoticeListener } from './merged.js';
export { parsePayTo, payToLine, payMessageLines, payNotice } from './pay.js';
export type { PayOutcome, PayToFact } from './pay.js';
export { GIT_LEAST } from './git.js';
export { GH_LEAST } from './github.js';
export { HOOK_COMMAND, HOOK_GH_CALL_COUNT, HOOK_GH_CALL_LIMIT_MS, HOOK_GITHUB_BUDGET_MS, HOOK_GITHUB_INTERVAL_MS, HOOK_HOSTS, HOOK_SLOTS, hookDisclosure, hookGroups, hookHost, hookOff, hookOn, hookStatus, runHook } from './hook.js';
export type { HookHost, HookRun, HookSlot } from './hook.js';
export { limitGitHubCalls } from './github.js';
