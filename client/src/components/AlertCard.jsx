import { StatusBadge, StatusIcon, SEVERITY_META } from './Status.jsx';
import SourceTags from './SourceTags.jsx';
import { GUIDANCE } from '../content/guidance.js';
import { HAZARDS } from '../content/hazards.js';
import { commsPolicy, formatDelay } from '../lib/comms.js';
import { formatIndicatorValue } from '../lib/format.js';

function StepList({ title, items, testid, highlight }) {
  return (
    <div className={`rounded border p-3 ${highlight ? 'border-accent bg-accent-soft' : 'border-line'}`} data-testid={testid}>
      <h4 className="mb-1 text-sm font-bold">{title}</h4>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
    </div>
  );
}

/** One alert: severity, meaning, why it matters in spaceflight, actions, countermeasure, escalation. */
export default function AlertCard({ alert, reading, delaySeconds, environment, onEscalate, compact = false }) {
  const { id, meta, result } = alert;
  const g = GUIDANCE[id];
  const s = g[result.severity];
  const hazard = HAZARDS[g.hazard];
  const policy = commsPolicy(result.severity, delaySeconds, environment);
  const selfCare = <StepList key="sc" title="Self-care protocol" items={s.selfCare} testid={`selfcare-${id}`} highlight={policy.selfCareFirst} />;
  const actions = <StepList key="ac" title="Recommended actions" items={s.actions} testid={`actions-${id}`} />;
  const sev = SEVERITY_META[result.severity];

  if (compact) {
    return (
      <li className={`flex items-start gap-2 border-l-4 py-1 pl-2 ${sev.border}`} data-testid={`alert-${id}`} data-severity={result.severity}>
        <StatusIcon severity={result.severity} size={18} className="mt-0.5 shrink-0" />
        <span className="text-sm">
          <strong>{meta.label}:</strong> {result.reason}
        </span>
      </li>
    );
  }

  return (
    <article className={`hud-panel border-l-4 ${sev.border}`} data-testid={`alert-${id}`} data-severity={result.severity} aria-labelledby={`alert-${id}-title`}>
      <header className="flex flex-wrap items-center gap-3">
        <StatusBadge severity={result.severity} pulse />
        <h3 id={`alert-${id}-title`} className="text-lg font-bold">
          {meta.label}: <span className="num">{formatIndicatorValue(id, reading)}</span> {meta.unit}
        </h3>
      </header>
      <p className="mt-2 text-sm text-ink-3">{result.reason}</p>

      <div className="mt-3 space-y-3">
        <section>
          <h4 className="text-sm font-bold">What it means</h4>
          <p className="text-sm">{s.meaning}</p>
        </section>
        <section>
          <h4 className="text-sm font-bold">
            Why it matters in spaceflight <span className="font-normal text-accent-text">· Hazard: {hazard.label}</span>
          </h4>
          <p className="text-sm">{g.why}</p>
        </section>

        <p className="text-xs text-ink-3" data-testid={`comms-${id}`}>
          {policy.selfCareFirst ? 'Long Earth-link delay: self-care protocol first. ' : ''}
          {policy.arrivalText}
        </p>
        <div className="grid gap-3 md:grid-cols-2" data-order={policy.selfCareFirst ? 'selfcare-first' : 'actions-first'}>
          {policy.selfCareFirst ? [selfCare, actions] : [actions, selfCare]}
        </div>

        <section>
          <h4 className="text-sm font-bold">Countermeasure</h4>
          <p className="text-sm">{g.countermeasure}</p>
        </section>
        <SourceTags ids={[...result.sources, ...g.sources]} />
      </div>

      <footer className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={policy.recommendEscalation ? 'btn-danger' : 'btn-ghost'}
          onClick={() => onEscalate(id)}
          data-testid={`escalate-${id}`}
        >
          Escalate to flight surgeon
        </button>
        <span className="text-xs text-ink-3">
          {policy.recommendEscalation
            ? result.severity === 'red'
              ? 'Escalation recommended: red finding.'
              : 'Escalation recommended: short delay, flight surgeon is reachable.'
            : 'Self-manage first; escalate if it does not improve.'}
          {policy.selfCareFirst && ` Message will arrive in ${formatDelay(delaySeconds)}.`}
        </span>
      </footer>
    </article>
  );
}
