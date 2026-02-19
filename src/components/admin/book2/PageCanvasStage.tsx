"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    ImageBlock,
    LayoutBlock,
    PageSideLayout,
    SvgBlock,
    TextBlock,
} from "@/types/book-content";
import { canAddBlock } from "@/lib/book-content/validation";
import {
    nudgeStepAtom,
    selectedBlockIdAtom,
    selectedBlockIdsAtom,
} from "@/lib/book-content/editor-atoms-book2";
import { computeSafeArea } from "@/lib/book-content/padding";
import { sanitizeSvgCode, svgToDataUrl } from "@/lib/book-content/svg-utils";
import { normalizePaperBackground } from "@/lib/book-content/paper-tone";
import { useBookProfileImage } from "@/lib/book-content/useBookProfileImage";
import { BASE_CANVAS_HEIGHT } from "@/lib/book-content/render-canvas";

const CANVAS_DISPLAY_WIDTH = 600;
const PAGE_ASPECT_RATIO = 1.71 / 1.28;
const CANVAS_DISPLAY_HEIGHT = Math.round(CANVAS_DISPLAY_WIDTH * PAGE_ASPECT_RATIO);
const REFERENCE_TEXTURE_HEIGHT = BASE_CANVAS_HEIGHT;
const REFERENCE_TEXTURE_WIDTH = Math.round(REFERENCE_TEXTURE_HEIGHT * (1.28 / 1.71));
const MIN_BLOCK_SIZE = 0.05;
const MIN_NUDGE_STEP = 0.001;
const MAX_NUDGE_STEP = 0.2;

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

    const applySelection = useCallback(
        (nextIds: string[], primaryId?: string | null) => {
            setSelectedBlockIds(nextIds);

            if (nextIds.length === 0) {
                setSelectedBlockId(null);
                return;
            }

            if (primaryId && nextIds.includes(primaryId)) {
                setSelectedBlockId(primaryId);
                return;
            }

            setSelectedBlockId(nextIds[nextIds.length - 1] ?? null);
        },
        [setSelectedBlockId, setSelectedBlockIds],
    );

    useEffect(() => {
        const available = new Set(layout.blocks.map((b) => b.id));
        const nextIds = selectedBlockIds.filter((id) => available.has(id));
        const primaryStillValid =
            selectedBlockId !== null && available.has(selectedBlockId);

        const selectionChanged = nextIds.length !== selectedBlockIds.length;
        if (!selectionChanged && primaryStillValid) {
            return;
        }

        applySelection(nextIds, primaryStillValid ? selectedBlockId : null);
    }, [applySelection, layout.blocks, selectedBlockId, selectedBlockIds]);

    const addBlock = useCallback(
        (type: "text" | "image" | "svg" | "profile") => {
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
                    zIndex: maxZ + 1,
                    content: "Teks baru",
                    style: {
                        fontSize: 24,
                        fontWeight: 400,
                        textAlign: "left",
                        color: "#000000",
                        lineHeight: 1.4,
                        fontFamily: "sans-serif",
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
                    zIndex: maxZ + 1,
                    assetPath: book2ProfileImageUrl ?? "",
                    objectFit: "cover",
                    shape: "circle",
                } satisfies ImageBlock;
            } else {
                newBlock = {
                    id,
                    type: "svg",
                    x: 0.05,
                    y: 0.05,
                    w: 0.2,
                    h: 0.2,
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
    }, [moveSelectedBlocks, nudgeStep, selectedBlockIds.length]);

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
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        [
            applySelection,
            layout.blocks,
            selectedBlockIdSet,
            selectedBlockIds,
        ],
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
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

                    const appliedDx = clamp(rawDx, minDx, maxDx);
                    const appliedDy = clamp(rawDy, minDy, maxDy);
                    const activeIds = new Set(dragging.blockIds);

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
                const nextGroupW = clamp(
                    resizing.bounds.w + rawDx,
                    MIN_BLOCK_SIZE,
                    1 - resizing.bounds.x,
                );
                const nextGroupH = clamp(
                    resizing.bounds.h + rawDy,
                    MIN_BLOCK_SIZE,
                    1 - resizing.bounds.y,
                );
                const scaleX = resizing.bounds.w > 0 ? nextGroupW / resizing.bounds.w : 1;
                const scaleY = resizing.bounds.h > 0 ? nextGroupH / resizing.bounds.h : 1;
                const activeIds = new Set(resizing.blockIds);

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
                            resizing.bounds.x + (origin.x - resizing.bounds.x) * scaleX,
                            0,
                            1,
                        );
                        const nextY = clamp(
                            resizing.bounds.y + (origin.y - resizing.bounds.y) * scaleY,
                            0,
                            1,
                        );
                        const scaledW = origin.w * scaleX;
                        const scaledH = origin.h * scaleY;
                        const maxW = Math.max(0.001, 1 - nextX);
                        const maxH = Math.max(0.001, 1 - nextY);

                        return {
                            ...block,
                            x: nextX,
                            y: nextY,
                            w: Math.min(maxW, Math.max(MIN_BLOCK_SIZE, scaledW)),
                            h: Math.min(maxH, Math.max(MIN_BLOCK_SIZE, scaledH)),
                        };
                    }),
                }));
            }
        },
        [dragging, onLayoutChange, resizing, safeArea.h, safeArea.w],
    );

    const handlePointerUp = useCallback(() => {
        setDragging(null);
        setResizing(null);
    }, []);

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
                <div
                    className="pointer-events-none absolute border border-dashed border-neutral-300/30"
                    style={{
                        left: safeArea.x,
                        top: safeArea.y,
                        width: safeArea.w,
                        height: safeArea.h,
                    }}
                />

                {sortedBlocks.map((block) => {
                    const isSelected = selectedBlockIdSet.has(block.id);
                    const isPrimarySelection = selectedBlockId === block.id;
                    const left = safeArea.x + block.x * safeArea.w;
                    const top = safeArea.y + block.y * safeArea.h;
                    const width = block.w * safeArea.w;
                    const height = block.h * safeArea.h;
                    const circlePreviewSize = Math.min(width, height);

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
                            {block.type === "text" ? (
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
                                    }}
                                >
                                    {block.content || "..."}
                                </div>
                            ) : block.type === "image" ? (
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
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={block.assetPath}
                                                    alt="Block image"
                                                    className="h-full w-full"
                                                    style={{ objectFit: block.objectFit }}
                                                    draggable={false}
                                                />
                                            </div>
                                        ) : (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={block.assetPath}
                                                alt="Block image"
                                                className="h-full w-full"
                                                style={{ objectFit: block.objectFit }}
                                                draggable={false}
                                            />
                                        )
                                    ) : (
                                        <span className="text-xs text-neutral-400">
                                            Belum ada gambar
                                        </span>
                                    )}
                                </div>
                            ) : block.type === "svg" ? (
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
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={svgUrl}
                                                alt="SVG block preview"
                                                className="h-full w-full"
                                                style={{ objectFit: block.objectFit }}
                                                draggable={false}
                                            />
                                        );
                                    })()}
                                </div>
                            ) : (
                                <div className="flex h-full w-full items-center justify-center bg-neutral-900/40">
                                    <span className="text-xs text-neutral-400">Tipe blok lama</span>
                                </div>
                            )}

                            {block.linkUrl && (
                                <div className="pointer-events-none absolute right-1 top-1 rounded bg-sky-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                    Link
                                </div>
                            )}

                            {isPrimarySelection && (
                                <div
                                    className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded-full border-2 border-neutral-900 bg-amber-400"
                                    onPointerDown={(e) => handleResizePointerDown(e, block)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
