import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { GUIDE } from '../content/guide.js';
import { HAZARDS, HAZARD_IDS } from '../content/hazards.js';
import GuideCard from '../components/GuideCard.jsx';
import SourceTags from '../components/SourceTags.jsx';
import { DISCLAIMER } from '../config/thresholds.js';

export default function Guide() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.querySelector(hash)?.scrollIntoView({ block: 'start' });
  }, [hash]);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Measurement guide</h1>
        <p className="text-sm text-ink-3">How to measure each reading with on-board devices, why it matters in space, and when to worry. {DISCLAIMER}</p>
      </div>
      <nav aria-label="Guide sections" className="flex flex-wrap gap-2">
        {GUIDE.map((g) => (
          <a key={g.id} href={`#guide-${g.id}`} className="btn-ghost py-1 text-sm">{g.title}</a>
        ))}
      </nav>
      <div className="grid gap-4 lg:grid-cols-2">
        {GUIDE.map((g) => (
          <GuideCard key={g.id} item={g} />
        ))}
      </div>
      <section className="hud-panel" aria-labelledby="hazards-title">
        <h2 id="hazards-title" className="text-xl font-bold">The five hazards of human spaceflight</h2>
        <ul className="mt-2 grid gap-3 md:grid-cols-2">
          {HAZARD_IDS.map((id) => (
            <li key={id} className="rounded border border-line p-3">
              <h3 className="font-semibold">{HAZARDS[id].label}</h3>
              <p className="text-sm">{HAZARDS[id].summary}</p>
              <p className="mt-1 text-xs text-ink-3">Countermeasures: {HAZARDS[id].countermeasures.join(' · ')}</p>
              <SourceTags ids={HAZARDS[id].sources} className="mt-1" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
