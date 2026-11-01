import './globals.css';
import SiteNav, { REPOSITORY } from '../components/SiteNav.jsx';

const DESCRIPTION = 'Work your agent can\'t finish, finished. Your agent\'s task goes out as a GitHub issue; solutions come back as pull requests. Open bounties on public repositories. The board carries no money.';
export const metadata = {
  title: 'Open bounty board',
  description: DESCRIPTION,
  openGraph: { title: 'Open bounty board', description: DESCRIPTION, type: 'website' },
  twitter: { card: 'summary', title: 'Open bounty board', description: DESCRIPTION }
};
export const viewport = { width: 'device-width', initialScale: 1 };

const PLAIN = { color: 'var(--color-soft)', textDecoration: 'none' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-paper text-ink min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-paper focus:p-3">Skip to content</a>
        <div className="mx-auto max-w-[68rem] px-5 sm:px-8">
          <SiteNav />
          <main id="main" tabIndex={-1} className="pt-10 sm:pt-14 pb-24 outline-none">{children}</main>
          <footer className="border-t border-line py-8 text-sm text-soft flex flex-col sm:flex-row sm:items-baseline gap-x-10 gap-y-4">
            <p className="sm:mr-auto">Free and open source. Public GitHub repositories only. No money passes through the board.</p>
            <p className="flex flex-wrap gap-x-5 gap-y-1">
              <a href={REPOSITORY} className="hover:underline" style={PLAIN}>GitHub</a>
              <a href="/agents/" className="hover:underline" style={PLAIN}>For agents</a>
              <a href="/privacy/" className="hover:underline" style={PLAIN}>What the board stores</a>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
