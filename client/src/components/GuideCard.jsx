import SourceTags from './SourceTags.jsx';
import { HAZARDS } from '../content/hazards.js';

export default function GuideCard({ item, headingLevel = 2 }) {
  const H = `h${headingLevel}`;
  return (
    <article id={`guide-${item.id}`} className="hud-panel scroll-mt-24" data-testid={`guide-${item.id}`} aria-labelledby={`guide-${item.id}-title`}>
      <H id={`guide-${item.id}-title`} className="text-xl font-bold">
        {item.title} <span className="text-sm font-normal text-ink-3">({item.unit})</span>
      </H>
      <p className="mt-1 text-sm">{item.what}</p>
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="font-bold">Why check it in space</dt>
          <dd>{item.whySpace}</dd>
        </div>
        <div>
          <dt className="font-bold">On-board device</dt>
          <dd>{item.device}</dd>
          <dt className="mt-2 font-bold">Related hazard</dt>
          <dd>{HAZARDS[item.hazard].label}</dd>
        </div>
        <div>
          <dt className="font-bold">Normal range</dt>
          <dd className="num">{item.normal}</dd>
        </div>
        <div>
          <dt className="font-bold">When to worry</dt>
          <dd>{item.worry}</dd>
        </div>
      </dl>
      <h3 className="mt-3 text-sm font-bold">Step by step</h3>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
        {item.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <SourceTags ids={item.sources} className="mt-3" />
    </article>
  );
}
