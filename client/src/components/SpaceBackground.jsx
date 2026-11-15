import { useEffect, useRef } from 'react';
import { useHealthStore } from '../store/useHealthStore.js';

/**
 * Live space background (ported from ui-redesign/Live Space Background.html).
 * Parallax starfield drifting downward, twinkle, and occasional comets.
 * - Respects the in-app reduced-motion toggle, falling back to the OS setting: renders one static frame.
 * - Pauses while the tab is hidden; caps device-pixel ratio at 2; switched off in high-contrast mode.
 * - Purely decorative: aria-hidden, pointer-events none, sits behind everything.
 */
export default function SpaceBackground() {
  const ref = useRef(null);
  const pref = useHealthStore((s) => s.reducedMotion);
  const highContrast = useHealthStore((s) => s.highContrast);
  const light = useHealthStore((s) => s.theme) === 'light';

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || highContrast) return undefined;
    const ctx = canvas.getContext('2d');
    const reduce = pref ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Light theme: a pale dawn sky with faint slate stars and soft blue comets.
    const P = light
      ? { near: '#3B6FB6', warm: '#C2414A', far: '#64748B', alpha: 0.55, head: 'rgba(59,111,182,0.85)', trail: 'rgba(59,111,182,0.35)', fade: 'rgba(59,111,182,0)' }
      : { near: '#bfe9ff', warm: '#ffc9cc', far: '#e2e8f0', alpha: 1, head: 'rgba(255,255,255,0.95)', trail: 'rgba(125,211,252,0.6)', fade: 'rgba(125,211,252,0)' };
    let w = 0, h = 0, dpr = 1, stars = [], comets = [], last = 0, nextComet = 0, raf = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(Math.round((w * h) / 5200), 520);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random() * 0.9 + 0.1,
        size: Math.random() * 1.2 + 0.3,
        twinkle: Math.random() * Math.PI * 2,
        tint: Math.random(),
      }));
    }

    function spawnComet(now) {
      const fromLeft = Math.random() < 0.5;
      const speed = 6 + Math.random() * 6;
      const angle = ((Math.random() * 25 + 20) * Math.PI) / 180;
      comets.push({
        x: fromLeft ? -40 : w + 40,
        y: Math.random() * h * 0.6,
        vx: (fromLeft ? 1 : -1) * Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: 120 + Math.random() * 140,
      });
      nextComet = now + 3500 + Math.random() * 5000;
    }

    function drawStars(t, dt) {
      for (const s of stars) {
        if (!reduce) {
          s.y += s.z * 12 * dt;
          if (s.y > h + 2) {
            s.y = -2;
            s.x = Math.random() * w;
          }
        }
        const a = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.0015 * s.z + s.twinkle));
        ctx.globalAlpha = a * (0.4 + 0.6 * s.z) * P.alpha;
        ctx.fillStyle = s.z > 0.8 ? P.near : s.tint > 0.93 ? P.warm : P.far;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * s.z, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawComets(t, dt) {
      if (!reduce && t > nextComet) spawnComet(t);
      comets = comets.filter((c) => c.x > -300 && c.x < w + 300 && c.y < h + 300);
      for (const c of comets) {
        c.x += c.vx * dt * 60;
        c.y += c.vy * dt * 60;
        const mag = Math.hypot(c.vx, c.vy);
        const tx = c.x - (c.vx / mag) * c.length;
        const ty = c.y - (c.vy / mag) * c.length;
        const grad = ctx.createLinearGradient(c.x, c.y, tx, ty);
        grad.addColorStop(0, P.head);
        grad.addColorStop(0.25, P.trail);
        grad.addColorStop(1, P.fade);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 14);
        halo.addColorStop(0, P.head);
        halo.addColorStop(1, P.fade);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 14, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame(t) {
      // ~30 fps is plenty for a slow drift.
      if (!reduce && t - last < 32) {
        if (!document.hidden) raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      ctx.clearRect(0, 0, w, h);
      drawStars(t, dt);
      drawComets(t, dt);
      if (!reduce && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    const onResize = () => {
      resize();
      if (reduce) frame(performance.now());
    };
    const onVisibility = () => {
      if (!document.hidden && !reduce) start();
    };

    resize();
    start();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pref, highContrast, light]);

  // High contrast: plain background (black, or white in the light theme), no moving stars behind text.
  if (highContrast) return <div className="pointer-events-none fixed inset-0 -z-10 bg-bg" aria-hidden="true" />;

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 bg-bg" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background:
            light
              ? 'radial-gradient(ellipse at 70% 10%, rgba(79,209,197,.16), transparent 55%),' +
                'radial-gradient(ellipse at 15% 95%, rgba(129,140,248,.16), transparent 60%),' +
                'radial-gradient(ellipse at 95% 85%, rgba(215,51,58,.07), transparent 50%),' +
                'linear-gradient(180deg, #F6F8FC 0%, #E7EDF7 100%)'
              : 'radial-gradient(ellipse at 70% 20%, rgba(79,209,197,.10), transparent 55%),' +
                'radial-gradient(ellipse at 20% 90%, rgba(99,102,241,.12), transparent 60%),' +
                'radial-gradient(ellipse at 95% 85%, rgba(215,51,58,.08), transparent 50%)',
        }}
      />
      <canvas ref={ref} data-space-bg="" className="absolute inset-0 h-full w-full" />
    </div>
  );
}
