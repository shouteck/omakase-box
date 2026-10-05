import { useState } from 'react';
import { derivePrivateOptions } from '../private/eligibility.js';
import type { SyntheticSubject } from '../private/eligibility.js';

export function SelectionPanel({ subject }: { subject: SyntheticSubject }) {
  const options = derivePrivateOptions(subject);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState('No plan selected.');
  async function select(id: string) {
    const response = await fetch('/selection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedId: id }) });
    if (!response.ok) { setStatus('Selection failed.'); return; }
    setSelected(id); setStatus('Selection saved.');
  }
  return <section><h1>Synthetic plan selection</h1>{options.map(option => <button key={option.id} aria-pressed={selected === option.id} onClick={() => { void select(option.id); }}>{option.displayName}: {option.monthlyPriceCents} cents</button>)}<p role="status">{status}</p></section>;
}
