/**
 * Full-page body view (/body). The 3D viewer owns most of the width: view buttons along its
 * top (outside to inside), Front / Side / Back along its bottom, and the selected reading's
 * details in a rail on the right (stacked below on phones).
 *
 * States: loading (size shown), slow connection or Save-Data (asks before downloading),
 * no WebGL or a failed download (2D body map), no readings (grey markers).
 */
import { Component, Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Body2D from '../components/Body2D.jsx';
import EscalationDialog from '../components/EscalationDialog.jsx';
import { buildRegions, hasWebGL, ReadingDetail } from '../components/BodyView.jsx';
import { StatusIcon, SEVERITY_META } from '../components/Status.jsx';
import { useHealthStore, usePrefersReducedMotion } from '../store/useHealthStore.js';
import { INDICATORS } from '../config/thresholds.js';
import { HOTSPOTS } from '../config/fields.js';
import { BODY_MODELS, MODEL_CREDITS, ORIENTATIONS, PART_NAMES, VIEWS, bodyKindFor } from '../config/anatomy.js';

const AnatomyViewer = lazy(() => import('../components/body/AnatomyViewer.jsx'));
const LABELS = Object.fromEntries(Object.entries(HOTSPOTS).map(([id, h]) => [id, h.short]));

class ViewerBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn('3D body failed, showing the 2D map:', err?.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function BodyPage() {
  const status = useHealthStore((s) => s.status);
  const profile = useHealthStore((s) => s.profile);
  const reduced = usePrefersReducedMotion();
  const [params, setParams] = useSearchParams();
  const [webgl] = useState(() => hasWebGL());
  const [view, setView] = useState('outside');
  const [explode, setExplode] = useState(0.6);
  const [orientation, setOrientation] = useState(null);
  const [viewer, setViewer] = useState({ outerReady: false, innerLoading: false });
  const [escalating, setEscalating] = useState(false);

  const kind = bodyKindFor(profile?.sex);
  const models = BODY_MODELS[kind];
  const regions = useMemo(() => buildRegions(status.results, status.reading), [status]);
  const fromUrl = params.get('reading');
  const selected = INDICATORS.some((m) => m.id === fromUrl) ? fromUrl : status.alerts[0]?.id ?? 'hr';
  const select = useCallback((id) => setParams({ reading: id }, { replace: true }), [setParams]);
  const onStatus = useCallback((patch) => setViewer((v) => (Object.entries(patch).every(([k, x]) => v[k] === x) ? v : { ...v, ...patch })), []);

  // The 3D body loads straight away; the 2D map appears only when this browser cannot run 3D (no WebGL).
  const show3D = webgl;
  const flagged = status.alerts.find((a) => a.id === selected);

  const twoD = <Body2D regions={regions} selected={selected} onSelect={select} reduced={reduced} />;
  const viewerMsg = !show3D
    ? null
    : !viewer.outerReady
      ? `Loading the 3D body (${models.outerMB} MB)`
      : viewer.innerLoading
        ? `Loading the inside view (${models.anatomyMB} MB)`
        : null;

  return (
    <div className="mx-auto flex max-w-page flex-col gap-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[260px] flex-1">
          <h1 className="page-title">Body</h1>
          <p className="mt-1.5 max-w-[62ch] text-ink-3">
            Your seven readings on a 3D body. Tap a marker to see what it means, or pick a view to look inside.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <section className="hud-panel flex min-w-0 flex-[2_1_520px] flex-col gap-3" aria-labelledby="body-viewer-title">
          <h2 id="body-viewer-title" className="sr-only">3D body</h2>
          {show3D && (
            <div role="group" aria-label="View" className="flex flex-wrap gap-1.5" data-testid="body-views">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={view === v.id}
                  onClick={() => setView(v.id)}
                  title={v.hint}
                  data-testid={`body-view-${v.id}`}
                  className={`min-h-touch rounded-full border px-4 text-sm font-semibold ${view === v.id ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          <div className="relative h-[480px] w-full overflow-hidden rounded-2xl border border-line bg-[radial-gradient(ellipse_at_50%_30%,rgb(var(--stage-glow)),rgb(var(--stage-bg))_70%)] sm:h-[600px]" data-testid="body-stage" data-mode={show3D ? '3d' : '2d'}>
            {show3D ? (
              <ViewerBoundary fallback={twoD}>
                <Suspense fallback={null}>
                  <AnatomyViewer kind={kind} view={view} explode={explode} orientation={orientation} regions={regions} selected={selected} onSelect={select} reduced={reduced} labels={LABELS} onStatus={onStatus} />
                </Suspense>
              </ViewerBoundary>
            ) : (
              twoD
            )}
            {viewerMsg && (
              <p className="absolute left-3 top-3 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2" role="status" data-testid="body-loading">
                {viewerMsg}
              </p>
            )}
            {!webgl && <p className="absolute bottom-3 left-3 text-xs text-ink-3">3D is not available in this browser, so this is the simple body map.</p>}
          </div>

          {show3D && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div role="group" aria-label="Turn the body" className="flex gap-1.5">
                {ORIENTATIONS.map((o) => (
                  <button key={o.id} type="button" className="btn-ghost min-h-touch px-3.5 text-sm" onClick={() => setOrientation({ ...o })} data-testid={`body-turn-${o.id}`}>
                    {o.label}
                  </button>
                ))}
              </div>
              {view === 'exploded' && (
                <label className="flex min-w-[220px] flex-1 items-center gap-3 text-sm font-semibold text-ink-2">
                  Spread
                  <input type="range" min={0} max={100} step={1} value={Math.round(explode * 100)} onChange={(e) => setExplode(Number(e.target.value) / 100)} className="flex-1" data-testid="body-spread" aria-valuetext={`${Math.round(explode * 100)} percent`} />
                </label>
              )}
              <span className="ml-auto text-xs text-ink-3">Drag to turn · scroll or pinch to zoom</span>
            </div>
          )}

          <p className="max-w-[58ch] text-xs text-ink-3">
            3D models: {MODEL_CREDITS.map((c) => `${c.title} by ${c.author} (${c.licence.split(',')[0]})`).join('; ')}.{' '}
            <Link to="/credits" className="font-semibold text-accent-text underline-offset-2 hover:underline">Full credits</Link>
          </p>
        </section>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4" aria-label="Reading details">
          <section className="hud-panel" aria-labelledby="body-readings-title">
            <h2 id="body-readings-title" className="hud-title">Readings on your body</h2>
            <ul className="mt-2 flex flex-col gap-1" data-testid="body-regions">
              {INDICATORS.map((m) => {
                const r = regions[m.id];
                const active = selected === m.id;
                return (
                  <li key={m.id} data-indicator={m.id} data-severity={r?.severity ?? 'none'}>
                    <button
                      type="button"
                      onClick={() => select(m.id)}
                      aria-pressed={active}
                      data-testid={`body-reading-${m.id}`}
                      className={`flex min-h-touch w-full items-center gap-3 rounded-input px-3 text-left text-sm ${active ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
                    >
                      {r ? <StatusIcon severity={r.severity} size={16} /> : <span className="block h-3 w-3 rounded-full bg-ink-3" aria-hidden="true" />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink">{m.short}</span>
                        <span className="block text-xs text-ink-3">{PART_NAMES[m.id]}</span>
                      </span>
                      <span className="num text-right text-sm">
                        {r ? r.valueText : 'Not logged yet'}
                        {r && <span className="sr-only">, {SEVERITY_META[r.severity].label}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {INDICATORS.every((m) => !regions[m.id]) && (
              <p className="mt-2 text-sm text-ink-3">
                Nothing logged yet, so every marker is grey. <Link to="/log" className="font-semibold text-accent-text underline-offset-2 hover:underline">Log your readings</Link>
              </p>
            )}
          </section>

          <ReadingDetail id={selected} result={status.results[selected]} reading={status.reading} />

          <div className="flex flex-wrap gap-2">
            <Link to="/log" className="btn-ghost min-h-touch text-sm">Log a reading</Link>
            <button type="button" className={`${flagged?.result.severity === 'red' ? 'btn-danger' : 'btn-ghost'} min-h-touch text-sm`} onClick={() => setEscalating(true)} data-testid="body-escalate">
              Send to flight surgeon
            </button>
          </div>
        </aside>
      </div>

      {escalating && <EscalationDialog focusId={flagged ? selected : null} onClose={() => setEscalating(false)} />}
    </div>
  );
}
