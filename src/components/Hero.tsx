'use client';

import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, SpotLight, useGLTF } from '@react-three/drei';
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import {
  ACESFilmicToneMapping,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  SpotLight as SpotLightImpl,
  Vector3,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Book3D, createBookAtom } from './Book3D';

interface ModelProps {
  path: string;
  scale: number | [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
}

// Edit transform buku dari sini.
const BOOK_POSITION: [number, number, number] = [0, -0.09, -0.01];
const BOOK_ROTATION_DEG: [number, number, number] = [90, 90, 0];
const BOOK_SCALE = 0.5;
const LAMP_POSITION: [number, number, number] = [-1.2, -0.15, 0.01];
const LAMP_ROTATION: [number, number, number] = [0, 1.55, 0];
const LAMP_SCALE = 3.8;
const LAMP_BULB_POSITION: [number, number, number] = [-1, 1.38, 0];
const LAMP_REFLECTOR_POSITION: [number, number, number] = [-0.6, 0.65, 0.2];
const LAMP_TARGET_POSITION: [number, number, number] = [-0.55, -0.5, 0.2];

const book2Atom = createBookAtom();
const book3Atom = createBookAtom();

// Reusing textures from Book3D for the second book's 40 pages
const pictures = [
  "DSC00680", "DSC00933", "DSC00966", "DSC00983", "DSC01011", "DSC01040",
  "DSC01064", "DSC01071", "DSC01103", "DSC01145", "DSC01420", "DSC01461",
  "DSC01489", "DSC02031", "DSC02064", "DSC02069",
];

const book2Pages = [
  { front: "book-cover", back: "__cover-inner-front" },
];
for (let i = 0; i < 40; i++) {
  book2Pages.push({
    front: pictures[i % pictures.length],
    back: pictures[(i + 1) % pictures.length],
  });
}
book2Pages.push({ front: "__cover-inner-back", back: "book-back" });

function ShiftTrackpadMove({
  controlsRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera, gl } = useThree();

  useEffect(() => {
    const dom = gl.domElement;
    const forward = new Vector3();
    const right = new Vector3();
    const move = new Vector3();

    const handleWheel = (event: WheelEvent) => {
      if (!event.shiftKey) {
        return;
      }
      const controls = controlsRef.current;
      if (!controls) {
        return;
      }

      event.preventDefault();

      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) {
        forward.set(0, 0, -1);
      } else {
        forward.normalize();
      }
      right.crossVectors(forward, camera.up).normalize();

      const distance = camera.position.distanceTo(controls.target);
      const panFactor = Math.max(0.4, distance) * 0.0025;

      move.set(0, 0, 0);
      move.addScaledVector(right, event.deltaX * panFactor);
      move.addScaledVector(forward, -event.deltaY * panFactor);

      camera.position.add(move);
      controls.target.add(move);
      controls.update();
    };

    dom.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      dom.removeEventListener('wheel', handleWheel);
    };
  }, [camera, controlsRef, gl]);

  return null;
}

function Model({ path, scale, position, rotation = [0, 0, 0] }: ModelProps) {
  const { scene } = useGLTF(path);
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);

    clone.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    return clone;
  }, [scene]);

  return (
    <primitive
      object={clonedScene}
      scale={scale}
      position={position}
      rotation={rotation}
    />
  );
}

function tuneLampMaterial(material: MeshStandardMaterial) {
  const tunedMaterial = material.clone();

  if (tunedMaterial.emissiveMap) {
    tunedMaterial.emissive.set('#ffd59a');
    tunedMaterial.emissiveIntensity = 1.2;
  }

  tunedMaterial.needsUpdate = true;
  return tunedMaterial;
}

interface DeskLampModelProps extends Omit<ModelProps, 'path'> {
  lightsOn: boolean;
}

function DeskLampModel({ scale, position, rotation = [0, 0, 0], lightsOn }: DeskLampModelProps) {
  const { scene } = useGLTF('/models/old_desk_lamp/scene.gltf');
  const lampScene = useMemo(() => {
    const clone = scene.clone(true);

    clone.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) {
        return;
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Initial material tuning
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((material) => {
          if ((material as MeshStandardMaterial).isMeshStandardMaterial) {
            return tuneLampMaterial(material as MeshStandardMaterial);
          }
          return material.clone();
        });
        return;
      }

      const material = mesh.material as MeshStandardMaterial;
      if (material.isMeshStandardMaterial) {
        mesh.material = tuneLampMaterial(material);
        return;
      }

      mesh.material = material.clone();
    });

    return clone;
  }, [scene]);

  useEffect(() => {
    lampScene.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;

      const updateMaterial = (mat: MeshStandardMaterial) => {
        if (mat.emissiveMap) {
          // Toggle emissive intensity
          mat.emissiveIntensity = lightsOn ? 1.2 : 0;
        }
      };

      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => updateMaterial(m as MeshStandardMaterial));
      } else {
        updateMaterial(mesh.material as MeshStandardMaterial);
      }
    });
  }, [lightsOn, lampScene]);

  return (
    <primitive
      object={lampScene}
      scale={scale}
      position={position}
      rotation={rotation}
    />
  );
}

export default function Hero() {
  const [lightsOn, setLightsOn] = React.useState(true);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lampSpotRef = useRef<SpotLightImpl | null>(null);
  const lampTargetRef = useRef<Object3D | null>(null);

  useEffect(() => {
    if (!lampTargetRef.current || !lampSpotRef.current) {
      return;
    }
    lampSpotRef.current.target = lampTargetRef.current;
    lampTargetRef.current.updateMatrixWorld();
  }, []);

  return (
    <div className="h-screen w-full bg-[#101010] relative">
      <div className="absolute bottom-10 right-10 z-10">
        <button
          onClick={() => setLightsOn((prev) => !prev)}
          className={`px-4 py-2 rounded-full font-medium transition-all duration-300 backdrop-blur-md border ${lightsOn
            ? 'bg-amber-100/10 border-amber-500/30 text-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.2)] hover:bg-amber-100/20'
            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
            }`}
        >
          {lightsOn ? 'Turn Lights Off' : 'Turn Lights On'}
        </button>
      </div>

      <Canvas
        shadows
        camera={{ position: [0, 3, 6], fov: 40 }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.7;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = PCFSoftShadowMap;
        }}
      >
        <color attach="background" args={['#101010']} />

        <object3D ref={lampTargetRef} position={LAMP_TARGET_POSITION} />

        <SpotLight
          ref={lampSpotRef}
          position={LAMP_BULB_POSITION}
          color="#ffddaa"
          intensity={lightsOn ? 8 : 0}
          angle={0.9}
          penumbra={0.7}
          distance={5}
          decay={2}
          attenuation={5}
          anglePower={4}
          opacity={lightsOn ? 0.03 : 0}
          volumetric
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.05}
          shadow-camera-far={6}
          shadow-focus={1}
          shadow-bias={-0.00008}
          shadow-normalBias={0.025}
        />

        <pointLight
          position={LAMP_REFLECTOR_POSITION}
          color="#ffd9a8"
          intensity={lightsOn ? 4 : 0}
          distance={6.5}
          decay={2}
        />

        <Suspense fallback={<group><mesh><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="gray" wireframe /></mesh></group>}>
          <Model path="/models/mahogany_table/scene.gltf" position={[0, -2.1, 0]} scale={0.3} rotation={[0, 0, 0]} />
          <DeskLampModel
            position={LAMP_POSITION}
            scale={LAMP_SCALE}
            rotation={LAMP_ROTATION}
            lightsOn={lightsOn}
          />

          <group
            position={BOOK_POSITION}
            scale={BOOK_SCALE}
            rotation={[
              MathUtils.degToRad(BOOK_ROTATION_DEG[0]),
              MathUtils.degToRad(BOOK_ROTATION_DEG[1]),
              MathUtils.degToRad(BOOK_ROTATION_DEG[2]),
            ]}
          >
            <Book3D />
          </group>




          <Model path="/models/simple_old_mug/scene.gltf" position={[1.3, 0.04, 0.4]} scale={0.2} rotation={[0, 2.1, 0]} />
          <Model path="/models/mini_plant/scene.gltf" position={[-1, -0.15, 0.8]} scale={2} rotation={[0, 2, 0]} />
          <Model path="/models/ballpoin_golden/scene.gltf" position={[1.7, 0.16, 0.3]} scale={0.3} rotation={[0, 0.5, 1.57]} />
        </Suspense>
        <EffectComposer enableNormalPass={false}>
          <Bloom luminanceThreshold={1.2} mipmapBlur intensity={0.25} />
          <Vignette eskil={false} offset={0.1} darkness={1.05} />
        </EffectComposer>

        <ShiftTrackpadMove controlsRef={controlsRef} />
        <OrbitControls
          ref={controlsRef}
          enableZoom
          enablePan
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
          minAzimuthAngle={-Infinity}
          maxAzimuthAngle={Infinity}
        />
      </Canvas>
    </div>
  );
}
