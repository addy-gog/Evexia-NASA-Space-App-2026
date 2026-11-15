/**
 * AI dock (bottom-right) with the 3D companion, and the assistant panel.
 * Online: Claude through the server. Offline (toggle, no key, or no link):
 * the rule-based engine. The dock is one real <button> with aria-expanded; the
 * canvas is decorative and its information is repeated in the dock text.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useHealthStore, usePrefersReducedMotion } from '../../store/useHealthStore.js';
import { api } from '../../lib/api.js';
import { ruleBasedAnswer, summaryMessage } from '../../lib/ruleAssistant.js';
import { sleepHistoryBefore } from '../../lib/evaluate.js';
import { ENVIRONMENTS, INDICATORS } from '../../config/thresholds.js';
import { SEVERITY_META } from '../Status.jsx';
import CompanionStill from './CompanionStill.jsx';

const Companion = lazy(() => import('./Companion.jsx'));
const CHIPS = ['What should I do first?', 'Why does the delay matter?', 'Draft a report'];

function useWorst(status) {
  const sevs = INDICATORS.map((m) => status.results[m.id]?.severity).filter(Boolean);
  const flagged = sevs.filter((s) => s !== 'green').length;
  const worst = sevs.includes('red') ? 'red' : sevs.includes('amber') ? 'amber' : 'green';
  return { worst, flagged };
}

export default function AIDock() {
  const status = useHealthStore((s) => s.status);
  const environment = useHealthStore((s) => s.environment);
  const delaySeconds = useHealthStore((s) => s.delaySeconds);
  const profile = useHealthStore((s) => s.profile);
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [offline, setOffline] = useState(false);
  const [fallback, setFallback] = useState(false); // server answered with offline guidance
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const { worst, flagged } = useWorst(status);
  const compStatus = { green: 'ok', amber: 'warn', red: 'crit' }[worst];
  const envLabel = ENVIRONMENTS[environment].label;
  const ruleCtx = useMemo(
    () => ({ results: status.results, delaySeconds, environmentLabel: envLabel, score: status.score.score, tier: status.score.band?.label ?? '', missionDay: status.missionDay, crewName: profile?.name }),
    [status, delaySeconds, envLabel, profile],
  );
  const shown = messages ?? [{ role: 'assistant', text: summaryMessage(ruleCtx) }];

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [shown.length, busy]);

  const ask = async (question) => {
    const q = question.trim();
    if (!q || busy) return;
    const base = shown;
    setMessages([...base, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    const s = useHealthStore.getState();
    let reply;
    if (offline) {
      await new Promise((r) => setTimeout(r, 350));
      reply = { text: ruleBasedAnswer(q, ruleCtx), mode: 'offline' };
    } else {
      try {
        const res = await api.assistant(q, {
          environment: s.environment,
          delaySeconds: s.delaySeconds,
          reading: s.status.reading,
          sleepHistory: s.status.snapshot.sleep ? sleepHistoryBefore(s.crewLogs, s.status.snapshot.sleep.ts) : [],
          missionDay: s.status.missionDay,
          baselineMode: s.baselineMode,
          baseline: s.baseline,
        });
        // The server's offline answer covers single readings; chip intents use the richer local engine.
        reply = res.mode === 'ai' ? { text: res.answer, mode: 'ai' } : { text: ruleBasedAnswer(q, ruleCtx), mode: 'offline' };
      } catch {
        reply = { text: ruleBasedAnswer(q, ruleCtx), mode: 'offline' };
      }
    }
    setFallback(reply.mode === 'offline');
    setMessages([...base, { role: 'user', text: q }, { role: 'assistant', text: reply.text, mode: reply.mode }]);
    setBusy(false);
  };

  // Starts with the visible text ("Ask Evexia AI" + status line) so voice-control users can say what they see; aria-expanded gives open/closed.
  const statusLine = open ? 'Tap to minimise' : flagged ? `${flagged} item${flagged > 1 ? 's' : ''} to review` : 'All nominal · ask anything';
  const aria = `Ask Evexia AI, ${statusLine}`;
  const modeText = offline ? 'Offline · rule-based fallback' : fallback ? 'Online · rule-based (no Claude key)' : 'Online · powered by Claude';

  return (
    <>
      {open && (
        <aside
          id="assistant-panel"
          className="rise fixed inset-0 z-50 flex flex-col bg-bg sm:inset-auto sm:bottom-[132px] sm:right-6 sm:h-[min(600px,72vh)] sm:w-[380px] sm:rounded-card sm:border sm:border-line sm:bg-surface sm:shadow-panel"
          aria-label="Evexia AI assistant"
          data-testid="assistant-panel"
        >
          <header className="flex items-center gap-2 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="whitespace-nowrap font-display text-lg font-bold">Evexia AI</h2>
              <p className={`truncate text-xs font-semibold ${busy ? 'text-accent' : 'text-ink-3'}`}>{busy ? 'Thinking…' : modeText}</p>
            </div>
            <button type="button" className="btn-ghost min-h-touch px-3 text-xs" aria-pressed={offline} onClick={() => setOffline(!offline)} data-testid="online-toggle">
              {offline ? 'Go online' : 'Use offline'}
            </button>
            <button type="button" className="btn-ghost h-11 w-11 p-0" onClick={() => setOpen(false)} aria-label="Close assistant">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
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
            {shown.map((m, i) => (
              <div
                key={i}
                className={`max-w-[88%] whitespace-pre-wrap px-3.5 py-2.5 text-sm ${m.role === 'user' ? 'self-end rounded-[16px_16px_4px_16px] bg-accent text-white' : 'self-start rounded-[16px_16px_16px_4px] border border-[#E6EAF0] bg-surface'}`}
                data-role={m.role}
              >
                {m.text}
              </div>
            ))}
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
          </div>
          <form
            className="flex gap-2 border-t border-line bg-surface px-4 pb-6 pt-2 sm:rounded-b-card sm:pb-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <label htmlFor="assistant-input" className="sr-only">Message Evexia AI</label>
            <input id="assistant-input" ref={inputRef} value={input} maxLength={1000} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a reading…" className="h-12 min-w-0 flex-1 rounded-tile border border-[#C9D1DC] bg-surface px-3.5 text-[15px]" />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="btn-primary h-12 w-12 p-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </form>
          <p className="bg-surface px-4 pb-3 text-[11px] text-ink-3 sm:rounded-b-card">Decision support only. Not a diagnosis.</p>
        </aside>
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
