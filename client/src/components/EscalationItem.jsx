import { useState } from 'react';
import { Link } from 'react-router-dom';
import { reportToText } from '../lib/escalation.js';
import { StatusBadge } from './Status.jsx';
import { Avatar } from './Brand.jsx';
import { formatDateTime, relativeTime } from '../lib/format.js';
import { formatDelay } from '../lib/comms.js';

const REPLY_STEP = {
  waiting: 'Reply waiting on Earth for the link',
  travelling: 'Reply on its way to the crew',
  delivered: 'Reply delivered to the crew',
};

/** Written on board vs arrived on Earth: on Mars these are minutes apart, and both matter. */
function Journey({ link }) {
  if (!link?.arrivedAt) return null;
  const gapMs = new Date(link.arrivedAt) - new Date(link.writtenAt);
  const gap = gapMs > 1000 ? formatDelay(Math.round(gapMs / 1000)) : null;
  return (
    <p className="mt-1 text-xs text-ink-3" data-testid="esc-journey">
      Written on board <span className="num text-ink-2">{formatDateTime(link.writtenAt)}</span> · reached Earth{' '}
      <span className="num text-ink-2">{formatDateTime(link.arrivedAt)}</span>
      {gap && <> ({gap} later)</>}
    </p>
  );
}

/** One escalation in the flight surgeon's inbox: crew portrait, priority, report, review + note. */
export default function EscalationItem({ e, avatar, onSave, onReply, showCrew = true }) {
  const [note, setNote] = useState(e.note || '');
  const [reply, setReply] = useState('');
  const back = e.link?.back;
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
      <Journey link={e.link} />
      {e.payload.focusIndicator && <p className="mt-2 text-sm">{e.payload.focusIndicator}</p>}
      <button type="button" className="btn-ghost mt-2 min-h-touch py-1 text-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide report' : 'View report'}
      </button>
      {open && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-tile bg-surface-2 p-3 font-mono text-xs" tabIndex={0}>{reportToText(e.payload)}</pre>}
      <label className="mt-3 block">
        <span className="label">Surgeon note</span>
        <textarea className="field mt-1 min-h-[64px] font-sans text-base" value={note} maxLength={2000} onChange={(ev) => setNote(ev.target.value)} />
      </label>
      <p className="mt-1 text-xs text-ink-3">Stays on Earth. Only your reply travels to the crew.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {e.status === 'reviewed' ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-tile bg-ok-bg px-3 py-1.5 text-sm font-semibold text-ok-fg" data-testid="status-reviewed-indicator">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Reviewed
            </span>
            <button type="button" className="btn-ghost text-xs text-ink-3 hover:text-ink" onClick={() => onSave(e.id, { status: 'open', note })}>
              Reopen
            </button>
          </>
        ) : (
          <button type="button" className="btn-primary" onClick={() => onSave(e.id, { status: 'reviewed', note })}>
            Mark reviewed
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => onSave(e.id, { note })}>Save note</button>
      </div>
      {onReply && (
        <div className="mt-4 border-t border-line pt-3" data-testid={`esc-reply-${e.id}`}>
          {back?.kind === 'reply' && (
            <div className="mb-3 rounded-tile bg-surface-2 px-3 py-2 text-sm">
              <p className="text-xs font-semibold text-ink-3">
                Your reply, written <span className="num">{formatDateTime(back.writtenAt)}</span> · <span data-testid="reply-step" data-step={back.step}>{REPLY_STEP[back.step] ?? ''}</span>
                {back.step === 'travelling' && back.arriveAt && <> (arrives about <span className="num">{formatDateTime(back.arriveAt)}</span>)</>}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{back.text}</p>
            </div>
          )}
          <label className="block">
            <span className="label">{back?.kind === 'reply' ? 'Send another reply' : 'Reply to the crew'}</span>
            <textarea className="field mt-1 min-h-[64px] font-sans text-base" value={reply} maxLength={2000} onChange={(ev) => setReply(ev.target.value)} />
          </label>
          <p className="mt-1 text-xs text-ink-3">It travels with the same delay{e.link?.delaySeconds ? `, about ${formatDelay(e.link.delaySeconds)}` : ''}.</p>
          <button
            type="button"
            className="btn-primary mt-2"
            disabled={!reply.trim()}
            onClick={async () => {
              if (await onReply(e.id, reply.trim())) setReply('');
            }}
          >
            Send reply
          </button>
        </div>
      )}
    </li>
  );
}
