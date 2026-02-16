"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import type {
    LayoutBlock,
    PageSideLayout,
    TextBlock,
    ImageBlock,
} from "@/types/book-content";
import { canAddBlock } from "@/lib/book-content/validation";
import { selectedBlockIdAtom } from "@/lib/book-content/editor-atoms";

// ── Constants ────────────────────────────────

const CANVAS_DISPLAY_WIDTH = 600;
const PAGE_ASPECT_RATIO = 1.71 / 1.28; // height / width from Book3D defaults
const CANVAS_DISPLAY_HEIGHT = Math.round(CANVAS_DISPLAY_WIDTH * PAGE_ASPECT_RATIO);

// ── Props ────────────────────────────────────

interface PageCanvasStageProps {
    layout: PageSideLayout;
    onLayoutChange: (updater: (prev: PageSideLayout) => PageSideLayout) => void;
}

// ── Component ────────────────────────────────

export function PageCanvasStage({
    layout,
    onLayoutChange,
}: PageCanvasStageProps) {
    const selectedBlockId = useAtomValue(selectedBlockIdAtom);
    const setSelectedBlockId = useSetAtom(selectedBlockIdAtom);

    const stageRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<{
        blockId: string;
        startX: number;
        startY: number;
        origX: number;
        origY: number;
    } | null>(null);

    const [resizing, setResizing] = useState<{
        blockId: string;
        startX: number;
        startY: number;
        origW: number;
        origH: number;
    } | null>(null);

    // ── Add block ──────────────────────────────
    const addBlock = useCallback(
        (type: "text" | "image") => {
            if (!canAddBlock(layout)) {
                alert("Maksimal 8 blok per sisi halaman.");
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
                        zIndex: maxZ + 1,
                        assetPath: "",
                        objectFit: "cover",
                    } satisfies ImageBlock);

            onLayoutChange((prev) => ({
                ...prev,
                blocks: [...prev.blocks, newBlock],
            }));
            setSelectedBlockId(id);
        },
        [layout, onLayoutChange, setSelectedBlockId],
    );

    // ── Delete block ───────────────────────────
    const deleteBlock = useCallback(
        (blockId: string) => {
            onLayoutChange((prev) => ({
                ...prev,
                blocks: prev.blocks.filter((b) => b.id !== blockId),
            }));
            setSelectedBlockId(null);
        },
        [onLayoutChange, setSelectedBlockId],
    );

    // ── Drag handlers ──────────────────────────
    const handlePointerDown = useCallback(
        (e: React.PointerEvent, block: LayoutBlock) => {
            e.stopPropagation();
            e.preventDefault();
            setSelectedBlockId(block.id);
            setDragging({
                blockId: block.id,
                startX: e.clientX,
                startY: e.clientY,
                origX: block.x,
                origY: block.y,
            });
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        [setSelectedBlockId],
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (dragging) {
                const dx = (e.clientX - dragging.startX) / CANVAS_DISPLAY_WIDTH;
                const dy = (e.clientY - dragging.startY) / CANVAS_DISPLAY_HEIGHT;

                onLayoutChange((prev) => ({
                    ...prev,
                    blocks: prev.blocks.map((b) =>
                        b.id === dragging.blockId
                            ? {
                                ...b,
                                x: Math.max(0, Math.min(1 - b.w, dragging.origX + dx)),
                                y: Math.max(0, Math.min(1 - b.h, dragging.origY + dy)),
                            }
                            : b,
                    ),
                }));
            }

            if (resizing) {
                const dx = (e.clientX - resizing.startX) / CANVAS_DISPLAY_WIDTH;
                const dy = (e.clientY - resizing.startY) / CANVAS_DISPLAY_HEIGHT;

                onLayoutChange((prev) => ({
                    ...prev,
                    blocks: prev.blocks.map((b) =>
                        b.id === resizing.blockId
                            ? {
                                ...b,
                                w: Math.max(0.05, Math.min(1 - b.x, resizing.origW + dx)),
                                h: Math.max(0.05, Math.min(1 - b.y, resizing.origH + dy)),
                            }
                            : b,
                    ),
                }));
            }
        },
        [dragging, resizing, onLayoutChange],
    );

    const handlePointerUp = useCallback(() => {
        setDragging(null);
        setResizing(null);
    }, []);

    // ── Resize handle ──────────────────────────
    const handleResizePointerDown = useCallback(
        (e: React.PointerEvent, block: LayoutBlock) => {
            e.stopPropagation();
            e.preventDefault();
            setResizing({
                blockId: block.id,
                startX: e.clientX,
                startY: e.clientY,
                origW: block.w,
                origH: block.h,
            });
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        [],
    );

    // ── Render ─────────────────────────────────
    const sortedBlocks = [...layout.blocks].sort((a, b) => a.zIndex - b.zIndex);
    const bgColor = layout.backgroundColor || "#ffffff";

    return (
        <div className="flex flex-col items-center gap-4">
            {/* Add block buttons */}
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
                {selectedBlockId && (
                    <button
                        onClick={() => deleteBlock(selectedBlockId)}
                        className="rounded-lg border border-red-800/50 bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/50"
                    >
                        Hapus Blok
                    </button>
                )}
            </div>

            {/* Canvas stage */}
            <div
                ref={stageRef}
                className="relative border border-neutral-700 rounded-lg overflow-hidden shadow-lg"
                style={{
                    width: CANVAS_DISPLAY_WIDTH,
                    height: CANVAS_DISPLAY_HEIGHT,
                    backgroundColor: bgColor,
                }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onClick={() => setSelectedBlockId(null)}
            >
                {/* Padding guide */}
                <div
                    className="absolute border border-dashed border-neutral-300/30 pointer-events-none"
                    style={{
                        left: `${8}%`,
                        top: `${10}%`,
                        width: `${84}%`,
                        height: `${80}%`,
                    }}
                />

                {/* Blocks */}
                {sortedBlocks.map((block) => {
                    const isSelected = selectedBlockId === block.id;
                    const left = block.x * 100;
                    const top = block.y * 100;
                    const width = block.w * 100;
                    const height = block.h * 100;

                    return (
                        <div
                            key={block.id}
                            className={`absolute cursor-move transition-shadow ${isSelected
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
                            {/* Block content preview */}
                            {block.type === "text" ? (
                                <div
                                    className="w-full h-full overflow-hidden p-1"
                                    style={{
                                        fontSize: `${Math.max(8, block.style.fontSize * 0.4)}px`,
                                        fontWeight: block.style.fontWeight,
                                        textAlign: block.style.textAlign,
                                        color: block.style.color,
                                        lineHeight: block.style.lineHeight,
                                        fontFamily: block.style.fontFamily,
                                    }}
                                >
                                    {block.content || "…"}
                                </div>
                            ) : (
                                <div className="w-full h-full bg-neutral-200 flex items-center justify-center">
                                    {block.assetPath ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={block.assetPath}
                                            alt="Block image"
                                            className="w-full h-full"
                                            style={{ objectFit: block.objectFit }}
                                            draggable={false}
                                        />
                                    ) : (
                                        <span className="text-xs text-neutral-400">
                                            Belum ada gambar
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Resize handle (bottom-right corner) */}
                            {isSelected && (
                                <div
                                    className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-amber-400 cursor-se-resize border-2 border-neutral-900"
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
