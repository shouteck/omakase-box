import { useRef } from 'react';

export interface GenericPlan { id: string; displayName: string; monthlyPriceCents: number; available: boolean; disabledReason: string }
export interface PlanSelectorProps { plans: readonly GenericPlan[]; selectedId: string | null; loading: boolean; error: string | null; locale: string; currency: string; onSelect: (id: string) => void }
export function PlanSelector({ plans, selectedId, loading, error, locale, currency, onSelect }: PlanSelectorProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  if (loading) return <p role="status">Loading plans…</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!plans.length) return <p role="status">No plans available.</p>;
  const selected = plans.findIndex(plan => plan.id === selectedId && plan.available);
  const active = selected >= 0 ? selected : plans.findIndex(plan => plan.available);
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency });
  function move(index: number, direction: number) {
    for (let distance = 1; distance <= plans.length; distance++) {
      const next = (index + direction * distance + plans.length * distance) % plans.length;
      if (plans[next]?.available) { buttons.current[next]?.focus(); onSelect(plans[next]!.id); return; }
    }
  }
  return <div role="radiogroup" aria-label="Plan selection">{plans.map((plan, index) => <div key={plan.id}>
    <button ref={element => { buttons.current[index] = element; }} role="radio" aria-checked={plan.id === selectedId} aria-describedby={!plan.available ? `plan-reason-${index}` : undefined} disabled={!plan.available} tabIndex={index === active ? 0 : -1} onClick={() => onSelect(plan.id)} onKeyDown={event => {
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); move(index, ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1); }
    }}>{plan.displayName} — {format.format(plan.monthlyPriceCents / 100)}</button>
    {!plan.available && <span id={`plan-reason-${index}`}>{plan.disabledReason}</span>}
  </div>)}</div>;
}
