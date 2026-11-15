import { SOURCES } from '../config/thresholds.js';

/** Source tags shown next to every threshold, explanation and action. */
export default function SourceTags({ ids = [], className = '' }) {
  const unique = [...new Set(ids)].filter((id) => SOURCES[id]);
  if (!unique.length) return null;
  return (
    <p className={`flex flex-wrap items-center gap-1.5 text-xs text-ink-3 ${className}`}>
      <span className="font-mono uppercase tracking-wider">Source:</span>
      {unique.map((id) => {
        const s = SOURCES[id];
        const label = `${s.label}${s.verified ? '' : ' (to be verified)'}`;
        return s.url ? (
          <a
            key={id}
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded border border-line px-1.5 py-0.5 underline-offset-2 hover:border-accent hover:text-accent hover:underline"
            title={label}
          >
            {id}
            <span className="sr-only">: {label} (opens in a new tab)</span>
          </a>
        ) : (
          <span key={id} className="rounded border border-line px-1.5 py-0.5" title={label}>
            {id}
            <span className="sr-only">: {label}</span>
          </span>
        );
      })}
    </p>
  );
}
