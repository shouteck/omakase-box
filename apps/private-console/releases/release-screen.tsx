import { useState } from 'react';
import { api, failureText } from '../intake/private-client.js';
import type { PrivateSession } from '../intake/private-client.js';
import type { ReleaseContentsReview } from '../../../services/private-api/releases/staging.js';
import { ReleaseContents } from './contents-review.js';

type Review = Omit<ReleaseContentsReview, 'state' | 'approval'> & { id: string; version: number; state: 'release_review' | 'approved'; approval: { manifestHash: string } | null };
export function ReleaseScreen(props: { session: PrivateSession | null }) {
  const [id, setId] = useState('');
  const [input, setInput] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [rationale, setRationale] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const owner = props.session?.role === 'owner';
  async function run(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try { await operation(); } catch (failure) { setError(failureText(failure)); } finally { setBusy(false); }
  }
  function display(loaded: Review) { setReview(loaded); setId(loaded.id); setConfirmed(false); setRationale(''); }
  return <section aria-label="Owner release review">
    <h2>Owner disclosure approval</h2>
    <p>Review the actual public bytes, combined meaning, listing, feedback vocabulary and payment obligation terms. Signing does not publish or establish readiness.</p>
    {!owner ? <p>Only an authenticated owner can stage, review or approve release sets.</p> : <>
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('invalid release id');
        display(await api<Review>('GET', `/v1/release-candidates/${id}`));
      }); }}>
        <label>Release candidate ID <input value={id} onChange={event => setId(event.target.value)} /></label>
        <button disabled={busy} type="submit">Open exact release set</button>
      </form>
      <details><summary>Stage a prepared release candidate</summary>
        <p>Provide the prepared contract, listing, asset bytes and feedback policy, with the exact approved intent revision/hash and pinned private revision. Unsupported or stale content is rejected. This does not fetch arbitrary repository files.</p>
        <form onSubmit={event => { event.preventDefault(); void run(async () => {
          if (!props.session?.csrf) throw new Error('sign in again to make changes');
          display(await api<Review>('POST', '/v1/release-candidates', JSON.parse(input), props.session.csrf));
        }); }}>
          <label>Prepared release JSON <textarea value={input} onChange={event => setInput(event.target.value)} rows={10} /></label>
          <button disabled={busy || !props.session?.csrf} type="submit">Stage exact bytes for review</button>
        </form>
      </details>
      {review ? <>
        <p>Release state: {review.state}; version {review.version}.</p>
        <ReleaseContents review={review} />
        {review.state === 'release_review' ? <form onSubmit={event => { event.preventDefault(); void run(async () => {
          if (!props.session?.csrf || !confirmed || !rationale.trim()) return;
          const result = await api<{ state: 'approved'; manifestHash: string }>('POST', `/v1/release-candidates/${review.id}/approval`, { expectedVersion: review.version, manifestHash: review.manifestHash, combinedDisclosureReviewed: true, semanticDisclosureRationale: rationale.trim() }, props.session.csrf);
          if (result.manifestHash !== review.manifestHash) throw new Error('release binding mismatch');
          display(await api<Review>('GET', `/v1/release-candidates/${review.id}`));
          setNotice('Exact release set approved and signed. Package/readiness/publication gates remain open.');
        }); }}>
          <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I reviewed all actual bytes and the combined disclosure.</label>
          <label>Private semantic disclosure rationale <textarea value={rationale} onChange={event => setRationale(event.target.value)} maxLength={4096} /></label>
          <button type="submit" disabled={busy || !props.session?.csrf || !confirmed || !rationale.trim()}>Approve exact manifest</button>
        </form> : <>
          <p>These approved bytes are immutable. Changes require a new task version and approval.</p>
          <button type="button" disabled={busy || !props.session?.csrf} onClick={() => { void run(async () => {
            if (!props.session?.csrf) return;
            const response = await fetch(`http://private.localhost:4000/v1/release-candidates/${review.id}/package`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': props.session.csrf }, body: JSON.stringify({ expectedVersion: review.version, manifestHash: review.manifestHash }) });
            if (!response.ok) throw new Error('approved package unavailable');
            const digest = response.headers.get('X-Package-SHA256');
            if (response.headers.get('Content-Type') !== 'application/zip' || !digest || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('invalid package response');
            const objectUrl = URL.createObjectURL(await response.blob());
            const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = `task-${review.contract.taskId}-v${review.contract.version}.zip`; anchor.click(); URL.revokeObjectURL(objectUrl);
            setNotice(`Approved package SHA-256: ${digest}. Runtime readiness remains unverified; nothing was published.`);
          }); }}>Download approved package</button>
        </>}
      </> : null}
    </>}
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
