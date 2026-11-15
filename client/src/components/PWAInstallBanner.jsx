import { useState, useEffect } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall.js';
import InstallDialog from './InstallDialog.jsx';

export default function PWAInstallBanner({ delayMs = 2000 }) {
  const { isStandalone, showInstructions, installApp, closeInstructions } = usePWAInstall();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.sessionStorage?.getItem('evexia_pwa_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // If running in standalone mode (already installed), never show the prompt
    if (isStandalone || dismissed) {
      setVisible(false);
      return undefined;
    }

    // Show the prompt at the top corner after the specified delay (default 2 seconds)
    const timer = setTimeout(() => {
      setVisible(true);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [isStandalone, dismissed, delayMs]);

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    try {
      window.sessionStorage?.setItem('evexia_pwa_banner_dismissed', 'true');
    } catch {
      // ignore
    }
  };

  const handleInstall = async () => {
    const res = await installApp();
    if (res?.installed) {
      handleDismiss();
    }
  };

  return (
    <>
      {visible && (
        <aside
          role="region"
          aria-label="Install Evexia application"
          className="rise fixed right-4 top-16 z-[90] w-[calc(100%-2rem)] max-w-sm rounded-card border border-ink/15 bg-surface/95 p-4 text-ink shadow-float backdrop-blur-md sm:right-6 sm:top-20"
          data-testid="pwa-install-banner"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-glow">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-bold text-ink">Install Evexia App</h3>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-full p-1 text-ink-3 transition-colors hover:bg-ink/[0.08] hover:text-ink"
                  aria-label="Dismiss install prompt"
                  data-testid="pwa-dismiss-banner"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                Install on your device for one-click access and full offline medical monitoring.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleInstall}
                  className="btn-primary min-h-[36px] rounded-input px-3.5 text-xs font-semibold"
                  data-testid="pwa-banner-install-button"
                >
                  Install app
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="min-h-[36px] px-3 text-xs font-medium text-ink-3 hover:text-ink"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}
      <InstallDialog open={showInstructions} onClose={closeInstructions} />
    </>
  );
}
