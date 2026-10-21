// The few primitives every page is built from. Sizes: text-sm, text-base,
// text-lg, text-2xl only. Weights: normal (400) and semibold (600) only.
import Link from 'next/link';

export function Title({ children, sub }) {
  return (
    <header className="mb-10">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {sub ? <p className="mt-3 text-soft max-w-prose">{sub}</p> : null}
    </header>
  );
}

export function Section({ title, children, id }) {
  return (
    <section className="mt-12" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}

/** A definition list of facts: label on the left, fact on the right. */
export function Facts({ rows }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-x-6 gap-y-3 sm:gap-y-4">
      {rows.filter(Boolean).map(([label, value], i) => (
        <div key={i} className="contents">
          <dt className="text-soft text-sm sm:text-base pt-1 sm:pt-0 border-t border-line sm:border-0">{label}</dt>
          <dd className="max-w-prose">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The one primary action of a page. */
export function Primary({ children, onClick, href, disabled }) {
  const cls = 'inline-block bg-accent text-paper px-5 py-2.5 font-semibold no-underline rounded-sm disabled:opacity-60';
  if (href) return <Link href={href} className={cls} style={{ textDecoration: 'none', color: 'var(--color-paper)' }}>{children}</Link>;
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{children}</button>;
}

/** Any other action looks like a link. */
export function Quiet({ children, onClick }) {
  return <button type="button" onClick={onClick} className="text-accent underline underline-offset-[3px] decoration-1 hover:decoration-2">{children}</button>;
}

export const Soft = ({ children, as: As = 'p', className = '' }) => <As className={`text-soft text-sm ${className}`}>{children}</As>;

/** Text that is not ours: shown as a quotation, with whose words it is. */
export function TheirWords({ who, children }) {
  return (
    <figure className="border-l-2 border-line pl-5">
      <figcaption className="text-soft text-sm mb-2">{who}</figcaption>
      <blockquote className="whitespace-pre-wrap max-w-prose">{children}</blockquote>
    </figure>
  );
}

export const Person = ({ login, as = 'solver' }) => <Link href={`/${as}/${login}/`}>{login}</Link>;
