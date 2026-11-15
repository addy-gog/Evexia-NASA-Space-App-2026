import { useEffect, useRef } from 'react';

export default function InstallDialog({ open, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('pointerdown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('pointerdown', handleClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-dialog-title"
    >
      <div
        ref={ref}
        className="rise max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card border border-ink/10 bg-surface p-6 shadow-float"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            </div>
            <div>
              <h2 id="install-dialog-title" className="text-base font-bold text-ink">
                Install Evexia
              </h2>
              <p className="text-xs text-ink-3">Standalone offline medical console</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-ink/[0.08] hover:text-ink"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 pt-4 text-sm text-ink-2">
          <p className="text-xs leading-relaxed">
            Installing Evexia adds an app icon to your home screen or desktop. It opens in its own window without browser toolbars and works fully offline during deep space communication blackouts.
          </p>

          <div className="space-y-3 rounded-card border border-line bg-ink/[0.02] p-3">
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent-text">
                1
              </span>
              <div>
                <p className="font-semibold text-ink">Desktop (Chrome, Edge, Brave)</p>
                <p className="text-xs text-ink-3">
                  Click the install icon in the right side of the address bar, or open the browser menu (⋮) and select <span className="font-medium text-ink">Install Evexia</span>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent-text">
                2
              </span>
              <div>
                <p className="font-semibold text-ink">iPhone &amp; iPad (Safari)</p>
                <p className="text-xs text-ink-3">
                  Tap the <span className="font-medium text-ink">Share</span> button (square with arrow up), scroll down, and tap <span className="font-medium text-ink">Add to Home Screen</span>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent-text">
                3
              </span>
              <div>
                <p className="font-semibold text-ink">Android (Chrome)</p>
                <p className="text-xs text-ink-3">
                  Tap the three dots (⋮) in the top right and select <span className="font-medium text-ink">Install app</span> or <span className="font-medium text-ink">Add to Home screen</span>.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary min-h-touch px-4 text-xs font-semibold"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
