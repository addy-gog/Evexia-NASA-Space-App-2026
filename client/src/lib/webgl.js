/**
 * True when this browser can create a WebGL context. Any three.js canvas must check this
 * first: creating a renderer without WebGL throws, and an uncaught throw blanks the whole app.
 * The answer is cached, since it cannot change during a visit.
 */
let cached;
export function hasWebGL() {
  if (cached !== undefined) return cached;
  try {
    const c = document.createElement('canvas');
    cached = Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    cached = false;
  }
  return cached;
}
