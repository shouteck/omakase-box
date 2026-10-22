import { asOneCommand } from './git.js';
import { applyBounty as applyBountyCommand } from './answer.js';
import { answerGitHub as answerGitHubCommand,listGitHubAnswers as listGitHubAnswersCommand } from './collect.js';
import { previewGitHub as previewGitHubCommand } from './post.js';
import { createBounty as createBountyCommand,finalizeBounty as finalizeBountyCommand,planBounty as planBountyCommand } from './create.js';
import { closeBounty as closeBountyCommand,postBounty as postBountyCommand } from './commands.js';
import { renderStatus as renderStatusCommand } from './render.js';
import { lookBounty as lookBountyCommand } from './look.js';
import { statusDocument as statusDocumentCommand,configDocument as configDocumentCommand } from './json.js';
import { findBounties as findBountiesCommand,findDocument as findDocumentCommand,renderFind as renderFindCommand } from './find.js';

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
export const findBounties = command(findBountiesCommand);
export const findDocument = command(findDocumentCommand);
export const renderFind = command(renderFindCommand);
export { FIND_RESULT_LIMIT } from './find.js';
export type { FindMatch } from './find.js';
export { lookDocument } from './json.js';
export type { StatusDocumentOptions } from './json.js';
export type { LookResult, LookTarget } from './look.js';
export { exportLook, LOOK_DIFF_LIMIT } from './look.js';
export type { LookExport } from './look.js';
export { escapeControls, quoteForeign, showPath } from './notice.js';
// The reading boundary (BT43): the one renderer for a stranger's text.
export { blockFooter, blockHeader, LOOK_FOREIGN_FIELDS, solverAccount, solverBlock, solverLine, SOLVER_WORDS, STATUS_FOREIGN_FIELDS } from './untrusted.js';
export type { ForeignField, ForeignSource } from './untrusted.js';
export type { GitHubChoice, GitHubPublication } from './gh.js';
export type { GitHubPlan } from './publish-plan.js';
export type { IssueComment } from './collect.js';
export type { ApplyResult, ApplyTarget } from './answer.js';
export { BountyUsage, parseCreateArgs, parseOptions, commandHelp, BOUNTY_COMMANDS, OPTIONS_NOTE } from './args.js';
export type { CreateArgs, ParsedOptions } from './args.js';
export { deriveTitle, renderPreview, resolveRepoRoot, TITLE_LIMIT, TOOL_VERSION } from './create.js';
export type { BountyPlan, BountyResult, CreateOptions, PlanFile, RuleRemoval } from './create.js';
export { BountyRefused } from './errors.js';
export { GitFailed, git, gitOutcome, ownerGit, ownerGitOutcome } from './git.js';
export { ProgramLaunchUnsupported, ProgramUnavailable, resolveProgram } from './program.js';
export type { ResolvedProgram } from './program.js';
export { NOTHING_RUN } from './notice.js';
export { BUILTIN_RULES, changePublishList, loadOwnerList, OWNER_LIST_FILE, publishListed, publishLists, shipRules } from './never-ship.js';
export type { NeverShipRule, PublishLists } from './never-ship.js';
export { applicableAttempts, attemptRefName, attemptsOf, canonicalForNew, endedCount, endedRecords, isOpenStage, listRecords, loadRecord, noticeMergedOnce, openRecords, persistRecord, recordDir, recordPath, refName, requireCurrentDelivery, retiredRoute, trackedRecordFiles, transitionTo, writeNewRecord } from './record.js';
export { anyJsonContaining, closeStores, countCorrupt, corruptFiles, dropStored, endedContaining, forgetFileSha, listEndedRecent, listOpen, recordExists, recordIds, readStored, searchRecords, seedStored, storeDbPath, storedIds, storedRaw } from './store.js';
export { ownerGate, waitForOwner } from './gate.js';
export { assertPromiseRoom, promisedTotal, rewardForPost, withPromiseLock } from './money.js';
export { waitingSummary } from './owner-text.js';
export { ENDED_OVERVIEW_LIMIT, renderHelp, renderOpenLine, renderResume, renderOverview, setInstructionNoticeListener } from './render.js';
export { firstUseBlock, mergeWaitLines, ownerBlock, ownerWaitLines } from './owner-text.js';
export { boundAmount } from './format.js';
export type { AllowedBy, AnswerSpec, Attempt, AttemptOutcome, BountyRecord, BountyStage, EndedStage, ListedBounty, OpenStage, RecordSeed, StageEvent, WaitingFor } from './record.js';
export type { CloseOutcome } from './commands.js';
export { allowRepository, allowBounty, denyRepository, renderConfig, changeConfig, renderSummary } from './owner.js';
export { actingOn, askMergeNoticeLine, loadSettings, loadState, projectKey, readDecision, readReward, repoReward, repositoryIdentity, requireRepository, rewardNoticeLine, saveState, settingsDir, settingsFile, stateFile, unlistedRemotes, writeDecision, SETTINGS_ENV, STATE_FILE_NAME } from './settings.js';
export type { DecisionRead, OwnerDecision, OwnerSettings, ToolState } from './settings.js';
export { chooseRepository, githubRemotes, repositoryAddress, repositoryChoiceLines } from './repository.js';
export type { RemoteCandidate, RepositoryChoice } from './repository.js';
export { shownOfPlan } from './publish-plan.js';
export { binaryPatchPaths, looksBinary, SECRET_RULES, scanPatch, scanText } from './scan.js';
export type { ScanHit, SecretRule } from './scan.js';
export { recordScanFinding, settleScanFindings } from './record.js';
export type { ScanFinding } from './record.js';
export { renderDescribe, renderRules } from './tell.js';
export { readGitPinsOncePerProcess } from './git.js';
export { DESCRIBE_LINES, INSTALL_PACKAGE, renderRulesBlock, RULES_LINES, RULES_MARKERS, rulesBlockInterior } from './wording.js';
export { classifySnapshot, createSnapshot, createSnapshotCommit } from './snapshot.js';
export type { Snapshot, SnapshotFile, SnapshotRemoval } from './snapshot.js';
export { checkMergedSolutions, noticeMergedSolutions } from './merged.js';
export { setMergeNoticeListener } from './notice.js';
export { parsePayTo, paymentOf, payToLine, payMessageLines, payNotice } from './pay.js';
export type { PaymentState, PayOutcome, PayToFact } from './pay.js';
export { GIT_LEAST } from './git.js';
export { GH_LEAST } from './gh.js';
export { HOOK_COMMAND, HOOK_GH_CALL_COUNT, HOOK_GH_CALL_LIMIT_MS, HOOK_GITHUB_BUDGET_MS, HOOK_GITHUB_INTERVAL_MS, HOOK_HOSTS, HOOK_SLOTS, HOOK_START_OPEN_LIMIT, hookDisclosure, hookGroups, hookHost, hookOff, hookOn, hookStatus, runHook } from './hook.js';
export type { HookHost, HookRun, HookSlot } from './hook.js';
export { limitGitHubCalls } from './gh.js';
export { CHAIN_NS, CHAIN_REMOTE_NS, chainRef, syncChains, refreshSharedMemory, sharePosted, shareSolution, shareMerged, shareClosed, sharePaid, sharedOnlyRefusal, appendEvent, pushChain } from './chain.js';
export type { PushResult } from './chain.js';
export { sharedOpen, sharedEnded, sharedRead, sharedSearch, metaGet, metaSet, metaKeys } from './store.js';
export type { SharedRow } from './store.js';
