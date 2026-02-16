import { useCursor, useTexture } from "@react-three/drei";
import { ThreeElements, useFrame } from "@react-three/fiber";
import { atom, useAtom, useSetAtom, type PrimitiveAtom } from "jotai";
import { easing } from "maath";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bone,
  BoxGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  MathUtils,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import { pageSideKey } from "@/types/book-content";
import type { DynamicTextureMap } from "@/lib/book-content/useBookSideTextures";

const easingFactor = 0.5;
const easingFactorFold = 0.3;
const turningCurveStrength = 0.09;

const DEFAULT_PAGE_WIDTH = 1.28;
const DEFAULT_PAGE_HEIGHT = 1.71;
const PAGE_DEPTH = 0.005;
const COVER_DEPTH = 0.05;
const COVER_OVERHANG_X = 0.04;
const COVER_OVERHANG_Y = 0.06;
const PAGE_SEGMENTS = 30;
const STACK_GAP = 0.0009;
const PAGE_HEIGHT_SEGMENTS = 4;
const PAGE_DEPTH_SEGMENTS = 2;
const COVER_HEIGHT_SEGMENTS = 20;
const COVER_DEPTH_SEGMENTS = 14;
const COVER_CORNER_RADIUS = 0.045;
const COVER_CONNECTOR_HEIGHT_TRIM = 0.001;
const COVER_CONNECTOR_RADIUS_SCALE = 0.5;
const COVER_CONNECTOR_X_OFFSET = -0.14;
const COVER_CONNECTOR_Y_OFFSET = 0;
const COVER_CONNECTOR_Z_OFFSET = 0.05;
const TAU = Math.PI * 2;
const ANGLE_EPSILON = 1e-5;
const MAX_DIRECTIONAL_TURN = Math.PI - MathUtils.degToRad(2);
const COVER_CLOSED_ANGLE = Math.PI / 2;
// Nearly flat-open against the table while keeping a tiny clearance.
const COVER_OPEN_ANGLE = -Math.PI / 2 + MathUtils.degToRad(1.2);
const COVER_CLOSED_END_ANGLE = -Math.PI / 2;
const RIGHT_STACK_BASE_ANGLE = COVER_OPEN_ANGLE + MathUtils.degToRad(2.4);
const LEFT_STACK_BASE_ANGLE = COVER_CLOSED_ANGLE - MathUtils.degToRad(1.2);
const RIGHT_STACK_FAN_STEP = MathUtils.degToRad(0.72);
const LEFT_STACK_FAN_STEP = MathUtils.degToRad(0.24);
const PAGE_COVER_CLEARANCE_ANGLE = MathUtils.degToRad(3.4);
const COVER_TO_TEXTBLOCK_GAP = 0.0012;
const COVER_SURFACE_GUARD_Z = 0.0016;
const ACTIVE_PAGE_LIFT_Z = 0.0065;
const ACTIVE_PAGE_LIFT_Y = 0.0028;

const whiteColor = new Color("white");
const emissiveColor = new Color("orange");
const paperFaceColor = new Color("#ece0c5");
const paperEdgeColor = new Color("#e1cfaa");
const defaultCoverBoardColor = new Color("#9a3727");
const defaultCoverBoardDarkColor = new Color("#74261a");
const coverConnectorColor = new Color("#4a170f");
const pageSideMaterials: MeshStandardMaterial[] = [
  new MeshStandardMaterial({ color: paperEdgeColor, roughness: 0.96, metalness: 0.01 }),
  new MeshStandardMaterial({ color: paperEdgeColor, roughness: 0.98, metalness: 0.01 }),
  new MeshStandardMaterial({ color: paperEdgeColor, roughness: 0.96, metalness: 0.01 }),
  new MeshStandardMaterial({ color: paperEdgeColor, roughness: 0.96, metalness: 0.01 }),
];
const coverSideMaterialCache = new Map<string, MeshStandardMaterial[]>();

const getCoverSideMaterials = (coverDarkColor: Color) => {
  const cacheKey = coverDarkColor.getHexString();
  const cachedMaterials = coverSideMaterialCache.get(cacheKey);
  if (cachedMaterials) {
    return cachedMaterials;
  }

  const materials = Array.from(
    { length: 4 },
    () => new MeshStandardMaterial({ color: coverDarkColor, roughness: 0.95, metalness: 0.05 }),
  );
  coverSideMaterialCache.set(cacheKey, materials);
  return materials;
};
type GroupProps = ThreeElements["group"];

const normalizeAngleDelta = (delta: number) => {
  let normalized = ((delta + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (Math.abs(normalized + Math.PI) < ANGLE_EPSILON) {
    normalized = -Math.PI;
  }
  return normalized;
};

const isHalfTurn = (delta: number, toleranceRad = MathUtils.degToRad(12)) =>
  Math.abs(Math.abs(delta) - Math.PI) < toleranceRad;

const resolveDirectedTargetAngle = (
  currentAngle: number,
  targetAngle: number,
  preferPositiveTurn: boolean,
  options?: {
    allowLongPath?: boolean;
    halfTurnToleranceRad?: number;
  },
) => {
  const allowLongPath = options?.allowLongPath ?? false;
  const halfTurnToleranceRad = options?.halfTurnToleranceRad ?? MathUtils.degToRad(12);

  let shortestDelta = normalizeAngleDelta(targetAngle - currentAngle);
  const isHalfTurnDelta = isHalfTurn(shortestDelta, halfTurnToleranceRad);
  if (isHalfTurnDelta) {
    shortestDelta = preferPositiveTurn ? Math.PI : -Math.PI;
  }

  let delta = shortestDelta;
  // Direction lock is only needed around 180deg ambiguity.
  // For regular deltas, keep shortest-path to avoid unintended full spins.
  if (isHalfTurnDelta) {
    if (preferPositiveTurn && delta < 0) {
      delta += TAU;
    } else if (!preferPositiveTurn && delta > 0) {
      delta -= TAU;
    }
  }
  // Avoid long-path rotations that visually look like multiple spins.
  if (
    !allowLongPath
    && Math.abs(delta) > MAX_DIRECTIONAL_TURN
    && !isHalfTurnDelta
  ) {
    delta = shortestDelta;
  }
  return currentAngle + delta;
};

interface SkinnedGeometryOptions {
  width: number;
  height: number;
  depth: number;
  heightSegments: number;
  depthSegments: number;
}

const createSkinnedPageGeometry = ({
  width,
  height,
  depth,
  heightSegments,
  depthSegments,
}: SkinnedGeometryOptions) => {
  const geometry = new BoxGeometry(
    width,
    height,
    depth,
    PAGE_SEGMENTS,
    heightSegments,
    depthSegments,
  );
  geometry.translate(width / 2, 0, 0);

  const position = geometry.attributes.position;
  const vertex = new Vector3();
  const skinIndexes: number[] = [];
  const skinWeights: number[] = [];
  const segmentWidth = width / PAGE_SEGMENTS;

  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i);
    const x = MathUtils.clamp(vertex.x, 0, width - 0.00001);
    const skinIndex = Math.min(
      PAGE_SEGMENTS - 1,
      Math.max(0, Math.floor(x / segmentWidth)),
    );
    const skinWeight = (x % segmentWidth) / segmentWidth;

    skinIndexes.push(skinIndex, skinIndex + 1, 0, 0);
    skinWeights.push(1 - skinWeight, skinWeight, 0, 0);
  }

  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndexes, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(skinWeights, 4));

  return geometry;
};

interface CachedPageGeometryOptions extends SkinnedGeometryOptions {
  roundedCornerRadius?: number;
}

const skinnedGeometryCache = new Map<string, BoxGeometry>();

const getCachedSkinnedGeometry = ({
  width,
  height,
  depth,
  heightSegments,
  depthSegments,
  roundedCornerRadius = 0,
}: CachedPageGeometryOptions) => {
  const cacheKey = [
    width.toFixed(5),
    height.toFixed(5),
    depth.toFixed(5),
    heightSegments,
    depthSegments,
    roundedCornerRadius.toFixed(5),
  ].join(":");

  const cachedGeometry = skinnedGeometryCache.get(cacheKey);
  if (cachedGeometry) {
    return cachedGeometry;
  }

  const geometry = createSkinnedPageGeometry({
    width,
    height,
    depth,
    heightSegments,
    depthSegments,
  });

  if (roundedCornerRadius > 0) {
    applyOuterRoundedCornersXY(
      geometry,
      width,
      height,
      roundedCornerRadius,
    );
  }

  skinnedGeometryCache.set(cacheKey, geometry);
  return geometry;
};

const applyOuterRoundedCornersXY = (
  geometry: BoxGeometry,
  width: number,
  height: number,
  radius: number,
) => {
  if (radius <= 0) {
    return;
  }

  const position = geometry.attributes.position;
  const vertex = new Vector3();
  const halfHeight = height / 2;
  const clampedRadius = Math.min(radius, width * 0.25, height * 0.25);
  const topCenterY = halfHeight - clampedRadius;
  const bottomCenterY = -halfHeight + clampedRadius;
  const rightCenterX = width - clampedRadius;

  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i);

    const isRight = vertex.x > width - clampedRadius;
    const isTop = vertex.y > halfHeight - clampedRadius;
    const isBottom = vertex.y < -halfHeight + clampedRadius;

    if (!(isTop || isBottom) || !isRight) {
      continue;
    }

    const centerX = rightCenterX;
    const centerY = isTop ? topCenterY : bottomCenterY;
    const dx = vertex.x - centerX;
    const dy = vertex.y - centerY;
    const cornerLength = Math.hypot(dx, dy) || 1;

    if (cornerLength > clampedRadius) {
      const scale = clampedRadius / cornerLength;
      const nextX = centerX + dx * scale;
      const nextY = centerY + dy * scale;
      position.setXYZ(i, nextX, nextY, vertex.z);
    }
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
};

const pictures = [
  "DSC00680",
  "DSC00933",
  "DSC00966",
  "DSC00983",
  "DSC01011",
  "DSC01040",
  "DSC01064",
  "DSC01071",
  "DSC01103",
  "DSC01145",
  "DSC01420",
  "DSC01461",
  "DSC01489",
  "DSC02031",
  "DSC02064",
  "DSC02069",
  "DSC00680",
  "DSC00933",
  "DSC00966",
  "DSC00983",
  "DSC01011",
  "DSC01040",
  "DSC01064",
  "DSC01071",
  "DSC01103",
  "DSC01145",
  "DSC01420",
  "DSC01461",
  "DSC01489",
  "DSC02031",
  "DSC02064",
  "DSC02069",
];

export const createBookAtom = (initialPage = 0) => atom(initialPage);
export const pageAtom = createBookAtom();
export const pages: Array<{ front: string; back: string }> = [
  {
    front: "__book-cover",
    back: "__cover-inner-front",
  },
];

for (let i = 0; i < pictures.length - 1; i += 2) {
  pages.push({
    front: pictures[i % pictures.length],
    back: pictures[(i + 1) % pictures.length],
  });
}

pages.push({
  front: "__cover-inner-back",
  back: "__book-back",
});

const createCoverConnectorGeometry = (
  height: number,
  depth: number,
) => {
  const connectorHeight = Math.max(0.01, height - COVER_CONNECTOR_HEIGHT_TRIM);
  const connectorRadius = Math.max(0.012, depth * COVER_CONNECTOR_RADIUS_SCALE);
  const geometry = new CylinderGeometry(
    connectorRadius,
    connectorRadius,
    connectorHeight,
    28,
    1,
    false,
    Math.PI / -0.75, // thetaStart adjusted for quarter cylinder
    Math.PI / 1.5,   // thetaLength reduced to ~quarter cylinder (slightly more for coverage)
  );
  // Flat side stays on hinge line (x=0), curved side points outward.
  geometry.rotateY(Math.PI / 2); // Putar 90 derjat agar lengkungan menghadap ke arah yang benar
  return geometry;
};

export interface PageData {
  front: string;
  back: string;
}

const STRIP_FIRST_COVER: PageData = {
  front: "__book-cover",
  back: "__cover-inner-front",
};

const STRIP_LAST_COVER: PageData = {
  front: "__cover-inner-back",
  back: "__book-back",
};

const stripEmbeddedCovers = (inputPages: PageData[]) => {
  const normalizedPages = [...inputPages];
  const firstPage = normalizedPages[0];
  if (
    firstPage
    && firstPage.front === STRIP_FIRST_COVER.front
    && firstPage.back === STRIP_FIRST_COVER.back
  ) {
    normalizedPages.shift();
  }

  const lastPage = normalizedPages[normalizedPages.length - 1];
  if (
    lastPage
    && lastPage.front === STRIP_LAST_COVER.front
    && lastPage.back === STRIP_LAST_COVER.back
  ) {
    normalizedPages.pop();
  }

  return normalizedPages;
};

interface PageProps extends GroupProps {
  number: number;
  front: string;
  back: string;
  page: number;
  opened: boolean;
  bookClosed: boolean;
  bookAtom?: PrimitiveAtom<number>;
  width: number;
  height: number;
  coverColor?: string;
  coverFrontTexturePath?: string;
  coverBackTexturePath?: string;
  frontCoverAvatarUrl?: string;
  coverFrontTextureOffsetY?: number;
  coverBackTextureOffsetY?: number;
  totalPages: number;
  zOffset?: number;
  anchorZOffset?: number;
  texturesEnabled: boolean;
  enableShadows: boolean;
  contentEnabled?: boolean;
  dynamicContent?: DynamicTextureMap;
  /** Controls max fan spread for books with >20 page entries. */
  largeBookFanSpreadDeg?: number;

}

const Page = ({
  number,
  front,
  back,
  page,
  opened,
  bookClosed,
  bookAtom: externalAtom,
  width,
  height,
  coverColor,
  coverFrontTexturePath,
  coverBackTexturePath,
  frontCoverAvatarUrl,
  coverFrontTextureOffsetY,
  coverBackTextureOffsetY,
  totalPages,
  zOffset,
  anchorZOffset,
  texturesEnabled,
  enableShadows,
  contentEnabled,
  dynamicContent,
  largeBookFanSpreadDeg,

  ...props
}: PageProps) => {
  const isCoverPage = number === 0 || number === totalPages - 1;
  const isFrontCover = number === 0;
  const isBackCover = number === totalPages - 1;

  // Dynamic content textures (from Supabase-rendered CanvasTextures)
  const dynamicFrontTexture = contentEnabled && dynamicContent
    ? dynamicContent[pageSideKey(number, "front")]
    : undefined;
  const dynamicBackTexture = contentEnabled && dynamicContent
    ? dynamicContent[pageSideKey(number, "back")]
    : undefined;

  const useLegacyFront = !front.startsWith("__");
  const useLegacyBack = !back.startsWith("__");

  const hasFrontTexture = texturesEnabled && useLegacyFront && !dynamicFrontTexture;
  const hasBackTexture = texturesEnabled && useLegacyBack && !dynamicBackTexture;
  const activeCoverFrontTexturePath = isFrontCover ? coverFrontTexturePath : undefined;
  const activeCoverBackTexturePath = isBackCover ? coverBackTexturePath : undefined;
  const activeCoverAvatarPath = isFrontCover ? frontCoverAvatarUrl : undefined;
  const texturePaths = [
    ...(hasFrontTexture ? [`/textures/${front}.jpg`] : []),
    ...(hasBackTexture ? [`/textures/${back}.jpg`] : []),
    ...(activeCoverFrontTexturePath ? [activeCoverFrontTexturePath] : []),
    ...(activeCoverBackTexturePath ? [activeCoverBackTexturePath] : []),
    ...(activeCoverAvatarPath ? [activeCoverAvatarPath] : []),
  ];

  const loadedTextures = useTexture(
    texturePaths,
    (textures) => {
      const textureArray = Array.isArray(textures) ? textures : [textures];
      textureArray.forEach((texture) => {
        if (texture) {
          texture.colorSpace = SRGBColorSpace;
        }
      });
    },
  ) as Texture[];

  let textureIndex = 0;
  const picture = hasFrontTexture ? loadedTextures[textureIndex++] : undefined;
  const picture2 = hasBackTexture ? loadedTextures[textureIndex++] : undefined;
  const coverFrontTexture = activeCoverFrontTexturePath
    ? loadedTextures[textureIndex++]
    : undefined;
  const coverBackTexture = activeCoverBackTexturePath
    ? loadedTextures[textureIndex++]
    : undefined;
  const coverAvatarTexture = activeCoverAvatarPath
    ? loadedTextures[textureIndex]
    : undefined;

  const mappedCoverFrontTexture = useMemo(() => {
    if (!coverFrontTexture) {
      return undefined;
    }
    const texture = coverFrontTexture.clone();
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.offset.set(0, coverFrontTextureOffsetY ?? 0);
    texture.needsUpdate = true;
    return texture;
  }, [coverFrontTexture, coverFrontTextureOffsetY]);

  const mappedCoverBackTexture = useMemo(() => {
    if (!coverBackTexture) {
      return undefined;
    }
    const texture = coverBackTexture.clone();
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.offset.set(0, coverBackTextureOffsetY ?? 0);
    texture.needsUpdate = true;
    return texture;
  }, [coverBackTexture, coverBackTextureOffsetY]);

  const avatarCircleRadius = (width + COVER_OVERHANG_X) * 0.18;
  const avatarCenterX = (width + COVER_OVERHANG_X) * 0.5;
  const avatarSurfaceZ = COVER_DEPTH * 0.5 + 0.0014;

  const group = useRef<Group | null>(null);
  const turnedAt = useRef(0);
  const lastOpened = useRef(opened);
  const turnDirection = useRef<1 | -1>(opened ? 1 : -1);
  const skinnedMeshRef = useRef<SkinnedMesh | null>(null);
  const idleRef = useRef(false);
  const settledFrameCount = useRef(0);
  const lastFrameState = useRef({
    rootY: opened ? -Math.PI / 2 : Math.PI / 2,
    y: 0,
    z: 0,
  });
  const [highlighted, setHighlighted] = useState(false);
  const setPage = useSetAtom(externalAtom ?? pageAtom);

  const customCoverColor = useMemo(() => coverColor ? new Color(coverColor) : defaultCoverBoardColor, [coverColor]);
  const customCoverDarkColor = useMemo(() => coverColor ? new Color(coverColor).multiplyScalar(0.7) : defaultCoverBoardDarkColor, [coverColor]);

  const manualSkinnedMesh = useMemo(() => {
    const pageGeometry = getCachedSkinnedGeometry({
      width: width,
      height: height,
      depth: PAGE_DEPTH,
      heightSegments: PAGE_HEIGHT_SEGMENTS,
      depthSegments: PAGE_DEPTH_SEGMENTS,
    });

    const coverGeometry = getCachedSkinnedGeometry({
      width: width + COVER_OVERHANG_X,
      height: height + COVER_OVERHANG_Y,
      depth: COVER_DEPTH,
      heightSegments: COVER_HEIGHT_SEGMENTS,
      depthSegments: COVER_DEPTH_SEGMENTS,
      roundedCornerRadius: COVER_CORNER_RADIUS,
    });

    const bones: Bone[] = [];
    const segmentWidth = (isCoverPage ? width + COVER_OVERHANG_X : width) / PAGE_SEGMENTS;

    for (let i = 0; i <= PAGE_SEGMENTS; i += 1) {
      const bone = new Bone();
      bone.position.x = i === 0 ? 0 : segmentWidth;
      bones.push(bone);
      if (i > 0) {
        bones[i - 1].add(bone);
      }
    }

    const skeleton = new Skeleton(bones);

    const sideMaterials = isCoverPage
      ? getCoverSideMaterials(customCoverDarkColor)
      : pageSideMaterials;

    // Resolve front face map: dynamic > legacy photo > none
    const frontFaceMap = isCoverPage
      ? (isFrontCover && mappedCoverFrontTexture ? mappedCoverFrontTexture : undefined)
      : dynamicFrontTexture
        ? dynamicFrontTexture
        : picture
          ? picture
          : undefined;

    // Resolve back face map: dynamic > legacy photo > none
    const backFaceMap = isCoverPage
      ? (isBackCover && mappedCoverBackTexture ? mappedCoverBackTexture : undefined)
      : dynamicBackTexture
        ? dynamicBackTexture
        : picture2
          ? picture2
          : undefined;

    // Choose front face color
    const frontFaceColor = isCoverPage
      ? isFrontCover
        ? mappedCoverFrontTexture ? whiteColor : customCoverColor
        : paperFaceColor
      : frontFaceMap
        ? whiteColor
        : paperFaceColor;

    // Choose back face color
    const backFaceColor = isCoverPage
      ? isBackCover
        ? mappedCoverBackTexture ? whiteColor : customCoverColor
        : paperFaceColor
      : backFaceMap
        ? whiteColor
        : paperFaceColor;

    const materials: MeshStandardMaterial[] = [
      ...sideMaterials,
      new MeshStandardMaterial({
        color: frontFaceColor,
        ...(frontFaceMap ? { map: frontFaceMap } : {}),
        roughness: isCoverPage ? 0.9 : 0.1,
        emissive: emissiveColor,
        emissiveIntensity: 0,
      }),
      new MeshStandardMaterial({
        color: backFaceColor,
        ...(backFaceMap ? { map: backFaceMap } : {}),
        roughness: isCoverPage ? 0.9 : 0.1,
        emissive: emissiveColor,
        emissiveIntensity: 0,
      }),
    ];

    const mesh = new SkinnedMesh(isCoverPage ? coverGeometry : pageGeometry, materials);
    mesh.castShadow = enableShadows;
    mesh.receiveShadow = enableShadows;
    mesh.frustumCulled = false;
    mesh.add(skeleton.bones[0]);
    mesh.bind(skeleton);
    return mesh;
  }, [
    hasBackTexture,
    hasFrontTexture,
    isBackCover,
    isFrontCover,
    isCoverPage,
    picture,
    picture2,
    mappedCoverFrontTexture,
    mappedCoverBackTexture,
    dynamicFrontTexture,
    dynamicBackTexture,
    width,
    height,
    customCoverColor,
    customCoverDarkColor,
    enableShadows,
  ]);

  useCursor(highlighted);

  // Stack rank calculation updated to work with variable total pages
  const stackRank = isCoverPage
    || bookClosed
    ? 0
    : opened
      ? Math.max(0, page - number)
      : Math.max(0, number - page);

  const relativeSheetZ = (zOffset ?? 0) - (anchorZOffset ?? 0);

  // Prevent stack settling from pushing pages through the cover.
  const maxSafeStackOffset = Math.max(0.00035, COVER_TO_TEXTBLOCK_GAP * 0.65);
  const stackDepthOffset = Math.min(maxSafeStackOffset, stackRank * 0.00035);
  const stackSettleY = isCoverPage ? 0 : -Math.min(0.014, stackRank * 0.0018);
  const stackSettleZ = isCoverPage
    ? 0
    : (opened ? -1 : 1) * stackDepthOffset;
  const coverSurfaceGuard = isCoverPage
    ? (isFrontCover ? COVER_SURFACE_GUARD_Z : -COVER_SURFACE_GUARD_Z)
    : 0;

  useEffect(() => {
    settledFrameCount.current = 0;
  }, [bookClosed, highlighted, opened, page, totalPages]);

  useFrame((_, delta) => {
    if (!skinnedMeshRef.current || !group.current) {
      return;
    }


    const materials = skinnedMeshRef.current.material as MeshStandardMaterial[];
    const emissiveIntensity = highlighted ? 0.22 : 0;
    if (materials[4] && (highlighted || materials[4].emissiveIntensity > 0.001)) {
      materials[4].emissiveIntensity = MathUtils.lerp(materials[4].emissiveIntensity, emissiveIntensity, 0.1);
    }
    if (materials[5] && (highlighted || materials[5].emissiveIntensity > 0.001)) {
      materials[5].emissiveIntensity = MathUtils.lerp(materials[5].emissiveIntensity, emissiveIntensity, 0.1);
    }

    if (lastOpened.current !== opened) {
      turnedAt.current = Date.now();
      turnDirection.current = opened ? 1 : -1;
      lastOpened.current = opened;
    }

    let turningTime = Math.min(400, Date.now() - turnedAt.current) / 400;
    turningTime = Math.sin(turningTime * Math.PI);
    const isBackwardTurn = turnDirection.current === -1 && turningTime > 0.001;

    // Standard lift for turning
    const turnLiftFactor = !isCoverPage && !bookClosed ? turningTime : 0;
    const turnLiftSign = opened ? 1 : -1;
    const targetLiftZ = turnLiftFactor * ACTIVE_PAGE_LIFT_Z * turnLiftSign;
    const targetLiftY = turnLiftFactor * ACTIVE_PAGE_LIFT_Y;

    const groupTargetZ = bookClosed ? 0 : targetLiftZ;
    const groupTargetY = bookClosed ? 0 : targetLiftY;
    easing.damp(group.current.position, "z", groupTargetZ, 0.24, delta);
    easing.damp(group.current.position, "y", groupTargetY, 0.24, delta);

    let targetRotation = opened ? -Math.PI / 2 : Math.PI / 2;
    const frontCoverLimit = page > 0 ? COVER_OPEN_ANGLE : COVER_CLOSED_ANGLE;
    const backCoverLimit = page > totalPages - 1 ? COVER_OPEN_ANGLE : COVER_CLOSED_ANGLE;
    const coverAngleMin = Math.min(frontCoverLimit, backCoverLimit);
    const coverAngleMax = Math.max(frontCoverLimit, backCoverLimit);

    if (isCoverPage) {
      if (bookClosed) {
        targetRotation = opened ? COVER_CLOSED_END_ANGLE : COVER_CLOSED_ANGLE;
      } else {
        targetRotation = opened ? COVER_OPEN_ANGLE : COVER_CLOSED_ANGLE;
      }
    } else if (!bookClosed) {
      const leftRank = Math.max(0, page - number);
      const rightRank = Math.max(0, number - page);
      const largeBookFanSpread = Math.max(2, largeBookFanSpreadDeg ?? 30);
      const effectiveFanStep = totalPages > 20
        ? MathUtils.degToRad(largeBookFanSpread / Math.max(1, totalPages - 2))
        : (opened ? RIGHT_STACK_FAN_STEP : LEFT_STACK_FAN_STEP);

      targetRotation = opened
        ? RIGHT_STACK_BASE_ANGLE - leftRank * effectiveFanStep
        : LEFT_STACK_BASE_ANGLE - rightRank * effectiveFanStep;
    }

    const pageDistance = Math.abs(page - number);
    const activeTurnInfluence = isCoverPage
      ? 1
      : MathUtils.clamp(1 - pageDistance / 1.1, 0, 1);

    const bones = skinnedMeshRef.current.skeleton.bones;
    for (let i = 0; i < bones.length; i += 1) {
      const target = i === 0 ? group.current : bones[i];
      if (!target) {
        continue;
      }

      if (bookClosed) {
        const closedRotationY = i === 0 ? targetRotation : 0;
        const isCoverRoot = (isFrontCover || isBackCover) && i === 0;
        if (isCoverRoot) {
          const directedClosedTarget = resolveDirectedTargetAngle(
            target.rotation.y,
            closedRotationY,
            !opened,
            {
              allowLongPath: true,
              halfTurnToleranceRad: MathUtils.degToRad(20),
            },
          );
          easing.damp(target.rotation, "y", directedClosedTarget, easingFactor, delta);
        } else {
          easing.dampAngle(target.rotation, "y", closedRotationY, easingFactor, delta);
        }
        easing.dampAngle(target.rotation, "x", 0, easingFactorFold, delta);
        continue;
      }

      // Normalized position
      const t = i / bones.length;

      // 1. BASE ROTATION (Simple Fan)
      let rotationAngle = 0;
      if (i === 0) {
        rotationAngle = targetRotation;
      } else {
        // Simple curvature for open pages (slight bend)
        // No complex bulge or valley logic
        if (!isCoverPage) {
          // Small constant curve to simulate gravity/fan
          rotationAngle = (opened ? -1 : 1) * 0.05 / bones.length;
        }
      }

      // 2. TURNING ANIMATION (Bend)
      if (!isCoverPage && turningTime > 0.001) {
        // Apply turning curve
        const turnBend = Math.sin(t * Math.PI) * turningCurveStrength * (opened ? 1 : -1) * turningTime;
        if (i > 0) rotationAngle += turnBend;

        const physicsWeight = 1.0 - turningTime;
        rotationAngle *= physicsWeight; // Blend out static pose

        if (i > 0) {
          // Main turn arc
          rotationAngle += (Math.sin(t * Math.PI) * turningTime * 0.5 * (opened ? 1 : -1)) / bones.length * 4.0;
        }
      }

      // --- APPLY LIMITS ---
      if (!isCoverPage && i === 0) {
        const minLimit = coverAngleMin + PAGE_COVER_CLEARANCE_ANGLE;
        const maxLimit = coverAngleMax - PAGE_COVER_CLEARANCE_ANGLE;
        if (minLimit < maxLimit) {
          rotationAngle = MathUtils.clamp(rotationAngle, minLimit, maxLimit);
        } else {
          rotationAngle = (coverAngleMin + coverAngleMax) * 0.5;
        }
      }

      // --- FINAL APPLICATION ---
      const isCoverRoot = (isFrontCover || isBackCover) && i === 0;
      if (isCoverRoot) {
        const preferPositiveTurn = !opened;
        const directedTarget = resolveDirectedTargetAngle(
          target.rotation.y,
          rotationAngle,
          preferPositiveTurn,
          {
            allowLongPath: true,
            halfTurnToleranceRad: MathUtils.degToRad(20),
          },
        );
        easing.damp(target.rotation, "y", directedTarget, easingFactor, delta);
      } else {
        easing.dampAngle(target.rotation, "y", rotationAngle, easingFactor, delta);
        target.rotation.y =
          MathUtils.euclideanModulo(target.rotation.y + Math.PI, TAU) - Math.PI;
      }

      // --- X-Axis Fold ---
      const foldRotationAngle = i === 0 ? 0 : MathUtils.degToRad(Math.sign(targetRotation) * 0.5);
      const foldIntensity =
        !isBackwardTurn && i > 8
          ? Math.sin((i * Math.PI) / bones.length - 0.5) * turningTime * activeTurnInfluence
          : 0;

      easing.dampAngle(
        target.rotation,
        "x",
        foldRotationAngle * foldIntensity,
        easingFactorFold,
        delta,
      );
    }

    const rootBone = skinnedMeshRef.current.skeleton.bones[0];
    if (!rootBone) {
      return;
    }

    const frameDelta =
      Math.abs(normalizeAngleDelta(rootBone.rotation.y - lastFrameState.current.rootY)) +
      Math.abs(group.current.position.y - lastFrameState.current.y) +
      Math.abs(group.current.position.z - lastFrameState.current.z);

    lastFrameState.current = {
      rootY: rootBone.rotation.y,
      y: group.current.position.y,
      z: group.current.position.z,
    };

    /*
    // Removed idle check to prevent animation stuttering
    if (!highlighted && turningTime <= 0.001 && frameDelta < 0.00015) {
      settledFrameCount.current += 1;
      if (settledFrameCount.current > 24) {
        idleRef.current = true;
      }
    } else {
      settledFrameCount.current = 0;
    }
    */
  });

  return (
    <group
      {...props}
      ref={group}
      onPointerEnter={(event) => {
        event.stopPropagation();
        setHighlighted(true);
      }}
      onPointerLeave={(event) => {
        event.stopPropagation();
        setHighlighted(false);
      }}
      onClick={(event) => {
        event.stopPropagation();
        setPage(opened ? number : number + 1);
        setHighlighted(false);
      }}
    >
      <primitive
        object={manualSkinnedMesh}
        ref={skinnedMeshRef}
        position-x={0}
        position-y={stackSettleY}
        position-z={relativeSheetZ + stackSettleZ + coverSurfaceGuard}
      />
      {isFrontCover && coverAvatarTexture ? (
        <mesh
          position-x={avatarCenterX}
          position-y={stackSettleY}
          position-z={relativeSheetZ + stackSettleZ + coverSurfaceGuard + avatarSurfaceZ}
        >
          <circleGeometry args={[avatarCircleRadius, 64]} />
          <meshStandardMaterial
            map={coverAvatarTexture}
            color={whiteColor}
            roughness={0.72}
            metalness={0.02}
          />
        </mesh>
      ) : null}
    </group>
  );
};

export interface Book3DProps extends GroupProps {
  bookAtom?: PrimitiveAtom<number>;
  width?: number;
  height?: number;
  coverColor?: string;
  coverFrontTexturePath?: string;
  coverBackTexturePath?: string;
  frontCoverAvatarUrl?: string;
  coverFrontTextureOffsetY?: number;
  coverBackTextureOffsetY?: number;
  pages?: PageData[];
  textureLoadRadius?: number;
  enableShadows?: boolean;
  /** Enable dynamic content rendering for this book. */
  contentEnabled?: boolean;
  /** Map of page-side keys to CanvasTextures. */
  dynamicContent?: DynamicTextureMap;
  /** Controls max fan spread for books with >20 page entries. */
  largeBookFanSpreadDeg?: number;

}

export const Book3D = ({
  bookAtom: externalAtom,
  width = DEFAULT_PAGE_WIDTH,
  height = DEFAULT_PAGE_HEIGHT,
  coverColor,
  coverFrontTexturePath,
  coverBackTexturePath,
  frontCoverAvatarUrl,
  coverFrontTextureOffsetY,
  coverBackTextureOffsetY,
  pages: customPages,
  textureLoadRadius = Number.POSITIVE_INFINITY,
  enableShadows = true,
  contentEnabled,
  dynamicContent,
  largeBookFanSpreadDeg,

  ...props
}: Book3DProps) => {
  const activeAtom = externalAtom ?? pageAtom;
  const [page] = useAtom(activeAtom);
  const [delayedPage, setDelayedPage] = useState(page);
  const coverConnectorRef = useRef<Group | null>(null);

  const activePages = useMemo(() => {
    if (customPages) {
      const normalizedCustomPages = stripEmbeddedCovers(customPages);
      const wrapped: PageData[] = [
        { front: "__book-cover", back: "__cover-inner-front" },
        ...normalizedCustomPages,
        { front: "__cover-inner-back", back: "__book-back" }
      ];
      return wrapped;
    }
    return pages;
  }, [customPages]);

  const bookClosed = delayedPage === 0 || delayedPage === activePages.length;
  const sheetAnchorIndex = Math.min(
    activePages.length - 1,
    Math.max(0, Math.round(delayedPage)),
  );

  const { sheetZOffsets, totalStackDepth } = useMemo(() => {
    const depths = activePages.map((_, index) =>
      index === 0 || index === activePages.length - 1 ? COVER_DEPTH : PAGE_DEPTH
    );
    const gaps = depths.slice(0, -1).map((_, index) =>
      index === 0 || index === depths.length - 2 ? COVER_TO_TEXTBLOCK_GAP : STACK_GAP
    );
    const total = depths.reduce((sum, d) => sum + d, 0) + gaps.reduce((sum, g) => sum + g, 0);

    const offsets = depths.reduce(
      ({ cursor, sheetOffsets }, depth, index) => {
        const centerZ = cursor - depth / 2;
        const gap = index < gaps.length ? gaps[index] : 0;
        return {
          cursor: cursor - depth - gap,
          sheetOffsets: [...sheetOffsets, centerZ],
        };
      },
      { cursor: total / 2, sheetOffsets: [] as number[] },
    ).sheetOffsets;

    return { sheetZOffsets: offsets, totalStackDepth: total };
  }, [activePages]);

  const coverConnectorGeometry = useMemo(() => createCoverConnectorGeometry(
    height + COVER_OVERHANG_Y,
    totalStackDepth,
  ), [height, totalStackDepth]);

  const customConnectorColor = useMemo(() => coverColor ? new Color(coverColor).multiplyScalar(0.4) : coverConnectorColor, [coverColor]);

  const coverConnectorMaterial = useMemo(() => new MeshStandardMaterial({
    color: customConnectorColor,
    roughness: 0.95,
    metalness: 0.04,
  }), [customConnectorColor]);

  useEffect(() => {
    if (!Number.isFinite(textureLoadRadius)) {
      return;
    }

    const radius = Math.max(0, Math.floor(textureLoadRadius));
    const start = Math.max(0, sheetAnchorIndex - radius - 1);
    const end = Math.min(activePages.length - 1, sheetAnchorIndex + radius + 1);
    for (let i = start; i <= end; i += 1) {
      const pageData = activePages[i];
      if (!pageData) {
        continue;
      }
      if (!pageData.front.startsWith("__")) {
        useTexture.preload(`/textures/${pageData.front}.jpg`);
      }
      if (!pageData.back.startsWith("__")) {
        useTexture.preload(`/textures/${pageData.back}.jpg`);
      }
    }
  }, [activePages, sheetAnchorIndex, textureLoadRadius]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const goToPage = () => {
      setDelayedPage((currentDelayedPage) => {
        if (page === currentDelayedPage) {
          return currentDelayedPage;
        }

        if (page < currentDelayedPage) {
          // Snap backward navigation (9 -> 8 -> 7 ...) without flip-chain animation.
          return page;
        }

        timeoutId = setTimeout(
          goToPage,
          Math.abs(page - currentDelayedPage) > 2 ? 50 : 150,
        );

        if (page > currentDelayedPage) {
          return currentDelayedPage + 1;
        }
        return currentDelayedPage;
      });
    };

    goToPage();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [page]);

  useFrame((_, delta) => {
    if (!coverConnectorRef.current) {
      return;
    }

    const frontCoverRotation = bookClosed
      ? delayedPage === 0
        ? COVER_CLOSED_ANGLE
        : COVER_CLOSED_END_ANGLE
      : delayedPage > 0
        ? COVER_OPEN_ANGLE
        : COVER_CLOSED_ANGLE;
    const backCoverRotation = bookClosed
      ? delayedPage === 0
        ? COVER_CLOSED_ANGLE
        : COVER_CLOSED_END_ANGLE
      : delayedPage > activePages.length - 1
        ? COVER_OPEN_ANGLE
        : COVER_CLOSED_ANGLE;
    const targetConnectorRotation = (frontCoverRotation + backCoverRotation) * 0.5;
    const targetConnectorZ = -sheetZOffsets[sheetAnchorIndex];

    const totalPages = activePages.length;

    // Dynamic spine positioning and rotation
    const normalizedPage = totalPages > 1 ? delayedPage / (totalPages - 1) : 0;
    const balance = (normalizedPage - 0.5) * 2; // -1 (start) to 1 (end)
    const spineOffset = balance * 0.002; // Slight shift to follow the "heavier" side
    const spineRotationAmplitude = Math.PI / 6; // Angle range for dynamic rotation
    const spineTilt = bookClosed ? 0 : -balance * spineRotationAmplitude;

    easing.dampAngle(
      coverConnectorRef.current.rotation,
      "y",
      targetConnectorRotation + spineTilt,
      1,
      delta,
    );

    easing.damp(
      coverConnectorRef.current.position,
      "z",
      targetConnectorZ + COVER_CONNECTOR_Z_OFFSET,
      0.35,
      delta,
    );
    easing.damp(
      coverConnectorRef.current.position,
      "x",
      COVER_CONNECTOR_X_OFFSET + spineOffset,
      0.35,
      delta,
    );
    easing.damp(
      coverConnectorRef.current.position,
      "y",
      (bookClosed ? 0 : 0.005) + COVER_CONNECTOR_Y_OFFSET,
      0.35,
      delta,
    );
  });

  return (
    <group {...props} rotation-y={-Math.PI / 2}>
      <group>
        {activePages.map((pageData, index) => {
          const zOffset = sheetZOffsets[index];
          const isCover = index === 0 || index === activePages.length - 1;
          const shouldUseTexturesForSheet = isCover
            || Math.abs(sheetAnchorIndex - index) <= textureLoadRadius;

          return (
            <Page
              key={index}
              number={index}
              page={delayedPage}
              opened={delayedPage > index}
              bookClosed={bookClosed}
              bookAtom={activeAtom}
              front={pageData.front}
              back={pageData.back}
              width={width}
              height={height}
              coverColor={coverColor}
              coverFrontTexturePath={coverFrontTexturePath}
              coverBackTexturePath={coverBackTexturePath}
              frontCoverAvatarUrl={frontCoverAvatarUrl}
              coverFrontTextureOffsetY={coverFrontTextureOffsetY}
              coverBackTextureOffsetY={coverBackTextureOffsetY}
              totalPages={activePages.length}
              zOffset={zOffset}
              anchorZOffset={sheetZOffsets[sheetAnchorIndex]}
              texturesEnabled={shouldUseTexturesForSheet}
              enableShadows={enableShadows}
              contentEnabled={contentEnabled}
              dynamicContent={dynamicContent}
              largeBookFanSpreadDeg={largeBookFanSpreadDeg}

            />
          );
        })}
      </group>
      <mesh
        ref={coverConnectorRef}
        geometry={coverConnectorGeometry}
        material={coverConnectorMaterial}
        position-x={COVER_CONNECTOR_X_OFFSET}
        position-y={COVER_CONNECTOR_Y_OFFSET}
        position-z={COVER_CONNECTOR_Z_OFFSET}
      />
    </group>
  );
};
