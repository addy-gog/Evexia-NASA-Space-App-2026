/**
 * Evexia logo: the team's mark (heartbeat through an open ring, with a four-point
 * star and three orbit dots), redrawn as SVG in the brand blue. Red is reserved
 * for Critical status in the light UI, so the mark no longer uses it.
 */
export function LogoMark({ size = 36, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M44.5 10.5A26 26 0 1 0 54 23" fill="none" stroke="#1F4FD8" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M17 18a20 20 0 0 1 12-7" fill="none" stroke="#163BA6" strokeWidth="2" strokeLinecap="round" opacity=".55" />
      <path d="M47 44a20 20 0 0 1-12 9" fill="none" stroke="#163BA6" strokeWidth="2" strokeLinecap="round" opacity=".55" />
      <path d="M4 34.5l20-1.5 6-13 8 24 15-27" fill="none" stroke="#1F4FD8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M53 6l2 5.2 5.2 2-5.2 2L53 20.4l-2-5.2-5.2-2 5.2-2z" fill="#1F4FD8" />
      <circle cx="32" cy="6.5" r="1.6" fill="#8A94A6" />
      <circle cx="58" cy="32" r="1.6" fill="#8A94A6" />
      <circle cx="32" cy="57.5" r="1.6" fill="#8A94A6" />
    </svg>
  );
}

export function Wordmark({ subtitle = 'Crew health console' }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="flex flex-col leading-tight">
        <span className="font-display text-xl font-bold tracking-tight text-ink">Evexia</span>{' '}
        <span className="text-[11px] font-medium text-ink-3">{subtitle}</span>
      </span>
    </span>
  );
}

/** Portrait (generated illustration). Decorative unless `label` is given. */
export function Avatar({ src, name, size = 44, className = '', label }) {
  const initials = (name || '?')
    .replace(/^(Cdr\.|Dr\.)\s*/, '')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2);
  return src ? (
    <img
      src={src}
      alt={label ?? ''}
      width={size}
      height={size}
      className={`shrink-0 rounded-full border border-line bg-surface-2 object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-accent-soft font-bold text-accent ${className}`}
      style={{ width: size, height: size }}
      aria-hidden={label ? undefined : true}
    >
      {initials}
    </span>
  );
}
