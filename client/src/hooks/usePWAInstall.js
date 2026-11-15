import { useState, useEffect, useCallback } from 'react';

// Keep the captured prompt in module scope so early events before component mount are not lost
let deferredPrompt = null;
const promptListeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar on mobile so we can trigger our own polished prompt
    e.preventDefault();
    deferredPrompt = e;
    promptListeners.forEach((listener) => listener(deferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    promptListeners.forEach((listener) => listener(null));
  });
}

export function usePWAInstall() {
  const [prompt, setPrompt] = useState(deferredPrompt);
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator?.standalone === true
    );
  });
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const handlePromptChange = (newPrompt) => {
      setPrompt(newPrompt);
    };
    promptListeners.add(handlePromptChange);

    const mql = window.matchMedia?.('(display-mode: standalone)');
    const handleMql = (e) => setIsStandalone(e.matches);
    mql?.addEventListener?.('change', handleMql);

    return () => {
      promptListeners.delete(handlePromptChange);
      mql?.removeEventListener?.('change', handleMql);
    };
  }, []);

  const installApp = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice?.outcome === 'accepted') {
          deferredPrompt = null;
          setPrompt(null);
          return { installed: true };
        }
        return { installed: false, cancelled: true };
      } catch (err) {
        console.error('Install prompt failed:', err);
      }
    }
    // If native prompt is not available (e.g. iOS Safari, Firefox, or already rejected),
    // show instructions modal
    setShowInstructions(true);
    return { installed: false, needsGuide: true };
  }, []);

  const closeInstructions = useCallback(() => {
    setShowInstructions(false);
  }, []);

  return {
    canInstallPrompt: Boolean(prompt) && !isStandalone,
    isStandalone,
    showInstructions,
    installApp,
    closeInstructions,
  };
}
