// The few primitives every page is built from (from K43's prototype). Sizes:
// text-sm, text-base, text-lg, text-2xl only. Weights: normal and semibold only.
// Links are plain <a>: PLATFORM-UX section 8's static-export trap never arises.

export function Title({ children, sub }) {
  return (
    <header className="mb-10">
      <h1 className="text-2xl font-semibold tracking-tight break-words">{children}</h1>
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
          <dd className="max-w-prose break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The one primary action of a page. */
export function Primary({ children, href }) {
  return <a href={href} data-primary className="inline-block bg-accent text-paper px-5 py-2.5 font-semibold rounded-sm" style={{ textDecoration: 'none', color: 'var(--color-paper)' }}>{children}</a>;
}

/** Any other action looks like a link. */
export function Quiet({ children, onClick }) {
  return <button type="button" onClick={onClick} className="text-accent underline underline-offset-[3px] decoration-1 hover:decoration-2">{children}</button>;
}

export const Soft = ({ children, as: As = 'p', className = '' }) => <As className={`text-soft text-sm ${className}`}>{children}</As>;

/** Text that is not ours: shown as a quotation, with whose words it is. Never parsed, never linked. */
export function TheirWords({ who, children }) {
  return (
    <figure className="border-l-2 border-line pl-5">
      <figcaption className="text-soft text-sm mb-2">{who}</figcaption>
      <blockquote className="whitespace-pre-wrap break-words max-w-prose">{children}</blockquote>
    </figure>
  );
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtTime = iso => new Date(iso).toISOString().slice(11, 16);

/** What a stale read says: when, why, and that nothing is asked of the reader. */
export function Stale({ data }) {
  if (!data?.stale || !data.read_at) return null;
  const at = fmtTime(data.read_at);
  return (
    <p role="status" className="mt-8 border-l-2 border-accent pl-4">
      The board could not read GitHub after {at} UTC: {data.stale}. What you see is from {at} UTC. Nothing to do: the board tries again every 15 minutes.
    </p>
  );
}

export function SampleNote({ data }) {
  return data?.sample ? <p className="mb-8 text-sm text-soft" role="note">Sample data. Every name here is invented and its links lead nowhere; nothing is a real record.</p> : null;
}
