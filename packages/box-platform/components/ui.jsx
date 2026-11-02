// The few primitives every page is built from. Sizes: text-sm, text-mono, text-base,
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
 * Lines of code in a hairline panel, with one copy button for the whole block. Long lines
 * wrap at every width, so
 * none of it is hidden. `mark` names the data attribute a test reads the lines back through.
 */
export function CodeBlock({ lines, mark, what = 'command', className = '' }) {
  const attribute = mark ? { [`data-${mark}`]: '' } : {};
  return (
    <div className={`flex items-start gap-4 border border-line bg-surface rounded-xl px-4 py-2.5 min-w-0 ${className}`}>
      <div className="flex flex-col gap-1 min-w-0 grow overflow-x-auto" tabIndex={0} role="group" aria-label={what}>
        {lines.map(line => <code key={line} {...attribute} className="block whitespace-pre-wrap break-words">{line}</code>)}
      </div>
      <Copy text={lines.join('\n')} what={what} />
    </div>
  );
}

/**
 * A terminal window of commands, grouped by a comment line naming what they are for, with
 * one copy button. Long lines wrap at every width, so nothing is hidden on a phone.
 */
export function CommandWindow({ groups, what, className = '' }) {
  const text = groups.map(([title, lines]) => [`# ${title}`, ...lines].join('\n')).join('\n\n');
  return (
    <div className={`bg-code text-code-ink rounded-2xl px-5 py-4 min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-4 mb-3 [&_button]:text-code-soft">
        <div className="flex gap-1.5" aria-hidden="true"><i className="size-2.5 rounded-full bg-code-soft/40" /><i className="size-2.5 rounded-full bg-code-soft/40" /><i className="size-2.5 rounded-full bg-code-soft/40" /></div>
        <Copy text={text} what={what} />
      </div>
      <div className="flex flex-col gap-4 text-sm font-mono">
        {groups.map(([title, lines]) => (
          <div key={title} data-group className="flex flex-col gap-1 min-w-0">
            <p data-comment className="text-code-soft"># {title}</p>
            {lines.map(line => <code key={line} data-command className="block text-sm whitespace-pre-wrap break-words">{line}</code>)}
          </div>
        ))}
      </div>
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

// ---- Your page's pieces (PF19). References: Primer's layout and dialog, Stripe's empty state and status. ----

const BADGE = { ok: 'bg-[var(--color-ok-bg)] text-[var(--color-ok)]', wait: 'bg-[var(--color-wait-bg)] text-[var(--color-wait)]', off: 'bg-[var(--color-off-bg)] text-soft' };
/** One short status, in the words of whoever decides it. */
export const Badge = ({ tone = 'off', children }) => <span data-badge={tone} className={`text-sm px-2.5 py-0.5 rounded-full whitespace-nowrap ${BADGE[tone]}`}>{children}</span>;

/** A button on a row; the primary one is filled. */
export const Button = ({ primary = false, onClick, children, type = 'button' }) => (
  <button type={type} onClick={onClick} className={`text-sm rounded-full px-3.5 py-1.5 border whitespace-nowrap ${primary ? 'bg-button border-[var(--color-button)] font-medium' : 'bg-card border-line'}`} style={primary ? { color: 'var(--color-button-ink)' } : undefined}>{children}</button>
);

/** Why a space is empty, when it fills, and the one next step. */
export const Empty = ({ title, why, action }) => (
  <div data-empty className="border border-dashed border-line rounded-2xl px-5 py-6 text-center">
    <p>{title}</p>
    {why ? <p className="text-sm text-soft">{why}</p> : null}
    {action ? <div className="mt-3">{action}</div> : null}
  </div>
);

const ICON = { stripe: '#635bff', card: '#1d4f91', link: '#66655f', paypal: '#9a9a92' };
/** One thing a person has, with its status and what they can do to it. */
export const Row = ({ icon, tone = 'link', title, detail, actions, id }) => (
  <li id={id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3.5 gap-y-2 px-4 py-3.5 border-b border-line last:border-b-0 scroll-mt-6">
    <span aria-hidden="true" className="size-8 shrink-0 rounded-[9px] grid place-items-center text-sm font-semibold text-white" style={{ background: ICON[tone] }}>{icon}</span>
    <div className="flex-1 min-w-0"><p className="break-words">{title}</p>{detail ? <p className="text-sm text-soft break-words">{detail}</p> : null}</div>
    {actions ? <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto pl-[2.875rem] sm:pl-0">{actions}</div> : null}
  </li>
);
export const Rows = ({ children }) => <ul className="bg-card border border-line rounded-2xl">{children}</ul>;

/** A table that stacks into one block per row on a phone. A head cell given as [text, 'r'] is right-aligned. */
export function Table({ label, head, rows }) {
  const cell = (index, extra = '') => `${Array.isArray(head[index]) && head[index][1] === 'r' ? 'sm:text-right' : ''} ${extra}`;
  return (
    <table aria-label={label} className="w-full text-sm bg-card border border-line rounded-2xl overflow-hidden border-separate border-spacing-0">
      <thead className="hidden sm:table-header-group"><tr>{head.map((name, index) => <th key={index} scope="col" className={`text-left font-medium text-soft px-3.5 py-2.5 border-b border-line ${cell(index)}`}>{Array.isArray(name) ? name[0] : name}</th>)}</tr></thead>
      <tbody>{rows.map((row, at) => (
        <tr key={at} className="block sm:table-row border-b border-line last:border-b-0 px-3.5 py-2.5 sm:p-0">
          {row.map((value, index) => <td key={index} className={`block sm:table-cell sm:px-3.5 sm:py-3 sm:align-middle ${at < rows.length - 1 ? 'sm:border-b border-line' : ''} ${index === row.length - 1 ? 'sm:text-right pt-1 sm:pt-3' : ''} ${cell(index)}`}>{value}</td>)}
        </tr>
      ))}</tbody>
    </table>
  );
}
