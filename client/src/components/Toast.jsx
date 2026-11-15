import { useEffect } from 'react';
import { useHealthStore } from '../store/useHealthStore.js';

export default function Toast() {
  const toast = useHealthStore((s) => s.toast);
  const clear = useHealthStore((s) => s.clearToast);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(clear, 5000);
    return () => clearTimeout(id);
  }, [toast, clear]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4" aria-live="polite" role="status">
      {toast && (
        <p
          className={`pointer-events-auto rounded-md border bg-surface px-4 py-3 text-sm shadow-xl ${
            toast.tone === 'ok' ? 'border-ok-dot' : toast.tone === 'warn' ? 'border-warn-dot' : 'border-accent'
          }`}
          data-testid="toast"
        >
          {toast.message}
        </p>
      )}
    </div>
  );
}
