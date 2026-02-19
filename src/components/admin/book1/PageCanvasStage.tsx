"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    ImageBlock,
    LayoutBlock,
    PageSideLayout,
    TextBlock,
} from "@/types/book-content";
import { canAddBlock } from "@/lib/book-content/validation";
import {
    nudgeStepAtom,
    selectedBlockIdAtom,
    selectedBlockIdsAtom,
} from "@/lib/book-content/editor-atoms";
import { sanitizeSvgCode, svgToDataUrl } from "@/lib/book-content/svg-utils";
import { normalizePaperBackground } from "@/lib/book-content/paper-tone";
import { getBlockAspectRatio } from "@/lib/book-content/aspect-ratio";

const CANVAS_DISPLAY_WIDTH = 600;
const PAGE_ASPECT_RATIO = 1.71 / 1.28;
const CANVAS_DISPLAY_HEIGHT = Math.round(CANVAS_DISPLAY_WIDTH * PAGE_ASPECT_RATIO);
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

export function PageCanvasStage({
    layout,
    onLayoutChange,
}: PageCanvasStageProps) {
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
        (type: "text" | "image") => {
            if (!canAddBlock(layout)) {
                alert("Maksimal 20 blok per sisi halaman.");
                return;
            }

            const id = crypto.randomUUID();
            const maxZ = layout.blocks.reduce((max, b) => Math.max(max, b.zIndex), 0);

            const newBlock: LayoutBlock =
                type === "text"
                    ? ({
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
                        },
                    } satisfies TextBlock)
                    : ({
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
                    } satisfies ImageBlock);

            onLayoutChange((prev) => ({
                ...prev,
                blocks: [...prev.blocks, newBlock],
            }));
            applySelection([id], id);
        },
        [applySelection, layout, onLayoutChange],
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
                const rawDx = (e.clientX - dragging.startX) / CANVAS_DISPLAY_WIDTH;
                const rawDy = (e.clientY - dragging.startY) / CANVAS_DISPLAY_HEIGHT;

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
                const rawDx = (e.clientX - resizing.startX) / CANVAS_DISPLAY_WIDTH;
                const rawDy = (e.clientY - resizing.startY) / CANVAS_DISPLAY_HEIGHT;
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
                const uniformScale = clamp(desiredScale, safeMinScale, maxScale);
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
        [dragging, onLayoutChange, resizing],
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
                        left: `${8}%`,
                        top: `${10}%`,
                        width: `${84}%`,
                        height: `${80}%`,
                    }}
                />

                {sortedBlocks.map((block) => {
                    const isSelected = selectedBlockIdSet.has(block.id);
                    const isPrimarySelection = selectedBlockId === block.id;
                    const left = block.x * 100;
                    const top = block.y * 100;
                    const width = block.w * 100;
                    const height = block.h * 100;

                    return (
                        <div
                            key={block.id}
                            className={`absolute cursor-move transition-shadow ${
                                isSelected
                                    ? "ring-2 ring-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]"
                                    : "hover:ring-1 hover:ring-neutral-400"
                            }`}
                            style={{
                                left: `${left}%`,
                                top: `${top}%`,
                                width: `${width}%`,
                                height: `${height}%`,
                                zIndex: block.zIndex,
                            }}
                            onPointerDown={(e) => handlePointerDown(e, block)}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {block.type === "text" ? (
                                <div
                                    className="h-full w-full overflow-hidden p-1"
                                    style={{
                                        fontSize: `${Math.max(8, block.style.fontSize * 0.4)}px`,
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
                                <div className="flex h-full w-full items-center justify-center bg-neutral-200">
                                    {block.assetPath ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={block.assetPath}
                                            alt="Block image"
                                            className="h-full w-full"
                                            style={{ objectFit: block.objectFit }}
                                            draggable={false}
                                        />
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
                                    <span className="text-xs text-neutral-400">
                                        Tipe blok tidak didukung
                                    </span>
                                </div>
                            )}

                            {isPrimarySelection && !multiSelectedBounds && (
                                <div
                                    className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded-full border-2 border-neutral-900 bg-amber-400"
                                    onPointerDown={(e) => handleResizePointerDown(e, block)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            )}
                        </div>
                    );
                })}

                {multiSelectedBounds && (
                    <>
                        <div
                            className="pointer-events-none absolute ring-2 ring-sky-300/90"
                            style={{
                                left: `${multiSelectedBounds.x * 100}%`,
                                top: `${multiSelectedBounds.y * 100}%`,
                                width: `${multiSelectedBounds.w * 100}%`,
                                height: `${multiSelectedBounds.h * 100}%`,
                                zIndex: 9998,
                            }}
                        />
                        <div
                            className="absolute h-3 w-3 cursor-se-resize rounded-full border-2 border-neutral-900 bg-sky-300"
                            style={{
                                left: `${(multiSelectedBounds.x + multiSelectedBounds.w) * 100}%`,
                                top: `${(multiSelectedBounds.y + multiSelectedBounds.h) * 100}%`,
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
