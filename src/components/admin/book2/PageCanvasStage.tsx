"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    ImageBlock,
    LayoutBlock,
    PageSideLayout,
    SvgBlock,
    TextBlock,
    VisualCrop,
} from "@/types/book-content";
import { canAddBlock } from "@/lib/book-content/validation";
import { getSnappedDragDelta, getSnappedUniformResizeScale } from "@/lib/book-content/block-snap";
import {
    nudgeStepAtom,
    selectedBlockIdAtom,
    selectedBlockIdsAtom,
} from "@/lib/book-content/editor-atoms-book2";
import { computeSafeArea } from "@/lib/book-content/padding";
import { sanitizeSvgCode, svgToDataUrl } from "@/lib/book-content/svg-utils";
import { normalizePaperBackground } from "@/lib/book-content/paper-tone";
import { useBookProfileImage } from "@/lib/book-content/useBookProfileImage";
import { BASE_CANVAS_HEIGHT, renderPageSideToCanvas } from "@/lib/book-content/render-canvas";
import { getBlockAspectRatio } from "@/lib/book-content/aspect-ratio";
import { VisualBlockPreview } from "@/components/admin/VisualBlockPreview";
import {
    type CropDragState,
    type VisualCropEdge,
    buildDraggedCrop,
    buildVisualCropBlockForEdge,
    getSnappedCropForEdge,
} from "@/lib/book-content/visual-crop-interaction";
import { normalizeVisualCrop } from "@/lib/book-content/visual-crop";

const CANVAS_DISPLAY_WIDTH = 600;
const PAGE_ASPECT_RATIO = 1.71 / 1.28;
const CANVAS_DISPLAY_HEIGHT = Math.round(CANVAS_DISPLAY_WIDTH * PAGE_ASPECT_RATIO);
const REFERENCE_TEXTURE_HEIGHT = BASE_CANVAS_HEIGHT;
const REFERENCE_TEXTURE_WIDTH = Math.round(REFERENCE_TEXTURE_HEIGHT * (1.28 / 1.71));
const MIN_BLOCK_SIZE = 0.05;
const MIN_NUDGE_STEP = 0.001;
const MAX_NUDGE_STEP = 0.2;
const SNAP_THRESHOLD_PX = 8;
const RESUME_BUTTON_SVG_CODE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 92" fill="none" data-block-role="resume-button">'
    + '<rect x="2" y="2" width="316" height="88" rx="12" fill="#0a0a0a" stroke="#f5f5f5" stroke-width="3"/>'
    + '<rect x="22" y="20" width="38" height="52" rx="6" fill="#f5f5f5"/>'
    + '<path d="M41 31v20" stroke="#0a0a0a" stroke-width="4" stroke-linecap="round"/>'
    + '<path d="M31 43l10 10 10-10" stroke="#0a0a0a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M30 61h22" stroke="#0a0a0a" stroke-width="4" stroke-linecap="round"/>'
    + '<text id="resume-label" x="84" y="58" fill="#f5f5f5" font-size="46" font-family="Arial, sans-serif" font-weight="700">Resume</text>'
    + '</svg>';

interface BlockRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface DragState {
    blockIds: string[];
    startX: number;
    startY: number;
    origins: Record<string, BlockRect>;
}

interface ResizeState {
    blockIds: string[];
    startX: number;
    startY: number;
    origins: Record<string, BlockRect>;
    bounds: BlockRect;
}

interface CropState {
    blockId: string;
    drag: CropDragState;
}

interface PageCanvasStageProps {
    layout: PageSideLayout;
    onLayoutChange: (updater: (prev: PageSideLayout) => PageSideLayout) => void;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    if (target.isContentEditable) {
        return true;
    }
    return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

function getBounds(rects: BlockRect[]): BlockRect | null {
    if (rects.length === 0) {
        return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const rect of rects) {
        minX = Math.min(minX, rect.x);
        minY = Math.min(minY, rect.y);
        maxX = Math.max(maxX, rect.x + rect.w);
        maxY = Math.max(maxY, rect.y + rect.h);
    }

    return {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
    };
}

function areIdListsEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function isVisualBlock(block: LayoutBlock): block is LayoutBlock & (
    { type: "image"; crop?: VisualCrop }
    | { type: "svg"; crop?: VisualCrop }
) {
    return block.type === "image" || block.type === "svg";
}

function getEdgeResizedRect(
    startRect: BlockRect,
    edge: VisualCropEdge,
    deltaX: number,
    deltaY: number,
    minSize: number,
): BlockRect {
    let nextX = startRect.x;
    let nextY = startRect.y;
    let nextW = startRect.w;
    let nextH = startRect.h;

    if (edge === "left") {
        const right = startRect.x + startRect.w;
        nextX = clamp(startRect.x + deltaX, 0, right - minSize);
        nextW = right - nextX;
    } else if (edge === "right") {
        nextW = clamp(startRect.w + deltaX, minSize, 1 - startRect.x);
    } else if (edge === "top") {
        const bottom = startRect.y + startRect.h;
        nextY = clamp(startRect.y + deltaY, 0, bottom - minSize);
        nextH = bottom - nextY;
    } else {
        nextH = clamp(startRect.h + deltaY, minSize, 1 - startRect.y);
    }

    return {
        x: nextX,
        y: nextY,
        w: nextW,
        h: nextH,
    };
}

export function PageCanvasStage({
    layout,
    onLayoutChange,
}: PageCanvasStageProps) {
    const book2ProfileImageUrl = useBookProfileImage({ bookKey: "book-2" });
    const [selectedBlockIds, setSelectedBlockIds] = useAtom(selectedBlockIdsAtom);
    const selectedBlockId = useAtomValue(selectedBlockIdAtom);
    const setSelectedBlockId = useSetAtom(selectedBlockIdAtom);
    const nudgeStep = useAtomValue(nudgeStepAtom);

    const selectedBlockIdSet = useMemo(
        () => new Set(selectedBlockIds),
        [selectedBlockIds],
    );

    const stageRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<DragState | null>(null);
    const [resizing, setResizing] = useState<ResizeState | null>(null);
    const [cropping, setCropping] = useState<CropState | null>(null);
    const [cropPreview, setCropPreview] = useState<{
        blockId: string;
        crop: VisualCrop;
        x: number;
        y: number;
        w: number;
        h: number;
    } | null>(null);
    const [finalRenderPreviewSrc, setFinalRenderPreviewSrc] = useState<string | null>(null);
    const [snapGuide, setSnapGuide] = useState<{ x: number | null; y: number | null }>({
        x: null,
        y: null,
    });
    const multiSelectedBounds = useMemo(() => {
        if (selectedBlockIds.length <= 1) {
            return null;
        }
        const selectedSet = new Set(selectedBlockIds);
        const rects = layout.blocks
            .filter((block) => selectedSet.has(block.id))
            .map((block) => ({ x: block.x, y: block.y, w: block.w, h: block.h }));
        return getBounds(rects);
    }, [layout.blocks, selectedBlockIds]);

    const safeArea = useMemo(
        () =>
            computeSafeArea(
                CANVAS_DISPLAY_WIDTH,
                CANVAS_DISPLAY_HEIGHT,
                layout.paddingOverride,
            ),
        [layout.paddingOverride],
    );

    const referenceSafeArea = useMemo(
        () =>
            computeSafeArea(
                REFERENCE_TEXTURE_WIDTH,
                REFERENCE_TEXTURE_HEIGHT,
                layout.paddingOverride,
            ),
        [layout.paddingOverride],
    );

    const textPreviewScale = useMemo(() => {
        if (referenceSafeArea.h <= 0) {
            return 1;
        }
        return safeArea.h / referenceSafeArea.h;
    }, [referenceSafeArea.h, safeArea.h]);
    const isTransforming = Boolean(dragging || resizing || cropping);
    const showInlinePreview = !finalRenderPreviewSrc || isTransforming;

    useEffect(() => {
        if (isTransforming) {
            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(() => {
            void (async () => {
                try {
                    const canvas = await renderPageSideToCanvas(
                        layout,
                        REFERENCE_TEXTURE_WIDTH,
                        REFERENCE_TEXTURE_HEIGHT,
                    );
                    if (cancelled) {
                        return;
                    }
                    setFinalRenderPreviewSrc(canvas.toDataURL("image/png"));
                } catch {
                    if (!cancelled) {
                        setFinalRenderPreviewSrc(null);
                    }
                }
            })();
        }, 80);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [isTransforming, layout]);

    const applySelection = useCallback(
        (nextIds: string[], primaryId?: string | null) => {
            const nextPrimary =
                nextIds.length === 0
                    ? null
                    : primaryId && nextIds.includes(primaryId)
                        ? primaryId
                        : (nextIds[nextIds.length - 1] ?? null);

            setSelectedBlockIds((prev) =>
                areIdListsEqual(prev, nextIds) ? prev : nextIds,
            );
            setSelectedBlockId((prev) =>
                prev === nextPrimary ? prev : nextPrimary,
            );
        },
        [setSelectedBlockId, setSelectedBlockIds],
    );

    useEffect(() => {
        const available = new Set(layout.blocks.map((b) => b.id));
        const nextIds = selectedBlockIds.filter((id) => available.has(id));
        const primaryStillValid =
            selectedBlockId !== null && available.has(selectedBlockId);

        const nextPrimary =
            nextIds.length === 0
                ? null
                : primaryStillValid
                    ? selectedBlockId
                    : (nextIds[nextIds.length - 1] ?? null);

        const selectionChanged =
            !areIdListsEqual(nextIds, selectedBlockIds)
            || selectedBlockId !== nextPrimary;
        if (!selectionChanged) {
            return;
        }

        applySelection(nextIds, nextPrimary);
    }, [applySelection, layout.blocks, selectedBlockId, selectedBlockIds]);

    const addBlock = useCallback(
        (type: "text" | "image" | "svg" | "profile" | "resume") => {
            if (!canAddBlock(layout)) {
                alert("Maksimal 20 blok per sisi halaman.");
                return;
            }

            const id = crypto.randomUUID();
            const maxZ = layout.blocks.reduce((max, b) => Math.max(max, b.zIndex), 0);

            let newBlock: LayoutBlock;
            if (type === "text") {
                newBlock = {
                    id,
                    type: "text",
                    x: 0.05,
                    y: 0.05,
                    w: 0.4,
                    h: 0.15,
                    aspectRatio: 0.4 / 0.15,
                    zIndex: maxZ + 1,
                    content: "Teks baru",
                    style: {
                        fontSize: 24,
                        fontWeight: 400,
                        textAlign: "left",
                        color: "#000000",
                        lineHeight: 1.4,
                        fontFamily: "sans-serif",
                        listType: "none",
                    },
                } satisfies TextBlock;
            } else if (type === "image") {
                newBlock = {
                    id,
                    type: "image",
                    x: 0.05,
                    y: 0.05,
                    w: 0.4,
                    h: 0.3,
                    aspectRatio: 0.4 / 0.3,
                    zIndex: maxZ + 1,
                    assetPath: "",
                    objectFit: "cover",
                    shape: "rect",
                } satisfies ImageBlock;
            } else if (type === "profile") {
                newBlock = {
                    id,
                    type: "image",
                    x: 0.35,
                    y: 0.35,
                    w: 0.3,
                    h: 0.3,
                    aspectRatio: 1,
                    zIndex: maxZ + 1,
                    assetPath: book2ProfileImageUrl ?? "",
                    objectFit: "cover",
                    shape: "circle",
                } satisfies ImageBlock;
            } else if (type === "resume") {
                newBlock = {
                    id,
                    type: "svg",
                    x: 0.1,
                    y: 0.72,
                    w: 0.44,
                    h: 0.12,
                    aspectRatio: 320 / 92,
                    zIndex: maxZ + 1,
                    objectFit: "contain",
                    svgCode: RESUME_BUTTON_SVG_CODE,
                    linkUrl: "",
                } satisfies SvgBlock;
            } else {
                newBlock = {
                    id,
                    type: "svg",
                    x: 0.05,
                    y: 0.05,
                    w: 0.2,
                    h: 0.2,
                    aspectRatio: 1,
                    zIndex: maxZ + 1,
                    objectFit: "contain",
                    svgCode:
                        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000000"><path d="M12 2L2 22h20L12 2z"/></svg>',
                } satisfies SvgBlock;
            }

            onLayoutChange((prev) => ({
                ...prev,
                blocks: [...prev.blocks, newBlock],
            }));
            applySelection([id], id);
        },
        [applySelection, book2ProfileImageUrl, layout, onLayoutChange],
    );

    const deleteSelectedBlocks = useCallback(() => {
        if (selectedBlockIds.length === 0) {
            return;
        }
        const target = new Set(selectedBlockIds);
        onLayoutChange((prev) => ({
            ...prev,
            blocks: prev.blocks.filter((b) => !target.has(b.id)),
        }));
        applySelection([]);
    }, [applySelection, onLayoutChange, selectedBlockIds]);

    const moveSelectedBlocks = useCallback(
        (deltaX: number, deltaY: number) => {
            if (selectedBlockIds.length === 0) {
                return;
            }

            const target = new Set(selectedBlockIds);
            onLayoutChange((prev) => {
                const selected = prev.blocks.filter((b) => target.has(b.id));
                if (selected.length === 0) {
                    return prev;
                }

                let minDx = Number.NEGATIVE_INFINITY;
                let maxDx = Number.POSITIVE_INFINITY;
                let minDy = Number.NEGATIVE_INFINITY;
                let maxDy = Number.POSITIVE_INFINITY;

                for (const block of selected) {
                    minDx = Math.max(minDx, -block.x);
                    maxDx = Math.min(maxDx, 1 - block.w - block.x);
                    minDy = Math.max(minDy, -block.y);
                    maxDy = Math.min(maxDy, 1 - block.h - block.y);
                }

                const appliedDx = clamp(deltaX, minDx, maxDx);
                const appliedDy = clamp(deltaY, minDy, maxDy);

                if (appliedDx === 0 && appliedDy === 0) {
                    return prev;
                }

                return {
                    ...prev,
                    blocks: prev.blocks.map((block) =>
                        target.has(block.id)
                            ? {
                                ...block,
                                x: block.x + appliedDx,
                                y: block.y + appliedDy,
                            }
                            : block,
                    ),
                };
            });
        },
        [onLayoutChange, selectedBlockIds],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (selectedBlockIds.length === 0 || isTypingTarget(event.target)) {
                return;
            }

            if (event.key === "Backspace" || event.key === "Delete") {
                event.preventDefault();
                deleteSelectedBlocks();
                return;
            }

            const safeStep = clamp(
                Number.isFinite(nudgeStep) ? nudgeStep : 0.01,
                MIN_NUDGE_STEP,
                MAX_NUDGE_STEP,
            );

            let deltaX = 0;
            let deltaY = 0;
            switch (event.key) {
                case "ArrowUp":
                    deltaY = -safeStep;
                    break;
                case "ArrowDown":
                    deltaY = safeStep;
                    break;
                case "ArrowLeft":
                    deltaX = -safeStep;
                    break;
                case "ArrowRight":
                    deltaX = safeStep;
                    break;
                default:
                    return;
            }

            event.preventDefault();
            moveSelectedBlocks(deltaX, deltaY);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [deleteSelectedBlocks, moveSelectedBlocks, nudgeStep, selectedBlockIds.length]);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent, block: LayoutBlock) => {
            e.stopPropagation();
            e.preventDefault();

            if (e.shiftKey) {
                const nextIds = selectedBlockIdSet.has(block.id)
                    ? selectedBlockIds.filter((id) => id !== block.id)
                    : [...selectedBlockIds, block.id];
                applySelection(nextIds, block.id);
                return;
            }

            const activeIds = selectedBlockIdSet.has(block.id)
                ? selectedBlockIds
                : [block.id];
            applySelection(activeIds, block.id);
            setSnapGuide({ x: null, y: null });

            const origins: Record<string, BlockRect> = {};
            for (const selectedBlock of layout.blocks) {
                if (!activeIds.includes(selectedBlock.id)) {
                    continue;
                }
                origins[selectedBlock.id] = {
                    x: selectedBlock.x,
                    y: selectedBlock.y,
                    w: selectedBlock.w,
                    h: selectedBlock.h,
                };
            }

            setDragging({
                blockIds: activeIds,
                startX: e.clientX,
                startY: e.clientY,
                origins,
            });
            setSnapGuide({ x: null, y: null });
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        [
            applySelection,
            layout.blocks,
            selectedBlockIdSet,
            selectedBlockIds,
        ],
    );

    const handleCropPointerDown = useCallback(
        (e: React.PointerEvent, block: LayoutBlock, edge: VisualCropEdge) => {
            if (block.type !== "text" && !isVisualBlock(block)) {
                return;
            }

            e.stopPropagation();
            e.preventDefault();
            setSnapGuide({ x: null, y: null });
            applySelection([block.id], block.id);
            setDragging(null);
            setResizing(null);
            setSnapGuide({ x: null, y: null });

            const startCrop = normalizeVisualCrop(
                isVisualBlock(block) ? block.crop : undefined,
            );
            setCropping({
                blockId: block.id,
                drag: {
                    edge,
                    startX: e.clientX,
                    startY: e.clientY,
                    startCrop,
                    startRect: { x: block.x, y: block.y, w: block.w, h: block.h },
                },
            });
            const previewBlock = block.type === "text"
                ? getEdgeResizedRect(
                    { x: block.x, y: block.y, w: block.w, h: block.h },
                    edge,
                    0,
                    0,
                    MIN_BLOCK_SIZE,
                )
                : buildVisualCropBlockForEdge(
                    block,
                    startCrop,
                    MIN_BLOCK_SIZE,
                    edge,
                );
            setCropPreview({
                blockId: block.id,
                crop: startCrop,
                x: previewBlock.x,
                y: previewBlock.y,
                w: previewBlock.w,
                h: previewBlock.h,
            });
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        [applySelection],
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (cropping) {
                const source = layout.blocks.find((b) => b.id === cropping.blockId);
                if (!source) {
                    return;
                }

                if (source.type === "text") {
                    const deltaX =
                        safeArea.w > 0 ? (e.clientX - cropping.drag.startX) / safeArea.w : 0;
                    const deltaY =
                        safeArea.h > 0 ? (e.clientY - cropping.drag.startY) / safeArea.h : 0;
                    const previewRect = getEdgeResizedRect(
                        cropping.drag.startRect,
                        cropping.drag.edge,
                        deltaX,
                        deltaY,
                        MIN_BLOCK_SIZE,
                    );
                    setSnapGuide({ x: null, y: null });
                    setCropPreview({
                        blockId: cropping.blockId,
                        crop: cropping.drag.startCrop,
                        x: previewRect.x,
                        y: previewRect.y,
                        w: previewRect.w,
                        h: previewRect.h,
                    });
                    return;
                }

                const nextCrop = buildDraggedCrop(
                    cropping.drag,
                    e.clientX,
                    e.clientY,
                    safeArea.w,
                    safeArea.h,
                );
                const targetRects = layout.blocks
                    .filter((block) => block.id !== cropping.blockId)
                    .map((block) => ({
                        x: block.x,
                        y: block.y,
                        w: block.w,
                        h: block.h,
                    }));
                const snappedCrop = getSnappedCropForEdge(
                    source,
                    nextCrop,
                    cropping.drag.edge,
                    targetRects,
                    SNAP_THRESHOLD_PX / Math.max(1, safeArea.w),
                    SNAP_THRESHOLD_PX / Math.max(1, safeArea.h),
                    MIN_BLOCK_SIZE,
                );
                const previewBlock = buildVisualCropBlockForEdge(
                    source,
                    snappedCrop.crop,
                    MIN_BLOCK_SIZE,
                    cropping.drag.edge,
                );
                setSnapGuide({
                    x: snappedCrop.guideX,
                    y: snappedCrop.guideY,
                });
                setCropPreview({
                    blockId: cropping.blockId,
                    crop: snappedCrop.crop,
                    x: previewBlock.x,
                    y: previewBlock.y,
                    w: previewBlock.w,
                    h: previewBlock.h,
                });
                return;
            }

            if (dragging) {
                const rawDx =
                    safeArea.w > 0 ? (e.clientX - dragging.startX) / safeArea.w : 0;
                const rawDy =
                    safeArea.h > 0 ? (e.clientY - dragging.startY) / safeArea.h : 0;

                const originRects = Object.values(dragging.origins);
                if (originRects.length > 0) {
                    let minDx = Number.NEGATIVE_INFINITY;
                    let maxDx = Number.POSITIVE_INFINITY;
                    let minDy = Number.NEGATIVE_INFINITY;
                    let maxDy = Number.POSITIVE_INFINITY;

                    for (const origin of originRects) {
                        minDx = Math.max(minDx, -origin.x);
                        maxDx = Math.min(maxDx, 1 - origin.w - origin.x);
                        minDy = Math.max(minDy, -origin.y);
                        maxDy = Math.min(maxDy, 1 - origin.h - origin.y);
                    }

                    const proposedDx = clamp(rawDx, minDx, maxDx);
                    const proposedDy = clamp(rawDy, minDy, maxDy);
                    const activeIds = new Set(dragging.blockIds);
                    const targetRects = layout.blocks
                        .filter((block) => !activeIds.has(block.id))
                        .map((block) => ({
                            x: block.x,
                            y: block.y,
                            w: block.w,
                            h: block.h,
                        }));
                    const snapped = getSnappedDragDelta({
                        proposedDx,
                        proposedDy,
                        movingRects: originRects,
                        targetRects,
                        thresholdX: SNAP_THRESHOLD_PX / Math.max(1, safeArea.w),
                        thresholdY: SNAP_THRESHOLD_PX / Math.max(1, safeArea.h),
                    });
                    const appliedDx = clamp(snapped.dx, minDx, maxDx);
                    const appliedDy = clamp(snapped.dy, minDy, maxDy);
                    setSnapGuide({
                        x: snapped.guideX,
                        y: snapped.guideY,
                    });

                    onLayoutChange((prev) => ({
                        ...prev,
                        blocks: prev.blocks.map((block) => {
                            if (!activeIds.has(block.id)) {
                                return block;
                            }
                            const origin = dragging.origins[block.id];
                            if (!origin) {
                                return block;
                            }
                            return {
                                ...block,
                                x: origin.x + appliedDx,
                                y: origin.y + appliedDy,
                            };
                        }),
                    }));
                }
            }

            if (resizing) {
                const rawDx =
                    safeArea.w > 0 ? (e.clientX - resizing.startX) / safeArea.w : 0;
                const rawDy =
                    safeArea.h > 0 ? (e.clientY - resizing.startY) / safeArea.h : 0;
                const scaleByX =
                    resizing.bounds.w > 0
                        ? (resizing.bounds.w + rawDx) / resizing.bounds.w
                        : 1;
                const scaleByY =
                    resizing.bounds.h > 0
                        ? (resizing.bounds.h + rawDy) / resizing.bounds.h
                        : 1;
                const desiredScale =
                    Math.abs(scaleByX - 1) >= Math.abs(scaleByY - 1)
                        ? scaleByX
                        : scaleByY;
                const maxScaleByX =
                    resizing.bounds.w > 0
                        ? (1 - resizing.bounds.x) / resizing.bounds.w
                        : 1;
                const maxScaleByY =
                    resizing.bounds.h > 0
                        ? (1 - resizing.bounds.y) / resizing.bounds.h
                        : 1;
                const maxScale = Math.min(maxScaleByX, maxScaleByY);
                const minScaleByW =
                    resizing.bounds.w > 0 ? MIN_BLOCK_SIZE / resizing.bounds.w : 1;
                const minScaleByH =
                    resizing.bounds.h > 0 ? MIN_BLOCK_SIZE / resizing.bounds.h : 1;
                const minScale = Math.max(minScaleByW, minScaleByH);
                const safeMinScale = Math.min(minScale, maxScale);
                const activeIds = new Set(resizing.blockIds);
                const targetRects = layout.blocks
                    .filter((block) => !activeIds.has(block.id))
                    .map((block) => ({
                        x: block.x,
                        y: block.y,
                        w: block.w,
                        h: block.h,
                    }));
                const snappedResize = getSnappedUniformResizeScale({
                    desiredScale: clamp(desiredScale, safeMinScale, maxScale),
                    minScale: safeMinScale,
                    maxScale,
                    bounds: resizing.bounds,
                    targetRects,
                    thresholdX: SNAP_THRESHOLD_PX / Math.max(1, safeArea.w),
                    thresholdY: SNAP_THRESHOLD_PX / Math.max(1, safeArea.h),
                });
                const uniformScale = snappedResize.scale;
                setSnapGuide({
                    x: snappedResize.guideX,
                    y: snappedResize.guideY,
                });

                onLayoutChange((prev) => ({
                    ...prev,
                    blocks: prev.blocks.map((block) => {
                        if (!activeIds.has(block.id)) {
                            return block;
                        }
                        const origin = resizing.origins[block.id];
                        if (!origin) {
                            return block;
                        }

                        const nextX = clamp(
                            resizing.bounds.x + (origin.x - resizing.bounds.x) * uniformScale,
                            0,
                            1,
                        );
                        const nextY = clamp(
                            resizing.bounds.y + (origin.y - resizing.bounds.y) * uniformScale,
                            0,
                            1,
                        );
                        const scaledW = origin.w * uniformScale;
                        const scaledH = origin.h * uniformScale;
                        const maxW = Math.max(0.001, 1 - nextX);
                        const maxH = Math.max(0.001, 1 - nextY);

                        return {
                            ...block,
                            x: nextX,
                            y: nextY,
                            w: Math.min(maxW, Math.max(MIN_BLOCK_SIZE, scaledW)),
                            h: Math.min(maxH, Math.max(MIN_BLOCK_SIZE, scaledH)),
                            aspectRatio: getBlockAspectRatio(block),
                        };
                    }),
                }));
            }
        },
        [cropping, dragging, layout.blocks, onLayoutChange, resizing, safeArea.h, safeArea.w],
    );

    const handlePointerUp = useCallback(() => {
        if (cropping) {
            const nextCrop =
                cropPreview && cropPreview.blockId === cropping.blockId
                    ? cropPreview.crop
                    : cropping.drag.startCrop;
            const previewRect =
                cropPreview && cropPreview.blockId === cropping.blockId
                    ? { x: cropPreview.x, y: cropPreview.y, w: cropPreview.w, h: cropPreview.h }
                    : cropping.drag.startRect;
            onLayoutChange((prev) => ({
                ...prev,
                blocks: prev.blocks.map((block) =>
                    block.id === cropping.blockId
                        ? block.type === "text"
                            ? {
                                ...block,
                                x: previewRect.x,
                                y: previewRect.y,
                                w: previewRect.w,
                                h: previewRect.h,
                                aspectRatio: previewRect.h > 0
                                    ? previewRect.w / previewRect.h
                                    : block.aspectRatio,
                            }
                            : buildVisualCropBlockForEdge(
                                block,
                                nextCrop,
                                MIN_BLOCK_SIZE,
                                cropping.drag.edge,
                            )
                        : block,
                ),
            }));
        }

        setDragging(null);
        setResizing(null);
        setCropping(null);
        setCropPreview(null);
        setSnapGuide({ x: null, y: null });
    }, [cropPreview, cropping, onLayoutChange]);

    const handleResizePointerDown = useCallback(
        (e: React.PointerEvent, block: LayoutBlock) => {
            e.stopPropagation();
            e.preventDefault();

            const activeIds = selectedBlockIdSet.has(block.id)
                ? selectedBlockIds
                : [block.id];
            applySelection(activeIds, block.id);

            const origins: Record<string, BlockRect> = {};
            const rects: BlockRect[] = [];
            for (const selectedBlock of layout.blocks) {
                if (!activeIds.includes(selectedBlock.id)) {
                    continue;
                }
                const rect = {
                    x: selectedBlock.x,
                    y: selectedBlock.y,
                    w: selectedBlock.w,
                    h: selectedBlock.h,
                };
                origins[selectedBlock.id] = rect;
                rects.push(rect);
            }

            const bounds = getBounds(rects);
            if (!bounds) {
                return;
            }

            setResizing({
                blockIds: activeIds,
                startX: e.clientX,
                startY: e.clientY,
                origins,
                bounds,
            });
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        [
            applySelection,
            layout.blocks,
            selectedBlockIdSet,
            selectedBlockIds,
        ],
    );

    const handleGroupResizePointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (selectedBlockIds.length <= 1) {
                return;
            }

            e.stopPropagation();
            e.preventDefault();

            const activeIds = selectedBlockIds;
            const selectedSet = new Set(activeIds);
            const origins: Record<string, BlockRect> = {};
            const rects: BlockRect[] = [];

            for (const selectedBlock of layout.blocks) {
                if (!selectedSet.has(selectedBlock.id)) {
                    continue;
                }
                const rect = {
                    x: selectedBlock.x,
                    y: selectedBlock.y,
                    w: selectedBlock.w,
                    h: selectedBlock.h,
                };
                origins[selectedBlock.id] = rect;
                rects.push(rect);
            }

            const bounds = getBounds(rects);
            if (!bounds) {
                return;
            }

            setResizing({
                blockIds: activeIds,
                startX: e.clientX,
                startY: e.clientY,
                origins,
                bounds,
            });
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        [layout.blocks, selectedBlockIds],
    );

    const sortedBlocks = [...layout.blocks].sort((a, b) => a.zIndex - b.zIndex);
    const bgColor = normalizePaperBackground(layout.backgroundColor);

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2">
                <button
                    onClick={() => addBlock("text")}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-700"
                >
                    + Teks
                </button>
                <button
                    onClick={() => addBlock("image")}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-700"
                >
                    + Gambar
                </button>
                <button
                    onClick={() => addBlock("svg")}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-700"
                >
                    + SVG
                </button>
                <button
                    onClick={() => addBlock("profile")}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-700"
                >
                    + Profile Page
                </button>
                <button
                    onClick={() => addBlock("resume")}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-700"
                >
                    + Resume
                </button>
                <span className="text-[10px] text-neutral-500">
                    Shift + Click untuk multi-select
                </span>
                {selectedBlockIds.length > 1 && (
                    <span className="rounded border border-amber-700/50 bg-amber-900/20 px-2 py-1 text-[10px] font-medium text-amber-300">
                        {selectedBlockIds.length} blok dipilih
                    </span>
                )}
                {selectedBlockIds.length > 0 && (
                    <button
                        onClick={deleteSelectedBlocks}
                        className="rounded-lg border border-red-800/50 bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/50"
                    >
                        Hapus Blok
                    </button>
                )}
            </div>

            <div
                ref={stageRef}
                className="relative overflow-hidden rounded-lg border border-neutral-700 shadow-lg"
                style={{
                    width: CANVAS_DISPLAY_WIDTH,
                    height: CANVAS_DISPLAY_HEIGHT,
                    backgroundColor: bgColor,
                }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onClick={() => applySelection([])}
            >
                {finalRenderPreviewSrc && !isTransforming && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={finalRenderPreviewSrc}
                        alt="Final render preview"
                        className="pointer-events-none absolute inset-0 h-full w-full"
                        draggable={false}
                    />
                )}

                <div
                    className="pointer-events-none absolute border border-dashed border-neutral-300/30"
                    style={{
                        left: safeArea.x,
                        top: safeArea.y,
                        width: safeArea.w,
                        height: safeArea.h,
                    }}
                />

                {snapGuide.x !== null && (
                    <div
                        className="pointer-events-none absolute bottom-0 top-0 w-px bg-sky-400/90"
                        style={{
                            left: safeArea.x + snapGuide.x * safeArea.w,
                            zIndex: 9996,
                        }}
                    />
                )}
                {snapGuide.y !== null && (
                    <div
                        className="pointer-events-none absolute left-0 right-0 h-px bg-sky-400/90"
                        style={{
                            top: safeArea.y + snapGuide.y * safeArea.h,
                            zIndex: 9996,
                        }}
                    />
                )}

                {sortedBlocks.map((block) => {
                    const isSelected = selectedBlockIdSet.has(block.id);
                    const isPrimarySelection = selectedBlockId === block.id;
                    const isVisual = isVisualBlock(block);
                    const canCrop = block.type === "text"
                        || (isVisual
                            && (block.type === "image"
                                ? Boolean(block.assetPath)
                                : Boolean(sanitizeSvgCode(block.svgCode))));
                    const previewForBlock =
                        cropPreview && cropPreview.blockId === block.id ? cropPreview : null;
                    const previewX = previewForBlock ? previewForBlock.x : block.x;
                    const previewY = previewForBlock ? previewForBlock.y : block.y;
                    const previewW = previewForBlock ? previewForBlock.w : block.w;
                    const previewH = previewForBlock ? previewForBlock.h : block.h;
                    const left = safeArea.x + previewX * safeArea.w;
                    const top = safeArea.y + previewY * safeArea.h;
                    const width = previewW * safeArea.w;
                    const height = previewH * safeArea.h;
                    const circlePreviewSize = Math.min(width, height);
                    const effectiveCrop = previewForBlock
                        ? previewForBlock.crop
                        : (isVisual ? block.crop : undefined);

                    return (
                        <div
                            key={block.id}
                            className={`absolute cursor-move transition-shadow ${
                                isSelected
                                    ? "ring-2 ring-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]"
                                    : block.linkUrl
                                        ? "ring-1 ring-sky-400/70 hover:ring-sky-300"
                                        : "hover:ring-1 hover:ring-neutral-400"
                            }`}
                            style={{
                                left,
                                top,
                                width,
                                height,
                                zIndex: block.zIndex,
                            }}
                            onPointerDown={(e) => handlePointerDown(e, block)}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {showInlinePreview && block.type === "text" ? (
                                <div
                                    className="h-full w-full overflow-hidden"
                                    style={{
                                        fontSize: `${Math.max(
                                            8,
                                            block.style.fontSize * textPreviewScale,
                                        )}px`,
                                        fontWeight: block.style.fontWeight,
                                        textAlign: block.style.textAlign,
                                        color: block.style.color,
                                        lineHeight: block.style.lineHeight,
                                        fontFamily: block.style.fontFamily,
                                        whiteSpace: "pre-wrap",
                                        overflowWrap: "anywhere",
                                        wordBreak: "break-word",
                                    }}
                                >
                                    {block.content || "..."}
                                </div>
                            ) : showInlinePreview && block.type === "image" ? (
                                <div className="flex h-full w-full items-center justify-center overflow-hidden bg-neutral-200">
                                    {block.assetPath ? (
                                        block.shape === "circle" ? (
                                            <div
                                                className="overflow-hidden rounded-full"
                                                style={{
                                                    width: circlePreviewSize,
                                                    height: circlePreviewSize,
                                                }}
                                            >
                                                <VisualBlockPreview
                                                    src={block.assetPath}
                                                    alt="Block image"
                                                    objectFit={block.objectFit}
                                                    crop={effectiveCrop}
                                                />
                                            </div>
                                        ) : (
                                            <VisualBlockPreview
                                                src={block.assetPath}
                                                alt="Block image"
                                                objectFit={block.objectFit}
                                                crop={effectiveCrop}
                                            />
                                        )
                                    ) : (
                                        <span className="text-xs text-neutral-400">
                                            Belum ada gambar
                                        </span>
                                    )}
                                </div>
                            ) : showInlinePreview && block.type === "svg" ? (
                                <div className="flex h-full w-full items-center justify-center">
                                    {(() => {
                                        const sanitized = sanitizeSvgCode(block.svgCode);
                                        const svgUrl = sanitized ? svgToDataUrl(sanitized) : null;
                                        if (!svgUrl) {
                                            return (
                                                <span className="text-xs text-neutral-400">
                                                    SVG tidak valid
                                                </span>
                                            );
                                        }
                                        return (
                                            <VisualBlockPreview
                                                src={svgUrl}
                                                alt="SVG block preview"
                                                objectFit={block.objectFit}
                                                crop={effectiveCrop}
                                            />
                                        );
                                    })()}
                                </div>
                            ) : showInlinePreview ? (
                                <div className="flex h-full w-full items-center justify-center bg-neutral-900/40">
                                    <span className="text-xs text-neutral-400">Tipe blok lama</span>
                                </div>
                            ) : (
                                <div className="h-full w-full" />
                            )}

                            {block.linkUrl && (
                                <div className="pointer-events-none absolute right-1 top-1 rounded bg-sky-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                    Link
                                </div>
                            )}

                            {isPrimarySelection && !multiSelectedBounds && (
                                <div
                                    className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded-full border-2 border-neutral-900 bg-amber-400"
                                    onPointerDown={(e) => handleResizePointerDown(e, block)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            )}

                            {isPrimarySelection && !multiSelectedBounds && canCrop && (
                                <>
                                    <div
                                        className="absolute left-1/2 top-0 h-2 w-5 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-full border border-neutral-500 bg-white/90"
                                        onPointerDown={(e) => handleCropPointerDown(e, block, "top")}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <div
                                        className="absolute bottom-0 left-1/2 h-2 w-5 -translate-x-1/2 translate-y-1/2 cursor-ns-resize rounded-full border border-neutral-500 bg-white/90"
                                        onPointerDown={(e) => handleCropPointerDown(e, block, "bottom")}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <div
                                        className="absolute left-0 top-1/2 h-5 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border border-neutral-500 bg-white/90"
                                        onPointerDown={(e) => handleCropPointerDown(e, block, "left")}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <div
                                        className="absolute right-0 top-1/2 h-5 w-2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border border-neutral-500 bg-white/90"
                                        onPointerDown={(e) => handleCropPointerDown(e, block, "right")}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </>
                            )}
                        </div>
                    );
                })}

                {multiSelectedBounds && (
                    <>
                        <div
                            className="pointer-events-none absolute ring-2 ring-sky-300/90"
                            style={{
                                left: safeArea.x + multiSelectedBounds.x * safeArea.w,
                                top: safeArea.y + multiSelectedBounds.y * safeArea.h,
                                width: multiSelectedBounds.w * safeArea.w,
                                height: multiSelectedBounds.h * safeArea.h,
                                zIndex: 9998,
                            }}
                        />
                        <div
                            className="absolute h-3 w-3 cursor-se-resize rounded-full border-2 border-neutral-900 bg-sky-300"
                            style={{
                                left:
                                    safeArea.x + (multiSelectedBounds.x + multiSelectedBounds.w) * safeArea.w,
                                top:
                                    safeArea.y + (multiSelectedBounds.y + multiSelectedBounds.h) * safeArea.h,
                                transform: "translate(-50%, -50%)",
                                zIndex: 9999,
                            }}
                            onPointerDown={handleGroupResizePointerDown}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
