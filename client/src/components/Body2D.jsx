/**
 * 2D SVG body: the non-3D fallback (no WebGL, or "Simple view"). Same six
 * hotspots as the 3D body, each a real button with icon + word + colour.
 */
import { SEVERITY_META, GRADE_OF } from './Status.jsx';
import { HOTSPOTS } from '../config/fields.js';

const NONE = '#9AA6B8';

export default function Body2D({ regions, selected, onSelect, reduced }) {
  const rad = regions.radiation?.severity;
  return (
    <div className="flex h-full w-full items-center justify-center" data-testid="body-2d">
      <div className="relative" style={{ width: 260, height: 520 }}>
        <svg viewBox="0 0 200 400" width="260" height="520" aria-hidden="true" className="block">
          <ellipse cx="100" cy="210" rx="92" ry="196" fill="none" stroke={rad ? SEVERITY_META[rad].color : NONE} strokeWidth="1.5" strokeDasharray="4 6" />
          <ellipse cx="100" cy="42" rx="24" ry="28" fill="#E6EBF3" stroke="#A9B5C6" strokeWidth="1.5" />
          <rect x="91" y="68" width="18" height="16" rx="5" fill="#E6EBF3" stroke="#A9B5C6" strokeWidth="1.5" />
          <path d="M62 86 Q100 76 138 86 L146 150 Q140 200 132 214 L68 214 Q60 200 54 150 Z" fill="#E6EBF3" stroke="#A9B5C6" strokeWidth="1.5" />
          <path d="M60 90 Q42 96 38 130 L30 210 Q28 222 36 224 Q44 224 46 212 L56 140 Z" fill="#E6EBF3" stroke="#A9B5C6" strokeWidth="1.5" />
          <path d="M140 90 Q158 96 162 130 L170 210 Q172 222 164 224 Q156 224 154 212 L144 140 Z" fill="#E6EBF3" stroke="#A9B5C6" strokeWidth="1.5" />
          <path d="M70 212 L98 212 L96 300 L94 380 Q93 392 82 392 Q74 390 76 378 L72 300 Z" fill="#E6EBF3" stroke="#A9B5C6" strokeWidth="1.5" />
          <path d="M102 212 L130 212 L128 300 L124 378 Q126 390 118 392 Q107 392 106 380 L104 300 Z" fill="#E6EBF3" stroke="#A9B5C6" strokeWidth="1.5" />
          <path d="M100 88 L100 206" stroke="#C7D0DC" strokeWidth="1" strokeDasharray="2 4" />
        </svg>
        {Object.entries(HOTSPOTS).map(([id, h]) => {
          const r = regions[id];
          const m = r ? SEVERITY_META[r.severity] : null;
          const [x, y] = h.pos2d;
          const sel = selected === id;
          return (
            <div key={id} className="absolute" style={{ left: `${(x / 200) * 100}%`, top: `${(y / 400) * 100}%`, width: 0, height: 0 }} data-region={id} data-severity={r?.severity ?? 'none'}>
              {m && !reduced && <span aria-hidden="true" className={`ring-g${GRADE_OF[r.severity]} absolute block rounded-full`} style={{ left: -10, top: -10, width: 20, height: 20, border: `2px solid ${m.color}` }} />}
              <button
                type="button"
                onClick={() => onSelect?.(id)}
                aria-pressed={sel}
                aria-label={r ? `${r.label}: ${r.valueText}, ${m.label}. Show details.` : `${h.short}: no current reading. Show details.`}
                className="absolute flex items-center justify-center rounded-full"
                style={{ left: -22, top: -22, width: 44, height: 44 }}
              >
                <span className="block rounded-full border-[3px] border-white" style={{ width: sel ? 22 : 18, height: sel ? 22 : 18, background: m ? m.color : NONE, boxShadow: sel ? '0 0 0 3px rgba(31,79,216,.35)' : '0 2px 6px rgba(14,23,38,.3)' }} />
              </button>
              <span
                aria-hidden="true"
                className="absolute flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-white px-2.5 py-1 font-mono text-xs font-semibold shadow-sm"
                style={{ [h.side === 'left' ? 'right' : 'left']: 26, top: -14, borderColor: sel ? '#1F4FD8' : m ? m.line : '#DDE2E9' }}
              >
                <span className="font-sans text-ink-3">{h.short}</span>
                {r ? r.shortValue : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
