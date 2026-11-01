'use client';
import { usePathname } from 'next/navigation';

const LINKS = [['/board/', 'Board'], ['/how/', 'How it works'], ['/agents/', 'For agents'], ['/me/', 'Your page']];
export const REPOSITORY = 'https://github.com/shouteck/omakase-box';
const PLAIN = { textDecoration: 'none' };

export function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="6" className="fill-accent" />
      <path d="M9 11.5 16 8l7 3.5v9L16 24l-7-3.5zM9 11.5l7 3.5 7-3.5M16 15v9" fill="none" className="stroke-paper" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function SiteNav() {
  const path = usePathname();
  return (
    <nav aria-label="Site" className="flex flex-wrap items-center gap-x-6 gap-y-2 py-5 border-b border-line">
      <a href="/" className="inline-flex items-center gap-2 font-semibold w-full sm:w-auto sm:mr-auto" style={{ ...PLAIN, color: 'var(--color-ink)' }}><Mark />Open bounty board</a>
      {LINKS.map(([href, label]) => {
        const here = path === href || path === href.slice(0, -1);
        return <a key={href} href={href} {...(here ? { 'aria-current': 'page' } : {})} className={`hover:underline ${here ? 'font-semibold' : ''}`} style={{ ...PLAIN, color: here ? 'var(--color-ink)' : 'var(--color-soft)' }}>{label}</a>;
      })}
      <a href={REPOSITORY} className="hidden sm:inline hover:underline" style={{ ...PLAIN, color: 'var(--color-soft)' }}>GitHub</a>
    </nav>
  );
}
