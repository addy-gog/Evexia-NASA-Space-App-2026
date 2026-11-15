import { Component, Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Body2D from './Body2D.jsx';
import { StatusIcon, StatusBadge, SEVERITY_META } from './Status.jsx';
import { INDICATORS } from '../config/thresholds.js';
import { HOTSPOTS } from '../config/fields.js';
import { formatIndicatorValue, REGION_NAMES } from '../lib/format.js';
import { GUIDANCE, GREEN_MESSAGE } from '../content/guidance.js';
import { GUIDE } from '../content/guide.js';
import { HAZARDS } from '../content/hazards.js';
import { useHealthStore, usePrefersReducedMotion } from '../store/useHealthStore.js';
import { hasWebGL } from '../lib/webgl.js';
import { bodyKindFor } from '../config/anatomy.js';

// The realistic body, shared with the Body page.
const AnatomyViewer = lazy(() => import('./body/AnatomyViewer.jsx'));
const LABELS = Object.fromEntries(Object.entries(HOTSPOTS).map(([id, h]) => [id, h.short]));

export { hasWebGL };

class WebGLBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn('3D body failed, using 2D fallback:', err?.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** { [indicatorId]: { severity, label, valueText, shortValue } | null } */
export function buildRegions(results, reading) {
  const out = {};
  for (const m of INDICATORS) {
    const r = results[m.id];
    if (!r) {
      out[m.id] = null;
      continue;
    }
    const v = formatIndicatorValue(m.id, reading);
    out[m.id] = { indicator: m.id, region: m.region, severity: r.severity, label: m.short, valueText: `${v} ${m.unit}`, shortValue: v };
  }
  return out;
}

/** Detail for the selected reading: message, bold action, how to measure, linked hazard. */
export function ReadingDetail({ id, result, reading }) {
  const meta = INDICATORS.find((m) => m.id === id);
  const g = GUIDANCE[id];
  const guide = GUIDE.find((x) => x.id === id);
  const sev = result?.severity;
  const m = sev ? SEVERITY_META[sev] : null;
  const msg = !result ? 'No current reading. Log one to see its status.' : sev === 'green' ? `${meta.label} is in range.` : g[sev].meaning;
  const act = !result ? '' : sev === 'green' ? GREEN_MESSAGE : g[sev].selfCare[0];
  return (
    <div className="rise flex flex-col gap-2 rounded-2xl border p-4" style={{ background: m ? m.bg : 'rgb(var(--c-surface))', borderColor: m ? m.line : 'rgb(var(--c-line))' }} data-testid="reading-detail" data-indicator={id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-base font-semibold">
          {meta.label} · <span className="num">{result ? `${formatIndicatorValue(id, reading)} ${meta.unit}` : '—'}</span>
        </span>
        {sev && <StatusBadge severity={sev} compact className="bg-surface" />}
      </div>
      <p className="m-0 text-ink">
        {msg} {act && <strong>{act}</strong>}
      </p>
      {result?.reason && <p className="m-0 text-sm text-ink-2" data-testid="reading-reason">{result.reason}</p>}
      <p className="m-0 text-sm text-ink-2">
        <strong>How to measure:</strong> {guide.steps.slice(0, 2).join(' ')}{' '}
        <Link to={`/guide#guide-${id}`} className="font-semibold text-accent-text underline-offset-2 hover:underline">Full guide</Link>
      </p>
      <p className="m-0 text-xs text-ink-3">Linked hazard: {HAZARDS[g.hazard].label}</p>
    </div>
  );
}

/**
 * Body map panel. Uses the store's current status unless `status` is passed
 * (the console passes a live preview while readings are being edited).
 */
export default function BodyView({ status: statusProp, selected: selProp, onSelect: onSelProp }) {
  const storeStatus = useHealthStore((s) => s.status);
  const status = statusProp ?? storeStatus;
  const reduced = usePrefersReducedMotion();
  const [webgl] = useState(() => hasWebGL());
  const [yaw, setYaw] = useState(0);
  const [selLocal, setSelLocal] = useState('sleep');
  const selected = selProp ?? selLocal;
  const onSelect = onSelProp ?? setSelLocal;

  const profile = useHealthStore((s) => s.profile);
  const kind = bodyKindFor(profile?.sex);
  const orientation = useMemo(() => ({ azimuth: yaw }), [yaw]);

  const regions = useMemo(() => buildRegions(status.results, status.reading), [status]);
  // 3D straight away; the 2D map appears only when this browser cannot run 3D (no WebGL).
  const use3D = webgl;
  const step = (20 * Math.PI) / 180;
  const limit = (40 * Math.PI) / 180;

  return (
    <section className="hud-panel flex h-full flex-col gap-3.5" aria-labelledby="body-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="body-title" className="hud-title">Body map</h2>
          <p className="text-sm text-ink-3">
            Tap a marker to see what it means.{' '}
            <Link to={`/body?reading=${selected}`} className="font-semibold text-accent-text underline-offset-2 hover:underline" data-testid="open-body-page">Open full body view</Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {use3D && (
            <>
              <button type="button" className="btn-ghost h-11 w-11 p-0" onClick={() => setYaw((y) => Math.max(-limit, y - step))} aria-label="Rotate body left">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
              </button>
              <button type="button" className="btn-ghost h-11 w-11 p-0" onClick={() => setYaw((y) => Math.min(limit, y + step))} aria-label="Rotate body right">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></svg>
              </button>
            </>
          )}
          {!webgl && <span className="text-xs text-ink-3">3D unavailable: simple view</span>}
        </div>
      </div>

      <div
        className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-line bg-[rgb(var(--stage-bg))] sm:h-[500px]"
        data-view={use3D ? '3d' : '2d'}
        data-testid="body-container"
        style={{ backgroundImage: 'linear-gradient(rgb(var(--c-line) / 0.45) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--c-line) / 0.45) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
      >
        {use3D ? (
          <WebGLBoundary fallback={<Body2D regions={regions} selected={selected} onSelect={onSelect} reduced={reduced} />}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-3" role="status">Loading 3D body…</div>}>
              <div className="absolute inset-0" data-testid="body-3d" data-model="realistic">
                <AnatomyViewer kind={kind} view="outside" explode={0} orientation={orientation} regions={regions} selected={selected} onSelect={onSelect} reduced={reduced} labels={LABELS} zoom={false} markerTestId="hotspot" />
              </div>
            </Suspense>
          </WebGLBoundary>
        ) : (
          <Body2D regions={regions} selected={selected} onSelect={onSelect} reduced={reduced} />
        )}
        {use3D && <span className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] text-ink-3">Drag to rotate</span>}
      </div>

      <ReadingDetail id={selected} result={status.results[selected]} reading={status.reading} />

      {/* Screen-reader (and test) summary of the body */}
      <h3 className="sr-only">Body regions and status</h3>
      <ul className="sr-only" data-testid="body-regions" aria-label="Body regions and status">
        {INDICATORS.map((m) => {
          const r = regions[m.id];
          return (
            <li key={m.id} data-region={m.region} data-indicator={m.id} data-severity={r?.severity ?? 'none'}>
              {r && <StatusIcon severity={r.severity} size={14} />}
              {REGION_NAMES[m.region]} ({HOTSPOTS[m.id].short}): {r ? `${r.valueText}, ${SEVERITY_META[r.severity].label}` : 'no reading'}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
