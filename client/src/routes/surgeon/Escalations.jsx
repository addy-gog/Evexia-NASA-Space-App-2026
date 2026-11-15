import { useCallback, useEffect, useState } from 'react';
import { useHealthStore } from '../../store/useHealthStore.js';
import { api } from '../../lib/api.js';
import EscalationItem from '../../components/EscalationItem.jsx';

/** Every escalation from every crew member, emergencies first. */
export default function SurgeonEscalations() {
  const showToast = useHealthStore((s) => s.showToast);
  const [esc, setEsc] = useState(null);
  const [avatars, setAvatars] = useState({});
  const [filter, setFilter] = useState('open');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [e, c] = await Promise.all([api.escalations(), api.crew()]);
      setEsc(e.escalations);
      setAvatars(Object.fromEntries(c.crew.map((x) => [x.id, x.avatar])));
      setError('');
    } catch {
      setError('Ground station API unreachable.');
      setEsc((x) => x ?? []);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (id, body) => {
    try {
      await api.patchEscalation(id, body);
      showToast(body.status === 'reviewed' ? `Escalation #${id} marked reviewed.` : 'Note saved.', 'ok');
      load();
    } catch {
      showToast('Could not save: ground link unavailable.', 'warn');
    }
  };
  const reply = async (id, text) => {
    try {
      await api.replyEscalation(id, text);
      showToast(`Reply to #${id} queued for the crew.`, 'ok');
      load();
      return true;
    } catch {
      showToast('Reply not sent: the ground server is unreachable.', 'warn');
      return false;
    }
  };
  useEffect(() => {
    const id = setInterval(load, 4000); // reports arrive over time on a delayed link
    return () => clearInterval(id);
  }, [load]);
  const shown = (esc ?? []).filter((e) => (filter === 'open' ? e.status !== 'reviewed' : true));

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Flight surgeon</p>
          <h1 className="page-title mt-1">Escalations</h1>
        </div>
        <div role="group" aria-label="Filter" className="flex gap-1 rounded-tile border border-line bg-surface p-1">
          {[['open', 'Open'], ['all', 'All']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={`min-h-touch rounded-[10px] px-4 text-sm font-semibold ${filter === v ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="rounded-tile bg-warn-bg px-4 py-3 text-sm font-semibold text-warn-fg" role="status">{error}</p>}
      {esc === null ? (
        <p className="text-ink-3" role="status">Loading escalations…</p>
      ) : shown.length === 0 ? (
        <p className="hud-panel text-sm text-ink-3">{filter === 'open' ? 'No open escalations.' : 'No escalations received.'}</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="escalation-list">
          {shown.map((e) => (
            <EscalationItem key={`${e.id}-${e.status}-${e.note}`} e={e} avatar={avatars[e.crewId]} onSave={save} onReply={reply} />
          ))}
        </ul>
      )}
    </div>
  );
}
