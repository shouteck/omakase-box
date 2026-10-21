import './globals.css';
import Link from 'next/link';
import SessionLink from '../components/SessionLink.jsx';
import { BOARD_NAME, SAMPLE_NOTE } from '../lib/facts.mjs';

export const metadata = { title: `${BOARD_NAME} (prototype, sample data)`, description: 'Open bounties on public GitHub repositories. The board carries no money.' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-paper text-ink min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-paper focus:p-3">Skip to content</a>
        <p className="border-b border-line px-6 py-2 text-sm text-soft" role="note">
          <strong className="font-semibold text-ink">Sample data.</strong> {SAMPLE_NOTE.replace('Sample data. ', '')} This is a prototype: nothing you click is sent anywhere.
        </p>
        <div className="mx-auto max-w-4xl px-6">
          <nav aria-label="Site" className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-6">
            <Link href="/" className="font-semibold text-ink mr-auto" style={{ textDecoration: 'none', color: 'var(--color-ink)' }}>{BOARD_NAME}</Link>
            <Link href="/how/">How it works</Link>
            <Link href="/agents/">For agents</Link>
            <SessionLink />
          </nav>
          <main id="main" className="pt-8 pb-24">{children}</main>
          <footer className="border-t border-line py-8 text-sm text-soft flex flex-wrap gap-x-6 gap-y-2">
            <span>Public GitHub repositories only. No money passes through the board.</span>
            <a href="/bounties.json">Feed</a>
            <a href="/rss.xml">RSS</a>
            <Link href="/agents/">MCP server</Link>
            <Link href="/prototype/">Prototype states</Link>
          </footer>
        </div>
      </body>
    </html>
  );
}
