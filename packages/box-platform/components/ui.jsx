// The few primitives every page is built from. Sizes: text-sm, text-code, text-base,
// text-lg, text-xl, text-2xl, text-3xl, text-4xl only. Weights: 400, 500, 600 only.
// Links are plain <a>: PLATFORM-UX section 8's static-export trap never arises.
import Copy from './Copy.jsx';

export function Title({ children, sub }) {
  return (
    <header className="mb-12">
      <h1 className="text-xl sm:text-2xl font-medium tracking-[-0.03em] break-words text-balance">{children}</h1>
      {sub ? <p className="mt-4 text-lg text-soft max-w-[36rem]">{sub}</p> : null}
    </header>
  );
}

export function Section({ title, children, id }) {
  return (
    <section className="mt-14 first-of-type:mt-0" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-medium tracking-tight mb-4">{title}</h2>
      {children}
    </section>
  );
}

/** A section with its heading beside it on a wide screen: for pages that are read. */
export function SideSection({ title, children, id }) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-[14rem_minmax(0,1fr)] gap-x-10 gap-y-4 border-t border-line py-10" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-medium tracking-tight">{title}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** A definition list of facts: label on the left, fact on the right; stacked in a narrow panel. */
export function Facts({ rows, stacked = false }) {
  if (stacked) {
    return (
      <dl className="flex flex-col">
        {rows.filter(Boolean).map(([label, value], i) => (
          <div key={i} className="border-t border-line py-3">
            <dt className="text-soft text-sm">{label}</dt>
            <dd className="text-sm mt-0.5 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[15rem_minmax(0,1fr)] border-b border-line">
      {rows.filter(Boolean).map(([label, value], i) => (
        <div key={i} className="contents">
          <dt className="text-soft border-t border-line pt-3 sm:py-3">{label}</dt>
          <dd className="pb-3 pt-0.5 sm:py-3 sm:border-t border-line break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The one primary action of a page. */
export function Primary({ children, href }) {
  return <a href={href} data-primary className="inline-block bg-button px-5 py-2.5 font-medium rounded-full text-center" style={{ textDecoration: 'none', color: 'var(--color-button-ink)' }}>{children}</a>;
}

/** Any other action looks like a link. */
export function Quiet({ children, onClick }) {
  return <button type="button" onClick={onClick} className="text-accent underline underline-offset-[3px] decoration-1 hover:decoration-2">{children}</button>;
}

export const Soft = ({ children, as: As = 'p', className = '' }) => <As className={`text-soft text-sm ${className}`}>{children}</As>;

/**
 * Lines of code in a hairline panel, with one copy button for the whole block. On a
 * phone a long line scrolls, so a command still reads as one; wider, it wraps, so
 * none of it is hidden. `mark` names the data attribute a test reads the lines back through.
 */
export function CodeBlock({ lines, mark, what = 'command', className = '' }) {
  const attribute = mark ? { [`data-${mark}`]: '' } : {};
  return (
    <div className={`flex items-start gap-4 border border-line bg-surface rounded-xl px-4 py-2.5 min-w-0 ${className}`}>
      <div className="flex flex-col gap-1 min-w-0 grow overflow-x-auto" tabIndex={0} role="group" aria-label={what}>
        {lines.map(line => <code key={line} {...attribute} className="block whitespace-pre sm:whitespace-pre-wrap sm:break-words">{line}</code>)}
      </div>
      <Copy text={lines.join('\n')} what={what} />
    </div>
  );
}

/** Text that is not ours: shown as a quotation, with whose words it is. Never parsed, never linked. */
export function TheirWords({ who, children }) {
  return (
    <figure className="border border-line bg-surface rounded-xl px-5 py-4">
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
