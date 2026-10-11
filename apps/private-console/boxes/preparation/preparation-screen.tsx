import { useCallback, useEffect, useState } from 'react';
import { failureText, registerBoxRepository, type PrivateSession } from '../../intake/private-client.js';
import { approveBoxBehavior, loadBoxAgreement, openBoxReadiness, prepareBox, reviseBox, type BoxAgreementView, type BoxArtifactEdit } from './preparation-client.js';
import './preparation-screen.css';

const REQUEST_A_CASE = 'delegation.private-shop.request-a.response-policy';
const REQUEST_B_CASE = 'delegation.private-shop.request-b.public-ranking';

export function PreparationScreen(props: { session: PrivateSession | null }) {
  const { session } = props;
  const canAct = session !== null && session.csrf !== null && (session.role === 'owner' || session.role === 'requester');
  const isOwner = session?.role === 'owner';
  const canRegister = session !== null && session.csrf !== null && (session.role === 'owner' || session.role === 'operator');
  const [sourceId, setSourceId] = useState('private-shop');
  const [baseCommit, setBaseCommit] = useState('');
  const [repositoryId, setRepositoryId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [supportedCaseId, setSupportedCaseId] = useState(REQUEST_A_CASE);
  const [operationKey, setOperationKey] = useState('');
  const [boxId, setBoxId] = useState('');
  const [agreement, setAgreement] = useState<BoxAgreementView | null>(null);
  const [approvalId, setApprovalId] = useState('');
  const [editGoal, setEditGoal] = useState('');
  const [editUnknowns, setEditUnknowns] = useState('');
  const [editAssumptions, setEditAssumptions] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback((target: string) => {
    if (!/^[0-9a-f-]{36}$/.test(target)) { setFailure('invalid box id'); return; }
    return void (async () => {
      setBusy(true); setFailure(null);
      try {
        const loaded = await loadBoxAgreement(target);
        setAgreement(loaded); setBoxId(target);
        setEditGoal(loaded.goal); setEditUnknowns(loaded.unknowns.join('\n')); setEditAssumptions(loaded.assumptions.join('\n'));
      } catch (error) { setAgreement(null); setFailure(failureText(error)); } finally { setBusy(false); }
    })();
  }, []);
  useEffect(() => { if (/^[0-9a-f-]{36}$/.test(boxId)) load(boxId); }, [boxId, load]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setFailure(null); setNotice(null);
    try { await action(); } catch (error) { setFailure(failureText(error)); } finally { setBusy(false); }
  }

  const register = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canRegister || session === null) return;
    const csrf = session.csrf;
    return void run(async () => {
      const registered = await registerBoxRepository({ sourceId, baseCommit, ...(operationKey.trim() !== '' ? { operationKey: operationKey.trim() } : {}) }, csrf);
      setRepositoryId(registered.repoId);
      setNotice(`Registered repository ${registered.repoId} at ${registered.baseCommit.slice(0, 12)}… (${registered.fileCount} files).`);
    });
  };
  const prepare = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canAct || session === null) return;
    const csrf = session.csrf;
    return void run(async () => {
      const prepared = await prepareBox({ requestId, repositoryId, supportedCaseId, ...(operationKey.trim() !== '' ? { operationKey: operationKey.trim() } : {}) }, csrf);
      setBoxId(prepared.boxId); setAgreement(prepared.agreement);
      setNotice(`Prepared Box ${prepared.boxId.slice(0, 8)}… version ${prepared.version}.`);
    });
  };
  const approve = () => {
    if (!isOwner || session === null || agreement === null || agreement.approval !== null) return;
    const csrf = session.csrf, target = agreement.boxId, version = agreement.version, hash = agreement.contentHash, approval = approvalId.trim() !== '' ? approvalId.trim() : crypto.randomUUID();
    return void run(async () => {
      await approveBoxBehavior(target, { expectedVersion: version, expectedHash: hash, approvalId: approval }, csrf);
      setNotice('Behavior approval recorded for this exact version.');
      load(target);
    });
  };
  const readiness = () => {
    if (!canAct || session === null || agreement === null || agreement.blockingReasons.length > 0) return;
    const csrf = session.csrf, target = agreement.boxId, version = agreement.version;
    return void run(async () => {
      await openBoxReadiness(target, version, csrf);
      setNotice('Readiness opened.');
      load(target);
    });
  };
  const amend = () => {
    if (!canAct || session === null || agreement === null) return;
    const csrf = session.csrf, target = agreement.boxId, version = agreement.version;
    const artifact: BoxArtifactEdit = {
      schemaVersion: 1,
      artifactId: crypto.randomUUID(),
      profile: 'open_trusted',
      intent: agreement.intent,
      goal: editGoal,
      acceptanceExamples: agreement.acceptanceExamples,
      assumptions: editAssumptions.split('\n').map(line => line.trim()).filter(line => line !== ''),
      unknowns: editUnknowns.split('\n').map(line => line.trim()).filter(line => line !== ''),
      scope: agreement.scope
    };
    return void run(async () => {
      const revised = await reviseBox(target, { expectedVersion: version, artifact, ...(operationKey.trim() !== '' ? { operationKey: operationKey.trim() } : {}) }, csrf);
      setNotice(revised.approvalInvalidated ? `Amended to version ${revised.version}; prior approval invalidated.` : `Amended to version ${revised.version}.`);
      load(target);
    });
  };

  const lines = (values: readonly string[]) => values.map((value, index) => <li key={index}>{value}</li>);
  const mappings = (map: Record<string, string>) => Object.entries(map).map(([key, value]) => <li key={key}><code>{key}</code> → <code>{value}</code></li>);

  return <section aria-label="Box preparation" className="preparation-screen">
    <h2>Box preparation</h2>
    <p>Register the reviewed fixture baseline, prepare a Box from an approved intent, and let the owner approve the exact behavior version. Amendments invalidate prior approval.</p>
    {failure !== null ? <p role="alert" className="preparation-failure">{failure}</p> : null}
    {notice !== null ? <p role="status" className="preparation-notice">{notice}</p> : null}
    {canRegister ? <form onSubmit={register} aria-label="Register Box repository">
      <fieldset disabled={busy}>
        <legend>Register repository</legend>
        <label htmlFor="prep-source">Source id</label>
        <input id="prep-source" value={sourceId} onChange={event => setSourceId(event.target.value)} />
        <label htmlFor="prep-commit">Baseline commit</label>
        <input id="prep-commit" value={baseCommit} onChange={event => setBaseCommit(event.target.value)} placeholder="40-hex commit" />
        <label htmlFor="prep-opkey">Operation key (optional)</label>
        <input id="prep-opkey" value={operationKey} onChange={event => setOperationKey(event.target.value)} />
        <button type="submit">Register</button>
      </fieldset>
    </form> : null}
    {canAct ? <form onSubmit={prepare} aria-label="Prepare Box">
      <fieldset disabled={busy}>
        <legend>Prepare Box</legend>
        <label htmlFor="prep-request">Request id</label>
        <input id="prep-request" value={requestId} onChange={event => setRequestId(event.target.value)} placeholder="uuid" />
        <label htmlFor="prep-repo">Repository id</label>
        <input id="prep-repo" value={repositoryId} onChange={event => setRepositoryId(event.target.value)} />
        <label htmlFor="prep-case">Supported case</label>
        <select id="prep-case" value={supportedCaseId} onChange={event => setSupportedCaseId(event.target.value)}>
          <option value={REQUEST_A_CASE}>Request A — response security policy</option>
          <option value={REQUEST_B_CASE}>Request B — public ranking</option>
        </select>
        <button type="submit">Prepare</button>
      </fieldset>
    </form> : null}
    <form onSubmit={event => { event.preventDefault(); load(boxId); }} aria-label="Open Box agreement">
      <fieldset disabled={busy}>
        <legend>Open agreement</legend>
        <label htmlFor="prep-box">Box id</label>
        <input id="prep-box" value={boxId} onChange={event => setBoxId(event.target.value)} placeholder="uuid" />
        <button type="submit">Open</button>
      </fieldset>
    </form>
    {agreement !== null ? <article aria-label="Box agreement" className="preparation-agreement">
      <h3>Agreement — version {agreement.version} ({agreement.state})</h3>
      <dl>
        <dt>Box</dt><dd><code>{agreement.boxId}</code></dd>
        <dt>Content hash</dt><dd><code>{agreement.contentHash}</code></dd>
        <dt>Repository</dt><dd><code>{agreement.repoId}</code> ({agreement.sourceId})</dd>
        <dt>Base commit</dt><dd><code>{agreement.baseCommit}</code></dd>
        <dt>Manifest</dt><dd>{agreement.manifestLabel} — <code>{agreement.snapshotHash}</code></dd>
        <dt>Supported case</dt><dd>{agreement.supportedCaseId}</dd>
        <dt>Intent</dt><dd><code>{agreement.intent.intentId}</code> version {agreement.intent.intentVersion}</dd>
        <dt>Environment ref</dt><dd><code>{agreement.environmentRef.reference}</code> <code>{agreement.environmentRef.digest}</code></dd>
        <dt>Evaluator ref</dt><dd><code>{agreement.evaluatorRef.reference}</code> v{agreement.evaluatorRef.version} <code>{agreement.evaluatorRef.digest}</code></dd>
        <dt>Merge target</dt><dd><code>{agreement.mergeTarget.reference}</code> branch <code>{agreement.mergeTarget.branch}</code> at <code>{agreement.mergeTarget.expectedCommit}</code></dd>
        <dt>Artifact hashes</dt><dd>{Object.entries(agreement.artifactHashes).map(([key, value]) => <span key={key}><code>{key}</code>: <code>{value}</code> </span>)}</dd>
      </dl>
      <h4>Goal</h4><p>{agreement.goal}</p>
      <h4>Facts</h4><ul>{agreement.facts.map((fact, index) => <li key={index}>{fact.statement} <em>({fact.assurance})</em></li>)}</ul>
      <h4>Editable surface</h4><ul>{lines(agreement.editableSurface)}</ul>
      <h4>Runnable context</h4><ul>{lines(agreement.runnable)}</ul>
      <h4>Explanatory context</h4><ul>{lines(agreement.explanatory)}</ul>
      <h4>Package mapping</h4><ul>{mappings(agreement.packageMap)}</ul>
      <h4>Dependency versions</h4><ul>{mappings(agreement.dependencyVersions)}</ul>
      <h4>Runnable checks</h4><ul>{lines(agreement.runnableChecks)}</ul>
      <h4>Scope included</h4><ul>{lines(agreement.scope.included)}</ul>
      <h4>Scope excluded</h4><ul>{lines(agreement.scope.excluded)}</ul>
      <h4>Assumptions</h4><ul>{lines(agreement.assumptions)}</ul>
      <h4>Unknowns</h4>{agreement.unknowns.length === 0 ? <p>None recorded.</p> : <ul>{lines(agreement.unknowns)}</ul>}
      <h4>Acceptance requirements</h4>
      {agreement.acceptanceExamples.map(requirement => <section key={requirement.id} aria-label={requirement.id}>
        <h5>{requirement.id}</h5><p>{requirement.description}</p>
        <ul>{requirement.examples.map((example, index) => <li key={index}>Given {example.given}, when {example.when}, then {example.then}.</li>)}</ul>
      </section>)}
      <h4>Approval</h4>
      {agreement.approval !== null
        ? <p>Approved artifact <code>{agreement.approval.artifactHash}</code> by {agreement.approval.approvedBy.slice(0, 8)}… at {agreement.approval.approvedAt}.</p>
        : <p>{agreement.supersededApproval ? 'A prior approval was superseded by amendment. ' : ''}No approval on this version.</p>}
      {agreement.blockingReasons.length > 0 ? <div><h4>Blocking reasons</h4><ul>{lines(agreement.blockingReasons)}</ul></div> : null}
      {isOwner && agreement.approval === null && session?.csrf !== null ? <div className="preparation-approve">
        <label htmlFor="prep-approval-id">Approval id (optional)</label>
        <input id="prep-approval-id" value={approvalId} onChange={event => setApprovalId(event.target.value)} placeholder="uuid — generated if blank" />
        <button type="button" disabled={busy} onClick={approve}>Approve exact version</button>
      </div> : null}
      {!isOwner && agreement.approval === null ? <p>Only the owner approves the behavior version.</p> : null}
      {canAct && agreement.approval !== null && agreement.blockingReasons.length === 0 && agreement.state === 'draft' ? <button type="button" disabled={busy} onClick={readiness}>Open readiness</button> : null}
      {canAct ? <div className="preparation-amend">
        <h4>Amend (creates a new version; prior approval is invalidated)</h4>
        <label htmlFor="prep-goal">Goal</label>
        <textarea id="prep-goal" value={editGoal} onChange={event => setEditGoal(event.target.value)} rows={3} />
        <label htmlFor="prep-assumptions">Assumptions (one per line)</label>
        <textarea id="prep-assumptions" value={editAssumptions} onChange={event => setEditAssumptions(event.target.value)} rows={3} />
        <label htmlFor="prep-unknowns">Unknowns (one per line)</label>
        <textarea id="prep-unknowns" value={editUnknowns} onChange={event => setEditUnknowns(event.target.value)} rows={2} />
        <button type="button" disabled={busy} onClick={amend}>Amend</button>
      </div> : null}
    </article> : null}
    {session === null ? <p>Sign in to register repositories or prepare Boxes.</p> : null}
  </section>;
}
