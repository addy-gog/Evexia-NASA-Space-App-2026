/**
 * Status is never colour alone: every severity has an icon (check, triangle,
 * octagon), a word (Nominal, Caution, Critical) and a colour.
 * Internal severity keys stay green / amber / red.
 */
export const SEVERITY_META = {
  green: { label: 'Nominal', word: 'Nominal', color: '#22C55E', fg: 'rgb(var(--ok-fg))', bg: 'rgb(var(--ok-bg))', line: 'rgb(var(--ok-line))', glow: 'rgba(30,158,97,0.26)', text: 'text-ok-fg', border: 'border-ok-line', bgClass: 'bg-ok-bg', dotClass: 'bg-ok-dot' },
  amber: { label: 'Caution', word: 'Caution', color: '#F59E0B', fg: 'rgb(var(--warn-fg))', bg: 'rgb(var(--warn-bg))', line: 'rgb(var(--warn-line))', glow: 'rgba(224,138,0,0.34)', text: 'text-warn-fg', border: 'border-warn-line', bgClass: 'bg-warn-bg', dotClass: 'bg-warn-dot' },
  red: { label: 'Critical', word: 'Critical', color: '#F43F5E', fg: 'rgb(var(--crit-fg))', bg: 'rgb(var(--crit-bg))', line: 'rgb(var(--crit-line))', glow: 'rgba(217,35,50,0.38)', text: 'text-crit-fg', border: 'border-crit-line', bgClass: 'bg-crit-bg', dotClass: 'bg-crit-dot' },
};

export const GRADE_OF = { green: 0, amber: 1, red: 2 };

/** Stroke icon in the status foreground colour (inherits currentColor unless `filled`). */
export function StatusIcon({ severity = 'green', size = 16, className = '', title, filled = false }) {
  const m = SEVERITY_META[severity] ?? SEVERITY_META.green;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    className,
    'aria-hidden': title ? undefined : true,
    role: title ? 'img' : undefined,
    fill: 'none',
    stroke: filled ? '#FFFFFF' : 'currentColor',
    strokeWidth: 2.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: filled ? { flexShrink: 0 } : { color: m.fg, flexShrink: 0 },
  };
  const bg = filled ? <circle cx="12" cy="12" r="12" fill={m.color} stroke="none" /> : null;
  if (severity === 'red') {
    return (
      <svg {...common}>
        {title && <title>{title}</title>}
        {filled ? <polygon points="7,1 17,1 23,7 23,17 17,23 7,23 1,17 1,7" fill={m.color} stroke="none" /> : <path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z" />}
        <path d="M12 7v6M12 17h.01" />
      </svg>
    );
  }
  if (severity === 'amber') {
    return (
      <svg {...common}>
        {title && <title>{title}</title>}
        {filled ? <polygon points="12,1.5 23,22 1,22" fill={m.color} stroke="none" /> : <path d="M12 3l10 18H2z" />}
        <path d="M12 10v4M12 18h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      {title && <title>{title}</title>}
      {bg}
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

/** Status chip: icon + word on the status tint. */
export function StatusBadge({ severity = 'green', compact = false, pulse = false, className = '' }) {
  const m = SEVERITY_META[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${className}`}
      style={{ background: m.bg, color: m.fg, boxShadow: `inset 0 0 0 1px ${m.line}` }}
      data-severity={severity}
    >
      <StatusIcon severity={severity} size={14} className={pulse ? (severity === 'red' ? 'pulse-fast' : severity === 'amber' ? 'pulse-slow' : '') : ''} />
      <span>{m.label}</span>
      {!compact && severity !== 'green' && <span className="font-semibold">· {severity === 'red' ? 'act now' : 'watch'}</span>}
    </span>
  );
}
