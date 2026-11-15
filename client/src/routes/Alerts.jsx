import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore.js';
import AlertCard from '../components/AlertCard.jsx';
import HazardPanel from '../components/HazardPanel.jsx';
import EscalationDialog from '../components/EscalationDialog.jsx';
import { StatusIcon } from '../components/Status.jsx';
import { ENVIRONMENTS } from '../config/thresholds.js';
import { commsPolicy, formatDelay } from '../lib/comms.js';
import { worstOf } from '../lib/severity.js';

export default function Alerts() {
  const status = useHealthStore((s) => s.status);
  const environment = useHealthStore((s) => s.environment);
  const delaySeconds = useHealthStore((s) => s.delaySeconds);
  const [escalating, setEscalating] = useState(null);
  const { alerts, hazards, reading } = status;
  const overall = worstOf(alerts.map((a) => a.result.severity));
  const policy = commsPolicy(overall, delaySeconds, environment);
  const env = ENVIRONMENTS[environment];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Alerts and guidance</h1>
        <button type="button" className={alerts.length ? 'btn-danger ml-auto' : 'btn-ghost ml-auto'} onClick={() => setEscalating('__all')} data-testid="escalate-all">
          Escalate full report
        </button>
      </div>

      <section className={`hud-panel ${policy.selfCareFirst ? 'border-warn-dot' : ''}`} aria-label="Earth link and autonomy" data-testid="autonomy-panel" data-selfcare-first={policy.selfCareFirst}>
        <p className="font-semibold">
          {env.label} · Earth link {delaySeconds > 0 ? `${formatDelay(delaySeconds)} one-way` : 'real-time'} · Autonomy {env.autonomy}
        </p>
        <p className="text-sm text-ink-3">{env.autonomyNote} {policy.selfCareFirst ? 'Self-care protocols are shown first.' : 'Escalate early: the flight surgeon can respond quickly.'}</p>
        <p className="text-sm text-ink-3">{env.hazardNote}</p>
      </section>

      {alerts.length === 0 ? (
        <section className="hud-panel flex items-center gap-3" data-testid="alerts-empty">
          <StatusIcon severity="green" size={28} />
          <div>
            <p className="font-semibold">No active alerts.</p>
            <p className="text-sm text-ink-3">
              {status.hasData ? 'All current readings are green.' : 'No current readings.'} <Link to="/log" className="text-accent underline">Log new readings</Link> or review your <Link to="/history" className="text-accent underline">history</Link>.
            </p>
          </div>
        </section>
      ) : (
        <div className="space-y-4" data-testid="alerts-list">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} reading={reading} delaySeconds={delaySeconds} environment={environment} onEscalate={setEscalating} />
          ))}
        </div>
      )}

      <HazardPanel hazards={hazards} />
      {escalating && <EscalationDialog focusId={escalating === '__all' ? alerts[0]?.id ?? null : escalating} onClose={() => setEscalating(null)} />}
    </div>
  );
}
