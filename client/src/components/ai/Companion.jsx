/**
 * 3D AI companion (lazy-loaded). A small astronaut built from three.js
 * primitives in the light palette: white suit, #B8C3D2 seams, #C9D2DF backpack,
 * #14213D visor. States: idle (float, slow drift, looks at the pointer),
 * attention (antenna blinks the worst status colour), hover/open (waves),
 * thinking (arm still, visor glint). Renders on demand when the tab is hidden or
 * the pointer has been idle for 10 s with the panel closed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const STATUS = { ok: '#22C55E', warn: '#F59E0B', crit: '#F43F5E', think: '#FF4D55' };

function Astronaut({ status, waving, thinking, pointer }) {
  const root = useRef();
  const arm = useRef();
  const beacon = useRef();
  const glint = useRef();
  const suit = useMemo(() => new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.55 }), []);
  const seam = useMemo(() => new THREE.MeshStandardMaterial({ color: '#B8C3D2', roughness: 0.6 }), []);
  const pack = useMemo(() => new THREE.MeshStandardMaterial({ color: '#C9D2DF', roughness: 0.6 }), []);
  const visor = useMemo(() => new THREE.MeshStandardMaterial({ color: '#14213D', roughness: 0.15, metalness: 0.4 }), []);
  const chest = useMemo(() => new THREE.MeshStandardMaterial({ color: '#D7333A', roughness: 0.4 }), []);
  const light = useMemo(() => new THREE.MeshStandardMaterial({ color: STATUS.ok, emissive: STATUS.ok, emissiveIntensity: 0.6 }), []);
  useEffect(() => () => [suit, seam, pack, visor, chest, light].forEach((m) => m.dispose()), [suit, seam, pack, visor, chest, light]);
  useEffect(() => {
    const c = thinking ? STATUS.think : STATUS[status];
    light.color.set(c);
    light.emissive.set(c);
  }, [status, thinking, light]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!root.current) return;
    root.current.position.y = Math.sin(t * 1.8) * 0.06;
    const yaw = pointer.current.x * 0.44 + Math.sin(t * 0.25) * 0.1;
    root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, yaw, 0.08);
    root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, -pointer.current.y * 0.26, 0.08);
    if (arm.current) arm.current.rotation.z = waving && !thinking ? 0.5 + Math.sin(t * 6) * 0.5 : 0.35;
    if (beacon.current) light.emissiveIntensity = status === 'ok' && !thinking ? 0.6 : 0.6 + Math.sin(t * 4) * 0.6;
    if (glint.current) glint.current.position.x = thinking ? -0.1 + ((t * 0.6) % 1) * 0.2 : -0.06;
  });

  return (
    <group ref={root} scale={0.9}>
      {/* backpack */}
      <mesh position={[0, -0.18, -0.16]} material={pack}><boxGeometry args={[0.42, 0.36, 0.16]} /></mesh>
      {/* body */}
      <mesh position={[0, -0.2, 0]} material={suit}><capsuleGeometry args={[0.2, 0.18, 8, 20]} /></mesh>
      <mesh position={[0, -0.12, 0.19]} material={chest}><boxGeometry args={[0.12, 0.08, 0.02]} /></mesh>
      <mesh position={[0, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]} material={seam}><torusGeometry args={[0.2, 0.012, 8, 32]} /></mesh>
      {/* left arm */}
      <group position={[-0.24, -0.08, 0]} rotation={[0, 0, -0.35]}>
        <mesh position={[0, -0.12, 0]} material={suit}><capsuleGeometry args={[0.06, 0.16, 6, 12]} /></mesh>
      </group>
      {/* right arm (waves) */}
      <group ref={arm} position={[0.24, -0.08, 0]} rotation={[0, 0, 0.35]}>
        <mesh position={[0, -0.12, 0]} material={suit}><capsuleGeometry args={[0.06, 0.16, 6, 12]} /></mesh>
      </group>
      {/* legs */}
      <mesh position={[-0.09, -0.52, 0]} material={suit}><capsuleGeometry args={[0.07, 0.12, 6, 12]} /></mesh>
      <mesh position={[0.09, -0.52, 0]} material={suit}><capsuleGeometry args={[0.07, 0.12, 6, 12]} /></mesh>
      {/* helmet + visor */}
      <mesh position={[0, 0.24, 0]} material={suit}><sphereGeometry args={[0.27, 32, 24]} /></mesh>
      <mesh position={[0, 0.22, 0.07]} scale={[1, 0.7, 0.75]} material={visor}><sphereGeometry args={[0.24, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      <mesh ref={glint} position={[-0.06, 0.3, 0.25]} rotation={[0, 0, -0.4]}>
        <planeGeometry args={[0.08, 0.03]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.75} />
      </mesh>
      {/* antenna + beacon */}
      <mesh position={[0, 0.58, 0]} material={seam}><cylinderGeometry args={[0.01, 0.01, 0.12, 6]} /></mesh>
      <mesh ref={beacon} position={[0, 0.66, 0]} material={light}><sphereGeometry args={[0.04, 16, 12]} /></mesh>
    </group>
  );
}

function Activity({ active }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (active) return undefined;
    const id = setInterval(() => invalidate(), 1000); // one calm frame per second while idle
    return () => clearInterval(id);
  }, [active, invalidate]);
  return null;
}

/**
 * @param {'ok'|'warn'|'crit'} status   worst current status
 * @param {boolean} waving              pointer over dock or panel open
 * @param {boolean} thinking            waiting for a reply
 * @param {boolean} open                panel open (keeps rendering active)
 */
export default function Companion({ status = 'ok', waving = false, thinking = false, open = false, size = 96 }) {
  const pointer = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState(true);
  useEffect(() => {
    let idle;
    const wake = () => {
      setActive(true);
      clearTimeout(idle);
      idle = setTimeout(() => setActive(false), 10_000);
    };
    const move = (e) => {
      pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
      wake();
    };
    const vis = () => (document.hidden ? setActive(false) : wake());
    window.addEventListener('pointermove', move);
    document.addEventListener('visibilitychange', vis);
    wake();
    return () => {
      clearTimeout(idle);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  const running = (active || open || thinking) && !document.hidden;
  return (
    <Canvas aria-hidden="true" dpr={[1, 2]} gl={{ alpha: true, antialias: true }} camera={{ position: [0, 0.05, 3], fov: 30 }} style={{ width: size, height: size }} frameloop={running ? 'always' : 'demand'}>
      <Activity active={running} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 3, 2]} intensity={1.2} />
      <Astronaut status={status} waving={waving || open} thinking={thinking} pointer={pointer} />
    </Canvas>
  );
}
