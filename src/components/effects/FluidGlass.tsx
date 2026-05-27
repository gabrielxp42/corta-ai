/* eslint-disable react/no-unknown-property */
import * as THREE from 'three';
import { memo, useMemo, useRef, useState } from 'react';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import { MeshTransmissionMaterial, useFBO } from '@react-three/drei';
import { easing } from 'maath';

type FluidGlassMode = 'lens' | 'bar' | 'cube';

interface FluidGlassProps {
  mode?: FluidGlassMode;
  lensProps?: Record<string, number | string | boolean>;
  barProps?: Record<string, number | string | boolean>;
  cubeProps?: Record<string, number | string | boolean>;
}

interface ModeWrapperProps {
  mode: FluidGlassMode;
  modeProps?: Record<string, number | string | boolean>;
}

const getBaseScale = (mode: FluidGlassMode) => {
  if (mode === 'bar') {
    return [7.6, 1.15, 0.9] as const;
  }

  if (mode === 'cube') {
    return [2.4, 2.4, 2.4] as const;
  }

  return [3.2, 3.2, 1.2] as const;
};

function BackgroundField() {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current) {
      return;
    }

    const time = state.clock.elapsedTime;
    group.current.rotation.z = Math.sin(time * 0.08) * 0.12;
    group.current.children.forEach((child, index) => {
      child.position.y += Math.sin(time * 0.7 + index) * 0.0035;
      child.position.x += Math.cos(time * 0.45 + index * 0.35) * 0.0025;
      child.rotation.z += 0.0025 + index * 0.0004;
    });
  });

  return (
    <group ref={group}>
      <mesh position={[-6, 2.4, -2]}>
        <sphereGeometry args={[2.8, 64, 64]} />
        <meshBasicMaterial color="#00f2ff" transparent opacity={0.7} />
      </mesh>
      <mesh position={[4.5, -0.5, -1]}>
        <sphereGeometry args={[2.1, 64, 64]} />
        <meshBasicMaterial color="#5227ff" transparent opacity={0.85} />
      </mesh>
      <mesh position={[-1.8, -3.2, -1.5]}>
        <sphereGeometry args={[2.3, 64, 64]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.55} />
      </mesh>
      <mesh position={[6.2, 3.4, -3]}>
        <sphereGeometry args={[1.6, 64, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.16} />
      </mesh>
      <mesh position={[0, 0, -8]} scale={[28, 18, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#05070d" />
      </mesh>
    </group>
  );
}

const ModeWrapper = memo(function ModeWrapper({ mode, modeProps = {} }: ModeWrapperProps) {
  const ref = useRef<THREE.Mesh>(null);
  const buffer = useFBO();
  const { viewport } = useThree();
  const [scene] = useState(() => new THREE.Scene());
  const baseScale = useMemo(() => getBaseScale(mode), [mode]);
  const followPointer = mode !== 'bar';
  const lockToBottom = mode === 'bar';

  useFrame((state, delta) => {
    if (!ref.current) {
      return;
    }

    const { gl, camera, pointer } = state;
    const currentViewport = viewport.getCurrentViewport(camera, [0, 0, 15]);
    const destX = followPointer ? pointer.x * currentViewport.width * 0.28 : 0;
    const destY = lockToBottom
      ? -currentViewport.height * 0.33
      : followPointer
        ? pointer.y * currentViewport.height * 0.22
        : 0;

    easing.damp3(ref.current.position, [destX, destY, 15], 0.18, delta);
    ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.15;

    gl.setRenderTarget(buffer);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.setClearColor(new THREE.Color('#05070d'), 0);
  });

  const {
    scale,
    ior,
    thickness,
    anisotropy,
    chromaticAberration,
    transmission,
    roughness,
    ...extraMat
  } = modeProps;

  const effectiveScale = Array.isArray(scale)
    ? scale
    : typeof scale === 'number'
      ? [scale, scale, scale]
      : baseScale;

  return (
    <>
      {createPortal(<BackgroundField />, scene)}
      <mesh scale={[viewport.width, viewport.height, 1]} position={[0, 0, -6]}>
        <planeGeometry />
        <meshBasicMaterial map={buffer.texture} transparent opacity={0.9} />
      </mesh>

      <mesh
        ref={ref}
        position={[0, lockToBottom ? -viewport.height * 0.33 : 0, 15]}
        scale={effectiveScale as [number, number, number]}
        rotation-x={mode === 'lens' ? Math.PI / 2 : 0}
      >
        {mode === 'lens' ? (
          <cylinderGeometry args={[1, 1, 0.5, 96, 1, false]} />
        ) : mode === 'cube' ? (
          <boxGeometry args={[1.2, 1.2, 1.2, 8, 8, 8]} />
        ) : (
          <boxGeometry args={[1.2, 0.22, 0.28, 12, 12, 12]} />
        )}
        <MeshTransmissionMaterial
          buffer={buffer.texture}
          ior={typeof ior === 'number' ? ior : 1.15}
          thickness={typeof thickness === 'number' ? thickness : mode === 'bar' ? 10 : 5}
          anisotropy={typeof anisotropy === 'number' ? anisotropy : 0.02}
          chromaticAberration={typeof chromaticAberration === 'number' ? chromaticAberration : 0.12}
          transmission={typeof transmission === 'number' ? transmission : 1}
          roughness={typeof roughness === 'number' ? roughness : 0.02}
          distortion={0.18}
          temporalDistortion={0.08}
          color="#f5f7ff"
          attenuationColor="#7c5cff"
          attenuationDistance={0.3}
          backside
          transparent
          {...extraMat}
        />
      </mesh>
    </>
  );
});

export default function FluidGlass({
  mode = 'lens',
  lensProps = {},
  barProps = {},
  cubeProps = {},
}: FluidGlassProps) {
  const modeProps = mode === 'bar' ? barProps : mode === 'cube' ? cubeProps : lensProps;

  return (
    <Canvas camera={{ position: [0, 0, 20], fov: 18 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 8]} intensity={1.4} color="#ffffff" />
      <pointLight position={[-5, 2, 6]} intensity={1.1} color="#00f2ff" />
      <pointLight position={[5, -4, 5]} intensity={1.2} color="#5227ff" />
      <ModeWrapper mode={mode} modeProps={modeProps} />
    </Canvas>
  );
}
