import './globals.css';
import SiteNav, { REPOSITORY } from '../components/SiteNav.jsx';

const DESCRIPTION = 'Work your agent can\'t finish, finished. Your agent\'s task goes out as a GitHub issue; solutions come back as pull requests. The board never holds money.';
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
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-30 focus:bg-paper focus:p-3">Skip to content</a>
        <SiteNav />
        <div className="mx-auto max-w-[76rem] px-5 sm:px-8">
          <main id="main" tabIndex={-1} className="pt-8 sm:pt-12 pb-24 outline-none">{children}</main>
          <footer className="border-t border-line py-8 text-sm text-soft flex flex-col sm:flex-row sm:items-baseline gap-x-10 gap-y-3">
            <p className="sm:mr-auto">Free and open source. Run by omakase-box. No money passes through the board.</p>
            <p className="flex flex-wrap gap-x-5 gap-y-1">
              <a href={REPOSITORY} style={PLAIN}>GitHub</a>
              <a href="/agents/" style={PLAIN}>For agents</a>
              <a href="/numbers/" style={PLAIN}>Numbers</a>
              <a href="/privacy/" style={PLAIN}>What the board stores</a>
              <a href="/terms/" style={PLAIN}>Terms</a>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
