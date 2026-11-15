/** Still astronaut (reduced motion, loading fallback). Decorative. */
export default function CompanionStill({ light = '#1E9E61', size = 96 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      <line x1="48" y1="10" x2="48" y2="20" stroke="#A9B5C6" strokeWidth="2" />
      <circle cx="48" cy="9" r="4" fill={light} />
      <rect x="27" y="50" width="42" height="30" rx="9" fill="#C9D2DF" />
      <rect x="21" y="56" width="11" height="22" rx="5.5" fill="#FFFFFF" stroke="#B8C3D2" strokeWidth="2" transform="rotate(18 26 60)" />
      <rect x="64" y="54" width="11" height="22" rx="5.5" fill="#FFFFFF" stroke="#B8C3D2" strokeWidth="2" transform="rotate(-24 70 58)" />
      <rect x="31" y="52" width="34" height="30" rx="11" fill="#FFFFFF" stroke="#B8C3D2" strokeWidth="2" />
      <rect x="42" y="61" width="12" height="8" rx="2" fill="#1F4FD8" />
      <rect x="36" y="78" width="10" height="14" rx="4" fill="#FFFFFF" stroke="#B8C3D2" strokeWidth="2" />
      <rect x="50" y="78" width="10" height="14" rx="4" fill="#FFFFFF" stroke="#B8C3D2" strokeWidth="2" />
      <circle cx="48" cy="36" r="20" fill="#FFFFFF" stroke="#B8C3D2" strokeWidth="2" />
      <rect x="34" y="27" width="28" height="19" rx="9.5" fill="#14213D" />
      <ellipse cx="42" cy="32" rx="5" ry="2.6" fill="rgba(255,255,255,.75)" />
    </svg>
  );
}
