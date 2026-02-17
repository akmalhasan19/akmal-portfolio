"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";
import type {
    LayoutBlock,
    PageSideLayout,
    TextBlock,
    ImageBlock,
    SvgBlock,
} from "@/types/book-content";
import { canAddBlock } from "@/lib/book-content/validation";
import { selectedBlockIdAtom } from "@/lib/book-content/editor-atoms-book2";
import { computeSafeArea } from "@/lib/book-content/padding";
import { sanitizeSvgCode, svgToDataUrl } from "@/lib/book-content/svg-utils";
import { normalizePaperBackground } from "@/lib/book-content/paper-tone";
import { useBookProfileImage } from "@/lib/book-content/useBookProfileImage";

// ── Constants ────────────────────────────────

const CANVAS_DISPLAY_WIDTH = 600;
const PAGE_ASPECT_RATIO = 1.71 / 1.28; // height / width from Book3D defaults
const CANVAS_DISPLAY_HEIGHT = Math.round(CANVAS_DISPLAY_WIDTH * PAGE_ASPECT_RATIO);
const REFERENCE_TEXTURE_HEIGHT = 1536;
const REFERENCE_TEXTURE_WIDTH = Math.round(REFERENCE_TEXTURE_HEIGHT * (1.28 / 1.71));

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
    const book2ProfileImageUrl = useBookProfileImage({ bookKey: "book-2" });
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

    // ── Add block ──────────────────────────────
    const addBlock = useCallback(
        (type: "text" | "image" | "svg" | "profile") => {
            if (!canAddBlock(layout)) {
                alert("Maksimal 8 blok per sisi halaman.");
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
            setSelectedBlockId(id);
        },
        [book2ProfileImageUrl, layout, onLayoutChange, setSelectedBlockId],
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
                const dx =
                    safeArea.w > 0 ? (e.clientX - dragging.startX) / safeArea.w : 0;
                const dy =
                    safeArea.h > 0 ? (e.clientY - dragging.startY) / safeArea.h : 0;

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
                const dx =
                    safeArea.w > 0 ? (e.clientX - resizing.startX) / safeArea.w : 0;
                const dy =
                    safeArea.h > 0 ? (e.clientY - resizing.startY) / safeArea.h : 0;

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
        [dragging, resizing, onLayoutChange, safeArea.h, safeArea.w],
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
    const bgColor = normalizePaperBackground(layout.backgroundColor);

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
                        left: safeArea.x,
                        top: safeArea.y,
                        width: safeArea.w,
                        height: safeArea.h,
                    }}
                />

                {/* Blocks */}
                {sortedBlocks.map((block) => {
                    const isSelected = selectedBlockId === block.id;
                    const left = safeArea.x + block.x * safeArea.w;
                    const top = safeArea.y + block.y * safeArea.h;
                    const width = block.w * safeArea.w;
                    const height = block.h * safeArea.h;
                    const circlePreviewSize = Math.min(width, height);

                    return (
                        <div
                            key={block.id}
                            className={`absolute cursor-move transition-shadow ${isSelected
                                ? "ring-2 ring-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]"
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
                            {/* Block content preview */}
                            {block.type === "text" ? (
                                <div
                                    className="w-full h-full overflow-hidden"
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
                                    {block.content || "…"}
                                </div>
                            ) : block.type === "image" ? (
                                <div
                                    className="w-full h-full bg-neutral-200 flex items-center justify-center overflow-hidden"
                                >
                                    {block.assetPath ? (
                                        block.shape === "circle" ? (
                                            <div
                                                className="overflow-hidden rounded-full"
                                                style={{ width: circlePreviewSize, height: circlePreviewSize }}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={block.assetPath}
                                                    alt="Block image"
                                                    className="w-full h-full"
                                                    style={{ objectFit: block.objectFit }}
                                                    draggable={false}
                                                />
                                            </div>
                                        ) : (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={block.assetPath}
                                                alt="Block image"
                                                className="w-full h-full"
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
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
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
                                                className="w-full h-full"
                                                style={{ objectFit: block.objectFit }}
                                                draggable={false}
                                            />
                                        );
                                    })()}
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
