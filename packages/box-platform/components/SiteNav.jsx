'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const LINKS = [['/board/', 'Board'], ['/how/', 'How it works'], ['/agents/', 'For agents'], ['/me/', 'Your page']];
export const REPOSITORY = 'https://github.com/shouteck/omakase-box';
const PLAIN = { textDecoration: 'none' };

export default function SiteNav() {
  const path = usePathname();
  const [due, setDue] = useState(0);
  // A fact for whoever is signed in and owes something. It waits here; nobody is sent anything.
  useEffect(() => {
    fetch('/api/me/due').then(async response => {
      if (response.ok) setDue((await response.json()).due);
    }).catch(() => undefined);
  }, []);
  return (
    <nav aria-label="Site" className="sticky top-0 z-20 bg-paper/80 backdrop-blur-xl">
      <div className="mx-auto max-w-[76rem] px-5 sm:px-8 flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-1 py-3 text-mono">
        <a href="/" className="font-semibold inline-flex items-center gap-[0.55rem] w-auto mr-auto" style={{ ...PLAIN, color: 'var(--color-ink)' }}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ width: '1.15rem', height: '1.15rem', flex: 'none' }}><path d="M4.5 10v9.5h15V10" stroke="currentColor" strokeWidth="2" strokeLinecap="square" /><rect x="9" y="3.5" width="6" height="6" fill="currentColor" /></svg>
          <span>omakase-box</span>
        </a>
        <a href="/how/" data-nav-action className="ml-auto sm:ml-0 sm:order-last" style={{ ...PLAIN, background: 'var(--color-button)', color: 'var(--color-button-ink)', padding: '0.3rem 0.9rem', borderRadius: '999px', fontWeight: 500, whiteSpace: 'nowrap' }}>Get started</a>
        <span aria-hidden="true" className="basis-full h-0 sm:hidden" />
        {LINKS.map(([href, label]) => {
          const here = path === href || path === href.slice(0, -1);
          return <a key={href} href={href} {...(here ? { 'aria-current': 'page' } : {})} style={{ ...PLAIN, color: here ? 'var(--color-ink)' : 'var(--color-soft)' }}>{label}</a>;
        })}
        <a href={REPOSITORY} className="hidden sm:inline" style={{ ...PLAIN, color: 'var(--color-soft)' }}>GitHub</a>
        {due > 0 ? <a href="/me/#you-owe" className="font-medium" style={{ ...PLAIN, color: 'var(--color-accent)' }}>{due} {due === 1 ? 'payment' : 'payments'} due</a> : null}
      </div>
    </nav>
  );
}
