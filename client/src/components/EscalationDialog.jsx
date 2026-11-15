import { useEffect, useMemo, useRef, useState } from 'react';
import { buildEscalationReport, reportToText } from '../lib/escalation.js';
import { useHealthStore } from '../store/useHealthStore.js';
import { api } from '../lib/api.js';
import { GUIDANCE } from '../content/guidance.js';

function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadPdf(name, text) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFont('courier', 'normal');
  doc.setFontSize(9.5);
  const lines = doc.splitTextToSize(text, 515);
  let y = 50;
  for (const line of lines) {
    if (y > 800) {
      doc.addPage();
      y = 50;
    }
    doc.text(line, 40, y);
    y += 13;
  }
  doc.save(name);
}

/** Modal dialog: preview, copy, download (TXT/PDF) and send the structured report. */
export default function EscalationDialog({ focusId, onClose, onSent, priority = 'routine', presetActions = [], presetNote = '' }) {
  const s = useHealthStore();
  const crew = s.profile ?? s.crew.find((c) => c.id === s.crewId);
  const [actions, setActions] = useState(presetActions);
  const [note, setNote] = useState(presetNote);
  const [status, setStatus] = useState(null);
  const dialogRef = useRef(null);

  const focusMeta = focusId ? s.status.alerts.find((a) => a.id === focusId) : null;
  const suggestions = focusMeta ? GUIDANCE[focusId][focusMeta.result.severity].selfCare : [];

  const report = useMemo(
    () =>
      buildEscalationReport({
        crew,
        status: s.status,
        environment: s.environment,
        delaySeconds: s.delaySeconds,
        focusIndicator: focusMeta ? `${focusMeta.meta.label}: ${focusMeta.result.reason}` : null,
        actionsTaken: actions,
        note,
        priority,
      }),
    // createdAt is regenerated on each change; that is fine for a preview.
    [crew, s.status, s.environment, s.delaySeconds, focusMeta, actions, note, priority],
  );
  const text = reportToText(report);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    // No close() on cleanup: in development React mounts, unmounts and remounts once,
    // and closing here fired onClose and removed the dialog instantly. A dialog
    // removed from the page leaves the top layer by itself.
  }, []);

  const toggle = (a) => setActions((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
  const file = `evexia-${priority === 'emergency' ? 'EMERGENCY' : 'escalation'}-${crew.id}-${report.createdAt.slice(0, 16).replace(/[:T]/g, '')}`;

  const send = async () => {
    setStatus({ tone: 'info', msg: 'Sending…' });
    try {
      const saved = await api.postEscalation(report);
      onSent?.(saved);
      // Honest about the Earth link: never imply Earth has it before the receipt comes back.
      const waiting = saved.link?.step === 'waiting';
      setStatus({
        tone: waiting ? 'warn' : 'ok',
        msg: waiting
          ? `Report #${saved.id} queued for the flight surgeon. The Earth link is down, so it waits on board and leaves when the link is back.`
          : `Report #${saved.id} queued for the flight surgeon and leaving now. ${report.delay.arrival} Track it on the Earth link page.`,
      });
      s.setApiOnline(true);
      s.loadEarthLink();
    } catch {
      setStatus({ tone: 'warn', msg: 'Ground link unavailable: report saved for download. Copy or download it and send when the link returns.' });
      s.setApiOnline(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ tone: 'ok', msg: 'Report copied to clipboard.' });
    } catch {
      setStatus({ tone: 'warn', msg: 'Copy is blocked in this browser: select the text and copy it manually.' });
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="esc-title"
      className="m-auto w-[min(860px,96vw)] rounded-card border border-line bg-surface p-0 text-ink shadow-panel backdrop:bg-[#0E1726]/50"
      data-testid="escalation-dialog"
    >
      <div className="flex max-h-[90vh] flex-col">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="esc-title" className="text-lg font-bold">{priority === 'emergency' ? 'Emergency report to flight surgeon' : 'Escalate to flight surgeon'}</h2>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close escalation dialog">✕</button>
        </header>
        <div className="grid gap-4 overflow-y-auto p-5 md:grid-cols-[1fr_1.3fr]">
          <div className="space-y-4">
            <p className="rounded border border-line bg-bg p-3 text-sm">{report.delay.arrival}</p>
            {suggestions.length > 0 && (
              <fieldset>
                <legend className="label mb-2">Actions already taken</legend>
                <div className="space-y-1">
                  {suggestions.map((a) => (
                    <label key={a} className="flex min-h-touch items-start gap-3 text-sm">
                      <input type="checkbox" className="mt-1 h-5 w-5 accent-[#FF4D55]" checked={actions.includes(a)} onChange={() => toggle(a)} />
                      <span>{a}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="block">
              <span className="label">Note for the flight surgeon (optional)</span>
              <textarea className="field mt-1 min-h-[96px] text-base" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <div>
            <h3 className="label mb-1">Report preview</h3>
            <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded border border-line bg-bg p-3 font-mono text-xs" data-testid="report-preview" tabIndex={0}>
              {text}
            </pre>
          </div>
        </div>
        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <button type="button" className="btn-danger" onClick={send} data-testid="send-report">Send report</button>
          <button type="button" className="btn-ghost" onClick={copy}>Copy text</button>
          <button type="button" className="btn-ghost" onClick={() => download(`${file}.txt`, text)}>Download .txt</button>
          <button type="button" className="btn-ghost" onClick={() => downloadPdf(`${file}.pdf`, text)}>Download PDF</button>
          {status && (
            <p role="status" className={`w-full text-sm ${status.tone === 'ok' ? 'text-ok-fg' : status.tone === 'warn' ? 'text-warn-fg' : 'text-ink-3'}`} data-testid="escalation-status">
              {status.msg}
            </p>
          )}
        </footer>
      </div>
    </dialog>
  );
}
