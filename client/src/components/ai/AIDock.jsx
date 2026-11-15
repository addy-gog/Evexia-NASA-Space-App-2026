/**
 * AI dock (bottom-right) with the 3D companion, and the assistant panel.
 * Online: Claude through the server, with photos, dictation and read-aloud.
 * Offline (toggle, no key, or no link): the rule-based engine; photos need Claude.
 * Every message passes the danger-sign screen first, online or offline.
 * The dock is one real <button> with aria-expanded; the canvas is decorative
 * and its information is repeated in the dock text.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHealthStore, usePrefersReducedMotion } from '../../store/useHealthStore.js';
import { api, newId } from '../../lib/api.js';
import { ruleBasedAnswer, summaryMessage } from '../../lib/ruleAssistant.js';
import { sleepHistoryBefore } from '../../lib/evaluate.js';
import { screenDangerSigns, EMERGENCY_LINE } from '../../lib/safety.js';
import { preparePhoto, useDictation, useSpeaker } from '../../lib/media.js';
import { ENVIRONMENTS, INDICATORS } from '../../config/thresholds.js';
import { SEVERITY_META } from '../Status.jsx';
import CompanionStill from './CompanionStill.jsx';
import ActionCard from './ActionCard.jsx';
import EscalationDialog from '../EscalationDialog.jsx';
import CameraDialog from './CameraDialog.jsx';

const Companion = lazy(() => import('./Companion.jsx'));
const CHIPS = ['What should I do first?', 'Why does the delay matter?', 'Draft a report'];
const HISTORY_SENT = 8;

function Icon({ d, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((p) => <path key={p} d={p} />)}
    </svg>
  );
}
const ICONS = {
  plus: ['M12 5v14', 'M5 12h14'],
  image: ['M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M9 11a2 2 0 1 0 0-4a2 2 0 1 0 0 4z', 'M21 15l-5-5L5 20'],
  camera: ['M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M12 16.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7z'],
  mic: ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z', 'M19 11a7 7 0 0 1-14 0', 'M12 18v3'],
  stop: ['M7 7h10v10H7z'],
  speaker: ['M11 5L6 9H3v6h3l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M18.5 5.5a9 9 0 0 1 0 13'],
  expand: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
  shrink: ['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  send: ['M5 12h14', 'M13 6l6 6-6 6'],
};

function useWorst(status) {
  const sevs = INDICATORS.map((m) => status.results[m.id]?.severity).filter(Boolean);
  const flagged = sevs.filter((s) => s !== 'green').length;
  const worst = sevs.includes('red') ? 'red' : sevs.includes('amber') ? 'amber' : 'green';
  return { worst, flagged };
}

/** Text sent back to the server as conversation history (no photo data, just a marker). */
const historyOf = (msgs) => msgs.slice(-HISTORY_SENT).map((m) => ({ role: m.role, text: m.photo ? `${m.text} [photo attached]`.trim() : m.text }));

export default function AIDock() {
  const status = useHealthStore((s) => s.status);
  const environment = useHealthStore((s) => s.environment);
  const delaySeconds = useHealthStore((s) => s.delaySeconds);
  const profile = useHealthStore((s) => s.profile);
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState(false);
  const [offline, setOffline] = useState(false);
  const [fallback, setFallback] = useState(false); // server answered with offline guidance
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(null);
  const [photo, setPhoto] = useState(null); // { mediaType, data, previewUrl }
  const [notice, setNotice] = useState('');
  const [report, setReport] = useState(null); // proposal being reviewed in the escalation dialog
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const cameraInputRef = useRef(null);
  const plusRef = useRef(null);
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const dictation = useDictation(setInput);
  const speaker = useSpeaker();
  const { worst, flagged } = useWorst(status);
  const compStatus = { green: 'ok', amber: 'warn', red: 'crit' }[worst];
  const envLabel = ENVIRONMENTS[environment].label;
  const ruleCtx = useMemo(
    () => ({ results: status.results, delaySeconds, environmentLabel: envLabel, score: status.score.score, tier: status.score.band?.label ?? '', missionDay: status.missionDay, crewName: profile?.name }),
    [status, delaySeconds, envLabel, profile],
  );
  const shown = messages ?? [{ id: 'summary', role: 'assistant', text: summaryMessage(ruleCtx) }];

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else speaker.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [shown.length, busy]);

  /** Offline answer, with the same safety lines the server adds. */
  const offlineText = (q, hasPhoto, signs) => {
    const parts = [];
    if (signs.length) parts.push(`Possible danger sign: ${signs.map((s) => s.label).join(', ')}. ${EMERGENCY_LINE}`);
    if (hasPhoto) parts.push('Offline guidance cannot look at photos. Type the numbers from the screen in Log Readings, or describe what you see in words.');
    parts.push(ruleBasedAnswer(q, ruleCtx));
    return parts.join('\n\n');
  };

  const ask = async (question) => {
    const q = question.trim();
    if ((!q && !photo) || busy) return;
    if (dictation.listening) dictation.stop();
    const base = shown;
    const sentPhoto = photo;
    const userMsg = { id: newId(), role: 'user', text: q, photo: sentPhoto?.previewUrl };
    setMessages([...base, userMsg]);
    setInput('');
    setPhoto(null);
    setNotice('');
    setBusy(true);
    const signs = screenDangerSigns(q);
    const s = useHealthStore.getState();
    let reply;
    if (offline) {
      await new Promise((r) => setTimeout(r, 350));
      reply = { text: offlineText(q, Boolean(sentPhoto), signs), mode: 'offline' };
    } else {
      try {
        const res = await api.assistant(
          q,
          {
            environment: s.environment,
            delaySeconds: s.delaySeconds,
            reading: s.status.reading,
            sleepHistory: s.status.snapshot.sleep ? sleepHistoryBefore(s.crewLogs, s.status.snapshot.sleep.ts) : [],
            missionDay: s.status.missionDay,
            baselineMode: s.baselineMode,
            baseline: s.baseline,
          },
          { image: sentPhoto, history: historyOf(base.filter((m) => m.id !== 'summary')) },
        );
        // The server's offline answer covers single readings; chip intents use the richer local engine.
        reply = res.mode === 'ai'
          ? { text: res.answer, mode: 'ai', actions: res.actions ?? [], gap: res.gapRecorded }
          : { text: offlineText(q, Boolean(sentPhoto), signs), mode: 'offline' };
      } catch (err) {
        const tooBig = err.status === 413;
        reply = { text: tooBig ? 'That photo is too large to send. Try a closer, simpler shot.' : offlineText(q, Boolean(sentPhoto), signs), mode: 'offline' };
      }
    }
    setFallback(reply.mode === 'offline');
    setMessages([...base, userMsg, { id: newId(), role: 'assistant', ...reply, emergency: signs }]);
    setBusy(false);
  };

  // The + menu: upload a photo, or take one. Photos need Claude, so offline mode explains instead.
  const closeMenu = (refocus = true) => {
    setMenuOpen(false);
    if (refocus) plusRef.current?.focus();
  };
  const choose = (kind) => {
    closeMenu(false);
    if (offline) {
      setNotice('Photos need Claude. Tap "Go online" to send one, or type the numbers instead.');
      plusRef.current?.focus();
      return;
    }
    if (kind === 'upload') fileRef.current?.click();
    // Phones open their own camera app; laptops get a live camera view.
    else if (window.matchMedia?.('(pointer: coarse)').matches) cameraInputRef.current?.click();
    else setCameraOpen(true);
  };
  useEffect(() => {
    if (!menuOpen) return undefined;
    menuRef.current?.querySelector('[role=menuitem]')?.focus();
    const outside = (e) => {
      if (!menuRef.current?.contains(e.target) && !plusRef.current?.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [menuOpen]);
  const menuKeys = (e) => {
    const items = [...(menuRef.current?.querySelectorAll('[role=menuitem]') ?? [])];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    } else if (e.key === 'Tab') setMenuOpen(false);
  };
  const attachPhoto = async (file) => {
    if (!file) return;
    try {
      setPhoto(await preparePhoto(file));
      setNotice('');
      inputRef.current?.focus();
    } catch (err) {
      setNotice(err.message);
    }
  };
  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    attachPhoto(file);
  };

  // Starts with the visible text ("Ask Evexia AI" + status line) so voice-control users can say what they see; aria-expanded gives open/closed.
  const statusLine = open ? 'Tap to minimise' : flagged ? `${flagged} item${flagged > 1 ? 's' : ''} to review` : 'All nominal · ask anything';
  const aria = `Ask Evexia AI, ${statusLine}`;
  const modeText = offline ? 'Offline · rule-based fallback' : fallback ? 'Online · rule-based (no Claude key)' : 'Online · powered by Claude';
  const size = expanded ? 'sm:h-[min(820px,calc(100vh-156px))] sm:w-[min(680px,calc(100vw-48px))]' : 'sm:h-[min(600px,72vh)] sm:w-[380px]';
  const roundBtn = 'flex h-11 w-11 flex-none items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50';
  const menuItem = 'flex min-h-touch w-full items-center gap-3 rounded-input px-3 text-left text-sm font-semibold text-ink hover:bg-surface-2 focus-visible:bg-surface-2';

  return (
    <>
      {open && (
        <aside
          id="assistant-panel"
          className={`rise fixed inset-0 z-50 flex flex-col bg-bg sm:inset-auto sm:bottom-[132px] sm:right-6 sm:rounded-card sm:border sm:border-line sm:bg-surface sm:shadow-panel ${size}`}
          aria-label="Evexia AI assistant"
          data-testid="assistant-panel"
          data-expanded={expanded}
        >
          <header className="flex items-center gap-1.5 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="whitespace-nowrap font-display text-lg font-bold">Evexia AI</h2>
              <p className={`truncate text-xs font-semibold ${busy ? 'text-accent' : 'text-ink-3'}`}>{busy ? (photo || shown.at(-1)?.photo ? 'Looking at the photo…' : 'Thinking…') : modeText}</p>
            </div>
            <button type="button" className="btn-ghost min-h-touch px-3 text-xs" aria-pressed={offline} onClick={() => setOffline(!offline)} data-testid="online-toggle">
              {offline ? 'Go online' : 'Use offline'}
            </button>
            <button type="button" className="btn-ghost hidden h-11 w-11 p-0 sm:flex" onClick={() => setExpanded(!expanded)} aria-pressed={expanded} aria-label={expanded ? 'Make the assistant smaller' : 'Make the assistant larger'} data-testid="assistant-expand">
              <Icon d={expanded ? ICONS.shrink : ICONS.expand} size={18} />
            </button>
            <button type="button" className="btn-ghost h-11 w-11 p-0" onClick={() => setOpen(false)} aria-label="Close assistant">
              <Icon d={ICONS.close} size={18} />
            </button>
          </header>
          {(offline || fallback || messages?.some((m) => m.mode === 'ai')) && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
              {offline || fallback ? (
                <span className="rounded-full bg-warn-bg px-2.5 py-1 text-[11px] font-bold text-warn-fg" data-testid="offline-badge">Offline guidance mode</span>
              ) : (
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent-strong" data-testid="ai-badge">Claude</span>
              )}
              <span className="text-[11px] text-ink-3">{offline ? 'Rule-based answers, works without a link.' : fallback ? 'Set ANTHROPIC_API_KEY on the server for Claude.' : 'Answers from Claude via the ground server.'}</span>
            </div>
          )}
          <div className="flex justify-center py-2 sm:hidden" aria-hidden="true">
            {reduced ? <CompanionStill size={110} light={SEVERITY_META[worst].color} /> : (
              <Suspense fallback={<CompanionStill size={110} light={SEVERITY_META[worst].color} />}>
                <Companion status={compStatus} thinking={busy} open size={120} />
              </Suspense>
            )}
          </div>
          <div ref={listRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3" aria-live="polite" data-testid="assistant-messages" tabIndex={0}>
            {shown.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex max-w-[88%] flex-col items-end gap-1.5 self-end" data-role="user">
                  {m.photo && <img src={m.photo} alt="Photo you sent" className="max-h-40 rounded-tile border border-line object-cover" />}
                  {m.text && <div className="whitespace-pre-wrap rounded-[16px_16px_4px_16px] bg-accent px-3.5 py-2.5 text-sm text-white">{m.text}</div>}
                </div>
              ) : (
                <div key={m.id} className={`self-start ${expanded ? 'max-w-[80%]' : 'max-w-[92%]'}`} data-role="assistant">
                  {m.emergency?.length > 0 && (
                    <div className="mb-2 rounded-tile border border-crit-line bg-crit-bg p-3 text-sm" role="alert" data-testid="assistant-emergency">
                      <p><strong className="text-crit-fg">Possible danger sign: {m.emergency.map((e) => e.label).join(', ')}.</strong> {EMERGENCY_LINE}</p>
                      <Link to="/emergency" className="btn-danger mt-2 min-h-touch px-3.5 text-sm" onClick={() => setOpen(false)}>Open emergency mode</Link>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap rounded-[16px_16px_16px_4px] border border-[#E6EAF0] bg-surface px-3.5 py-2.5 text-sm">{m.text}</div>
                  {m.actions?.map((a) => <ActionCard key={a.type} action={a} onOpenReport={setReport} />)}
                  {m.gap && <p className="mt-1.5 text-xs text-ink-3" data-testid="gap-recorded">Added to the list of questions Evexia&apos;s NASA data does not cover yet.</p>}
                  {speaker.supported && (
                    <button
                      type="button"
                      className="mt-1 inline-flex min-h-touch items-center gap-1.5 rounded-input px-2 text-xs font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
                      onClick={() => (speaker.speakingId === m.id ? speaker.stop() : speaker.speak(m.id, m.text))}
                      aria-pressed={speaker.speakingId === m.id}
                    >
                      <Icon d={speaker.speakingId === m.id ? ICONS.stop : ICONS.speaker} size={16} />
                      {speaker.speakingId === m.id ? 'Stop reading' : 'Read aloud'}
                    </button>
                  )}
                </div>
              ),
            )}
            {busy && (
              <div className="flex gap-1.5 self-start rounded-[16px_16px_16px_4px] border border-[#E6EAF0] bg-surface px-4 py-3.5" aria-label="Evexia AI is typing">
                <span className="dot1 block h-[7px] w-[7px] rounded-full bg-accent" />
                <span className="dot2 block h-[7px] w-[7px] rounded-full bg-accent" />
                <span className="dot3 block h-[7px] w-[7px] rounded-full bg-accent" />
              </div>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 pt-1" role="group" aria-label="Suggested questions">
            {CHIPS.map((q) => (
              <button key={q} type="button" disabled={busy} onClick={() => ask(q)} className="min-h-touch flex-none rounded-full border border-[#C9D1DC] bg-surface px-3.5 text-[13px] font-semibold text-accent hover:bg-accent-soft">
                {q}
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => setMenuOpen(true)} className="min-h-touch flex-none rounded-full border border-[#C9D1DC] bg-surface px-3.5 text-[13px] font-semibold text-accent hover:bg-accent-soft">
              Read a device screen
            </button>
          </div>
          {(notice || dictation.error) && (
            <p className="bg-surface px-4 pb-1 text-xs font-semibold text-warn-fg" role="status" data-testid="assistant-notice">{notice || dictation.error}</p>
          )}
          {/* One rounded message box: + (photo menu) on the left, mic and send on the right. */}
          <form
            className="bg-surface px-4 pb-6 pt-1 sm:rounded-b-card sm:pb-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="photo-input" tabIndex={-1} aria-hidden="true" />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} tabIndex={-1} aria-hidden="true" />
            <div className="composer relative rounded-[24px] border border-[#C9D1DC] bg-surface p-1.5" data-testid="composer">
              {photo && (
                <div className="flex items-center gap-3 px-1.5 pb-1.5 pt-0.5" data-testid="photo-preview">
                  <img src={photo.previewUrl} alt="Photo ready to send" className="h-14 w-14 flex-none rounded-tile border border-line object-cover" />
                  <p className="min-w-0 flex-1 text-xs text-ink-3">Goes to Claude with your message. Not stored.</p>
                  <button type="button" className="btn-ghost min-h-touch px-3 text-xs" onClick={() => setPhoto(null)}>Remove</button>
                </div>
              )}
              <div className="flex items-center gap-1">
                <button
                  ref={plusRef}
                  type="button"
                  className={`${roundBtn} ${menuOpen ? 'bg-surface-2 text-ink' : ''}`}
                  onClick={() => setMenuOpen(!menuOpen)}
                  disabled={busy}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-controls="attach-menu"
                  aria-label="Add a photo"
                  data-testid="attach-button"
                >
                  <Icon d={ICONS.plus} size={22} />
                </button>
                <label htmlFor="assistant-input" className="sr-only">Message Evexia AI</label>
                <input
                  id="assistant-input"
                  ref={inputRef}
                  value={input}
                  maxLength={1000}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={dictation.listening ? 'Listening…' : photo ? 'Add a question (optional)' : 'Ask Evexia anything'}
                  className="h-11 min-w-0 flex-1 bg-transparent px-1.5 text-[15px] outline-none"
                />
                {dictation.supported && (
                  <button
                    type="button"
                    className={`${roundBtn} ${dictation.listening ? 'bg-crit-bg text-crit-fg hover:bg-crit-bg hover:text-crit-fg' : ''}`}
                    onClick={() => (dictation.listening ? dictation.stop() : dictation.start(input))}
                    disabled={busy}
                    aria-pressed={dictation.listening}
                    aria-label={dictation.listening ? 'Stop dictation' : 'Dictate a message'}
                    data-testid="mic-button"
                  >
                    <Icon d={dictation.listening ? ICONS.stop : ICONS.mic} />
                  </button>
                )}
                <button type="submit" disabled={busy || (!input.trim() && !photo)} aria-label="Send" className="btn-primary h-11 w-11 flex-none rounded-full p-0">
                  <Icon d={ICONS.send} />
                </button>
              </div>
              {menuOpen && (
                <div
                  ref={menuRef}
                  id="attach-menu"
                  role="menu"
                  aria-label="Add a photo"
                  onKeyDown={menuKeys}
                  className="rise absolute bottom-[calc(100%+8px)] left-0 z-10 w-60 rounded-card border border-line bg-surface p-1.5 shadow-float"
                  data-testid="attach-menu"
                >
                  <button type="button" role="menuitem" className={menuItem} onClick={() => choose('upload')}>
                    <Icon d={ICONS.image} />
                    Upload a photo
                  </button>
                  <button type="button" role="menuitem" className={menuItem} onClick={() => choose('camera')}>
                    <Icon d={ICONS.camera} />
                    Take a photo
                  </button>
                  {offline && <p className="px-3 pb-1.5 pt-1 text-xs text-ink-3">Photos need Claude. Go online first.</p>}
                </div>
              )}
            </div>
          </form>
          <p className="bg-surface px-4 pb-3 text-[11px] text-ink-3 sm:rounded-b-card">Decision support only. Not a diagnosis.</p>
        </aside>
      )}

      {cameraOpen && (
        <CameraDialog
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => {
            setCameraOpen(false);
            attachPhoto(file);
          }}
          onChooseFile={() => {
            setCameraOpen(false);
            fileRef.current?.click();
          }}
        />
      )}

      {report && (
        <EscalationDialog
          focusId={null}
          priority={report.priority}
          presetNote={report.note}
          onClose={() => setReport(null)}
        />
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        aria-expanded={open}
        aria-controls="assistant-panel"
        aria-label={aria}
        data-testid="assistant-open"
        className={`fixed bottom-[96px] right-4 z-40 flex items-center gap-3 rounded-full border border-line bg-surface p-1.5 shadow-float transition-[transform,box-shadow] hover:-translate-y-0.5 lg:bottom-6 lg:right-6 lg:rounded-[28px] lg:pr-5 ${open ? 'hidden sm:flex' : ''}`}
      >
        <span className="relative block h-[60px] w-[60px] flex-none lg:h-[76px] lg:w-[76px]" aria-hidden="true">
          <span className="absolute inset-0 block rounded-full bg-accent-soft" />
          <span className="orbit absolute inset-[5px] block rounded-full border-[1.5px] border-dashed border-[#9DB3F0]">
            <span className="absolute -top-1 left-1/2 block h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="absolute -top-3 left-1/2 block -translate-x-1/2">
            {reduced ? (
              <CompanionStill size={84} light={SEVERITY_META[worst].color} />
            ) : (
              <Suspense fallback={<CompanionStill size={84} light={SEVERITY_META[worst].color} />}>
                <Companion status={compStatus} waving={hover} thinking={busy} open={open} size={84} />
              </Suspense>
            )}
          </span>
          {flagged > 0 && !open && (
            <span className="absolute -right-1 -top-1 flex lg:hidden h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-white px-1 text-xs font-bold text-white" style={{ background: SEVERITY_META[worst].fg }}>
              {flagged}
            </span>
          )}
        </span>
        <span className="hidden flex-col text-left lg:flex">
          <span className="font-display text-[15px] font-bold text-ink">Ask Evexia AI</span>{' '}
          <span className="text-xs text-ink-3">{statusLine}</span>
        </span>
      </button>
    </>
  );
}
