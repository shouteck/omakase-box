import { useCallback, useEffect, useState } from 'react';
import { approveIntent, currentIntentForRequest, failureText, intentReview, readyIntent, resolveDecision, reviseIntent, type DecisionView, type IntentReview, type PrivateSession } from '../intake/private-client.js';
import './intents-screen.css';

function isStale(review: IntentReview, version: number) { return review.version !== version; }

export function IntentsScreen(props: { session: PrivateSession | null; intentId: string | null; onIntentId: (value: string | null) => void }) {
  const { session, intentId, onIntentId } = props;
  const canAct = session !== null && session.csrf !== null && session.role !== 'operator';
  const isOwner = session?.role === 'owner';
  const [intentInput, setIntentInput] = useState(intentId ?? '');
  const [requestInput, setRequestInput] = useState('');
  const [review, setReview] = useState<IntentReview | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [editGoal, setEditGoal] = useState('');
  const [editCurrent, setEditCurrent] = useState('');
  const [editDesired, setEditDesired] = useState('');
  const [editConstraints, setEditConstraints] = useState('');
  const [editExclusions, setEditExclusions] = useState('');
  const [editMode, setEditMode] = useState<'demo' | 'ollama'>('demo');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback((target: string) => {
    if (!/^[0-9a-f-]{36}$/.test(target)) { setFailure('invalid intent id'); return; }
    return void (async () => {
      setBusy(true); setFailure(null); setNotice(null);
      try {
        const loaded = await intentReview(target);
        setReview(loaded); setIntentInput(target); setAnswers({});
        setEditGoal(loaded.goal); setEditDesired(''); setEditCurrent('');
      } catch (error) { setReview(null); setFailure(failureText(error)); } finally { setBusy(false); }
    })();
  }, []);
  useEffect(() => { if (intentId !== null) load(intentId); }, [intentId, load]);

  async function run(action: () => Promise<string | void>) {
    if (busy || session === null || session.csrf === null || review === null) return;
    setBusy(true); setFailure(null);
    try {
      const message = await action();
      if (typeof message === 'string') setNotice(message);
    } catch (error) { setFailure(failureText(error)); } finally { setBusy(false); }
  }
  const openByIntent = (event: React.FormEvent) => { event.preventDefault(); onIntentId(intentInput); load(intentInput); };
  const openByRequest = (event: React.FormEvent) => {
    event.preventDefault();
    return void (async () => {
      setBusy(true); setFailure(null);
      try { const loaded = await currentIntentForRequest(requestInput); setReview(loaded); setIntentInput(loaded.id); onIntentId(loaded.id); setAnswers({}); setEditGoal(loaded.goal); setEditDesired(''); setEditCurrent(''); }
      catch (error) { setFailure(failureText(error)); } finally { setBusy(false); }
    })();
  };
  const resolve = (decision: DecisionView) => {
    if (review === null || !(session !== null && session.csrf !== null)) return;
    const answer = answers[decision.id] ?? '';
    if (answer.trim() === '') return;
    const version = review.version, intentId = review.id, csrf = session.csrf;
    return void run(async () => {
      if (isStale(review, version)) return;
      await resolveDecision(intentId, decision.id, answer.trim(), version, csrf);
      await reload(intentId, version);
      return 'Answer saved. Your review has been updated.';
    });
  };
  const reload = async (target: string, version: number) => {
    const loaded = await intentReview(target);
    setReview(loaded); setEditGoal(loaded.goal); setEditDesired(''); setEditCurrent('');
    if (loaded.version !== version) setNotice(`Intent is now at version ${loaded.version} (${loaded.state}).`);
  };
  const markReady = () => {
    if (review === null || !(session !== null && session.csrf !== null)) return;
    const { id, version, contentHash } = review, csrf = session.csrf;
    return void run(async () => {
      if (isStale(review, version)) return;
      await readyIntent(id, version, contentHash, csrf);
      await reload(id, version);
      return 'Ready for owner approval.';
    });
  };
  const approve = () => {
    if (review === null || !(session !== null && session.csrf !== null)) return;
    const { id, version, contentHash } = review, csrf = session.csrf;
    return void run(async () => {
      if (isStale(review, version)) return;
      await approveIntent(id, version, contentHash, csrf);
      await reload(id, version);
      return 'This revision is approved.';
    });
  };
  const submitEdit = () => {
    if (review === null || !(session !== null && session.csrf !== null)) return;
    const { id, version, goal } = review, csrf = session.csrf;
    return void run(async () => {
      if (isStale(review, version)) return;
      const result = await reviseIntent(id, { expectedVersion: version, mode: editMode, ...(editGoal.trim() === '' || editGoal === goal ? {} : { goal: editGoal }), ...(editCurrent === '' ? {} : { currentBehaviour: editCurrent }), ...(editDesired === '' ? {} : { desiredBehaviour: editDesired }), ...(editConstraints.trim() === '' ? {} : { constraints: editConstraints.split(/\r?\n/).map(item => item.trim()).filter(item => item.length > 0) }), ...(editExclusions.trim() === '' ? {} : { exclusions: editExclusions.split(/\r?\n/).map(item => item.trim()).filter(item => item.length > 0) }) }, csrf);
      await reload(id, version);
      return result.approvalInvalidated === true ? 'New immutable revision created; the previous owner approval no longer binds it.' : 'New immutable revision created.';
    });
  };
  const unanswered = review?.decisions.filter(decision => decision.answer === null) ?? [];
  const decision = unanswered.find(item => item.required) ?? unanswered[0];
  const preview = review?.acceptanceExamples.flatMap(example => example.examples)[0];
  const stateLabels: Record<string, string> = { draft: 'Draft', needs_decision: 'Needs your decision', ready_for_approval: 'Ready for approval', approved: 'Approved' };

  return <main className="intent-screen">
    <h2>Intent review</h2>
    <section aria-label="Open an intent" className="intent-lookup">
      <form onSubmit={openByIntent}>
        <label htmlFor="intents-id">Intent ID</label>
        <input id="intents-id" value={intentInput} onChange={event => setIntentInput(event.target.value)} disabled={busy} />
        <button type="submit" disabled={busy}>Open review</button>
      </form>
      <details><summary>Find by request ID</summary>
        <form onSubmit={openByRequest}>
          <label htmlFor="intents-request">Request ID</label>
          <input id="intents-request" value={requestInput} onChange={event => setRequestInput(event.target.value)} disabled={busy} />
          <button type="submit" disabled={busy}>Find current intent</button>
        </form>
      </details>
    </section>
    {failure !== null && <p role="alert">Review failed safely: {failure}</p>}
    {notice !== null && <p role="status">{notice}</p>}
    {review !== null && <article aria-label="Intent review" key={review.id}>
      <p className="intent-state">{stateLabels[review.state] ?? review.state} · Revision {review.version}</p>
      {review.state !== 'approved' && review.supersededApproval && <p role="alert">A previous owner approval no longer binds this revision: your edits need a new approval.</p>}
      <section className="intent-card" aria-label="Your goal">
        <h3>Your goal</h3>
        <p>{review.goal}</p>
        <p className="intent-hint">Proposal only — review it before approval. This does not publish a task.</p>
      </section>
      <section className="intent-card" aria-label="Before and after preview">
        <h3>What will change</h3>
        {preview ? <>
          <dl className="intent-comparison">
            <div><dt>Before</dt><dd>{preview.given}</dd></div>
            <div><dt>After</dt><dd>{preview.then}</dd></div>
          </dl>
          <p className="intent-hint">When: {preview.when}</p>
        </> : <p>No before/after example yet. Check the details before approval.</p>}
        <p className="intent-hint">{review.acceptanceExamples.length} acceptance requirement(s). Full examples are in View details.</p>
      </section>
      {decision && review.state !== 'approved' && <section className="intent-card intent-decision" aria-label="Decisions">
        <h3>What needs your decision</h3>
        <p className="intent-hint">{decision.required ? 'Required' : 'Optional'} · {unanswered.length} question(s) left</p>
        <p>{decision.question}</p>
        {canAct ? <form onSubmit={event => { event.preventDefault(); resolve(decision); }}>
          <label htmlFor={`decision-${decision.id}`}>Your answer</label>
          <input id={`decision-${decision.id}`} value={answers[decision.id] ?? ''} onChange={event => setAnswers({ ...answers, [decision.id]: event.target.value })} disabled={busy} />
          <button className="intent-primary" type="submit" disabled={busy || (answers[decision.id] ?? '').trim() === ''}>Save answer</button>
        </form> : <p>Sign in as a requester or owner to answer.</p>}
      </section>}
      <section className="intent-next" aria-label="Actions">
        <h3>Next step</h3>
        {review.blockage.requiredUnresolved > 0 && <p role="alert">Preparation is blocked: {review.blockage.requiredUnresolved} required decision(s) are unresolved.</p>}
        {review.state === 'approved' ? <p role="status">Approved. Any edits will need a new approval.</p>
          : review.state === 'ready_for_approval' ? <>
            <p>{isOwner ? 'Check the details, then approve this exact revision.' : 'An owner must approve this revision.'}</p>
            {isOwner && <>
              <p className="intent-binding">Owner approval binds this exact revision: version {review.version}, hash <code>{review.contentHash}</code>.</p>
              <button className="intent-primary" type="button" onClick={approve} disabled={!canAct || busy || review.blockage.requiredUnresolved > 0}>Approve this exact revision</button>
            </>}
          </> : <>
            {review.blockage.requiredUnresolved === 0 && <p>Check the examples and assumptions in View details, then request owner approval.</p>}
            {!canAct && <p>Sign in as a requester or owner to continue.</p>}
            <button className={review.blockage.requiredUnresolved > 0 ? '' : 'intent-primary'} type="button" onClick={markReady} disabled={!canAct || busy || review.blockage.requiredUnresolved > 0}>Mark ready for owner approval</button>
          </>}
      </section>
      <details className="intent-details">
        <summary>View details</summary>
        <p>State: {review.state} — version {review.version} — reviewed revision hash {review.contentHash}. {review.state === 'draft' && 'This is a reviewable draft; preparation stays blocked until required decisions are resolved.'}</p>
        {review.state === 'approved' && <p>Approved: owner approval binds the exact reviewed revision ({review.approval?.approvedHash ?? ''} at {review.approval?.approvedAt ?? ''}); the reviewed payload retains its ready-for-approval bytes.</p>}
        <h4>Observed facts</h4>
        {review.facts.length === 0 ? <p>No facts were proposed.</p> : <ul>{review.facts.map((fact, index) => <li key={index}>{fact.statement} (assurance: {fact.assurance}; evidence: {fact.evidence.map(item => item.location).join(', ') || 'none'})</li>)}</ul>}
        <h4>Assumptions</h4>
        {review.assumptions.length === 0 ? <p>No assumptions were proposed.</p> : <ul>{review.assumptions.map((item, index) => <li key={index}>{item.statement} (assurance: {item.assurance})</li>)}</ul>}
        <h4>Unknowns</h4>
        {review.unknowns.length === 0 ? <p>No unknowns were proposed.</p> : <ul>{review.unknowns.map((item, index) => <li key={index}>{item}</li>)}</ul>}
        <h4>Decisions and answers</h4>
        <p>Required unresolved decisions block preparation. Only internal users resolve consequential choices; model answers never count.</p>
        <ul>{review.decisions.map(item => <li key={item.id}>{item.id}: {item.question} {item.required ? '(required)' : '(optional)'} — {item.answer === null ? 'unresolved' : `resolved: ${item.answer}`}</li>)}</ul>
        <h4>Plain-language before/after preview</h4>
        <p>One composed outcome: all included units and disciplines are reviewed together as a single task; nothing is split into separate per-layer bounties.</p>
        <p>This trusted preview renders escaped text only. Proposed or model-generated code never executes inside this console, and screenshots remain private evidence with no image-understanding claim.</p>
        {review.acceptanceExamples.length === 0 ? <p>No acceptance examples were proposed yet.</p> : review.acceptanceExamples.map(example => <article key={example.id}>
          <h5>{example.id}</h5><p>{example.description}</p>
          <ul>
            {example.inputs.map((item, index) => <li key={`in-${index}`}>Given input: {item}</li>)}
            {example.outputs.map((item, index) => <li key={`out-${index}`}>Expected output: {item}</li>)}
            {example.states.map((item, index) => <li key={`state-${index}`}>State: {item}</li>)}
            {example.invalidCases.map((item, index) => <li key={`invalid-${index}`}>Invalid case: {item}</li>)}
            {example.exclusions.map((item, index) => <li key={`excl-${index}`}>Excluded: {item}</li>)}
          </ul>
          {example.examples.map((item, index) => <p key={index}>Before: {item.given} — when: {item.when} — after: {item.then}.</p>)}
        </article>)}
        <h4>Scope</h4>
        <p>Included: {review.scope.included.length === 0 ? 'none' : ''}</p>
        <ul>{review.scope.included.map((item, index) => <li key={index}>{item}</li>)}</ul>
        <p>Excluded: {review.scope.excluded.length === 0 ? 'none' : ''}</p>
        <ul>{review.scope.excluded.map((item, index) => <li key={index}>{item}</li>)}</ul>
        <h4>Private provenance</h4>
        <p>Planning request: {review.provenance.requestId ?? 'not recorded (legacy intent)'}; pinned snapshot {review.provenance.snapshotHash}; {review.evidence.length} bound evidence reference(s).</p>
      </details>
      <details className="intent-details">
        <summary>Edit outcome</summary>
        <section aria-label="Edit outcome">
          <p>Editing creates a new revision and invalidates any previous approval.</p>
          <label htmlFor="edit-goal">Goal</label>
          <textarea id="edit-goal" rows={2} value={editGoal} onChange={event => setEditGoal(event.target.value)} disabled={!canAct || busy} />
          <label htmlFor="edit-current">Current behaviour (optional)</label>
          <textarea id="edit-current" rows={2} value={editCurrent} onChange={event => setEditCurrent(event.target.value)} disabled={!canAct || busy} />
          <label htmlFor="edit-desired">Desired behaviour (optional)</label>
          <textarea id="edit-desired" rows={2} value={editDesired} onChange={event => setEditDesired(event.target.value)} disabled={!canAct || busy} />
          <label htmlFor="edit-constraints">Constraints (one per line, optional)</label>
          <textarea id="edit-constraints" rows={2} value={editConstraints} onChange={event => setEditConstraints(event.target.value)} disabled={!canAct || busy} />
          <label htmlFor="edit-exclusions">Exclusions (one per line, optional)</label>
          <textarea id="edit-exclusions" rows={2} value={editExclusions} onChange={event => setEditExclusions(event.target.value)} disabled={!canAct || busy} />
          <label><input type="radio" name="edit-mode" checked={editMode === 'demo'} onChange={() => setEditMode('demo')} disabled={!canAct || busy} /> Deterministic demo planning</label>
          <label><input type="radio" name="edit-mode" checked={editMode === 'ollama'} onChange={() => setEditMode('ollama')} disabled={!canAct || busy} /> Operator-configured private model</label>
          <button type="button" onClick={submitEdit} disabled={!canAct || busy}>Create new revision from edit</button>
        </section>
      </details>
    </article>}
  </main>;
}
