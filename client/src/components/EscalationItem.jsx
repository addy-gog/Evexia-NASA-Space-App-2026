import { useState } from 'react';
import { Link } from 'react-router-dom';
import { reportToText } from '../lib/escalation.js';
import { StatusBadge } from './Status.jsx';
import { Avatar } from './Brand.jsx';
import { formatDateTime, relativeTime } from '../lib/format.js';

/** One escalation in the flight surgeon's inbox: crew portrait, priority, report, review + note. */
export default function EscalationItem({ e, avatar, onSave, showCrew = true }) {
  const [note, setNote] = useState(e.note || '');
  const [open, setOpen] = useState(false);
  const emergency = e.priority === 'emergency';
  return (
    <li className={`rounded-card border p-4 ${emergency ? 'border-crit-line bg-crit-bg/40' : 'border-line bg-surface'}`} data-testid={`esc-${e.id}`} data-status={e.status} data-priority={e.priority}>
      <div className="flex flex-wrap items-center gap-3">
        {showCrew && <Avatar src={avatar} name={e.payload.crew.name} size={40} />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {emergency && <span className="mr-2 rounded-full bg-crit-fg px-2 py-0.5 text-xs font-bold text-white">EMERGENCY</span>}
            {showCrew ? (
              <Link to={`/surgeon/crew/${e.crewId}`} className="underline-offset-2 hover:underline">{e.payload.crew.name}</Link>
            ) : (
              `Report #${e.id}`
            )}
          </p>
          <p className="text-xs text-ink-3">
            #{e.id} · {formatDateTime(e.createdAt)} ({relativeTime(e.createdAt)}){e.payload.missionDay ? ` · mission day ${e.payload.missionDay}` : ''} · {e.payload.environment.label}
          </p>
        </div>
        <StatusBadge severity={e.payload.overallSeverity} compact />
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${e.status === 'reviewed' ? 'bg-ok-bg text-ok-fg' : 'bg-warn-bg text-warn-fg'}`}>{e.status === 'reviewed' ? 'Reviewed' : 'New'}</span>
      </div>
      {e.payload.focusIndicator && <p className="mt-2 text-sm">{e.payload.focusIndicator}</p>}
      <button type="button" className="btn-ghost mt-2 min-h-touch py-1 text-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide report' : 'View report'}
      </button>
      {open && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-tile bg-surface-2 p-3 font-mono text-xs" tabIndex={0}>{reportToText(e.payload)}</pre>}
      <label className="mt-3 block">
        <span className="label">Surgeon note</span>
        <textarea className="field mt-1 min-h-[64px] font-sans text-base" value={note} maxLength={2000} onChange={(ev) => setNote(ev.target.value)} />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => onSave(e.id, { status: 'reviewed', note })}>Mark reviewed</button>
        <button type="button" className="btn-ghost" onClick={() => onSave(e.id, { note })}>Save note</button>
      </div>
    </li>
  );
}
