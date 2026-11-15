import { StatusIcon, SEVERITY_META } from './Status.jsx';
import SourceTags from './SourceTags.jsx';
import { HAZARDS } from '../content/hazards.js';

/** Hazard correlation insights linked to the five NASA HRP hazards. */
export default function HazardPanel({ hazards, compact = false }) {
  return (
    <section className="hud-panel" aria-labelledby="hazard-title" data-testid="hazard-panel">
      <h2 id="hazard-title" className="hud-title">Hazard correlation</h2>
      {!hazards.length ? (
        <p className="mt-2 text-sm text-ink-3">No hazard patterns detected for this day.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {hazards.map((h) => (
            <li key={h.id} className={`border-l-4 pl-3 ${SEVERITY_META[h.severity].border}`} data-testid={`hazard-${h.id}`} data-severity={h.severity}>
              <p className="flex items-start gap-2 font-semibold">
                <StatusIcon severity={h.severity} size={18} className="mt-0.5 shrink-0" />
                <span>{h.title}</span>
              </p>
              {!compact && (
                <>
                  <p className="mt-1 text-sm text-ink-3">{h.detail}</p>
                  <p className="mt-1 text-xs text-ink-3">Countermeasures: {HAZARDS[h.hazard].countermeasures.join(' · ')}</p>
                  <SourceTags ids={h.sources} className="mt-1" />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
