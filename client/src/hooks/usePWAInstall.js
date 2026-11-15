import { useState, useEffect, useCallback } from 'react';

// Module-level state to guarantee early events before component mount are captured,
// and state remains synchronized across all header/banner/menu components.
let deferredPrompt = null;
let instructionsOpen = false;
const promptListeners = new Set();
const instructionListeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent default mini-infobar so we control the prompt
    e.preventDefault();
    deferredPrompt = e;
    promptListeners.forEach((listener) => listener(deferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    instructionsOpen = false;
    promptListeners.forEach((listener) => listener(null));
    instructionListeners.forEach((listener) => listener(false));
  });
}

export function usePWAInstall() {
  const [prompt, setPrompt] = useState(deferredPrompt);
  const [showInstructions, setShowInstructions] = useState(instructionsOpen);
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator?.standalone === true
    );
  });

  useEffect(() => {
    const handlePromptChange = (newPrompt) => {
      setPrompt(newPrompt);
    };
    const handleInstructionChange = (isOpen) => {
      setShowInstructions(isOpen);
    };

    promptListeners.add(handlePromptChange);
    instructionListeners.add(handleInstructionChange);

    const mql = window.matchMedia?.('(display-mode: standalone)');
    const handleMql = (e) => setIsStandalone(e.matches);
    mql?.addEventListener?.('change', handleMql);

    return () => {
      promptListeners.delete(handlePromptChange);
      instructionListeners.delete(handleInstructionChange);
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
    // If native prompt is not available, open the guide dialog
    instructionsOpen = true;
    instructionListeners.forEach((fn) => fn(true));
    return { installed: false, needsGuide: true };
  }, []);

  const closeInstructions = useCallback(() => {
    instructionsOpen = false;
    instructionListeners.forEach((fn) => fn(false));
  }, []);

  return {
    canInstallPrompt: Boolean(prompt) && !isStandalone,
    isStandalone,
    showInstructions,
    installApp,
    closeInstructions,
  };
}
