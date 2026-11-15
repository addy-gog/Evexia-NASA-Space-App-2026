/**
 * Live camera for laptops and desktops, where <input capture> just opens a file
 * picker. Phones use their own camera app instead (see AIDock).
 *
 * Limits: the browser asks permission first, and only allows the camera on
 * localhost or HTTPS. If it is blocked or missing, the astronaut can pick a file.
 */
import { useEffect, useRef, useState } from 'react';

export default function CameraDialog({ onCapture, onClose, onChooseFile }) {
  const dialogRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [state, setState] = useState('starting'); // starting | live | error
  const [error, setError] = useState('');

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot open the camera here. Choose a photo file instead.');
        setState('error');
        return;
      }
      try {
        // Prefer the back camera on tablets; laptops just use their webcam.
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setState('live');
      } catch (err) {
        const blocked = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
        const none = err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError';
        setError(blocked ? 'Camera access is blocked. Allow it in the browser, or choose a photo file instead.' : none ? 'No camera found on this device. Choose a photo file instead.' : 'The camera could not start. Choose a photo file instead.');
        setState('error');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const shoot = () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) onCapture(new File([blob], 'camera.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="camera-title"
      className="m-auto w-[min(640px,96vw)] rounded-card border border-line bg-surface p-0 text-ink shadow-panel backdrop:bg-[#0E1726]/60"
      data-testid="camera-dialog"
    >
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id="camera-title" className="text-lg font-bold">Take a photo</h2>
        <button type="button" className="btn-ghost h-11 w-11 p-0" onClick={onClose} aria-label="Close camera">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <div className="p-4">
        {state === 'error' ? (
          <p className="rounded-tile bg-warn-bg p-3 text-sm font-semibold text-warn-fg" role="alert">{error}</p>
        ) : (
          <div className="relative overflow-hidden rounded-tile bg-[#0E1726]">
            {/* Not mirrored, so the numbers on a device screen read the right way round. */}
            <video ref={videoRef} autoPlay playsInline muted className="block aspect-[4/3] w-full object-cover" aria-label="Camera preview" />
            {state === 'starting' && <p className="absolute inset-0 grid place-items-center text-sm text-white" role="status">Starting the camera…</p>}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-3">Fill the frame with the device screen and hold still. The photo goes to Claude with your message and is not stored.</p>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        {state !== 'error' && (
          <button type="button" className="btn-primary" onClick={shoot} disabled={state !== 'live'} data-testid="camera-shoot">Take photo</button>
        )}
        <button type="button" className="btn-ghost" onClick={onChooseFile}>Choose a file instead</button>
        <button type="button" className="btn-ghost ml-auto" onClick={onClose}>Cancel</button>
      </footer>
    </dialog>
  );
}
