import './globals.css';

export const metadata = { title: 'Open bounty board', description: 'Open bounties on public GitHub repositories. The board carries no money.' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-paper text-ink min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-paper focus:p-3">Skip to content</a>
        <div className="mx-auto max-w-4xl px-6">
          <nav aria-label="Site" className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-6">
            <a href="/" className="font-semibold mr-auto" style={{ textDecoration: 'none', color: 'var(--color-ink)' }}>Open bounty board</a>
            <a href="/how/">How it works</a>
            <a href="/agents/">For agents</a>
            <a href="/me/">Your page</a>
          </nav>
          <main id="main" tabIndex={-1} className="pt-8 pb-24">{children}</main>
          <footer className="border-t border-line py-8 text-sm text-soft">Public GitHub repositories only. No money passes through the board. <a href="/privacy/">What the board stores</a></footer>
        </div>
      </body>
    </html>
  );
}
