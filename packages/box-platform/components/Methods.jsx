// A way someone accepts payment, as text. Only a kind the server marks as a link is
// a link; the server has checked its shape and never followed it.
import { Soft } from './ui.jsx';

export const LABELS = { paypal: 'PayPal.me', stripe: 'Stripe payment link', 'github-sponsors': 'GitHub Sponsors', 'wise-email': 'Wise email', wallet: 'Wallet address' };

export function MethodLine({ method }) {
  const label = method.chain ? `${LABELS[method.kind]} (${method.chain})` : LABELS[method.kind];
  return <>{label}: {method.link ? <a href={method.value} rel="nofollow noopener noreferrer" className="break-all">{method.value}</a> : <span className="break-all">{method.value}</span>}</>;
}

export function MethodList({ methods, empty }) {
  if (methods.length === 0) return <Soft>{empty}</Soft>;
  return <ul className="flex flex-col gap-2">{methods.map((method, i) => <li key={i}><MethodLine method={method} /></li>)}</ul>;
}
