/**
 * Evexia logo: the team's mark (heartbeat through an open ring, with a four-point
 * star and three orbit dots), redrawn as SVG in the original logo red (ui-redesign/logo.jpg), with a soft glow on dark space.
 */
export function LogoMark({ size = 36, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} style={{ filter: "drop-shadow(0 0 6px rgba(255,77,85,.45))" }} aria-hidden="true">
      <path d="M44.5 10.5A26 26 0 1 0 54 23" fill="none" stroke="#E0393F" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M17 18a20 20 0 0 1 12-7" fill="none" stroke="#8E1A22" strokeWidth="2" strokeLinecap="round" opacity=".9" />
      <path d="M47 44a20 20 0 0 1-12 9" fill="none" stroke="#8E1A22" strokeWidth="2" strokeLinecap="round" opacity=".9" />
      <path d="M4 34.5l20-1.5 6-13 8 24 15-27" fill="none" stroke="#E0393F" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M53 6l2 5.2 5.2 2-5.2 2L53 20.4l-2-5.2-5.2-2 5.2-2z" fill="#E0393F" />
      <circle cx="32" cy="6.5" r="1.6" fill="#A3ABB8" />
      <circle cx="58" cy="32" r="1.6" fill="#A3ABB8" />
      <circle cx="32" cy="57.5" r="1.6" fill="#A3ABB8" />
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
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-accent-soft font-bold text-accent-text ${className}`}
      style={{ width: size, height: size }}
      aria-hidden={label ? undefined : true}
    >
      {initials}
    </span>
  );
}
