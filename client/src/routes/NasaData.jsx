import { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { api } from '../lib/api.js';
import { ENVIRONMENTS, THRESHOLDS } from '../config/thresholds.js';
import { formatDateTime } from '../lib/format.js';
import SourceTags from '../components/SourceTags.jsx';

const ago = (iso) => Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);

function SpaceWeather() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = (refresh) => {
    setError(null);
    api
      .spaceWeather(refresh)
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(() => load(false), []);
  const recentSep = data?.sep?.find((e) => ago(e.time) <= 72);
  return (
    <section className="hud-panel" aria-labelledby="sw-h" data-testid="space-weather">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="sw-h" className="text-lg font-bold">Solar activity (NASA DONKI)</h2>
        {data && (
          <span className={`text-xs ${data.live ? 'text-ok-fg' : 'text-warn-fg'}`} data-testid="sw-mode">
            {data.live ? `Live · fetched ${formatDateTime(data.fetchedAt)}` : 'Offline snapshot'}
          </span>
        )}
        <button type="button" className="btn-ghost ml-auto py-1 text-sm" onClick={() => load(true)}>Refresh</button>
      </div>
      {error && <p className="mt-2 text-sm text-warn-fg" role="status">Space-weather service unavailable: {error}</p>}
      {data?.error && <p className="mt-2 text-sm text-warn-fg" role="status">{data.error}</p>}
      {!data && !error && <p className="mt-2 text-sm text-ink-3" role="status">Loading NASA DONKI…</p>}
      {data && (
        <>
          {recentSep ? (
            <p className="mt-2 rounded border border-crit-dot p-2 text-sm text-crit-fg" role="alert" data-testid="sep-alert">
              Solar particle event reported {formatDateTime(recentSep.time)}. In deep space, check your dosimeter and tick the SPE alert when you log.
            </p>
          ) : (
            <p className="mt-2 text-sm">No solar particle events in the last 72 h ({data.range.start} to {data.range.end}: {data.sep.length} SEP events, {data.flares.length} flares).</p>
          )}
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="font-semibold">Solar particle events</h3>
              {data.sep.length === 0 ? (
                <p className="text-sm text-ink-3">None in this period.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm">
                  {data.sep.slice(0, 6).map((e) => (
                    <li key={e.id}>
                      <a href={e.link} target="_blank" rel="noreferrer noopener" className="text-accent-text underline">{formatDateTime(e.time)}</a> · {e.instruments.join(', ')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="font-semibold">Solar flares (latest)</h3>
              <ul className="mt-1 space-y-1 text-sm" data-testid="flare-list">
                {data.flares.slice(0, 6).map((f) => (
                  <li key={f.id}>
                    <a href={f.link} target="_blank" rel="noreferrer noopener" className="text-accent-text underline">{f.classType}</a> · peak {formatDateTime(f.peak)} · {f.sourceLocation}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-3">CCMC notes real-time DONKI data is prototyping quality, for research context.</p>
          <SourceTags ids={['DONKI']} className="mt-1" />
        </>
      )}
    </section>
  );
}

function RadLab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.radlab().then(setData).catch((e) => setError(e.message));
  }, []);
  if (error) return <section className="hud-panel"><p className="text-warn-fg">RadLab data unavailable: {error}</p></section>;
  if (!data) return <section className="hud-panel"><p className="text-ink-3" role="status">Loading RadLab data…</p></section>;
  const { storm, reference } = data;
  const pts = storm.hourly.map((h) => ({ t: new Date(h.t).getTime(), v: h.uGyPerHour }));
  const s = storm.summary;
  const dayTicks = storm.daily.map((d) => Date.parse(`${d.date}T00:00:00Z`));
  return (
    <>
      <section className="hud-panel" aria-labelledby="storm-h" data-testid="radlab-storm">
        <h2 id="storm-h" className="text-lg font-bold">Real solar storm on Mars: Curiosity RAD, 20 May 2024</h2>
        <p className="mt-1 text-sm">
          Measured absorbed dose rate on the Mars surface. The daily mean on <strong>{s.peakDay}</strong> was <strong>{s.peakDayMeanUGyPerHour} µGy/h</strong>,{' '}
          <strong>{s.peakDayTimesBaseline}×</strong> the {s.baselineUGyPerHour} µGy/h mean of 14–19 May, with a peak of {s.peakDayMaxUGyPerHour} µGy/h; it was back near normal within two days.
        </p>
        <div className="mt-2 h-[240px]" role="img" aria-label={`Hourly absorbed dose rate, 14 to 26 May 2024, peaking at ${s.peakDayMaxUGyPerHour} µGy per hour on ${s.peakDay}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pts} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={dayTicks} interval="preserveStartEnd" tickFormatter={(t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', timeZone: 'UTC' })} label={{ value: 'May 2024 (UTC)', position: 'insideBottomRight', offset: -2, fill: '#94a3b8', fontSize: 11 }} />
              <YAxis width={52} label={{ value: 'µGy/h', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
              <ReferenceLine y={s.baselineUGyPerHour} stroke="#22c55e" strokeDasharray="4 4" label={{ value: 'quiet-day mean', position: 'insideTopRight', fill: '#22c55e', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'rgb(var(--c-surface))', border: '1px solid rgb(var(--c-line))', color: 'rgb(var(--c-ink))' }} labelFormatter={(t) => `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`} formatter={(v) => [`${v} µGy/h`, 'Absorbed dose rate']} />
              <Line type="monotone" dataKey="v" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-xs text-ink-3">
          Hourly means of {storm.instrument} data from NASA OSDR RadLab, retrieved {formatDateTime(storm.retrieved)}.{' '}
          <a className="text-accent-text underline" href={storm.sourceUrl} target="_blank" rel="noreferrer noopener">Data query</a>
        </p>
        <SourceTags ids={['RADLAB']} className="mt-1" />
      </section>

      <section className="hud-panel" aria-labelledby="ref-h">
        <h2 id="ref-h" className="text-lg font-bold">Measured radiation by environment (absorbed dose)</h2>
        <p className="mt-1 text-sm text-ink-3">
          Dosimeters measure absorbed dose (mGy). NASA limits are effective dose (mSv), which also weighs how harmful each particle type is. Evexia shows the measured mGy and estimates mSv with a quality factor per environment (estimate, to be verified).
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm" data-testid="radlab-reference">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
                <th scope="col" className="py-2">Environment</th>
                <th scope="col">Instrument</th>
                <th scope="col">Date</th>
                <th scope="col">µGy/h</th>
                <th scope="col">mGy/day</th>
              </tr>
            </thead>
            <tbody>
              {reference.references.map((r) => (
                <tr key={r.id} className="num border-b border-line/60">
                  <th scope="row" className="py-2 font-sans font-semibold">{r.label}</th>
                  <td>{r.instrument}</td>
                  <td>{r.date}</td>
                  <td>{r.meanUGyPerHour}</td>
                  <td>{r.mGyPerDay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mt-3 font-semibold">Conversion used in the app</h3>
        <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
          {Object.values(ENVIRONMENTS).map((e) => (
            <li key={e.id}>
              {e.label}: quality factor <span className="num">{e.qualityFactor}</span>, green below <span className="num">{e.radiationGreenBelowMsv}</span> mSv/day
            </li>
          ))}
        </ul>
        <SourceTags ids={['RADLAB', 'MSL_RAD_LIT', 'STD3001_RAD']} className="mt-2" />
      </section>
    </>
  );
}

/**
 * Questions Evexia SI found were not covered by the NASA data above.
 * The ground team reads this list to decide which source to add next.
 */
function KnowledgeGaps() {
  const [gaps, setGaps] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api.knowledgeGaps().then((r) => setGaps(r.gaps)).catch(() => setError(true));
  }, []);
  return (
    <section className="hud-panel" aria-labelledby="gaps-h" data-testid="knowledge-gaps">
      <h2 id="gaps-h" className="text-lg font-bold">Questions our NASA data does not cover yet</h2>
      <p className="text-sm text-ink-3">
        When Evexia SI cannot answer from the sources on this page, it says so, gives labelled general advice at most, and adds the question here so the ground team knows which source to add next.
      </p>
      {error ? (
        <p className="mt-2 text-sm text-warn-fg">The list is unavailable while the ground link is down.</p>
      ) : !gaps ? (
        <p className="mt-2 text-sm text-ink-3" role="status">Loading…</p>
      ) : gaps.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">None yet. Every question so far was covered by the sources above.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {gaps.slice(0, 20).map((g) => (
            <li key={g.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line/60 py-2 text-sm last:border-0">
              <span className="pill">{g.topic}</span>
              <span className="min-w-[200px] flex-1">{g.question}</span>
              <span className="text-xs text-ink-3">{formatDateTime(g.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function NasaData() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Real NASA data</h1>
        <p className="text-sm text-ink-3">The numbers behind Evexia: live solar activity, measured space radiation and the published NASA limits the app uses.</p>
      </div>
      <SpaceWeather />
      <RadLab />
      <section className="hud-panel" aria-labelledby="lim-h">
        <h2 id="lim-h" className="text-lg font-bold">Published limits used by Evexia</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm" data-testid="limits-table">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
                <th scope="col" className="py-2">Limit</th>
                <th scope="col">Value</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line/60"><th scope="row" className="py-2">Career radiation (effective dose)</th><td className="num">{THRESHOLDS.cumulative.careerLimit} mSv</td><td>NASA-STD-3001</td></tr>
              <tr className="border-b border-line/60"><th scope="row" className="py-2">One solar particle event</th><td className="num">{THRESHOLDS.speEvent.limit} mSv</td><td>NASA-STD-3001</td></tr>
              <tr className="border-b border-line/60"><th scope="row" className="py-2">Recommended sleep period</th><td className="num">{THRESHOLDS.sleep.recommendedSleepPeriod} h</td><td>NASA-STD-3001</td></tr>
              <tr className="border-b border-line/60"><th scope="row" className="py-2">Hypothermia (red)</th><td className="num">below 35.0 °C</td><td>NASA-STD-3001</td></tr>
              <tr className="border-b border-line/60"><th scope="row" className="py-2">Fasting glucose lab normal range (green)</th><td className="num">65–99 mg/dL</td><td>Inspiration4 crew blood results, NASA OSDR</td></tr>
              <tr><th scope="row" className="py-2">Mars one-way communication delay</th><td className="num">up to 20 min</td><td>NASA distance-from-Earth hazard page</td></tr>
            </tbody>
          </table>
        </div>
        <SourceTags ids={['STD3001', 'STD3001_RAD', 'OSDR_I4']} className="mt-2" />
      </section>
      <KnowledgeGaps />
      <section className="hud-panel" aria-labelledby="unv-h">
        <h2 id="unv-h" className="text-lg font-bold">What is not verified</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>NASA publishes no green/amber/red limits for heart rate, blood pressure, glucose (upper bands) or fever, and no open astronaut vital-sign data. Those bands are demonstration values, labelled “to be verified”.</li>
          <li>Quality factors converting mGy to mSv are approximate (to be verified). The Mars-transit absorbed dose of 0.38 mGy/day is a RadLab measurement from the ExoMars TGO cruise to Mars in 2016, not from a crewed spacecraft.</li>
          <li>The Mars-surface figure of 0.67 mSv/day, the Chang’E-4 lunar figure and the ISS daily range from the research notes were not opened. The app uses RadLab measurements instead.</li>
          <li>No source yet explains why glucose matters specifically in flight; the guide text on this is marked accordingly.</li>
        </ul>
      </section>
    </div>
  );
}
