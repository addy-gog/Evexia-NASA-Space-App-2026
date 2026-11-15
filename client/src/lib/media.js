/**
 * Browser media helpers for the assistant: shrink a photo before upload,
 * dictation (speech to text) and read-aloud (text to speech).
 *
 * Limits worth knowing:
 * - Dictation uses the browser's SpeechRecognition. Chrome and Edge send the
 *   audio to their own servers, so it needs a network link; Firefox has none.
 * - Read-aloud uses speechSynthesis, which runs on the device and works offline.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_PHOTO_EDGE = 1280;

/** Resize an image file to at most 1280 px on its long edge, as JPEG. */
export async function preparePhoto(file, maxEdge = MAX_PHOTO_EDGE) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('Choose an image file.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This image could not be opened.'));
      el.src = url;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black in JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { mediaType: 'image/jpeg', data: dataUrl.split(',')[1], previewUrl: dataUrl, width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;
export const dictationSupported = Boolean(Recognition);
export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

/**
 * Dictation into a text field. `onText(finalText)` is called with the words
 * heard so far in this session (final + interim), so the field updates live.
 */
export function useDictation(onText) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const rec = useRef(null);
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(
    (prefix = '') => {
      if (!Recognition) return;
      setError('');
      const r = new Recognition();
      r.lang = 'en-GB';
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (e) => {
        let heard = '';
        for (let i = 0; i < e.results.length; i += 1) heard += e.results[i][0].transcript;
        cb.current(`${prefix}${prefix && heard ? ' ' : ''}${heard}`.trimStart());
      };
      r.onerror = (e) => {
        const msg = {
          'not-allowed': 'Microphone access is blocked. Allow it in the browser to dictate.',
          'service-not-allowed': 'Microphone access is blocked. Allow it in the browser to dictate.',
          network: 'Dictation needs a network link in this browser. Type instead.',
          'no-speech': 'No speech heard. Tap the microphone and try again.',
        }[e.error];
        setError(msg || 'Dictation stopped. Type instead.');
      };
      r.onend = () => setListening(false);
      rec.current = r;
      try {
        r.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    },
    [],
  );

  useEffect(() => () => rec.current?.abort?.(), []);
  return { supported: dictationSupported, listening, error, start, stop };
}

/** Read a message aloud. Only one message speaks at a time. */
export function useSpeaker() {
  const [speakingId, setSpeakingId] = useState(null);
  const stop = useCallback(() => {
    if (speechSupported) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, []);
  const speak = useCallback(
    (id, text) => {
      if (!speechSupported) return;
      window.speechSynthesis.cancel();
      // Square-bracket source tags read badly aloud; say them as "source: ...".
      const u = new window.SpeechSynthesisUtterance(text.replace(/\[([^\]]+)\]/g, '(source: $1)').replace(/^- /gm, ''));
      u.lang = 'en-GB';
      u.rate = 1;
      u.onend = () => setSpeakingId((cur) => (cur === id ? null : cur));
      u.onerror = u.onend;
      setSpeakingId(id);
      window.speechSynthesis.speak(u);
    },
    [],
  );
  useEffect(() => () => speechSupported && window.speechSynthesis.cancel(), []);
  return { supported: speechSupported, speakingId, speak, stop };
}
