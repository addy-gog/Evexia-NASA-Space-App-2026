import { SOURCES } from '../config/thresholds.js';

export default function Credits() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Credits, sources and licences</h1>
      <section className="hud-panel space-y-2 text-sm">
        <h2 className="text-lg font-bold">3D body</h2>
        <p>
          The body shown in this build is a stylised model made from three.js primitives (original work, MIT). It uses the same mesh names as a processed anatomy model so a real model can be swapped in.
        </p>
        <p>Planned model sources (not bundled in this build):</p>
        <ul className="list-disc pl-5">
          <li>Z-Anatomy (CC BY-SA 4.0), derived from BodyParts3D: github.com/LluisV/Z-Anatomy, github.com/Z-Anatomy/Models-of-human-anatomy</li>
          <li>BodyParts3D, © The Database Center for Life Science (now CC BY 4.0)</li>
          <li>NIH 3D (3d.nih.gov), CC-BY models</li>
        </ul>
        <p>If these models are bundled, keep each file&apos;s licence and attribution (Z-Anatomy CC BY-SA 4.0; BodyParts3D CC BY 4.0).</p>
      </section>
      <section className="hud-panel space-y-2 text-sm">
        <h2 className="text-lg font-bold">Software</h2>
        <ul className="list-disc pl-5">
          <li>three.js, @react-three/fiber, @react-three/drei (MIT)</li>
          <li>React, React Router, Zustand, Recharts, Vite, Tailwind CSS (MIT)</li>
          <li>jsPDF (MIT), Express (MIT), better-sqlite3 (MIT), Anthropic TypeScript SDK (MIT)</li>
          <li>Fonts: Inter and JetBrains Mono (SIL Open Font License 1.1) via Google Fonts</li>
          <li>Real data: NASA OSDR RadLab (radiation measurements), NASA CCMC DONKI (solar events), NASA OSDR Inspiration4 (glucose reference range). NASA data is public domain unless noted.</li>
        </ul>
      </section>
      <section className="hud-panel space-y-2 text-sm">
        <h2 className="text-lg font-bold">Sources</h2>
        <ul className="space-y-1">
          {Object.values(SOURCES).map((s) => (
            <li key={s.id}>
              <span className="font-mono">{s.id}</span>: {s.label}
              {s.url && (
                <>
                  {' '}
                  <a className="text-accent underline" href={s.url} target="_blank" rel="noreferrer noopener">{s.url}</a>
                </>
              )}
              {!s.verified && <span className="text-warn-fg"> (to be verified)</span>}
            </li>
          ))}
        </ul>
        <p className="text-ink-3">Radiation limits, sleep period, hypothermia and the glucose lower bound follow published NASA figures; heart rate, blood pressure, upper glucose and fever bands are demonstration values to be verified with flight surgeons.</p>
      </section>
      <section className="hud-panel text-sm">
        <h2 className="text-lg font-bold">Project</h2>
        <p>Evexia was built for the NASA Space Apps Challenge 2026 (&quot;Health Monitoring Software&quot;). Code: MIT licence. Not a medical device.</p>
      </section>
    </div>
  );
}
