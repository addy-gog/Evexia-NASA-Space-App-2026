import { useState } from 'react';
import { useHealthStore } from '../store/useHealthStore.js';
import { ENVIRONMENTS, ENVIRONMENT_IDS, BASELINE_RULES, VALID_RANGES } from '../config/thresholds.js';
import { formatDelay } from '../lib/comms.js';
import { validateReading } from '../lib/severity.js';
import { Avatar } from '../components/Brand.jsx';
import { ThemeToggle } from '../components/Layout.jsx';

const BASE_FIELDS = [
  ['hr', 'Resting heart rate', 'bpm', 1],
  ['sys', 'Systolic', 'mmHg', 1],
  ['dia', 'Diastolic', 'mmHg', 1],
  ['glucose', 'Fasting glucose', 'mg/dL', 1],
  ['temp', 'Temperature', '°C', 0.1],
  ['sleep', 'Sleep', 'h', 0.1],
];

function Toggle({ id, label, checked, onChange, description, testid }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <label htmlFor={id} className="font-semibold">{label}</label>
        {description && <p id={`${id}-d`} className="text-sm text-ink-3">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        onClick={() => onChange(!checked)}
        className={`relative h-11 w-20 shrink-0 rounded-full border-2 transition-colors ${checked ? 'border-accent bg-accent' : 'border-line bg-surface-2'}`}
        data-testid={testid}
      >
        <span className={`absolute top-1 h-8 w-8 rounded-full bg-white transition-all ${checked ? 'left-10' : 'left-1'}`} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

export default function Settings() {
  const s = useHealthStore();
  const env = ENVIRONMENTS[s.environment];
  const [base, setBase] = useState(() => Object.fromEntries(BASE_FIELDS.map(([k]) => [k, String(s.baseline[k] ?? '')])));
  const [saved, setSaved] = useState(false);
  const numeric = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v === '' ? undefined : Number(v)]));
  const errors = validateReading(numeric);
  const delayRange = env.delaySeconds;
  const delayAdjustable = delayRange.max > delayRange.min;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold">Mission and settings</h1>

      <section className="hud-panel" aria-labelledby="env-h">
        <h2 id="env-h" className="text-lg font-bold">Environment and Earth link</h2>
        <fieldset className="mt-2">
          <legend className="sr-only">Mission environment</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ENVIRONMENT_IDS.map((id) => {
              const e = ENVIRONMENTS[id];
              return (
                <label key={id} className={`flex min-h-touch cursor-pointer items-start gap-3 rounded border p-3 ${s.environment === id ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                  <input type="radio" name="env" className="mt-1 h-5 w-5 accent-[#FF4D55]" checked={s.environment === id} onChange={() => s.setEnvironment(id)} data-testid={`env-${id}`} />
                  <span>
                    <span className="font-semibold">{e.label}</span>
                    <span className="block text-xs text-ink-3">
                      ~{e.typicalRadiation} mSv/day · green below {e.radiationGreenBelow} · delay {e.delaySeconds.min === e.delaySeconds.max ? formatDelay(e.delaySeconds.min) : `${formatDelay(e.delaySeconds.min)}–${formatDelay(e.delaySeconds.max)}`} · autonomy {e.autonomy}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="mt-4">
          <label htmlFor="delay" className="font-semibold">
            Earth-link one-way delay: <span className="num">{s.delaySeconds > 0 ? formatDelay(s.delaySeconds) : 'real-time'}</span>
          </label>
          {delayAdjustable ? (
            <>
              <input
                id="delay"
                type="range"
                min={delayRange.min / 60}
                max={delayRange.max / 60}
                step={1}
                value={s.delaySeconds / 60}
                onChange={(e) => s.setDelaySeconds(Number(e.target.value) * 60)}
                aria-valuetext={`${formatDelay(s.delaySeconds)} one-way`}
                data-testid="delay-slider"
              />
              <p className="text-sm text-ink-3">Mars distance changes the one-way delay from about 4 up to 20 minutes. Above 5 minutes, alerts show the self-care protocol first.</p>
            </>
          ) : (
            <p className="text-sm text-ink-3">Fixed for this environment.</p>
          )}
        </div>
      </section>

      <section className="hud-panel" aria-labelledby="base-h">
        <h2 id="base-h" className="text-lg font-bold">Personal baseline</h2>
        <Toggle
          id="baseline-mode"
          label="Personal baseline mode"
          checked={s.baselineMode}
          onChange={s.setBaselineMode}
          description={`Judge readings against your pre-flight baseline: amber above ${BASELINE_RULES.amberPct}% deviation, red above ${BASELINE_RULES.redPct}%. Temperature uses ±${BASELINE_RULES.temp.amberDelta}/${BASELINE_RULES.temp.redDelta} °C. Absolute red limits always apply.`}
          testid="baseline-toggle"
        />
        <form
          className="mt-2 grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (Object.keys(errors).length) return;
            s.setBaseline(Object.fromEntries(Object.entries(numeric).filter(([, v]) => Number.isFinite(v))));
            setSaved(true);
          }}
          aria-label="Pre-flight baseline"
        >
          {BASE_FIELDS.map(([k, label, unit, step]) => (
            <label key={k} className="block">
              <span className="label">{label} ({unit})</span>
              <input
                className="field mt-1"
                type="number"
                step={step}
                min={VALID_RANGES[k].min}
                max={VALID_RANGES[k].max}
                value={base[k]}
                aria-invalid={Boolean(errors[k])}
                onChange={(e) => {
                  setBase((b) => ({ ...b, [k]: e.target.value }));
                  setSaved(false);
                }}
                data-testid={`baseline-${k}`}
              />
              {errors[k] && <span className="text-sm text-crit-fg" role="alert">{errors[k]}</span>}
            </label>
          ))}
          <div className="flex items-center gap-3 sm:col-span-3">
            <button type="submit" className="btn-primary">Save baseline</button>
            {saved && <span className="text-sm text-ok-fg" role="status">Baseline saved.</span>}
          </div>
        </form>
      </section>

      <section className="hud-panel" aria-labelledby="a11y-h">
        <h2 id="a11y-h" className="text-lg font-bold">Accessibility</h2>
        <div className="divide-y divide-line">
          <div className="flex flex-wrap items-center justify-between gap-3 py-2">
            <span>
              <span className="block font-semibold">Appearance</span>
              <span className="block text-sm text-ink-3">Dark (deep space) is the default. Light suits bright cabins and daylight.</span>
            </span>
            <ThemeToggle className="w-full sm:w-auto sm:min-w-[220px]" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-2">
            <span className="font-semibold" id="ts-label">Text size</span>
            <div role="group" aria-labelledby="ts-label" className="flex gap-2">
              {[['md', 'Normal'], ['lg', 'Large'], ['xl', 'Extra large']].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={s.textSize === v} className={`btn-ghost ${s.textSize === v ? 'border-accent text-accent-text' : ''}`} onClick={() => s.setTextSize(v)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <Toggle id="hc" label="High-contrast theme" checked={s.highContrast} onChange={s.setHighContrast} description="Pure black background, white text and borders." testid="contrast-toggle" />
          <Toggle
            id="rm"
            label="Reduced motion"
            checked={s.reducedMotion ?? false}
            onChange={s.setReducedMotion}
            description={s.reducedMotion === null ? 'Following your system setting. Turn on to make pulses a static glow.' : 'Pulses become a static glow; camera moves are instant.'}
            testid="motion-toggle"
          />
          <Toggle id="sv" label="Simple view (2D body)" checked={s.simpleView} onChange={s.setSimpleView} description="Show a 2D body instead of the 3D model. Used automatically when WebGL is unavailable." testid="simple-toggle" />
        </div>
      </section>

      <section className="hud-panel" aria-labelledby="sim-h">
        <h2 id="sim-h" className="text-lg font-bold">Mission and crew</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-tile border border-line p-3">
            <Avatar src={s.user?.avatar} name={s.user?.name} size={48} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink-3">Signed in as</p>
              <p className="truncate font-semibold" data-testid="signed-in-as">{s.user?.name}</p>
              <p className="truncate text-xs text-ink-3">{s.profile?.role} · {s.profile?.callsign}</p>
            </div>
          </div>
          <label className="block">
            <span className="label">Mission start date</span>
            <input type="date" className="field mt-1" value={s.missionStart} onChange={(e) => e.target.value && s.setMission({ missionStart: e.target.value })} data-testid="mission-start" />
            <span className="text-xs text-ink-3">Sets the mission day on every log and the start of the cumulative dose estimate.</span>
          </label>
          <label className="block">
            <span className="label">Last private crew / family conference</span>
            <input type="date" className="field mt-1" value={s.lastConference} onChange={(e) => e.target.value && s.setMission({ lastConference: e.target.value })} data-testid="last-conference" />
            <span className="text-xs text-ink-3">Used by the isolation hazard rule ({s.status.daysSinceContact} days ago).</span>
          </label>
          <label className="block">
            <span className="label">Career dose before this mission (mSv)</span>
            <input type="number" min={0} max={600} step={1} className="field mt-1" value={s.priorDose} onChange={(e) => s.setMission({ priorDose: Math.max(0, Number(e.target.value) || 0) })} data-testid="prior-dose" />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Telemetry gateway key (optional)</span>
            <input type="password" autoComplete="off" className="field mt-1" value={s.telemetryKey} onChange={(e) => s.setTelemetryKey(e.target.value)} placeholder="Only if the server sets TELEMETRY_KEY" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => { s.loadLogs(); s.showToast('Log history reloaded from the ground.', 'ok'); }}>Reload log history</button>
          <button type="button" className="btn-ghost" onClick={() => { s.resetSettings(); s.showToast('Settings reset.', 'ok'); }}>Reset settings</button>
        </div>
      </section>
    </div>
  );
}
