/**
 * Full-page 3D body (lazy-loaded). The realistic outside body loads first; the Open Anatomy
 * body downloads only when an inside view is first chosen. Going in or out plays the scan:
 * a blue ring travels the body, with the anatomy on one side of it and the skin on the other.
 * The outside model's outstretched arms fade as one piece (measured zone in config/anatomy.js)
 * because the anatomy model holds its arms down and a flat cut would leave floating forearms.
 *
 * The canvas is decorative (aria-hidden); every marker is a real <button>, and the page lists
 * the same readings as buttons too.
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SEVERITY_META, GRADE_OF } from '../Status.jsx';
import { BODY_HEIGHT, BODY_MODELS, MARKERS, MARKER_PART, MARKER_SIDE, PARTS_FOR, SCAN, VIEW_BY_ID, armOpacityAt, bandAt, isInside } from '../../config/anatomy.js';
import { ANATOMY_COLORS } from '../../config/anatomyColors.js';

const ACCENT = '#1F4FD8'; // Evexia accent token
const NONE = '#9AA6B8';
const TARGET = new THREE.Vector3(0, 0.92, 0);
const CAMERA_DISTANCE = 4.1;
const withMeshopt = (loader) => loader.setMeshoptDecoder(MeshoptDecoder);

/** Scale to 1.75 m, feet on the floor, centred on x/z. */
function fitToBody(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const s = BODY_HEIGHT / (box.max.y - box.min.y);
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root);
  const c = b2.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= b2.min.y;
  root.updateMatrixWorld(true);
  return s;
}

/**
 * Patch a material so the scan can cut it at the band. `side` is 'outer' (kept below the band,
 * arms fade) or 'inner' (kept above the band). When uScan is 0 the patch does nothing.
 */
function patchForScan(mat, side, uniforms, arms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vScanWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvScanWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const cut =
      side === 'outer'
        ? `if (uScan > 0.5) {
             if (vScanWorld.y > uBand) discard;
             if (abs(vScanWorld.x) > ${arms.x.toFixed(3)} && vScanWorld.y < ${arms.top.toFixed(3)} && vScanWorld.y > ${arms.bottom.toFixed(3)}) {
               gl_FragColor.a *= uArmFade;
               if (gl_FragColor.a < 0.02) discard;
             }
           }`
        : 'if (uScan > 0.5 && vScanWorld.y < uBand) discard;';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vScanWorld;\nuniform float uBand;\nuniform float uArmFade;\nuniform float uScan;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${cut}`);
  };
  mat.customProgramCacheKey = () => `evexia-scan-${side}`;
  mat.needsUpdate = true;
}

function OuterBody({ kind, uniforms, visible, onReady, widthRef }) {
  const cfg = BODY_MODELS[kind];
  const gltf = useLoader(GLTFLoader, cfg.outer, withMeshopt);
  const root = useMemo(() => {
    const r = gltf.scene.clone(true);
    r.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        patchForScan(o.material, 'outer', uniforms, cfg.arms);
      }
    });
    fitToBody(r);
    // Half-width of the body every 2.5 cm of height, so the scan ring can hug it.
    const bins = new Map();
    const v = new THREE.Vector3();
    r.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const k = Math.round(v.y * 40);
        bins.set(k, Math.max(bins.get(k) || 0, Math.abs(v.x)));
      }
    });
    widthRef.current = (y) => bins.get(Math.round(y * 40)) ?? cfg.arms.torso;
    return r;
  }, [gltf, uniforms, cfg, widthRef]);
  // Report "loaded" once, when the model first mounts (the callback changes identity every render).
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current?.();
  }, []);
  return <primitive object={root} visible={visible} />;
}

function InnerBody({ kind, uniforms, visible, view, explode, regions, selected, onReady, reduced, offsets }) {
  const cfg = BODY_MODELS[kind];
  const gltf = useLoader(GLTFLoader, cfg.anatomy, withMeshopt);
  const { root, meshes, scale } = useMemo(() => {
    const r = gltf.scene.clone(true);
    const list = [];
    r.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshStandardMaterial({ color: ANATOMY_COLORS[o.name] || '#cfd6df', roughness: 0.55, metalness: 0, transparent: true });
      patchForScan(o.material, 'inner', uniforms, cfg.arms);
      list.push(o);
    });
    const s = fitToBody(r);
    const center = new THREE.Vector3(0, 1.0, 0);
    for (const m of list) {
      const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
      m.userData.base = m.position.clone();
      // Exploded direction: outward from the body's middle, flattened a little vertically.
      m.userData.dir = c.sub(center).multiply(new THREE.Vector3(1, 0.55, 1.3));
      m.userData.system = m.parent?.name;
    }
    return { root: r, meshes: list, scale: s };
  }, [gltf, uniforms, cfg]);
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current?.();
  }, []);

  // Layers for the current view, and the status glow on the parts each reading points at.
  const glowFor = useMemo(() => {
    const out = {};
    for (const [id, parts] of Object.entries(PARTS_FOR)) {
      const sev = regions[id]?.severity;
      for (const p of parts) out[p] = { sev, selected: selected === id };
    }
    return out;
  }, [regions, selected]);
  useLayoutEffect(() => {
    const v = VIEW_BY_ID[view];
    const layers = new Set(v?.layers ?? VIEW_BY_ID.organs.layers);
    const faint = new Set(v?.faint ?? []);
    for (const m of meshes) {
      const sys = m.userData.system;
      m.visible = layers.has(sys);
      const glow = glowFor[m.name];
      const mat = m.material;
      mat.opacity = faint.has(sys) && !glow ? 0.5 : 1;
      mat.depthWrite = mat.opacity === 1;
      const c = glow?.sev && glow.sev !== 'green' ? new THREE.Color(SEVERITY_META[glow.sev].color) : null;
      mat.emissive.set(c ?? '#000000');
      mat.emissiveIntensity = c ? (glow.sev === 'red' ? 0.55 : 0.4) + (glow.selected ? 0.2 : 0) : 0;
    }
  }, [view, meshes, glowFor]);

  // Exploded view: parts slide outward; everything else eases back home.
  const spread = useRef(0);
  useFrame((_, dt) => {
    const want = view === 'exploded' ? explode : 0;
    if (Math.abs(spread.current - want) < 0.001 && spread.current === want) return;
    spread.current = reduced ? want : spread.current + (want - spread.current) * Math.min(1, dt * 7);
    if (Math.abs(spread.current - want) < 0.001) spread.current = want;
    for (const m of meshes) {
      m.position.copy(m.userData.base).addScaledVector(m.userData.dir, (spread.current * 0.9) / scale);
      // Markers ride with their part: share its offset in world units.
      if (offsets.current.has(m.name)) offsets.current.get(m.name).copy(m.userData.dir).multiplyScalar(spread.current * 0.9);
    }
  });

  return <primitive object={root} visible={visible} />;
}

/** One marker: status dot, pulse ring, 44 px button and a value pill. Rides with its part's offset. */
function Marker({ id, position, offset, side, r, label, selected, onSelect }) {
  const sev = r?.severity;
  const m = sev ? SEVERITY_META[sev] : null;
  const group = useRef();
  useFrame(() => {
    if (group.current && offset) group.current.position.set(position[0] + offset.x, position[1] + offset.y, position[2] + offset.z);
  });
  return (
    <group ref={group} position={position}>
    <Html zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'relative', width: 0, height: 0 }} data-marker={id} data-severity={sev ?? 'none'}>
        {m && <span aria-hidden="true" className={`ring-g${GRADE_OF[sev]}`} style={{ position: 'absolute', left: -10, top: -10, width: 20, height: 20, borderRadius: '50%', border: `2px solid ${m.color}`, boxSizing: 'border-box' }} />}
        <button
          type="button"
          onClick={() => onSelect(id)}
          aria-pressed={selected}
          aria-label={r ? `${r.label}: ${r.valueText}, ${m.label}. Show details.` : `${label}: no current reading. Show details.`}
          data-testid={`body-marker-${id}`}
          style={{ position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: '50%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}
        >
          <span style={{ width: selected ? 20 : 16, height: selected ? 20 : 16, borderRadius: '50%', background: m ? m.color : NONE, border: '3px solid #FFFFFF', boxShadow: selected ? '0 0 0 3px rgba(31,79,216,.35), 0 2px 6px rgba(14,23,38,.3)' : '0 2px 6px rgba(14,23,38,.3)', display: 'block' }} />
        </button>
        <span
          aria-hidden="true"
          className="font-mono"
          style={{ position: 'absolute', [side === 'left' ? 'right' : 'left']: 24, top: -14, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 999, background: '#FFFFFF', border: `1px solid ${selected ? ACCENT : m ? m.line : '#DDE2E9'}`, boxShadow: '0 4px 12px rgba(14,23,38,.10)', fontSize: 12, fontWeight: 600, color: '#0E1726' }}
        >
          <span style={{ fontFamily: 'Inter, sans-serif', color: '#4A5568' }}>{label}</span>
          {r ? r.shortValue : '—'}
        </span>
      </div>
    </Html>
    </group>
  );
}

/** The scan ring: a thin accent line and a faint halo, scaled to hug the body at its height. */
function ScanRing({ ringRef }) {
  return (
    <group ref={ringRef} visible={false}>
      <mesh>
        <cylinderGeometry args={[1, 1, 0.006, 96, 1, true]} />
        <meshBasicMaterial color={ACCENT} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[1.02, 1.02, 0.07, 96, 1, true]} />
        <meshBasicMaterial color={ACCENT} side={THREE.DoubleSide} transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Glide the camera around the body when Front / Side / Back is pressed. */
function CameraRig({ orientation, reduced }) {
  const { camera, controls } = useThree();
  const goal = useRef(null);
  useEffect(() => {
    if (orientation) goal.current = orientation.azimuth;
  }, [orientation]);
  useFrame((_, dt) => {
    if (goal.current === null || !controls) return;
    const offset = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    let diff = goal.current - sph.theta;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (reduced || Math.abs(diff) < 0.002) {
      sph.theta = goal.current;
      goal.current = null;
    } else {
      sph.theta += diff * Math.min(1, dt * 5);
    }
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
    controls.update();
  });
  return null;
}

function Scene({ kind, view, explode, orientation, regions, selected, onSelect, reduced, labels, onStatus }) {
  const uniforms = useMemo(() => ({ uBand: { value: 99 }, uArmFade: { value: 1 }, uScan: { value: 0 } }), []);
  const arms = BODY_MODELS[kind].arms;
  const widthRef = useRef(() => arms.torso);
  const ringRef = useRef();
  // World-space offset of each marker's part in the Exploded view (zero otherwise).
  const offsets = useRef(new Map(Object.values(MARKER_PART).map((p) => [p, new THREE.Vector3()])));
  const inside = isInside(view);
  // The anatomy download starts the first time an inside view is asked for, and stays loaded after.
  const [wantInner, setWantInner] = useState(inside);
  useEffect(() => {
    if (inside) setWantInner(true);
  }, [inside]);
  const [innerReady, setInnerReady] = useState(false);
  const [shown, setShownState] = useState(inside ? 'inner' : 'outer');
  const shownRef = useRef(shown);
  const setShown = (s) => {
    shownRef.current = s;
    setShownState(s);
  };
  // The anatomy keeps the layers of the inside view we came from while scanning back out.
  const [insideView, setInsideView] = useState(inside ? view : 'organs');
  useEffect(() => {
    if (inside) setInsideView(view);
  }, [inside, view]);
  const anim = useRef(null);

  useEffect(() => {
    onStatus?.({ innerLoading: wantInner && !innerReady });
  }, [wantInner, innerReady, onStatus]);

  // Start a scan when the view crosses between outside and inside (once the anatomy is ready).
  useEffect(() => {
    const target = inside ? 'inner' : 'outer';
    const running = anim.current;
    if (running ? running.target === target : shownRef.current === target) return;
    if (target === 'inner' && !innerReady) return;
    if (reduced) {
      anim.current = null;
      uniforms.uScan.value = 0;
      setShown(target);
      return;
    }
    anim.current = { start: performance.now(), direction: target === 'inner' ? 'down' : 'up', target };
    uniforms.uScan.value = 1;
    setShown('both');
  }, [inside, innerReady, reduced, uniforms]);

  useFrame(() => {
    const a = anim.current;
    const ring = ringRef.current;
    if (!a) {
      if (ring) ring.visible = false;
      return;
    }
    const p = Math.min(1, (performance.now() - a.start) / (SCAN.seconds * 1000));
    const y = bandAt(p, a.direction);
    const armFade = armOpacityAt(y, arms);
    uniforms.uBand.value = y;
    uniforms.uArmFade.value = armFade;
    if (ring) {
      const inArms = y < arms.top && y > arms.bottom;
      const full = Math.max(widthRef.current(y), arms.torso);
      const w = inArms ? arms.torso + (full - arms.torso) * armFade : widthRef.current(y);
      const r = Math.max(0.16, w + 0.05);
      ring.scale.set(r, 1, r * 0.6);
      ring.position.y = y;
      ring.visible = p > 0 && p < 1;
    }
    if (p >= 1) {
      anim.current = null;
      uniforms.uScan.value = 0;
      setShown(a.target);
    }
  });

  const outerVisible = shown === 'outer' || shown === 'both';
  const innerVisible = shown === 'inner' || shown === 'both';
  return (
    <>
      <Suspense fallback={null}>
        <OuterBody kind={kind} uniforms={uniforms} visible={outerVisible} widthRef={widthRef} onReady={() => onStatus?.({ outerReady: true })} />
      </Suspense>
      {wantInner && (
        <Suspense fallback={null}>
          <InnerBody
            kind={kind}
            uniforms={uniforms}
            visible={innerVisible}
            view={insideView}
            explode={inside ? explode : 0}
            offsets={offsets}
            regions={regions}
            selected={selected}
            reduced={reduced}
            onReady={() => setInnerReady(true)}
          />
        </Suspense>
      )}
      <ScanRing ringRef={ringRef} />
      {Object.entries(MARKERS[kind]).map(([id, pos]) => (
        <Marker key={id} id={id} position={pos} offset={offsets.current.get(MARKER_PART[id])} side={MARKER_SIDE[id]} r={regions[id]} label={labels[id]} selected={selected === id} onSelect={onSelect} />
      ))}
      <CameraRig orientation={orientation} reduced={reduced} />
    </>
  );
}

/**
 * @param {'male'|'female'} kind
 * @param {string} view            one of config/anatomy VIEWS ids
 * @param {number} explode         0..1, used in the Exploded view
 * @param {{azimuth:number}} orientation  a new object each press, so pressing Front twice re-centres
 * @param {object} regions         { [indicatorId]: { severity, label, valueText, shortValue } | null }
 * @param {object} labels          { [indicatorId]: short label }
 * @param {(status) => void} onStatus  reports { outerReady, innerLoading }
 */
export default function AnatomyViewer({ kind, view, explode, orientation, regions, selected, onSelect, reduced, labels, onStatus }) {
  return (
    <div className="absolute inset-0" data-testid="anatomy-viewer" data-kind={kind} data-view={view}>
      <Canvas
        camera={{ position: [0, TARGET.y + 0.1, CAMERA_DISTANCE], fov: 30, near: 0.05, far: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.domElement.setAttribute('aria-hidden', 'true');
        }}
      >
        <hemisphereLight args={['#FFFFFF', '#B8C2D0', 1.6]} />
        <directionalLight position={[1.5, 3, 2.5]} intensity={2.2} />
        <directionalLight position={[-2, 2, -2]} intensity={0.8} />
        <Scene kind={kind} view={view} explode={explode} orientation={orientation} regions={regions} selected={selected} onSelect={onSelect} reduced={reduced} labels={labels} onStatus={onStatus} />
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={1.3}
          maxDistance={5.5}
          minPolarAngle={Math.PI * 0.32}
          maxPolarAngle={Math.PI * 0.62}
          target={TARGET.toArray()}
        />
      </Canvas>
    </div>
  );
}
