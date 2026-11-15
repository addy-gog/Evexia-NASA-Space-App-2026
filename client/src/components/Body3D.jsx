/**
 * 3D body map (lazy-loaded). A light "clinical" body built from three.js
 * primitives, with six status hotspots (forehead, temple, heart, upper arm,
 * abdomen, pelvis) rendered as real <button>s through drei <Html>, a dashed
 * whole-body radiation aura, yaw-only orbit (±40°) and rotate buttons.
 * Mesh names match a processed anatomy GLB so a real model can be swapped in.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { SEVERITY_META, GRADE_OF } from './Status.jsx';
import { HOTSPOTS } from '../config/fields.js';

const BODY = '#1C2B4F';
const SEAM = '#6D86C0';
const NONE = '#6B7894';
const YAW_LIMIT = (40 * Math.PI) / 180;

const SILHOUETTE = [
  ['sphere', [0.19], [0, 1.58, 0], [0, 0, 0], [1, 1.12, 1.05]],
  ['cyl', [0.07, 0.07, 0.16], [0, 1.36, 0], [0, 0, 0], [1, 1, 1]],
  ['capsule', [0.27, 0.45], [0, 0.95, 0], [0, 0, 0], [1, 1, 0.62]],
  ['capsule', [0.24, 0.25], [0, 0.5, 0], [0, 0, 0], [1, 1, 0.6]],
  ['sphere', [0.25], [0, 0.18, 0], [0, 0, 0], [1.05, 0.7, 0.65]],
  ['capsule', [0.065, 0.42], [0.36, 1.0, 0], [0, 0, 0.12], [1, 1, 1]],
  ['capsule', [0.065, 0.42], [-0.36, 1.0, 0], [0, 0, -0.12], [1, 1, 1]],
  ['capsule', [0.055, 0.4], [0.42, 0.52, 0.02], [0, 0, 0.05], [1, 1, 1]],
  ['capsule', [0.055, 0.4], [-0.42, 0.52, 0.02], [0, 0, -0.05], [1, 1, 1]],
  ['sphere', [0.065], [0.44, 0.22, 0.03], [0, 0, 0], [0.8, 1.2, 0.6]],
  ['sphere', [0.065], [-0.44, 0.22, 0.03], [0, 0, 0], [0.8, 1.2, 0.6]],
  ['capsule', [0.1, 0.55], [0.13, -0.27, 0], [0, 0, 0.02], [1, 1, 1]],
  ['capsule', [0.1, 0.55], [-0.13, -0.27, 0], [0, 0, -0.02], [1, 1, 1]],
  ['capsule', [0.075, 0.55], [0.14, -0.92, 0], [0, 0, 0], [1, 1, 1]],
  ['capsule', [0.075, 0.55], [-0.14, -0.92, 0], [0, 0, 0], [1, 1, 1]],
  ['box', [0.1, 0.06, 0.22], [0.14, -1.27, 0.06], [0, 0, 0], [1, 1, 1]],
  ['box', [0.1, 0.06, 0.22], [-0.14, -1.27, 0.06], [0, 0, 0], [1, 1, 1]],
];

function Geometry({ kind, args }) {
  if (kind === 'sphere') return <sphereGeometry args={[args[0], 32, 24]} />;
  if (kind === 'cyl') return <cylinderGeometry args={[...args, 16]} />;
  if (kind === 'capsule') return <capsuleGeometry args={[args[0], args[1], 8, 20]} />;
  return <boxGeometry args={args} />;
}

function useStatusMaterial(severity, opacity = 0.9) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05, transparent: true }), []);
  useEffect(() => () => m.dispose(), [m]);
  useEffect(() => {
    const c = new THREE.Color(severity ? SEVERITY_META[severity].color : NONE);
    m.color.copy(c);
    m.emissive.copy(c);
    m.emissiveIntensity = severity === 'red' ? 0.35 : severity === 'amber' ? 0.25 : 0.12;
    m.opacity = opacity;
  }, [severity, m, opacity]);
  return m;
}

function Body({ sev }) {
  const skin = useMemo(() => new THREE.MeshStandardMaterial({ color: BODY, emissive: BODY, emissiveIntensity: 0.45, roughness: 0.8, metalness: 0, transparent: true, opacity: 0.95 }), []);
  const seam = useMemo(() => new THREE.MeshBasicMaterial({ color: SEAM, wireframe: true, transparent: true, opacity: 0.22 }), []);
  useEffect(() => () => { skin.dispose(); seam.dispose(); }, [skin, seam]);
  const heart = useStatusMaterial(sev.hr);
  const brain = useStatusMaterial(sev.sleep, 0.75);
  const pancreas = useStatusMaterial(sev.glucose);
  const vessels = useStatusMaterial(sev.bp);
  const marrow = useStatusMaterial(sev.radiation, 0.7);
  const aorta = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.05, 0.98, 0.06), new THREE.Vector3(0.02, 1.14, 0.06), new THREE.Vector3(-0.06, 1.12, 0.02),
      new THREE.Vector3(-0.05, 0.9, -0.02), new THREE.Vector3(-0.03, 0.55, -0.02), new THREE.Vector3(-0.02, 0.25, 0),
    ]);
    return new THREE.TubeGeometry(curve, 64, 0.02, 10, false);
  }, []);
  useEffect(() => () => aorta.dispose(), [aorta]);
  return (
    <group>
      <group name="skin_shell">
        {SILHOUETTE.map(([kind, args, pos, rot, scale], i) => (
          <mesh key={i} position={pos} rotation={rot} scale={scale} material={skin}>
            <Geometry kind={kind} args={args} />
          </mesh>
        ))}
      </group>
      <group name="seams">
        {SILHOUETTE.map(([kind, args, pos, rot, scale], i) => (
          <mesh key={i} position={pos} rotation={rot} scale={scale.map((x) => x * 1.004)} material={seam}>
            <Geometry kind={kind} args={args} />
          </mesh>
        ))}
      </group>
      <mesh name="brain" position={[0, 1.62, 0]} scale={[1, 0.85, 1.12]} material={brain}><sphereGeometry args={[0.12, 32, 24]} /></mesh>
      <mesh name="heart" position={[0.06, 0.98, 0.07]} rotation={[0, 0, -0.4]} scale={[0.9, 1.15, 0.85]} material={heart}><sphereGeometry args={[0.075, 32, 24]} /></mesh>
      <group name="vessels">
        <mesh geometry={aorta} material={vessels} />
        <mesh position={[-0.36, 1.0, 0.03]} rotation={[0, 0, -0.12]} material={vessels}><cylinderGeometry args={[0.016, 0.016, 0.4, 8]} /></mesh>
      </group>
      <mesh name="pancreas" position={[0.03, 0.5, 0.07]} rotation={[0, 0, Math.PI / 2 - 0.2]} material={pancreas}><capsuleGeometry args={[0.035, 0.17, 6, 12]} /></mesh>
      <group name="skeleton">
        <mesh position={[0, 0.78, -0.08]} material={marrow}><cylinderGeometry args={[0.024, 0.024, 1.15, 10]} /></mesh>
        <mesh position={[0, 0.17, -0.02]} rotation={[Math.PI / 2, 0, 0]} material={marrow}><torusGeometry args={[0.16, 0.03, 10, 32]} /></mesh>
      </group>
    </group>
  );
}

/** Dashed whole-body aura in the radiation status colour. */
function RadiationAura({ severity }) {
  const pts = useMemo(() => {
    const out = [];
    for (let i = 0; i <= 96; i += 1) {
      const a = (i / 96) * Math.PI * 2;
      out.push([Math.cos(a) * 0.82, 0.25 + Math.sin(a) * 1.72, 0]);
    }
    return out;
  }, []);
  return (
    <Billboard>
      <Line points={pts} color={severity ? SEVERITY_META[severity].color : NONE} lineWidth={1.5} dashed dashSize={0.06} gapSize={0.08} transparent opacity={0.9} />
    </Billboard>
  );
}

/** A hotspot: status glow, pulse ring (3.2 / 1.6 / 1 s), 44 px button and a pill label. */
function Hotspot({ id, r, selected, onSelect }) {
  const h = HOTSPOTS[id];
  const sev = r?.severity;
  const m = sev ? SEVERITY_META[sev] : null;
  const g = sev ? GRADE_OF[sev] : 0;
  return (
    <Html position={h.anchor} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'relative', width: 0, height: 0 }} data-region={id} data-severity={sev ?? 'none'}>
        {m && <span aria-hidden="true" style={{ position: 'absolute', left: -40, top: -40, width: 80, height: 80, borderRadius: '50%', background: `radial-gradient(circle, ${m.glow} 0%, rgba(255,255,255,0) 70%)` }} />}
        {m && <span aria-hidden="true" className={`ring-g${g}`} style={{ position: 'absolute', left: -10, top: -10, width: 20, height: 20, borderRadius: '50%', border: `2px solid ${m.color}`, boxSizing: 'border-box' }} />}
        <button
          type="button"
          onClick={() => onSelect(id)}
          aria-pressed={selected}
          aria-label={r ? `${r.label}: ${r.valueText}, ${m.label}. Show details.` : `${h.short}: no current reading. Show details.`}
          data-testid={`hotspot-${id}`}
          style={{ position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: '50%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}
        >
          <span style={{ width: selected ? 22 : 18, height: selected ? 22 : 18, borderRadius: '50%', background: m ? m.color : NONE, border: '3px solid #FFFFFF', boxShadow: selected ? '0 0 0 3px rgba(255,77,85,.45), 0 2px 8px rgba(0,0,0,.5)' : '0 2px 6px rgba(0,0,0,.3)', display: 'block' }} />
        </button>
        <span
          className="font-mono"
          style={{
            position: 'absolute',
            [h.side === 'left' ? 'right' : 'left']: 26,
            top: -15,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 999,
            background: 'rgb(var(--c-surface) / 0.88)',
            border: `1px solid ${selected ? '#FF4D55' : m ? m.line : 'rgb(var(--c-line))'}`,
            boxShadow: '0 4px 14px rgba(0,0,0,.3)',
            fontSize: 12,
            fontWeight: 600,
            color: 'rgb(var(--c-ink))',
          }}
          aria-hidden="true"
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: m ? m.color : NONE, display: 'block' }} />
          <span style={{ fontFamily: 'Inter, sans-serif', color: '#96A3BD' }}>{h.short}</span>
          {r ? r.shortValue : '—'}
        </span>
      </div>
    </Html>
  );
}

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;
function FrameLimiter({ fps }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = setInterval(() => invalidate(), 1000 / fps);
    return () => clearInterval(id);
  }, [fps, invalidate]);
  return null;
}

function Scene({ regions, selected, onSelect, yaw, reduced }) {
  const group = useRef();
  useFrame((_, dt) => {
    if (!group.current) return;
    const k = reduced ? 1 : Math.min(1, dt * 6);
    group.current.rotation.y += (yaw - group.current.rotation.y) * k;
  });
  const sev = Object.fromEntries(Object.entries(regions).map(([k, v]) => [k, v?.severity]));
  return (
    <group ref={group}>
      <Body sev={sev} />
      <RadiationAura severity={sev.radiation} />
      {Object.keys(HOTSPOTS).map((id) => (
        <Hotspot key={id} id={id} r={regions[id]} selected={selected === id} onSelect={onSelect} />
      ))}
    </group>
  );
}

/**
 * @param {object} props.regions   { [indicatorId]: { severity, label, valueText, shortValue } | null }
 * @param {string} props.selected  selected indicator id
 * @param {(id) => void} props.onSelect
 * @param {number} props.yaw       radians, clamped to ±40°
 */
export default function Body3D({ regions, selected, onSelect, yaw = 0, reduced }) {
  const [software, setSoftware] = useState(false);
  const capped = software || reduced;
  return (
    <div className="relative h-full w-full" data-testid="body-3d">
      <Canvas
        camera={{ position: [0, 0.25, 4.7], fov: 40, near: 0.1, far: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        frameloop={capped ? 'demand' : 'always'}
        onCreated={({ gl }) => {
          // Hide only the drawing surface: the hotspot buttons rendered beside it must stay accessible.
          gl.domElement.setAttribute('aria-hidden', 'true');
          try {
            const ctx = gl.getContext();
            const ext = ctx.getExtension('WEBGL_debug_renderer_info');
            setSoftware(SOFTWARE_RENDERER.test(String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '')));
          } catch {
            /* ignore */
          }
        }}
      >
        {capped && <FrameLimiter fps={software ? 12 : 20} />}
        <ambientLight intensity={1.1} />
        <hemisphereLight args={['#FFFFFF', '#C9D2DF', 0.6]} />
        <directionalLight position={[2, 3, 4]} intensity={0.8} />
        <directionalLight position={[-3, 1, -2]} intensity={0.35} />
        <Scene regions={regions} selected={selected} onSelect={onSelect} yaw={Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, yaw))} reduced={reduced} />
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 2}
          maxPolarAngle={Math.PI / 2}
          minAzimuthAngle={-YAW_LIMIT}
          maxAzimuthAngle={YAW_LIMIT}
          target={[0, 0.25, 0]}
        />
      </Canvas>
    </div>
  );
}
