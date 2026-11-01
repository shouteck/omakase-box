'use client';
import { usePathname } from 'next/navigation';

const LINKS = [['/board/', 'Board'], ['/how/', 'How it works'], ['/agents/', 'For agents'], ['/me/', 'Your page']];
export const REPOSITORY = 'https://github.com/shouteck/omakase-box';
const PLAIN = { textDecoration: 'none' };

export default function SiteNav() {
  const path = usePathname();
  return (
    <nav aria-label="Site" className="sticky top-0 z-20 bg-paper/80 backdrop-blur-xl">
      <div className="mx-auto max-w-[76rem] px-5 sm:px-8 flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-code">
        <a href="/" className="font-semibold w-full sm:w-auto sm:mr-auto" style={{ ...PLAIN, color: 'var(--color-ink)' }}>Open bounty board</a>
        {LINKS.map(([href, label]) => {
          const here = path === href || path === href.slice(0, -1);
          return <a key={href} href={href} {...(here ? { 'aria-current': 'page' } : {})} className={href === '/agents/' ? 'hidden sm:inline' : ''} style={{ ...PLAIN, color: here ? 'var(--color-ink)' : 'var(--color-soft)' }}>{label}</a>;
        })}
        <a href={REPOSITORY} className="hidden sm:inline" style={{ ...PLAIN, color: 'var(--color-soft)' }}>GitHub</a>
      </div>
    </nav>
  );
}
