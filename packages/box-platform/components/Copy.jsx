'use client';
import { useState } from 'react';

/** Copies the words it is given, and says plainly whether that worked. */
export default function Copy({ text, what = 'command', className = '' }) {
  const [said, setSaid] = useState(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setSaid('Copied');
    } catch {
      setSaid('Select to copy');
    }
    setTimeout(() => setSaid(null), 1800);
  };
  return (
    <button type="button" onClick={copy} aria-label={`Copy ${what}`} data-copy={text} className={`shrink-0 text-sm text-soft hover:text-ink font-sans ${className}`}>
      <span aria-live="polite">{said ?? 'Copy'}</span>
    </button>
  );
}
