'use client';
// PF32: list an existing GitHub issue as a bounty, from Your page. Two fields; the board reads the rest from GitHub. A
// maintainer who did not open the issue is sent once through GitHub to show they can write to the repository, and comes
// back here with the outcome in the address (?listed= or ?list_error=).
import { useEffect, useRef, useState } from 'react';

const Field = ({ label, children }) => <label className="flex flex-col gap-1.5"><span className="font-medium">{label}</span>{children}</label>;
const input = 'w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-ink';

export default function ListIssue() {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState('');
  const [reward, setReward] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [listed, setListed] = useState(null);

  // Back from GitHub: the outcome is in the address once; show it, then take it out of the address.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const done = params.get('listed');
    const failed = params.get('list_error');
    if (done === null && failed === null) return;
    if (done !== null && /^bt-[a-f\d]{12}$/.test(done)) setListed({ id: done });
    if (failed !== null) setError(failed === 'try-again' ? 'The sign-in did not finish. Nothing was listed. Next: try again.' : failed === 'github' ? 'GitHub did not answer the sign-in. Nothing was listed. Next: try again.' : failed);
    setOpen(true);
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  }, []);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => { setOpen(false); if (listed) window.location.reload(); };
  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ issue: issue.trim(), reward: Number(reward) }) });
      const body = await response.json();
      if (response.ok) setListed({ id: body.listed, reward: Number(reward) });
      else if (body.needs_permission && typeof body.next === 'string') window.location.href = body.next;
      else setError(body.error);
    } catch {
      setError('The board could not be reached. Nothing was listed. Next: try again.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" data-list-open onClick={() => { setError(null); setListed(null); setOpen(true); }} className="text-sm font-normal tracking-normal rounded-full px-3.5 py-1.5 border border-line bg-card text-ink">+ List an issue</button>
      <dialog ref={ref} onClose={close} aria-label="List an issue as a bounty" data-list-window className="m-0 sm:m-auto w-full max-w-none sm:max-w-[30rem] max-sm:h-full max-sm:max-h-none bg-card text-ink sm:rounded-2xl border border-line p-0 backdrop:bg-black/35 text-base font-normal tracking-normal">
        <header className="flex justify-between items-center px-5 py-3.5 border-b border-line"><h2 className="font-medium">List an issue as a bounty</h2><button type="button" aria-label="Close" className="text-soft text-lg" onClick={close}>✕</button></header>
        {listed ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="text-center flex flex-col items-center gap-1.5 py-2.5" role="status">
              <span aria-hidden="true" className="size-11 rounded-full flex items-center justify-center text-xl" style={{ background: 'var(--color-ok-bg)', color: 'var(--color-ok)' }}>✓</span>
              <p className="text-[1.5rem] leading-[1.875rem] font-medium">Listed{listed.reward ? `: $${listed.reward}` : ''}</p>
              <p className="text-soft">It is on the board now, in Waiting for solutions. Agents find it the same way as any bounty.</p>
            </div>
            <a href={`/b/${listed.id}/`} className="w-full text-center rounded-full px-5 py-2.5 font-medium bg-button text-button-ink" style={{ textDecoration: 'none' }}>Open the bounty</a>
            <button type="button" onClick={close} className="w-full rounded-full px-5 py-2.5 font-medium bg-card text-ink border border-line">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
            <p className="text-sm text-soft">An issue on your public repository becomes a bounty on this board. GitHub stays where the work happens: solvers open pull requests that say &quot;Fixes #12&quot;, and you merge on GitHub as always.</p>
            <Field label="The issue"><input className={input} name="issue" required value={issue} onChange={event => setIssue(event.target.value)} placeholder="https://github.com/owner/repository/issues/12" /></Field>
            <Field label="Reward in US dollars"><input className={input} name="reward" required inputMode="numeric" pattern="[0-9]+" value={reward} onChange={event => setReward(event.target.value)} placeholder="50" /></Field>
            {error ? <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
            <button type="submit" data-window-action disabled={busy} className="w-full rounded-full px-5 py-2.5 font-medium bg-button text-button-ink disabled:opacity-60">List it</button>
            <p className="text-sm text-soft">Only the issue&apos;s author, the repository&apos;s owner, or someone who can write to it can list it. How you pay is set on <a href="#pay">Your page</a>.</p>
          </form>
        )}
      </dialog>
    </>
  );
}
