'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, ThreeElements } from '@react-three/fiber';
import { OrbitControls, SpotLight, useDetectGPU, useGLTF } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import {
  ACESFilmicToneMapping,
  Group,
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
import { CoffeeSteam } from './CoffeeSteam';

import { useBookSideTextures } from '@/lib/book-content/useBookSideTextures';
import { useBookProfileImage } from '@/lib/book-content/useBookProfileImage';

interface ModelProps {
  path: string;
  scale: number | [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  enableShadows?: boolean;
}

// Edit transform buku dari sini.
const BOOK_POSITION: [number, number, number] = [0.5, -0.06, -0.01];
const BOOK_ROTATION_DEG: [number, number, number] = [90, 180, 0];
const BOOK_SCALE = 0.5;

// Second book transform
const BOOK2_POSITION: [number, number, number] = [1.3, -0.01, 0.9];
const BOOK2_ROTATION_DEG: [number, number, number] = [90, 180, 230];
const BOOK2_SCALE = 0.45;
const BOOK_ROTATION_RAD: [number, number, number] = [
  MathUtils.degToRad(BOOK_ROTATION_DEG[0]),
  MathUtils.degToRad(BOOK_ROTATION_DEG[1]),
  MathUtils.degToRad(BOOK_ROTATION_DEG[2]),
];
const BOOK2_ROTATION_RAD: [number, number, number] = [
  MathUtils.degToRad(BOOK2_ROTATION_DEG[0]),
  MathUtils.degToRad(BOOK2_ROTATION_DEG[1]),
  MathUtils.degToRad(BOOK2_ROTATION_DEG[2]),
];
const BOOK_SWAP_DURATION_MS = 2000;
const BOOK_SWAP_LIFT = 0.48;
const BOOK_SWAP_VERTICAL_SWING_RAD = MathUtils.degToRad(36);
const BOOK_SWAP_ROLL_SWING_RAD = MathUtils.degToRad(5);
const LAMP_POSITION: [number, number, number] = [-1.2, -0.15, 0.01];
const LAMP_ROTATION: [number, number, number] = [0, 1.55, 0];
const LAMP_SCALE = 3.8;
const LAMP_BULB_POSITION: [number, number, number] = [-1.1, 1.4, 0];
const LAMP_REFLECTOR_POSITION: [number, number, number] = [-0.6, 0.65, 0.2];
const LAMP_TARGET_POSITION: [number, number, number] = [-0.55, -0.5, 0.2];



const bookAtom = createBookAtom(0);
const book2Atom = createBookAtom(0);

// Reusing textures from Book3D for generated second-book pages.
const pictures = [
  "DSC00680", "DSC00933", "DSC00966", "DSC00983", "DSC01011", "DSC01040",
  "DSC01064", "DSC01071", "DSC01103", "DSC01145", "DSC01420", "DSC01461",
  "DSC01489", "DSC02031", "DSC02064", "DSC02069",
];

const createBookInteriorPages = (sheetCount: number) => {
  const generated: Array<{ front: string; back: string }> = [];
  for (let i = 0; i < sheetCount; i += 1) {
    generated.push({
      front: pictures[i % pictures.length],
      back: pictures[(i + 1) % pictures.length],
    });
  }
  return generated;
};

interface SceneProfile {
  name: "mobile" | "desktop";
  dpr: [number, number];
  antialias: boolean;
  enableShadows: boolean;
  shadowMapSize: number;
  enableVolumetricLight: boolean;
  enablePostProcessing: boolean;
  renderSecondBook: boolean;
  secondBookSheetCount: number;
  renderSteam: boolean;
  renderPlant: boolean;
  bookTextureLoadRadius: number;
}

const SCENE_PROFILES: Record<SceneProfile["name"], SceneProfile> = {
  mobile: {
    name: "mobile",
    dpr: [0.75, 1],
    antialias: false,
    enableShadows: false,
    shadowMapSize: 512,
    enableVolumetricLight: false,
    enablePostProcessing: false,
    renderSecondBook: false,
    secondBookSheetCount: 16,
    renderSteam: false,
    renderPlant: false,
    bookTextureLoadRadius: 2,
  },
  desktop: {
    name: "desktop",
    dpr: [1, 1.5],
    antialias: true,
    enableShadows: true,
    shadowMapSize: 1024,
    enableVolumetricLight: true,
    enablePostProcessing: true,
    renderSecondBook: true,
    secondBookSheetCount: 40,
    renderSteam: true,
    renderPlant: true,
    bookTextureLoadRadius: Number.POSITIVE_INFINITY,
  },
};

type BookId = 'book1' | 'book2';
type BookSlot = 'lamp' | 'side';

interface BookSlotTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

const BOOK_SLOT_TRANSFORMS: Record<BookSlot, BookSlotTransform> = {
  lamp: {
    position: BOOK_POSITION,
    rotation: BOOK_ROTATION_RAD,
    scale: BOOK_SCALE,
  },
  side: {
    position: BOOK2_POSITION,
    rotation: BOOK2_ROTATION_RAD,
    scale: BOOK2_SCALE,
  },
};

const lerp = (start: number, end: number, alpha: number) => start + (end - start) * alpha;

const setGroupTransform = (group: Group, transform: BookSlotTransform) => {
  group.position.set(...transform.position);
  group.rotation.set(...transform.rotation);
  group.scale.setScalar(transform.scale);
};

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

function Model({ path, scale, position, rotation = [0, 0, 0], enableShadows = true }: ModelProps) {
  const { scene } = useGLTF(path);
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);

    clone.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.castShadow = enableShadows;
      mesh.receiveShadow = enableShadows;
    });

    return clone;
  }, [enableShadows, scene]);

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
  enableShadows: boolean;
}

function DeskLampModel({ scale, position, rotation = [0, 0, 0], lightsOn, enableShadows }: DeskLampModelProps) {
  const { scene } = useGLTF('/models/old_desk_lamp/scene.gltf');
  const lampScene = useMemo(() => {
    const clone = scene.clone(true);

    clone.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) {
        return;
      }

      mesh.castShadow = false;
      mesh.receiveShadow = enableShadows;

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
  }, [enableShadows, scene]);

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

type CoffeeMugProps = ThreeElements['group'] & {
  steamEnabled: boolean;
  enableShadows: boolean;
};

function CoffeeMug({ steamEnabled, enableShadows, ...props }: CoffeeMugProps) {
  return (
    <group {...props}>
      <Model
        path="/models/simple_old_mug/scene.gltf"
        position={[0, 0, 0]}
        scale={0.2}
        rotation={[0, 2.1, 0]}
        enableShadows={enableShadows}
      />
      <mesh position={[0.05, 0.06, 0.07]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.145, 32]} />
        <meshStandardMaterial color="#0f0802" roughness={0.2} metalness={0.1} />
      </mesh>
      {steamEnabled && <CoffeeSteam position={[0, 0.46, 0]} scale={[0.5, 0.5, 0.5]} />}
    </group>
  );
}

interface InteractiveBooksProps {
  renderSecondBook: boolean;
  enableShadows: boolean;
  textureLoadRadius: number;
  book2Pages: Array<{ front: string; back: string }>;
  book1DynamicContent: ReturnType<typeof useBookSideTextures>;
  book2DynamicContent: ReturnType<typeof useBookSideTextures>;
  book2ProfileImageUrl: string | null;
}

function InteractiveBooks({
  renderSecondBook,
  enableShadows,
  textureLoadRadius,
  book2Pages,
  book1DynamicContent,
  book2DynamicContent,
  book2ProfileImageUrl,
}: InteractiveBooksProps) {
  const book1GroupRef = useRef<Group | null>(null);
  const book2GroupRef = useRef<Group | null>(null);
  const spotlightBookRef = useRef<BookId>('book1');
  const swapAnimationRef = useRef<{ startedAtMs: number; spotlightBeforeSwap: BookId } | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);

  const getSlotForBook = useCallback(
    (bookId: BookId, spotlightBook: BookId): BookSlot => (
      bookId === spotlightBook ? 'lamp' : 'side'
    ),
    [],
  );

  const handleBookClick = useCallback((bookId: BookId) => {
    if (!renderSecondBook) {
      return false;
    }
    if (swapAnimationRef.current) {
      return true;
    }

    const currentSpotlightBook = spotlightBookRef.current;
    if (bookId === currentSpotlightBook) {
      return false;
    }

    swapAnimationRef.current = {
      startedAtMs: performance.now(),
      spotlightBeforeSwap: currentSpotlightBook,
    };
    setIsSwapping(true);
    return true;
  }, [renderSecondBook]);

  useFrame(() => {
    const book1Group = book1GroupRef.current;
    if (!book1Group) {
      return;
    }

    if (!renderSecondBook) {
      setGroupTransform(book1Group, BOOK_SLOT_TRANSFORMS.lamp);
      return;
    }

    const book2Group = book2GroupRef.current;
    if (!book2Group) {
      return;
    }

    const swapAnimation = swapAnimationRef.current;
    if (!swapAnimation) {
      const book1Slot = getSlotForBook('book1', spotlightBookRef.current);
      const book2Slot = getSlotForBook('book2', spotlightBookRef.current);
      setGroupTransform(book1Group, BOOK_SLOT_TRANSFORMS[book1Slot]);
      setGroupTransform(book2Group, BOOK_SLOT_TRANSFORMS[book2Slot]);
      return;
    }

    const rawProgress = MathUtils.clamp(
      (performance.now() - swapAnimation.startedAtMs) / BOOK_SWAP_DURATION_MS,
      0,
      1,
    );
    const easedProgress = MathUtils.smootherstep(rawProgress, 0, 1);
    const inAirFactor = Math.sin(Math.PI * easedProgress);

    const applySwapPose = (bookId: BookId, group: Group) => {
      const startSlot = getSlotForBook(bookId, swapAnimation.spotlightBeforeSwap);
      const endSlot: BookSlot = startSlot === 'lamp' ? 'side' : 'lamp';
      const startTransform = BOOK_SLOT_TRANSFORMS[startSlot];
      const endTransform = BOOK_SLOT_TRANSFORMS[endSlot];
      const moveDirection = startSlot === 'side' ? 1 : -1;

      group.position.set(
        lerp(startTransform.position[0], endTransform.position[0], easedProgress),
        lerp(startTransform.position[1], endTransform.position[1], easedProgress) + inAirFactor * BOOK_SWAP_LIFT,
        lerp(startTransform.position[2], endTransform.position[2], easedProgress),
      );

      group.rotation.set(
        lerp(startTransform.rotation[0], endTransform.rotation[0], easedProgress)
        + inAirFactor * BOOK_SWAP_VERTICAL_SWING_RAD * moveDirection,
        lerp(startTransform.rotation[1], endTransform.rotation[1], easedProgress),
        lerp(startTransform.rotation[2], endTransform.rotation[2], easedProgress)
        + inAirFactor * BOOK_SWAP_ROLL_SWING_RAD * moveDirection,
      );

      const scale =
        lerp(startTransform.scale, endTransform.scale, easedProgress)
        * (1 + inAirFactor * 0.08);
      group.scale.setScalar(scale);
    };

    applySwapPose('book1', book1Group);
    applySwapPose('book2', book2Group);

    if (rawProgress >= 1) {
      spotlightBookRef.current = swapAnimation.spotlightBeforeSwap === 'book1' ? 'book2' : 'book1';
      swapAnimationRef.current = null;
      setIsSwapping(false);
    }
  });

  return (
    <>
      <group
        ref={book1GroupRef}
        position={BOOK_POSITION}
        scale={BOOK_SCALE}
        rotation={BOOK_ROTATION_RAD}
      >
        <Book3D
          bookAtom={bookAtom}
          coverColor="#4a3020"
          coverFrontTexturePath="/textures/book1-cover-front.png"
          coverBackTexturePath="/textures/book1-cover-back.png"
          coverFrontTextureOffsetY={0}
          enableShadows={enableShadows}
          textureLoadRadius={textureLoadRadius}
          contentEnabled={true}
          dynamicContent={book1DynamicContent}
          onBookClick={() => handleBookClick('book1')}
          interactionDisabled={isSwapping}
        />
      </group>

      {renderSecondBook && (
        <group
          ref={book2GroupRef}
          position={BOOK2_POSITION}
          scale={BOOK2_SCALE}
          rotation={BOOK2_ROTATION_RAD}
        >
          <Book3D
            bookAtom={book2Atom}
            pages={book2Pages}
            coverColor="#1a4a2e"
            enableShadows={enableShadows}
            textureLoadRadius={textureLoadRadius}
            contentEnabled={true}
            dynamicContent={book2DynamicContent}
            frontCoverAvatarUrl={book2ProfileImageUrl ?? undefined}
            largeBookFanSpreadDeg={8}
            onBookClick={() => handleBookClick('book2')}
            interactionDisabled={isSwapping}
          />
        </group>
      )}
    </>
  );
}

export default function Hero() {
  const [lightsOn, setLightsOn] = React.useState(true);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lampSpotRef = useRef<SpotLightImpl | null>(null);
  const lampTargetRef = useRef<Object3D | null>(null);
  const gpu = useDetectGPU();

  const isLowEndDevice = !gpu || gpu.isMobile || gpu.tier <= 1;
  const sceneProfile = isLowEndDevice
    ? SCENE_PROFILES.mobile
    : SCENE_PROFILES.desktop;
  const book2Pages = useMemo(
    () => createBookInteriorPages(sceneProfile.secondBookSheetCount),
    [sceneProfile.secondBookSheetCount],
  );

  // Dynamic content for Book 1
  const book1DynamicContent = useBookSideTextures({
    bookKey: "book-1",
    totalPageEntries: 18, // 16 interior + 2 covers
    canvasHeight: isLowEndDevice ? 1024 : 1536,
    textureLoadRadius: sceneProfile.bookTextureLoadRadius,
    enabled: true,
  });

  // Dynamic content for Book 2
  const book2DynamicContent = useBookSideTextures({
    bookKey: "book-2",
    totalPageEntries: book2Pages.length + 2, // interior sheets + 2 covers
    canvasHeight: isLowEndDevice ? 1024 : 1536,
    textureLoadRadius: sceneProfile.bookTextureLoadRadius,
    enabled: sceneProfile.renderSecondBook,
  });
  const book2ProfileImageUrl = useBookProfileImage({
    bookKey: "book-2",
    enabled: sceneProfile.renderSecondBook,
  });

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
          {lightsOn ? 'Turn Room Lights Off' : 'Turn Room Lights On'}
        </button>
      </div>

      {/* Book Controllers */}
      {/* <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-10">
        <div className="text-center text-white/60 text-xs mb-1">Book 1</div>
        <BookController bookAtom={bookAtom} />
        <div className="text-center text-white/60 text-xs mb-1 mt-2">Book 2</div>
        <BookController bookAtom={book2Atom} totalPages={book2Pages.length + 1} />
      </div> */}

      <Canvas
        dpr={sceneProfile.dpr}
        shadows={sceneProfile.enableShadows}
        gl={{ antialias: sceneProfile.antialias, powerPreference: 'high-performance' }}
        camera={{ position: [0, 3, 6], fov: 40 }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = sceneProfile.enablePostProcessing ? 0.7 : 0.75;
          gl.shadowMap.enabled = sceneProfile.enableShadows;
          if (sceneProfile.enableShadows) {
            gl.shadowMap.type = PCFSoftShadowMap;
          }
        }}
      >
        <color attach="background" args={['#101010']} />

        <ambientLight intensity={lightsOn ? 0.5 : 0} />

        <object3D ref={lampTargetRef} position={LAMP_TARGET_POSITION} />

        <SpotLight
          ref={lampSpotRef}
          position={LAMP_BULB_POSITION}
          color="#ffddaa"
          intensity={8}
          angle={0.9}
          penumbra={0.7}
          distance={5}
          decay={2}
          attenuation={5}
          anglePower={4}
          opacity={0.03}
          volumetric={sceneProfile.enableVolumetricLight}
          castShadow={sceneProfile.enableShadows}
          shadow-mapSize-width={sceneProfile.shadowMapSize}
          shadow-mapSize-height={sceneProfile.shadowMapSize}
          shadow-camera-near={0.05}
          shadow-camera-far={6}
          shadow-focus={1}
          shadow-bias={-0.00008}
          shadow-normalBias={0.025}
        />

        <pointLight
          position={LAMP_REFLECTOR_POSITION}
          color="#ffd9a8"
          intensity={1}
          distance={6.5}
          decay={2}
        />

        <Suspense fallback={<group><mesh><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="gray" wireframe /></mesh></group>}>
          <Model
            path="/models/mahogany_table/scene.gltf"
            position={[0, -2.1, 0]}
            scale={0.3}
            rotation={[0, 0, 0]}
            enableShadows={sceneProfile.enableShadows}
          />
          <DeskLampModel
            position={LAMP_POSITION}
            scale={LAMP_SCALE}
            rotation={LAMP_ROTATION}
            lightsOn={true}
            enableShadows={sceneProfile.enableShadows}
          />

          <InteractiveBooks
            renderSecondBook={sceneProfile.renderSecondBook}
            enableShadows={sceneProfile.enableShadows}
            textureLoadRadius={sceneProfile.bookTextureLoadRadius}
            book2Pages={book2Pages}
            book1DynamicContent={book1DynamicContent}
            book2DynamicContent={book2DynamicContent}
            book2ProfileImageUrl={book2ProfileImageUrl}
          />



          <CoffeeMug
            steamEnabled={sceneProfile.renderSteam}
            enableShadows={sceneProfile.enableShadows}
            position={[0.2, 0.04, 0.8]}
            rotation={[0, Math.PI / -2, 0]}
          />
          {sceneProfile.renderPlant && (
            <Model
              path="/models/mini_plant/scene.gltf"
              position={[-1, -0.15, 0.8]}
              scale={2}
              rotation={[0, 2, 0]}
              enableShadows={sceneProfile.enableShadows}
            />
          )}
          <Model
            path="/models/ballpoin_golden/scene.gltf"
            position={[1.7, 0.16, 0.3]}
            scale={0.3}
            rotation={[0, 0.5, 1.57]}
            enableShadows={sceneProfile.enableShadows}
          />
        </Suspense>
        {sceneProfile.enablePostProcessing && (
          <EffectComposer enableNormalPass={false} multisampling={0}>
            <Bloom luminanceThreshold={1.2} mipmapBlur intensity={0.25} />
            <Vignette eskil={false} offset={0.1} darkness={1.05} />
          </EffectComposer>
        )}

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
