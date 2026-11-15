import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore.js';
import { VALID_RANGES, ENVIRONMENTS } from '../config/thresholds.js';
import { validateReading, evaluateReading, estimateEffectiveDose } from '../lib/severity.js';
import { missionDayOf } from '../lib/evaluate.js';
import { StatusBadge } from '../components/Status.jsx';
import GuideCard from '../components/GuideCard.jsx';
import LogTable from '../components/LogTable.jsx';
import { GUIDE } from '../content/guide.js';
import { toDateInput, toTimeInput, formatDateTime, relativeTime, formatIndicatorValue } from '../lib/format.js';

/** Field definitions: slider ranges are practical; typed values may go wider (validated). */
const FIELDS = [
  { key: 'hr', indicator: 'hr', label: 'Resting heart rate', unit: 'bpm', slider: [30, 150], step: 1 },
  { key: 'sys', indicator: 'bp', label: 'Blood pressure: systolic (top number)', unit: 'mmHg', slider: [70, 200], step: 1 },
  { key: 'dia', indicator: 'bp', label: 'Blood pressure: diastolic (bottom number)', unit: 'mmHg', slider: [40, 130], step: 1 },
  { key: 'glucose', indicator: 'glucose', label: 'Fasting blood glucose', unit: 'mg/dL', slider: [40, 250], step: 1 },
  { key: 'temp', indicator: 'temp', label: 'Body temperature', unit: '°C', slider: [34, 41], step: 0.1 },
  { key: 'sleep', indicator: 'sleep', label: 'Sleep last night', unit: 'hours', slider: [0, 12], step: 0.1 },
  { key: 'radiation', indicator: 'radiation', label: 'Dosimeter: absorbed dose, last 24 h', unit: 'mGy/day', slider: [0, 5], step: 0.01 },
];

const parse = (s) => (s === '' || s === null ? undefined : Number(s));

function GuideDialog({ id, onClose }) {
  const ref = useRef(null);
  const item = GUIDE.find((g) => g.id === id);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close?.();
  }, []);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-label={`How to measure: ${item.title}`} className="m-auto w-[min(760px,96vw)] rounded-lg border border-accent bg-surface p-0 text-ink backdrop:bg-black/70" data-testid="guide-dialog">
      <div className="max-h-[88vh] overflow-y-auto p-4">
        <div className="mb-2 flex justify-end">
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close guide">✕ Close</button>
        </div>
        <GuideCard item={item} headingLevel={2} />
      </div>
    </dialog>
  );
}

export default function LogReadings() {
  const navigate = useNavigate();
  const environment = useHealthStore((s) => s.environment);
  const missionStart = useHealthStore((s) => s.missionStart);
  const snapshot = useHealthStore((s) => s.status.snapshot);
  const crewLogs = useHealthStore((s) => s.crewLogs);
  const addLog = useHealthStore((s) => s.addLog);
  const showToast = useHealthStore((s) => s.showToast);
  const [values, setValues] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.key, ''])));
  const [date, setDate] = useState(() => toDateInput(Date.now()));
  const [time, setTime] = useState(() => toTimeInput(Date.now()));
  const [whenEdited, setWhenEdited] = useState(false);
  const [notes, setNotes] = useState('');
  const [spe, setSpe] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [guide, setGuide] = useState(null);
  const formRef = useRef(null);

  const numeric = Object.fromEntries(FIELDS.map((f) => [f.key, parse(values[f.key])]));
  const errors = validateReading(numeric);
  for (const f of FIELDS) if (values[f.key] !== '' && Number.isNaN(numeric[f.key])) errors[f.key] = 'Enter a number.';
  const ts = new Date(`${date}T${time || '00:00'}`);
  if (!date || !time || Number.isNaN(ts.getTime())) errors.when = 'Enter a valid date and time.';
  else if (ts.getTime() > Date.now() + 5 * 60_000) errors.when = 'The log time cannot be in the future.';
  const preview = evaluateReading({ ...numeric, spe }, { environment });
  const hasAny = FIELDS.some((f) => values[f.key] !== '');
  const missionDay = !errors.when ? missionDayOf(ts, missionStart) : null;

  const set = (key, v) => {
    setValues((cur) => ({ ...cur, [key]: v }));
    setTouched((t) => ({ ...t, [key]: true }));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length || !hasAny) {
      const first = errors.when ? 'log-date' : FIELDS.find((f) => errors[f.key]) && `f-${FIELDS.find((f) => errors[f.key]).key}`;
      if (first) formRef.current?.querySelector(`#${first}`)?.focus();
      return;
    }
    const clean = Object.fromEntries(Object.entries(numeric).filter(([, v]) => Number.isFinite(v)));
    // Not edited → the exact moment of saving (to the second), so same-minute logs keep their order.
    const when = whenEdited ? ts.toISOString() : new Date().toISOString();
    const entry = addLog(clean, { ts: when, notes, spe, source: 'manual', device: 'Manual entry' });
    showToast(`Log saved for ${formatDateTime(entry.ts)}. Status, body, score and alerts updated.`, 'ok');
    navigate('/');
  };

  const recent = [...crewLogs].reverse().slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Log readings</h1>
        <p className="text-sm text-ink-3">
          Each log entry records when it was measured and any details. Type a value or use the slider; both stay in sync. {ENVIRONMENTS[environment].label}.
        </p>
      </div>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-3" aria-label="Log health readings">
        <fieldset className="hud-panel grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <legend className="sr-only">When was this measured?</legend>
          <label className="block">
            <span className="label">Date</span>
            <input id="log-date" type="date" className="field mt-1" value={date} max={toDateInput(Date.now())} onChange={(e) => { setDate(e.target.value); setWhenEdited(true); }} aria-invalid={Boolean(errors.when && submitted)} data-testid="input-date" />
          </label>
          <label className="block">
            <span className="label">Time (local)</span>
            <input id="log-time" type="time" className="field mt-1" value={time} onChange={(e) => { setTime(e.target.value); setWhenEdited(true); }} aria-invalid={Boolean(errors.when && submitted)} data-testid="input-time" />
          </label>
          <div className="flex items-end">
            <button type="button" className="btn-ghost w-full" onClick={() => { setDate(toDateInput(Date.now())); setTime(toTimeInput(Date.now())); setWhenEdited(false); }}>
              Now
            </button>
          </div>
          <p className="text-sm text-ink-3 md:col-span-3" data-testid="log-when">
            {errors.when ? <span className="font-semibold text-crit-fg" role="alert">{errors.when}</span> : <>Logged for <strong>{formatDateTime(ts)}</strong>{missionDay ? ` · mission day ${missionDay}` : ''}</>}
          </p>
        </fieldset>

        {FIELDS.map((f) => {
          const err = (touched[f.key] || submitted) && errors[f.key];
          const n = numeric[f.key];
          const sliderVal = Number.isFinite(n) ? Math.min(f.slider[1], Math.max(f.slider[0], n)) : f.slider[0];
          const r = preview[f.indicator];
          const last = snapshot[f.indicator];
          return (
            <fieldset key={f.key} className="hud-panel grid items-center gap-3 md:grid-cols-[1.2fr_140px_1.5fr_auto]">
              <legend className="sr-only">{f.label}</legend>
              <div>
                <label htmlFor={`f-${f.key}`} className="label">
                  {f.label} <span className="font-normal text-ink-3">({f.unit})</span>
                </label>
                <p className="mt-1 min-h-[24px] text-xs text-ink-3" aria-live="polite">
                  {r && !errors[f.key] && values[f.key] !== '' ? (
                    <StatusBadge severity={r.severity} compact />
                  ) : last ? (
                    <>Last: {f.key === 'sys' || f.key === 'dia' ? `${last.sys}/${last.dia} mmHg` : `${formatIndicatorValue(f.indicator, { [f.key]: last.value })} ${f.unit}`} ({relativeTime(last.ts)})</>
                  ) : null}
                  {f.key === 'radiation' && Number.isFinite(n) && !errors.radiation && (
                    <span className="ml-2" data-testid="radiation-estimate">≈ {estimateEffectiveDose(n, environment)} mSv/day estimated effective dose</span>
                  )}
                </p>
              </div>
              <div>
                <input
                  id={`f-${f.key}`}
                  name={f.key}
                  type="number"
                  inputMode="decimal"
                  step={f.step}
                  min={VALID_RANGES[f.key].min}
                  max={VALID_RANGES[f.key].max}
                  className="field"
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  aria-invalid={Boolean(err)}
                  aria-describedby={err ? `e-${f.key}` : undefined}
                  data-testid={`input-${f.key}`}
                />
              </div>
              <div>
                <label htmlFor={`s-${f.key}`} className="sr-only">{f.label} slider</label>
                <input
                  id={`s-${f.key}`}
                  type="range"
                  min={f.slider[0]}
                  max={f.slider[1]}
                  step={f.step}
                  value={sliderVal}
                  onChange={(e) => set(f.key, e.target.value)}
                  aria-valuetext={`${values[f.key] || 'empty'} ${f.unit}`}
                  data-testid={`slider-${f.key}`}
                />
              </div>
              <button type="button" className="btn-ghost text-sm" onClick={() => setGuide(f.indicator)} aria-label={`How to measure ${f.label}`}>
                How to measure
              </button>
              {err && (
                <p id={`e-${f.key}`} className="text-sm font-semibold text-crit-fg md:col-span-4" role="alert">
                  {err}
                </p>
              )}
            </fieldset>
          );
        })}
        <div className="hud-panel space-y-3">
          <label className="block">
            <span className="label">Details of this log (symptoms, activity, context)</span>
            <textarea
              className="field mt-1 min-h-[88px] font-sans text-base"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Fasting, before exercise. Slight headache since waking."
              data-testid="input-notes"
            />
          </label>
          <label className="flex min-h-touch items-center gap-3">
            <input type="checkbox" className="h-6 w-6 accent-[#B3141F]" checked={spe} onChange={(e) => setSpe(e.target.checked)} data-testid="input-spe" />
            <span className="font-semibold">Solar particle event alert is active</span>
          </label>
        </div>
        {submitted && !hasAny && <p className="text-crit-fg" role="alert">Enter at least one reading.</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary text-lg" data-testid="submit-readings">
            Save log entry
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setValues(Object.fromEntries(FIELDS.map((f) => [f.key, ''])));
              setNotes('');
              setSpe(false);
              setTouched({});
              setSubmitted(false);
            }}
          >
            Clear form
          </button>
          <Link to="/telemetry" className="btn-ghost">Use wearable data instead</Link>
        </div>
      </form>

      <section className="hud-panel" aria-labelledby="recent-h">
        <div className="flex items-center justify-between">
          <h2 id="recent-h" className="text-lg font-bold">Recent log entries</h2>
          <Link to="/history" className="inline-flex min-h-touch items-center text-sm text-accent underline-offset-2 hover:underline">Full history</Link>
        </div>
        <LogTable logs={recent} compact />
      </section>
      {guide && <GuideDialog id={guide} onClose={() => setGuide(null)} />}
    </div>
  );
}
