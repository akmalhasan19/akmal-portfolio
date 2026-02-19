'use client';

import { Caveat } from 'next/font/google';
import dynamic from 'next/dynamic';
import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, ThreeElements } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import type { TierResult } from 'detect-gpu';
import { SpotLight } from '@react-three/drei/core/SpotLight';
import { Text } from '@react-three/drei/core/Text';
import { useGLTF } from '@react-three/drei/core/Gltf';
import { useProgress } from '@react-three/drei/core/Progress';
import { useTexture } from '@react-three/drei/core/Texture';
import { Html } from '@react-three/drei/web/Html';
import { useCursor } from '@react-three/drei/web/useCursor';
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
import { Book3D, createBookAtom } from './Book3D';
import { useSetAtom, useAtomValue } from 'jotai';
import { CoffeeSteam } from './CoffeeSteam';

import { useBookSideContent, useBookSideTextures } from '@/lib/book-content/useBookSideTextures';
import { useBookProfileImage } from '@/lib/book-content/useBookProfileImage';
import { BOOK2_CENTER_SPREAD_PIVOT } from '@/lib/book-content/book2-constraints';

const caveat = Caveat({
  variable: '--font-caveat',
  subsets: ['latin'],
});

const PostProcessingEffects = dynamic(() => import('./PostProcessingEffects'), {
  ssr: false,
  loading: () => null,
});

interface ModelProps {
  path: string;
  scale: number | [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  enableShadows?: boolean;
}

type LanguageCode = 'id' | 'en';

interface HeroTranslations {
  lampStringMessage: string;
  portfolioLabel: string;
  aboutLabel: string;
  backButton: string;
  languageLabel: string;
  languageToggleHint: string;
  loaderOptimizingDevice: string;
  loaderOpeningScene: string;
  loaderLoadingScene: string;
  loaderPreparingScene: string;
}

const HERO_TRANSLATIONS: Record<LanguageCode, HeroTranslations> = {
  id: {
    lampStringMessage: 'Belum. Beberapa dari kita masih belajar melihat dalam terang',
    portfolioLabel: 'Portofolio',
    aboutLabel: 'Tentang',
    backButton: 'Kembali',
    languageLabel: 'Bahasa',
    languageToggleHint: 'Klik untuk ganti ke',
    loaderOptimizingDevice: 'Optimasi Perangkat',
    loaderOpeningScene: 'Membuka Scene',
    loaderLoadingScene: 'Memuat Scene',
    loaderPreparingScene: 'Menyiapkan Scene',
  },
  en: {
    lampStringMessage: 'Not yet. Some of us are still learning to see in the light',
    portfolioLabel: 'Portfolio',
    aboutLabel: 'About',
    backButton: 'Back',
    languageLabel: 'Language',
    languageToggleHint: 'Click to switch to',
    loaderOptimizingDevice: 'Optimizing Device',
    loaderOpeningScene: 'Opening Scene',
    loaderLoadingScene: 'Loading Scene',
    loaderPreparingScene: 'Preparing Scene',
  },
};

// Edit transform buku dari sini.
const BOOK_POSITION: [number, number, number] = [0.3, -0.06, -0.01];
const BOOK_ROTATION_DEG: [number, number, number] = [90, 180, 0];
const BOOK_SCALE = 0.5;

// Second book transform
const BOOK2_POSITION: [number, number, number] = [1.3, -0.01, 0.9];
const BOOK2_ROTATION_DEG: [number, number, number] = [90, 180, 230];
const BOOK2_SCALE = 0.45;

// Third book transform
const BOOK3_POSITION: [number, number, number] = [-1, -0.04, -1.1];
const BOOK3_ROTATION_DEG: [number, number, number] = [90, 180, 100];
const BOOK3_SCALE = 0.42;

// Fourth book transform
const BOOK4_POSITION: [number, number, number] = [-0.7, 0.085, -0.6];
const BOOK4_ROTATION_DEG: [number, number, number] = [90, 180, 310];
const BOOK4_SCALE = 0.48;

// Fifth book transform
const BOOK5_POSITION: [number, number, number] = [-0.7, 0.22, -0.98];
const BOOK5_ROTATION_DEG: [number, number, number] = [90, 180, 40];
const BOOK5_SCALE = 0.44;

// Base surface Y positions - where the bottom of the book touches the table
// These are calibrated so the book sits correctly on the table surface
const LAMP_SLOT_SURFACE_Y = -0.165;  // Base Y for lamp slot (lowered)
const SIDE_SLOT_SURFACE_Y = -0.165;  // Base Y for side slot (lowered)
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
const BOOK3_ROTATION_RAD: [number, number, number] = [
  MathUtils.degToRad(BOOK3_ROTATION_DEG[0]),
  MathUtils.degToRad(BOOK3_ROTATION_DEG[1]),
  MathUtils.degToRad(BOOK3_ROTATION_DEG[2]),
];
const BOOK4_ROTATION_RAD: [number, number, number] = [
  MathUtils.degToRad(BOOK4_ROTATION_DEG[0]),
  MathUtils.degToRad(BOOK4_ROTATION_DEG[1]),
  MathUtils.degToRad(BOOK4_ROTATION_DEG[2]),
];
const BOOK5_ROTATION_RAD: [number, number, number] = [
  MathUtils.degToRad(BOOK5_ROTATION_DEG[0]),
  MathUtils.degToRad(BOOK5_ROTATION_DEG[1]),
  MathUtils.degToRad(BOOK5_ROTATION_DEG[2]),
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
const ANTIQUE_GLOBE_POSITION: [number, number, number] = [-2.65, 0.57, 2.05];
const ANTIQUE_GLOBE_ROTATION: [number, number, number] = [0, 0.8, 0];
const ANTIQUE_GLOBE_SCALE = 2.4;
const LANGUAGE_TOGGLE_POSITION: [number, number, number] = [-1.26, 0.07, 0.82];
const LANGUAGE_TOGGLE_ROTATION_DEG: [number, number, number] = [0, 60, 0];
const LANGUAGE_TOGGLE_ROTATION_RAD: [number, number, number] = [
  MathUtils.degToRad(LANGUAGE_TOGGLE_ROTATION_DEG[0]),
  MathUtils.degToRad(LANGUAGE_TOGGLE_ROTATION_DEG[1]),
  MathUtils.degToRad(LANGUAGE_TOGGLE_ROTATION_DEG[2]),
];
const LANGUAGE_TOGGLE_SCALE = 0.5;
// Old desk lamp pull-string interaction tuning.
const LAMP_STRING_HOTSPOT_POSITION: [number, number, number] = [0.11, 0.29, 0.02];
const LAMP_STRING_HOTSPOT_SIZE: [number, number, number] = [0.08, 0.35, 0.08];
const LAMP_STRING_MESSAGE_POSITION: [number, number, number] = [0.26, 0.18, 0.06];
const LAMP_STRING_MESSAGE_TIMEOUT_MS = 4200;

// Desk name plaque transform (edit x/y/z directly).
const DESK_PLAQUE_POSITION: [number, number, number] = [1.2, -0.15, 1.25];
const DESK_PLAQUE_ROTATION_DEG: [number, number, number] = [0, -27, 0];
const DESK_PLAQUE_SCALE = 0.07;
const DESK_PLAQUE_ROTATION_RAD: [number, number, number] = [
  MathUtils.degToRad(DESK_PLAQUE_ROTATION_DEG[0]),
  MathUtils.degToRad(DESK_PLAQUE_ROTATION_DEG[1]),
  MathUtils.degToRad(DESK_PLAQUE_ROTATION_DEG[2]),
];
// Desk plaque text transform (fine tune to stick text onto name tag).
const DESK_PLAQUE_TEXT_OFFSET: [number, number, number] = [0, 0, -3.2512];
const DESK_PLAQUE_TEXT_ROTATION_DEG: [number, number, number] = [-29, 24, 13];
const DESK_PLAQUE_TEXT_SCALE = 2.5;
const DESK_PLAQUE_TEXT_ROTATION_RAD: [number, number, number] = [
  MathUtils.degToRad(DESK_PLAQUE_TEXT_ROTATION_DEG[0]),
  MathUtils.degToRad(DESK_PLAQUE_TEXT_ROTATION_DEG[1]),
  MathUtils.degToRad(DESK_PLAQUE_TEXT_ROTATION_DEG[2]),
];
const DESK_PLAQUE_TEXT_FONT_PATH = '/fonts/Caveat-700.ttf';
const DESK_PLAQUE_TEXT_COLOR = '#332421';

// Back button positions
const BOOK1_BACK_BUTTON_POSITION: [number, number, number] = [0.8, 0.02, 0.33];
const BOOK2_BACK_BUTTON_POSITION: [number, number, number] = [1.05, 0.04, 0];



const bookAtom = createBookAtom(0);
const book2Atom = createBookAtom(0);
const book3Atom = createBookAtom(0);
const book4Atom = createBookAtom(0);
const book5Atom = createBookAtom(0);

// Reusing textures from Book3D for generated second-book pages.
const pictures = [
  "DSC00680", "DSC00933", "DSC00966", "DSC00983", "DSC01011", "DSC01040",
  "DSC01064", "DSC01071", "DSC01103", "DSC01145", "DSC01420", "DSC01461",
  "DSC01489", "DSC02031", "DSC02064", "DSC02069",
];

const CRITICAL_MODEL_PATHS = [
  '/models/mahogany_table/scene.gltf',
  '/models/old_desk_lamp/scene.gltf',
] as const;

const CRITICAL_TEXTURE_PATHS = [
  '/textures/book1-cover-front.webp',
  '/textures/book1-cover-back.webp',
] as const;

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

const createBlankBookInteriorPages = (sheetCount: number) => {
  const generated: Array<{ front: string; back: string }> = [];
  for (let i = 0; i < sheetCount; i += 1) {
    generated.push({
      front: '',
      back: '',
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
  renderThirdBook: boolean;
  renderFourthBook: boolean;
  renderFifthBook: boolean;
  secondBookSheetCount: number;
  thirdBookSheetCount: number;
  fourthBookSheetCount: number;
  fifthBookSheetCount: number;
  renderSteam: boolean;
  renderPlant: boolean;
  bookTextureLoadRadius: number;
}

const BOOK_DYNAMIC_CANVAS_HEIGHT_MOBILE = 1024;
const BOOK_DYNAMIC_CANVAS_HEIGHT_DESKTOP = 2048;

const SCENE_PROFILES: Record<SceneProfile["name"], SceneProfile> = {
  mobile: {
    name: "mobile",
    dpr: [0.5, 0.75],
    antialias: false,
    enableShadows: false,
    shadowMapSize: 512,
    enableVolumetricLight: false,
    enablePostProcessing: false,
    renderSecondBook: false,
    renderThirdBook: false,
    renderFourthBook: false,
    renderFifthBook: false,
    secondBookSheetCount: 16,
    thirdBookSheetCount: 16,
    fourthBookSheetCount: 16,
    fifthBookSheetCount: 16,
    renderSteam: false,
    renderPlant: false,
    bookTextureLoadRadius: 2,
  },
  desktop: {
    name: "desktop",
    dpr: [1, 1.25],
    antialias: true,
    enableShadows: true,
    shadowMapSize: 512,
    enableVolumetricLight: true,
    enablePostProcessing: true,
    renderSecondBook: true,
    renderThirdBook: true,
    renderFourthBook: true,
    renderFifthBook: true,
    secondBookSheetCount: 40,
    thirdBookSheetCount: 32,
    fourthBookSheetCount: 28,
    fifthBookSheetCount: 36,
    renderSteam: true,
    renderPlant: true,
    // Load nearest pages first; farther pages stream in on demand.
    bookTextureLoadRadius: 4,
  },
};

type BookId = 'book1' | 'book2' | 'book3' | 'book4' | 'book5';
type BookSlot = 'lamp' | 'side' | 'corner1' | 'corner2' | 'corner3';

interface BookSlotTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

// Base slot transforms - Y position will be adjusted dynamically based on book thickness
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
  corner1: {
    position: BOOK3_POSITION,
    rotation: BOOK3_ROTATION_RAD,
    scale: BOOK3_SCALE,
  },
  corner2: {
    position: BOOK4_POSITION,
    rotation: BOOK4_ROTATION_RAD,
    scale: BOOK4_SCALE,
  },
  corner3: {
    position: BOOK5_POSITION,
    rotation: BOOK5_ROTATION_RAD,
    scale: BOOK5_SCALE,
  },
};

// Calculate the Y position for a book based on its thickness and slot
// The Y position is: surface_y + (thickness / 2) because Y is the center of the book
const calculateBookY = (slot: BookSlot, bookThickness: number): number => {
  const surfaceY = slot === 'lamp' ? LAMP_SLOT_SURFACE_Y : SIDE_SLOT_SURFACE_Y;
  return surfaceY + bookThickness / 2;
};

// Book cover colors for each book
const BOOK_COVER_COLORS: Record<BookId, string> = {
  book1: "#4a3020",
  book2: "#1a4a2e",
  book3: "#3a2a4a",
  book4: "#4a3a1a",
  book5: "#2a3a4a",
};

// Get slot transform with adjusted Y position for a specific book thickness
const getSlotTransformForBook = (
  slot: BookSlot,
  bookThickness: number,
): BookSlotTransform => {
  const baseTransform = BOOK_SLOT_TRANSFORMS[slot];
  const adjustedY = calculateBookY(slot, bookThickness);
  return {
    ...baseTransform,
    position: [baseTransform.position[0], adjustedY, baseTransform.position[2]],
  };
};

const lerp = (start: number, end: number, alpha: number) => start + (end - start) * alpha;

const setGroupTransform = (group: Group, transform: BookSlotTransform) => {
  group.position.set(...transform.position);
  group.rotation.set(...transform.rotation);
  group.scale.setScalar(transform.scale);
};

// Camera positions
const OVERVIEW_CAMERA_POSITION = new Vector3(2.2, 1.0, 3.8);
const OVERVIEW_CAMERA_TARGET = new Vector3(0, 0.2, -0.2);

// Book-focus camera: above the book, rotated 180° (looking from behind desk)
const BOOK_FOCUS_CAMERA_POSITION = new Vector3(0.3, 1.8, -0.4);
const BOOK_FOCUS_CAMERA_TARGET = new Vector3(0.3, -0.05, 0.05);

// Spiral arc pivot — the book position in XZ, used as center of the orbit
const ARC_PIVOT_X = 0.3;
const ARC_PIVOT_Z = 0.0;

// Pre-computed arc geometry from start/end camera positions
const ARC_START_ANGLE = Math.atan2(
  OVERVIEW_CAMERA_POSITION.z - ARC_PIVOT_Z,
  OVERVIEW_CAMERA_POSITION.x - ARC_PIVOT_X,
); // ≈ 63.4° (front-right)
const ARC_END_ANGLE = Math.atan2(
  BOOK_FOCUS_CAMERA_POSITION.z - ARC_PIVOT_Z,
  BOOK_FOCUS_CAMERA_POSITION.x - ARC_PIVOT_X,
); // ≈ -90° (behind desk)
const ARC_START_RADIUS = Math.hypot(
  OVERVIEW_CAMERA_POSITION.x - ARC_PIVOT_X,
  OVERVIEW_CAMERA_POSITION.z - ARC_PIVOT_Z,
); // ≈ 4.25
const ARC_END_RADIUS = Math.hypot(
  BOOK_FOCUS_CAMERA_POSITION.x - ARC_PIVOT_X,
  BOOK_FOCUS_CAMERA_POSITION.z - ARC_PIVOT_Z,
); // ≈ 0.4

const CAMERA_ARC_DURATION_MS = 1800;
const HERO_LOADER_MIN_MS = 700;
const HERO_REVEAL_DURATION_MS = 1200;
const HERO_LOADER_MAX_PROGRESS_BEFORE_READY = 96;

type CameraPhase = 'overview' | 'focusing' | 'focused' | 'book-closing' | 'unfocusing';
const BOOK_CLOSE_DELAY_MS = 800;
const BOOK2_CLOSE_DELAY_MS = 1450;
const PRIMARY_BOOK_PAGE_SEGMENTS = 12;
const BOOK1_INTERIOR_SHEET_COUNT = 16;

/** Compute position along the spiral arc at parameter t ∈ [0, 1].
 *  Sweeps angle and shrinks radius from overview → book focus. */
const spiralArcPosition = (
  startAngle: number, endAngle: number,
  startRadius: number, endRadius: number,
  startY: number, endY: number,
  t: number, out: Vector3,
) => {
  const angle = startAngle + (endAngle - startAngle) * t;
  const radius = startRadius + (endRadius - startRadius) * t;
  const y = startY + (endY - startY) * t;
  out.set(
    ARC_PIVOT_X + radius * Math.cos(angle),
    y,
    ARC_PIVOT_Z + radius * Math.sin(angle),
  );
  return out;
};

interface CameraSetupProps {
  phase: CameraPhase;
  onTransitionDone: () => void;
}

interface SceneReadySignalProps {
  onReady: () => void;
}

function SceneReadySignal({ onReady }: SceneReadySignalProps) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return null;
}

function CameraSetup({ phase, onTransitionDone }: CameraSetupProps) {
  const { camera } = useThree();
  const phaseRef = useRef<CameraPhase>(phase);
  const animStartRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const tempPos = useRef(new Vector3());
  const tempTarget = useRef(new Vector3());
  const staticSetRef = useRef(false);

  // Sync prop → ref synchronously (runs every render, before useFrame)
  // Sync phase refs outside render to keep component pure.
  useLayoutEffect(() => {
    if (phaseRef.current === phase) {
      return;
    }
    phaseRef.current = phase;
    staticSetRef.current = false;
    if (phase === 'focusing' || phase === 'unfocusing') {
      animStartRef.current = null; // will be set on first frame
      doneRef.current = false;
    }
  }, [phase]);

  // Set initial camera on mount
  useEffect(() => {
    camera.position.copy(OVERVIEW_CAMERA_POSITION);
    camera.lookAt(OVERVIEW_CAMERA_TARGET);
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame(() => {
    const p = phaseRef.current;

    if (p === 'overview') {
      if (!staticSetRef.current) {
        camera.position.copy(OVERVIEW_CAMERA_POSITION);
        camera.lookAt(OVERVIEW_CAMERA_TARGET);
        staticSetRef.current = true;
      }
      return;
    }

    if (p === 'focused' || p === 'book-closing') {
      if (!staticSetRef.current) {
        camera.position.copy(BOOK_FOCUS_CAMERA_POSITION);
        camera.lookAt(BOOK_FOCUS_CAMERA_TARGET);
        staticSetRef.current = true;
      }
      return;
    }

    // Animation already finished but React hasn't updated phase yet — hold final position
    if (doneRef.current) {
      const finalPos = p === 'focusing' ? BOOK_FOCUS_CAMERA_POSITION : OVERVIEW_CAMERA_POSITION;
      const finalTarget = p === 'focusing' ? BOOK_FOCUS_CAMERA_TARGET : OVERVIEW_CAMERA_TARGET;
      camera.position.copy(finalPos);
      camera.lookAt(finalTarget);
      return;
    }

    // Animating — focusing or unfocusing
    const now = performance.now();
    if (animStartRef.current === null) {
      animStartRef.current = now;
    }

    const rawT = MathUtils.clamp(
      (now - animStartRef.current) / CAMERA_ARC_DURATION_MS, 0, 1,
    );
    const t = MathUtils.smootherstep(rawT, 0, 1);

    const forward = p === 'focusing';
    const sAngle = forward ? ARC_START_ANGLE : ARC_END_ANGLE;
    const eAngle = forward ? ARC_END_ANGLE : ARC_START_ANGLE;
    const sRadius = forward ? ARC_START_RADIUS : ARC_END_RADIUS;
    const eRadius = forward ? ARC_END_RADIUS : ARC_START_RADIUS;
    const sY = forward ? OVERVIEW_CAMERA_POSITION.y : BOOK_FOCUS_CAMERA_POSITION.y;
    const eY = forward ? BOOK_FOCUS_CAMERA_POSITION.y : OVERVIEW_CAMERA_POSITION.y;
    const t0 = forward ? OVERVIEW_CAMERA_TARGET : BOOK_FOCUS_CAMERA_TARGET;
    const t2 = forward ? BOOK_FOCUS_CAMERA_TARGET : OVERVIEW_CAMERA_TARGET;

    spiralArcPosition(sAngle, eAngle, sRadius, eRadius, sY, eY, t, tempPos.current);
    camera.position.copy(tempPos.current);

    // Linearly interpolate the lookAt target
    tempTarget.current.lerpVectors(t0, t2, t);
    camera.lookAt(tempTarget.current);

    if (rawT >= 1) {
      // Snap to exact final position
      const finalPos = forward ? BOOK_FOCUS_CAMERA_POSITION : OVERVIEW_CAMERA_POSITION;
      camera.position.copy(finalPos);
      camera.lookAt(t2);
      // Mark done so stale closures won't restart the animation
      doneRef.current = true;
      // Defer state update to avoid mid-frame re-render
      queueMicrotask(onTransitionDone);
    }
  });

  return null;
}

function Model({ path, scale, position, rotation = [0, 0, 0], enableShadows = true }: ModelProps) {
  const { scene } = useGLTF(path, true, false);
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
  stringMessage: string;
}

function DeskLampModel({
  scale,
  position,
  rotation = [0, 0, 0],
  lightsOn,
  enableShadows,
  stringMessage,
}: DeskLampModelProps) {
  const { scene } = useGLTF('/models/old_desk_lamp/scene.gltf', true, false);
  const [showStringMessage, setShowStringMessage] = useState(false);
  const [isLampInteractiveHover, setIsLampInteractiveHover] = useState(false);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useCursor(isLampInteractiveHover);
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

  const showLampStringMessage = useCallback(() => {
    setShowStringMessage(true);

    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
    }
    messageTimerRef.current = setTimeout(() => {
      setShowStringMessage(false);
      messageTimerRef.current = null;
    }, LAMP_STRING_MESSAGE_TIMEOUT_MS);
  }, []);

  const handleStringClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    showLampStringMessage();
  }, [showLampStringMessage]);

  const handleLampClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    showLampStringMessage();
  }, [showLampStringMessage]);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  return (
    <group
      scale={scale}
      position={position}
      rotation={rotation}
    >
      <primitive
        object={lampScene}
        onPointerOver={() => setIsLampInteractiveHover(true)}
        onPointerOut={() => setIsLampInteractiveHover(false)}
        onClick={handleLampClick}
      />

      <mesh
        position={LAMP_STRING_HOTSPOT_POSITION}
        onPointerOver={(event) => {
          event.stopPropagation();
          setIsLampInteractiveHover(true);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          setIsLampInteractiveHover(false);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={handleStringClick}
      >
        <boxGeometry args={LAMP_STRING_HOTSPOT_SIZE} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <Html
        position={LAMP_STRING_MESSAGE_POSITION}
        center
        style={{
          pointerEvents: 'none',
          transition: 'opacity 0.35s ease',
          opacity: showStringMessage ? 1 : 0,
          whiteSpace: 'nowrap',
          zIndex: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-caveat), "Caveat", cursive',
            fontSize: '1.35rem',
            color: '#ead4a1',
            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
            fontWeight: 700,
          }}
        >
          {stringMessage}
        </span>
      </Html>
    </group>
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
      {steamEnabled && <CoffeeSteam />}
    </group>
  );
}

type AntiqueGlobeProps = ThreeElements['group'] & {
  enableShadows: boolean;
};

function AntiqueGlobe({ enableShadows, ...props }: AntiqueGlobeProps) {
  const { nodes, materials } = useGLTF('/models/antique_globe/antique_globe.glb', true, false) as unknown as {
    nodes: {
      Globe_Base_low001_Globe_Base_0: Mesh;
      Globe_low001_Globe003_0: Mesh;
    };
    materials: {
      Globe_Base: MeshStandardMaterial;
      'Globe.003': MeshStandardMaterial;
    };
  };

  return (
    <group {...props} dispose={null}>
      <group rotation={[-Math.PI / 2, 0, 0]} scale={0.133}>
        <group rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
          <mesh
            castShadow={enableShadows}
            receiveShadow={enableShadows}
            geometry={nodes.Globe_Base_low001_Globe_Base_0.geometry}
            material={materials.Globe_Base}
            position={[567.687, -207.548, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={100}
          />
          <mesh
            castShadow={enableShadows}
            receiveShadow={enableShadows}
            geometry={nodes.Globe_low001_Globe003_0.geometry}
            material={materials['Globe.003']}
            position={[564.611, 4.648, 0]}
            rotation={[-1.771, 0.044, -0.421]}
            scale={100}
          />
        </group>
      </group>
    </group>
  );
}

type LanguageToggle3DProps = ThreeElements['group'] & {
  enableShadows: boolean;
  language: LanguageCode;
  languageLabel: string;
  hintPrefix: string;
  onToggleLanguage: () => void;
};

function LanguageToggle3D({
  enableShadows,
  language,
  languageLabel,
  hintPrefix,
  onToggleLanguage,
  ...props
}: LanguageToggle3DProps) {
  const [isHovered, setIsHovered] = useState(false);
  useCursor(isHovered);

  const nextLanguageLabel = language === 'id' ? 'EN' : 'ID';
  const currentLanguageLabel = language.toUpperCase();

  const handleToggle = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onToggleLanguage();
  }, [onToggleLanguage]);

  return (
    <group {...props}>
      <mesh
        castShadow={enableShadows}
        receiveShadow={enableShadows}
        onPointerOver={(event) => {
          event.stopPropagation();
          setIsHovered(true);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          setIsHovered(false);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={handleToggle}
      >
        <boxGeometry args={[1.22, 0.5, 0.08]} />
        <meshStandardMaterial
          color={isHovered ? '#d4be8a' : '#b89661'}
          roughness={0.58}
          metalness={0.22}
        />
      </mesh>

      <mesh position={[0, 0, 0.044]} onClick={handleToggle}>
        <planeGeometry args={[1.03, 0.34]} />
        <meshStandardMaterial color="#241910" roughness={0.8} metalness={0.08} />
      </mesh>

      <Text
        position={[0, 0.07, 0.05]}
        font={DESK_PLAQUE_TEXT_FONT_PATH}
        fontSize={0.115}
        anchorX="center"
        anchorY="middle"
        color="#f4deaf"
        outlineColor="#0e0905"
        outlineWidth={0.005}
      >
        {`${languageLabel}: ${currentLanguageLabel}`}
      </Text>

      <Text
        position={[0, -0.11, 0.05]}
        fontSize={0.07}
        anchorX="center"
        anchorY="middle"
        color={isHovered ? '#ffe7ad' : '#ccb27b'}
      >
        {`${hintPrefix} ${nextLanguageLabel}`}
      </Text>
    </group>
  );
}

type DeskNamePlaqueProps = ThreeElements['group'] & {
  enableShadows: boolean;
};

function DeskNamePlaque({ enableShadows, ...props }: DeskNamePlaqueProps) {
  const { nodes, materials } = useGLTF('/models/desk_name_plaque/desk_name_plaque_2_kinds.glb', true, false) as unknown as {
    nodes: Record<string, Mesh>;
    materials: Record<string, MeshStandardMaterial>;
  };
  const nameBadgeGeometry = nodes.NameBadge_1_NameTag1_0.geometry;
  const nameTagMaterial = useMemo(() => {
    const material = materials.NameTag1.clone();
    material.map = null;
    material.color.set('#d8bf83');
    material.roughness = 0.42;
    material.metalness = 0.1;
    material.needsUpdate = true;
    return material;
  }, [materials.NameTag1]);
  const nameBadgeLayout = useMemo(() => {
    if (!nameBadgeGeometry.boundingBox) {
      nameBadgeGeometry.computeBoundingBox();
    }
    const box = nameBadgeGeometry.boundingBox;
    if (!box) {
      return {
        centerX: 0,
        centerY: 0,
        frontZ: 0.001,
        width: 1,
        height: 0.2,
      };
    }

    return {
      centerX: (box.min.x + box.max.x) * 0.5,
      centerY: (box.min.y + box.max.y) * 0.5,
      frontZ: box.max.z,
      width: Math.max(0.001, box.max.x - box.min.x),
      height: Math.max(0.001, box.max.y - box.min.y),
    };
  }, [nameBadgeGeometry]);

  useEffect(() => () => {
    nameTagMaterial.dispose();
  }, [nameTagMaterial]);

  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow={enableShadows}
        receiveShadow={enableShadows}
        geometry={nodes.NameHolder_1_DeskWood2_0.geometry}
        material={materials.DeskWood2}
      />
      <mesh
        castShadow={enableShadows}
        receiveShadow={enableShadows}
        geometry={nodes.NameHolder_1_Bronze2_0.geometry}
        material={materials.Bronze2}
      />
      <mesh
        castShadow={enableShadows}
        receiveShadow={enableShadows}
        geometry={nameBadgeGeometry}
        material={nameTagMaterial}
      >
        <Text
          position={[
            nameBadgeLayout.centerX + DESK_PLAQUE_TEXT_OFFSET[0],
            nameBadgeLayout.centerY + DESK_PLAQUE_TEXT_OFFSET[1],
            nameBadgeLayout.frontZ + DESK_PLAQUE_TEXT_OFFSET[2],
          ]}
          rotation={DESK_PLAQUE_TEXT_ROTATION_RAD}
          scale={DESK_PLAQUE_TEXT_SCALE}
          font={DESK_PLAQUE_TEXT_FONT_PATH}
          fontSize={nameBadgeLayout.height * 0.2}
          maxWidth={nameBadgeLayout.width * 0.88}
          anchorX="center"
          anchorY="middle"
          color={DESK_PLAQUE_TEXT_COLOR}
          depthOffset={-1}
        >
          Akmal Hasan Mulyadi
        </Text>
      </mesh>
    </group>
  );
}

function BookLabel({
  position,
  text,
  visible
}: {
  position: [number, number, number],
  text: string,
  visible: boolean
}) {
  return (
    <group position={position}>
      <Html
        center
        style={{
          pointerEvents: 'none',
          transition: 'opacity 0.5s',
          opacity: visible ? 1 : 0,
          whiteSpace: 'nowrap',
          zIndex: 0
        }}
      >
        <div className="flex flex-col items-center gap-1 select-none">
          <span
            style={{
              fontFamily: 'var(--font-caveat), "Caveat", cursive',
              fontSize: '1.5rem',
              color: '#ead4a1',
              textShadow: '0 2px 4px rgba(0,0,0,0.8)',
              fontWeight: 700
            }}
          >
            {text}
          </span>
          <span
            className="animate-bounce"
            style={{
              color: '#ead4a1',
              fontSize: '1.5rem',
              textShadow: '0 2px 4px rgba(0,0,0,0.8)'
            }}
          >
            ↓
          </span>
        </div>
      </Html>
    </group>
  );
}

interface InteractiveBooksProps {
  renderSecondBook: boolean;
  renderThirdBook: boolean;
  renderFourthBook: boolean;
  renderFifthBook: boolean;
  enableShadows: boolean;
  labelsVisible: boolean;
  textureLoadRadius: number;
  book1Pages: Array<{ front: string; back: string }>;
  book2Pages: Array<{ front: string; back: string }>;
  book3Pages: Array<{ front: string; back: string }>;
  book4Pages: Array<{ front: string; back: string }>;
  book5Pages: Array<{ front: string; back: string }>;
  book1DynamicContent: ReturnType<typeof useBookSideTextures>;
  book2DynamicContent: ReturnType<typeof useBookSideContent>;
  book2ProfileImageUrl: string | null;
  bookFocused: boolean;
  portfolioLabel: string;
  aboutLabel: string;
  onBookFocus: () => void;
}

function InteractiveBooks({
  renderSecondBook,
  renderThirdBook,
  renderFourthBook,
  renderFifthBook,
  enableShadows,
  labelsVisible,
  textureLoadRadius,
  book1Pages,
  book2Pages,
  book3Pages,
  book4Pages,
  book5Pages,
  book1DynamicContent,
  book2DynamicContent,
  book2ProfileImageUrl,
  bookFocused,
  portfolioLabel,
  aboutLabel,
  onBookFocus,
  spotlightBook,
  onSpotlightChange,
}: InteractiveBooksProps & {
  spotlightBook: BookId;
  onSpotlightChange: (id: BookId) => void;
}) {
  const book1GroupRef = useRef<Group | null>(null);
  const book2GroupRef = useRef<Group | null>(null);
  const spotlightBookRef = useRef<BookId>(spotlightBook);

  // Sync ref with prop for useFrame and event handlers
  useEffect(() => {
    spotlightBookRef.current = spotlightBook;
  }, [spotlightBook]);

  const swapAnimationRef = useRef<{ startedAtMs: number; spotlightBeforeSwap: BookId } | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);

  // Track book thickness for dynamic Y positioning
  const [book1Thickness, setBook1Thickness] = useState<number>(0);
  const [book2Thickness, setBook2Thickness] = useState<number>(0);
  const book2CenterSpreadPivot = Math.floor(book2Pages.length / 2) + 1;
  const isBook2Focused = bookFocused && spotlightBook === 'book2';
  const book2LockedMinPage = isBook2Focused ? book2CenterSpreadPivot : 0;
  const book2LockedMaxPage = isBook2Focused
    ? book2CenterSpreadPivot
    : Number.POSITIVE_INFINITY;

  const getSlotForBook = useCallback(
    (bookId: BookId, spotlightBook: BookId): BookSlot => (
      bookId === spotlightBook ? 'lamp' : 'side'
    ),
    [],
  );

  const handleBookClick = useCallback((bookId: BookId) => {
    const currentSpotlightBook = spotlightBookRef.current;

    // If the lamp-slot book is clicked and camera is NOT yet focused → trigger focus
    if (bookId === currentSpotlightBook && !bookFocused) {
      onBookFocus();
      return true; // consume click
    }

    // If already focused on book, let Book3D handle the click (page flip)
    if (bookId === currentSpotlightBook && bookFocused) {
      return false;
    }

    if (!renderSecondBook) {
      return false;
    }
    if (swapAnimationRef.current) {
      return true;
    }

    swapAnimationRef.current = {
      startedAtMs: performance.now(),
      spotlightBeforeSwap: currentSpotlightBook,
    };
    setIsSwapping(true);
    return true;
  }, [renderSecondBook, bookFocused, onBookFocus]);

  useFrame(() => {
    const book1Group = book1GroupRef.current;
    if (!book1Group) {
      return;
    }

    if (!renderSecondBook) {
      setGroupTransform(book1Group, getSlotTransformForBook('lamp', book1Thickness));
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
      setGroupTransform(book1Group, getSlotTransformForBook(book1Slot, book1Thickness));
      setGroupTransform(book2Group, getSlotTransformForBook(book2Slot, book2Thickness));
      return;
    }

    const rawProgress = MathUtils.clamp(
      (performance.now() - swapAnimation.startedAtMs) / BOOK_SWAP_DURATION_MS,
      0,
      1,
    );
    const easedProgress = MathUtils.smootherstep(rawProgress, 0, 1);
    const inAirFactor = Math.sin(Math.PI * easedProgress);

    const applySwapPose = (bookId: BookId, group: Group, bookThickness: number) => {
      const startSlot = getSlotForBook(bookId, swapAnimation.spotlightBeforeSwap);
      const endSlot: BookSlot = startSlot === 'lamp' ? 'side' : 'lamp';
      const startTransform = getSlotTransformForBook(startSlot, bookThickness);
      const endTransform = getSlotTransformForBook(endSlot, bookThickness);
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

    applySwapPose('book1', book1Group, book1Thickness);
    applySwapPose('book2', book2Group, book2Thickness);

    if (rawProgress >= 1) {
      const newSpotlight = swapAnimation.spotlightBeforeSwap === 'book1' ? 'book2' : 'book1';
      spotlightBookRef.current = newSpotlight;
      onSpotlightChange(newSpotlight);
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
          pages={book1Pages}
          coverColor="#4a3020"
          coverFrontTexturePath="/textures/book1-cover-front.webp"
          coverBackTexturePath="/textures/book1-cover-back.webp"
          spineBaseOffset={[-0.07, -0.002, 0.012]}
          coverFrontTextureOffsetY={0}
          enableShadows={enableShadows}
          textureLoadRadius={textureLoadRadius}
          contentEnabled={true}
          dynamicContent={book1DynamicContent}
          onBookClick={() => handleBookClick('book1')}
          interactionDisabled={isSwapping || (bookFocused && spotlightBook !== 'book1')}
          onThicknessChange={setBook1Thickness}
          pageSegments={PRIMARY_BOOK_PAGE_SEGMENTS}
          minPage={bookFocused && spotlightBook === 'book1' ? 1 : 0}
        />
        <BookLabel
          position={[0, 0, 0.6]}
          text={portfolioLabel}
          visible={labelsVisible && !bookFocused && !isSwapping}
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
            dynamicContent={book2DynamicContent.textures}
            dynamicLinkRegions={book2DynamicContent.linkRegions}
            frontCoverAvatarUrl={book2ProfileImageUrl ?? undefined}
            largeBookFanSpreadDeg={8}
            onBookClick={() => handleBookClick('book2')}
            interactionDisabled={isSwapping || (bookFocused && spotlightBook === 'book2')}
            onThicknessChange={setBook2Thickness}
            pageSegments={PRIMARY_BOOK_PAGE_SEGMENTS}
            minPage={book2LockedMinPage}
            maxPage={book2LockedMaxPage}
            chainBackwardTurns={true}
          />
          <BookLabel
            position={[0, 0, 0.6]}
            text={aboutLabel}
            visible={labelsVisible && !bookFocused && !isSwapping}
          />
        </group>
      )}

      {renderThirdBook && (
        <group
          position={BOOK3_POSITION}
          scale={BOOK3_SCALE}
          rotation={BOOK3_ROTATION_RAD}
        >
          <Book3D
            bookAtom={book3Atom}
            pages={book3Pages}
            coverColor={BOOK_COVER_COLORS.book3}
            enableShadows={enableShadows}
            textureLoadRadius={textureLoadRadius}
            largeBookFanSpreadDeg={8}
            interactionDisabled={true}
            pageSegments={8}
          />
        </group>
      )}

      {renderFourthBook && (
        <group
          position={BOOK4_POSITION}
          scale={BOOK4_SCALE}
          rotation={BOOK4_ROTATION_RAD}
        >
          <Book3D
            bookAtom={book4Atom}
            pages={book4Pages}
            coverColor={BOOK_COVER_COLORS.book4}
            enableShadows={enableShadows}
            textureLoadRadius={textureLoadRadius}
            largeBookFanSpreadDeg={8}
            interactionDisabled={true}
            pageSegments={8}
          />
        </group>
      )}

      {renderFifthBook && (
        <group
          position={BOOK5_POSITION}
          scale={BOOK5_SCALE}
          rotation={BOOK5_ROTATION_RAD}
        >
          <Book3D
            bookAtom={book5Atom}
            pages={book5Pages}
            coverColor={BOOK_COVER_COLORS.book5}
            enableShadows={enableShadows}
            textureLoadRadius={textureLoadRadius}
            largeBookFanSpreadDeg={8}
            interactionDisabled={true}
            pageSegments={8}
          />
        </group>
      )}
    </>
  );
}

export default function Hero() {
  const lampSpotRef = useRef<SpotLightImpl | null>(null);
  const lampTargetRef = useRef<Object3D | null>(null);
  const [gpu, setGpu] = useState<Pick<TierResult, 'isMobile' | 'tier'> | null>(null);
  const { active: assetsLoading, progress: loadingProgress } = useProgress();
  const heroBootAtRef = useRef<number>(0);
  const loaderProgressRef = useRef(0);

  const [gpuDetectTimedOut, setGpuDetectTimedOut] = useState(false);
  const [resolvedProfileName, setResolvedProfileName] = useState<SceneProfile["name"] | null>(null);
  const [sceneAssetsReady, setSceneAssetsReady] = useState(false);
  const [loaderProgressPercent, setLoaderProgressPercent] = useState(0);
  const [showLoaderOverlay, setShowLoaderOverlay] = useState(true);
  const [revealStarted, setRevealStarted] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>('id');

  const profileResolved = resolvedProfileName !== null;
  const sceneProfile = profileResolved
    ? SCENE_PROFILES[resolvedProfileName]
    : SCENE_PROFILES.mobile;
  const isLowEndDevice = sceneProfile.name === 'mobile';
  const translatedText = HERO_TRANSLATIONS[language];

  useEffect(() => {
    let cancelled = false;

    const detectGpu = async () => {
      try {
        const { getGPUTier } = await import('detect-gpu');
        const result = await getGPUTier();
        if (!cancelled) {
          setGpu({ isMobile: result.isMobile, tier: result.tier });
        }
      } catch {
        if (!cancelled) {
          setGpu(null);
        }
      }
    };

    detectGpu();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const preloadCriticalAssets = () => {
      if (cancelled) {
        return;
      }
      CRITICAL_MODEL_PATHS.forEach((path) => useGLTF.preload(path, true, false));
      CRITICAL_TEXTURE_PATHS.forEach((path) => useTexture.preload(path));
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleHandle = window.requestIdleCallback(preloadCriticalAssets, { timeout: 1200 });
    } else {
      timeoutHandle = setTimeout(preloadCriticalAssets, 200);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
    };
  }, []);

  useEffect(() => {
    if (gpu || gpuDetectTimedOut) {
      return;
    }

    const timer = setTimeout(() => setGpuDetectTimedOut(true), 1400);
    return () => clearTimeout(timer);
  }, [gpu, gpuDetectTimedOut]);

  useEffect(() => {
    if (resolvedProfileName) {
      return;
    }
    if (!gpu && !gpuDetectTimedOut) {
      return;
    }

    const gpuSuggestsLowEnd = !gpu || gpu.isMobile || gpu.tier <= 1;
    setResolvedProfileName(gpuSuggestsLowEnd ? 'mobile' : 'desktop');
  }, [gpu, gpuDetectTimedOut, resolvedProfileName]);

  useEffect(() => {
    heroBootAtRef.current = performance.now();
  }, []);

  const handleSceneAssetsReady = useCallback(() => {
    setSceneAssetsReady(true);
  }, []);

  useEffect(() => {
    if (!profileResolved || sceneAssetsReady) {
      return;
    }
    if (!assetsLoading && loaderProgressRef.current === 0) {
      return;
    }

    const nextProgress = Math.max(
      loaderProgressRef.current,
      Math.min(
        HERO_LOADER_MAX_PROGRESS_BEFORE_READY,
        Math.max(0, Math.round(loadingProgress)),
      ),
    );

    if (nextProgress !== loaderProgressRef.current) {
      loaderProgressRef.current = nextProgress;
      setLoaderProgressPercent(nextProgress);
    }
  }, [assetsLoading, loadingProgress, profileResolved, sceneAssetsReady]);

  useEffect(() => {
    if (!sceneAssetsReady) {
      return;
    }

    loaderProgressRef.current = 100;
    setLoaderProgressPercent(100);
  }, [sceneAssetsReady]);

  useEffect(() => {
    if (!showLoaderOverlay || revealStarted) {
      return;
    }
    if (!profileResolved || !sceneAssetsReady) {
      return;
    }

    const elapsed = performance.now() - heroBootAtRef.current;
    const delay = Math.max(0, HERO_LOADER_MIN_MS - elapsed);
    const timer = setTimeout(() => setRevealStarted(true), delay);

    return () => clearTimeout(timer);
  }, [profileResolved, sceneAssetsReady, revealStarted, showLoaderOverlay]);

  useEffect(() => {
    if (!revealStarted) {
      return;
    }

    const timer = setTimeout(() => setShowLoaderOverlay(false), HERO_REVEAL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [revealStarted]);

  // Camera focus state
  const [cameraPhase, setCameraPhase] = useState<CameraPhase>('overview');
  const bookFocused = cameraPhase === 'focused' || cameraPhase === 'focusing';


  const [spotlightBook, setSpotlightBook] = useState<BookId>('book1');

  // Get current page of the spotlight book to hide back button when page is flipped
  const activeBookAtom = useMemo(() => {
    switch (spotlightBook) {
      case 'book2': return book2Atom;
      case 'book3': return book3Atom;
      case 'book4': return book4Atom;
      case 'book5': return book5Atom;
      default: return bookAtom;
    }
  }, [spotlightBook]);
  const currentBook1Page = useAtomValue(bookAtom);
  const currentBook2Page = useAtomValue(book2Atom);
  const currentSpotlightPage = useAtomValue(activeBookAtom);

  // Use the dynamic atom for the setter
  const setSpotlightPage = useSetAtom(activeBookAtom);

  // Auto-open front cover when camera focuses on the book
  const [showBackButton, setShowBackButton] = useState(false);
  useEffect(() => {
    if (cameraPhase === 'focused') {
      if (spotlightBook === 'book2') {
        // Lock to center spread for Book 2.
        setSpotlightPage(BOOK2_CENTER_SPREAD_PIVOT);
      } else {
        setSpotlightPage(1); // Open front cover for others
      }
      // Show the back button after the book has fully opened
      const timer = setTimeout(() => setShowBackButton(true), 1400);
      return () => clearTimeout(timer);
    } else if (cameraPhase === 'book-closing') {
      setSpotlightPage(0); // Close book
      const closeDelayMs = spotlightBook === 'book2' ? BOOK2_CLOSE_DELAY_MS : BOOK_CLOSE_DELAY_MS;
      // Wait for the book closing animation, then start camera unfocusing
      const timer = setTimeout(() => {
        setCameraPhase('unfocusing');
      }, closeDelayMs);
      return () => clearTimeout(timer);
    } else {
      setShowBackButton(false);
    }
  }, [cameraPhase, setSpotlightPage, spotlightBook]);

  const handleBookFocus = useCallback(() => {
    if (cameraPhase === 'overview') {
      setCameraPhase('focusing');
    }
  }, [cameraPhase]);

  const handleBackToOverview = useCallback(() => {
    if (cameraPhase === 'focused') {
      setCameraPhase('book-closing');
    }
  }, [cameraPhase]);

  const handleTransitionDone = useCallback(() => {
    setCameraPhase((prev) => {
      if (prev === 'focusing') return 'focused';
      if (prev === 'unfocusing') return 'overview';
      return prev;
    });
  }, []);

  const handleToggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === 'id' ? 'en' : 'id'));
  }, []);

  const book1Pages = useMemo(
    () => createBlankBookInteriorPages(BOOK1_INTERIOR_SHEET_COUNT),
    [],
  );
  const book2Pages = useMemo(
    () => createBlankBookInteriorPages(sceneProfile.secondBookSheetCount),
    [sceneProfile.secondBookSheetCount],
  );
  const book3Pages = useMemo(
    () => createBookInteriorPages(sceneProfile.thirdBookSheetCount),
    [sceneProfile.thirdBookSheetCount],
  );
  const book4Pages = useMemo(
    () => createBookInteriorPages(sceneProfile.fourthBookSheetCount),
    [sceneProfile.fourthBookSheetCount],
  );
  const book5Pages = useMemo(
    () => createBookInteriorPages(sceneProfile.fifthBookSheetCount),
    [sceneProfile.fifthBookSheetCount],
  );

  // Dynamic content for Book 1
  const book1DynamicContent = useBookSideTextures({
    bookKey: "book-1",
    totalPageEntries: book1Pages.length + 2, // interior sheets + 2 covers
    canvasHeight: isLowEndDevice ? BOOK_DYNAMIC_CANVAS_HEIGHT_MOBILE : BOOK_DYNAMIC_CANVAS_HEIGHT_DESKTOP,
    textureLoadRadius: sceneProfile.bookTextureLoadRadius,
    currentPage: currentBook1Page,
    enabled: true,
  });

  // Dynamic content for Book 2
  const book2DynamicContent = useBookSideContent({
    bookKey: "book-2",
    totalPageEntries: book2Pages.length + 2, // interior sheets + 2 covers
    canvasHeight: isLowEndDevice ? 1024 : 1536,
    textureLoadRadius: sceneProfile.bookTextureLoadRadius,
    currentPage: currentBook2Page,
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
    <div className={`${caveat.variable} h-screen w-full bg-[#101010] relative`}>

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
        camera={{ position: [2.2, 1.0, 3.8], fov: 40 }}
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

        <ambientLight intensity={0.5} />

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

        {profileResolved && (
          <>
            <Suspense fallback={null} key={`${sceneProfile.name}-core`}>
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
                stringMessage={translatedText.lampStringMessage}
              />

              <InteractiveBooks
                renderSecondBook={sceneProfile.renderSecondBook}
                renderThirdBook={sceneProfile.renderThirdBook}
                renderFourthBook={sceneProfile.renderFourthBook}
                renderFifthBook={sceneProfile.renderFifthBook}
                enableShadows={sceneProfile.enableShadows}
                labelsVisible={!showLoaderOverlay}
                textureLoadRadius={sceneProfile.bookTextureLoadRadius}
                book1Pages={book1Pages}
                book2Pages={book2Pages}
                book3Pages={book3Pages}
                book4Pages={book4Pages}
                book5Pages={book5Pages}
                book1DynamicContent={book1DynamicContent}
                book2DynamicContent={book2DynamicContent}
                book2ProfileImageUrl={book2ProfileImageUrl}
                bookFocused={bookFocused}
                portfolioLabel={translatedText.portfolioLabel}
                aboutLabel={translatedText.aboutLabel}
                onBookFocus={handleBookFocus}
                spotlightBook={spotlightBook}
                onSpotlightChange={setSpotlightBook}
              />

              <CoffeeMug
                steamEnabled={sceneProfile.renderSteam}
                enableShadows={sceneProfile.enableShadows}
                position={[1.3, 0.04, -0.6]}
                rotation={[0, Math.PI / -2, 0]}
              />
              <LanguageToggle3D
                enableShadows={sceneProfile.enableShadows}
                language={language}
                languageLabel={translatedText.languageLabel}
                hintPrefix={translatedText.languageToggleHint}
                onToggleLanguage={handleToggleLanguage}
                position={LANGUAGE_TOGGLE_POSITION}
                rotation={LANGUAGE_TOGGLE_ROTATION_RAD}
                scale={LANGUAGE_TOGGLE_SCALE}
              />
              <Model
                path="/models/ballpoin_golden/scene.gltf"
                position={[1, 0.16, 0.1]}
                scale={0.3}
                rotation={[0, 0.5, 1.57]}
                enableShadows={sceneProfile.enableShadows}
              />
              <SceneReadySignal onReady={handleSceneAssetsReady} />
            </Suspense>

            <Suspense fallback={null} key={`${sceneProfile.name}-details`}>
              <AntiqueGlobe
                enableShadows={sceneProfile.enableShadows}
                position={ANTIQUE_GLOBE_POSITION}
                rotation={ANTIQUE_GLOBE_ROTATION}
                scale={ANTIQUE_GLOBE_SCALE}
              />
              <DeskNamePlaque
                enableShadows={sceneProfile.enableShadows}
                position={DESK_PLAQUE_POSITION}
                rotation={DESK_PLAQUE_ROTATION_RAD}
                scale={DESK_PLAQUE_SCALE}
              />
              {sceneProfile.renderPlant && (
                <Model
                  path="/models/mini_plant/scene.gltf"
                  position={[-0.65, -0.15, 0.8]}
                  scale={2}
                  rotation={[0, 2, 0]}
                  enableShadows={sceneProfile.enableShadows}
                />
              )}
            </Suspense>
          </>
        )}
        {sceneProfile.enablePostProcessing && !showLoaderOverlay && <PostProcessingEffects />}

        <CameraSetup phase={cameraPhase} onTransitionDone={handleTransitionDone} />

        {/* 3D Home button — on the left page (back of front cover), vintage style */}
        {cameraPhase === 'focused' && (
          <group position={spotlightBook === 'book2' ? BOOK2_BACK_BUTTON_POSITION : BOOK1_BACK_BUTTON_POSITION}>
            <Html
              center
              distanceFactor={1.0}
              style={{ pointerEvents: showBackButton && (spotlightBook === 'book2' || currentSpotlightPage <= 1) ? 'auto' : 'none' }}
              zIndexRange={[100, 0]}
            >
              <button
                onClick={handleBackToOverview}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 18px',
                  borderRadius: '4px',
                  background: 'transparent',
                  border: 'none',
                  color: spotlightBook === 'book2' ? '#ffffff' : '#5a3e28',
                  cursor: 'pointer',
                  fontSize: '22px',
                  fontFamily: 'var(--font-caveat), "Caveat", cursive',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.5px',
                  textDecoration: 'none',
                  transition: 'opacity 0.6s ease, color 0.3s',
                  textShadow: spotlightBook === 'book2' ? '0 1px 3px rgba(0,0,0,0.6)' : '0 1px 2px rgba(90,62,40,0.15)',
                  opacity: showBackButton && (spotlightBook === 'book2' || currentSpotlightPage <= 1) ? 1 : 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = spotlightBook === 'book2' ? '#e0e0e0' : '#3a2010';
                  e.currentTarget.style.textDecoration = 'underline';
                  e.currentTarget.style.textUnderlineOffset = '4px';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = spotlightBook === 'book2' ? '#ffffff' : '#5a3e28';
                  e.currentTarget.style.textDecoration = 'none';
                }}
              >
                {`← ${translatedText.backButton}`}
              </button>
            </Html>
          </group>
        )}
      </Canvas>

      {showLoaderOverlay && (
        <div
          className={`pointer-events-none absolute inset-0 z-20 overflow-hidden transition-opacity duration-700 ${revealStarted ? 'opacity-0' : 'opacity-100'
            }`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(20,20,20,0.7),rgba(5,5,5,1))]" />
          <div
            className={`absolute inset-x-0 top-0 h-1/2 bg-[#050505] transition-all duration-[1200ms] ease-[cubic-bezier(0.2,0.9,0.2,1)] ${revealStarted ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'
              }`}
          />
          <div
            className={`absolute inset-x-0 bottom-0 h-1/2 bg-[#050505] transition-all duration-[1200ms] ease-[cubic-bezier(0.2,0.9,0.2,1)] ${revealStarted ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'
              }`}
          />

          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-4 transition-all duration-500 ${revealStarted ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
              }`}
          >
            <div className="h-14 w-14 animate-spin rounded-full border border-[#f5e4c0]/20 border-t-[#f5e4c0]/90" />
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#f5e4c0]/80 transition-[width] duration-300"
                style={{ width: `${loaderProgressPercent}%` }}
              />
            </div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#f5e4c0]/70">
              {!profileResolved
                ? translatedText.loaderOptimizingDevice
                : sceneAssetsReady
                  ? translatedText.loaderOpeningScene
                  : assetsLoading
                    ? translatedText.loaderLoadingScene
                    : translatedText.loaderPreparingScene}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


