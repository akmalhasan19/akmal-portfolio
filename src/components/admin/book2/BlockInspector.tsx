"use client";

import { useAtom, useAtomValue } from "jotai";
import { nudgeStepAtom, selectedBlockIdAtom } from "@/lib/book-content/editor-atoms-book2";
import type {
    PageSideLayout,
    TextBlock,
} from "@/types/book-content";
import { ImageUploadField } from "./ImageUploadField";
import { normalizePaperBackground } from "@/lib/book-content/paper-tone";

interface BlockInspectorProps {
    layout: PageSideLayout;
    onLayoutChange: (updater: (prev: PageSideLayout) => PageSideLayout) => void;
}

const DEFAULT_MOVE_STEP = 0.01;
const MIN_MOVE_STEP = 0.001;
const MAX_MOVE_STEP = 0.2;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function BlockInspector({
    layout,
    onLayoutChange,
}: BlockInspectorProps) {
    const [moveStep, setMoveStep] = useAtom(nudgeStepAtom);
    const selectedBlockId = useAtomValue(selectedBlockIdAtom);
    const selectedBlock = layout.blocks.find((b) => b.id === selectedBlockId);

    const updateBlock = (blockId: string, updates: Record<string, unknown>) => {
        onLayoutChange((prev) => ({
            ...prev,
            blocks: prev.blocks.map((b) =>
                b.id === blockId ? ({ ...b, ...updates } as typeof b) : b,
            ),
        }));
    };

    const updateTextStyle = (
        blockId: string,
        styleUpdates: Partial<TextBlock["style"]>,
    ) => {
        onLayoutChange((prev) => ({
            ...prev,
            blocks: prev.blocks.map((b) =>
                b.id === blockId && b.type === "text"
                    ? { ...b, style: { ...b.style, ...styleUpdates } }
                    : b,
            ),
        }));
    };

    const moveBlock = (
        blockId: string,
        deltaX: number,
        deltaY: number,
    ) => {
        onLayoutChange((prev) => ({
            ...prev,
            blocks: prev.blocks.map((b) => {
                if (b.id !== blockId) {
                    return b;
                }

                const maxX = Math.max(0, 1 - b.w);
                const maxY = Math.max(0, 1 - b.h);
                return {
                    ...b,
                    x: clamp(b.x + deltaX, 0, maxX),
                    y: clamp(b.y + deltaY, 0, maxY),
                };
            }),
        }));
    };

    if (!selectedBlock) {
        return (
            <div className="p-4">
                <p className="text-xs text-neutral-500">
                    Pilih blok di canvas untuk mengedit propertinya.
                </p>

                {/* Background color */}
                <div className="mt-6 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                        Background
                    </h3>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={normalizePaperBackground(layout.backgroundColor)}
                            onChange={(e) =>
                                onLayoutChange((prev) => ({
                                    ...prev,
                                    backgroundColor: e.target.value,
                                }))
                            }
                            className="h-8 w-8 cursor-pointer rounded border border-neutral-700 bg-transparent"
                        />
                        <span className="text-xs text-neutral-500">
                            {normalizePaperBackground(layout.backgroundColor)}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    const canMoveLeft = selectedBlock.x > 0;
    const canMoveRight = selectedBlock.x < 1 - selectedBlock.w;
    const canMoveUp = selectedBlock.y > 0;
    const canMoveDown = selectedBlock.y < 1 - selectedBlock.h;

    return (
        <div className="p-4 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                {selectedBlock.type === "text"
                    ? "Blok Teks"
                    : selectedBlock.type === "image"
                        ? "Blok Gambar"
                        : selectedBlock.type === "svg"
                            ? "Blok SVG"
                            : "Blok Lainnya"}
            </h3>

            {/* Position / Size */}
            <div className="space-y-2">
                <label className="text-xs text-neutral-500">Posisi & Ukuran</label>
                <div className="grid grid-cols-2 gap-2">
                    {(["x", "y", "w", "h"] as const).map((prop) => (
                        <div key={prop} className="space-y-0.5">
                            <label className="text-[10px] uppercase text-neutral-600">
                                {prop}
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="1"
                                value={selectedBlock[prop]}
                                onChange={(e) =>
                                    updateBlock(selectedBlock.id, {
                                        [prop]: parseFloat(e.target.value) || 0,
                                    })
                                }
                                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                            />
                        </div>
                    ))}
                </div>

                <div className="space-y-2 rounded border border-neutral-800 bg-neutral-900/50 p-2">
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] uppercase text-neutral-600">
                            Step Geser
                        </label>
                        <input
                            type="number"
                            min={MIN_MOVE_STEP}
                            max={MAX_MOVE_STEP}
                            step="0.001"
                            value={moveStep}
                            onChange={(e) => {
                                const parsed = parseFloat(e.target.value);
                                if (!Number.isFinite(parsed)) {
                                    setMoveStep(DEFAULT_MOVE_STEP);
                                    return;
                                }
                                setMoveStep(clamp(parsed, MIN_MOVE_STEP, MAX_MOVE_STEP));
                            }}
                            className="w-24 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                        />
                    </div>

                    <div className="mx-auto grid w-24 grid-cols-3 gap-1">
                        <span />
                        <button
                            type="button"
                            onClick={() => moveBlock(selectedBlock.id, 0, -moveStep)}
                            disabled={!canMoveUp}
                            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            &uarr;
                        </button>
                        <span />
                        <button
                            type="button"
                            onClick={() => moveBlock(selectedBlock.id, -moveStep, 0)}
                            disabled={!canMoveLeft}
                            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            &larr;
                        </button>
                        <span className="rounded border border-neutral-800 bg-neutral-900/70 px-2 py-1 text-center text-[10px] text-neutral-500">
                            XY
                        </span>
                        <button
                            type="button"
                            onClick={() => moveBlock(selectedBlock.id, moveStep, 0)}
                            disabled={!canMoveRight}
                            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            &rarr;
                        </button>
                        <span />
                        <button
                            type="button"
                            onClick={() => moveBlock(selectedBlock.id, 0, moveStep)}
                            disabled={!canMoveDown}
                            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            &darr;
                        </button>
                        <span />
                    </div>
                </div>
            </div>

            {/* Z-Index */}
            <div className="space-y-1">
                <label className="text-xs text-neutral-500">Z-Index</label>
                <input
                    type="number"
                    value={selectedBlock.zIndex}
                    onChange={(e) =>
                        updateBlock(selectedBlock.id, {
                            zIndex: parseInt(e.target.value) || 0,
                        })
                    }
                    className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                />
            </div>

            <div className="space-y-1">
                <label className="text-xs text-neutral-500">
                    Link Blok (Opsional)
                </label>
                <input
                    type="text"
                    value={selectedBlock.linkUrl ?? ""}
                    onChange={(e) =>
                        updateBlock(selectedBlock.id, {
                            linkUrl: e.target.value,
                        })
                    }
                    placeholder="https://example.com"
                    className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-sky-500"
                />
                <p className="text-[10px] text-neutral-500">
                    Jika diisi, area blok ini akan bisa diklik pada tampilan 3D.
                </p>
            </div>

            {/* ── Text-specific controls ────────── */}
            {selectedBlock.type === "text" && (
                <>
                    <div className="space-y-1">
                        <label className="text-xs text-neutral-500">Konten</label>
                        <textarea
                            value={selectedBlock.content}
                            onChange={(e) =>
                                updateBlock(selectedBlock.id, { content: e.target.value })
                            }
                            rows={3}
                            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs outline-none focus:border-amber-500 resize-y"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                            <label className="text-[10px] uppercase text-neutral-600">
                                Font Size
                            </label>
                            <input
                                type="number"
                                min="8"
                                max="200"
                                value={selectedBlock.style.fontSize}
                                onChange={(e) =>
                                    updateTextStyle(selectedBlock.id, {
                                        fontSize: parseInt(e.target.value) || 24,
                                    })
                                }
                                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                            />
                        </div>
                        <div className="space-y-0.5">
                            <label className="text-[10px] uppercase text-neutral-600">
                                Weight
                            </label>
                            <select
                                value={selectedBlock.style.fontWeight}
                                onChange={(e) =>
                                    updateTextStyle(selectedBlock.id, {
                                        fontWeight: parseInt(e.target.value),
                                    })
                                }
                                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                            >
                                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                                    <option key={w} value={w}>
                                        {w}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                            <label className="text-[10px] uppercase text-neutral-600">
                                Align
                            </label>
                            <select
                                value={selectedBlock.style.textAlign}
                                onChange={(e) =>
                                    updateTextStyle(selectedBlock.id, {
                                        textAlign: e.target.value as "left" | "center" | "right",
                                    })
                                }
                                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                            >
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                            </select>
                        </div>
                        <div className="space-y-0.5">
                            <label className="text-[10px] uppercase text-neutral-600">
                                Line Height
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                min="0.8"
                                max="3"
                                value={selectedBlock.style.lineHeight}
                                onChange={(e) =>
                                    updateTextStyle(selectedBlock.id, {
                                        lineHeight: parseFloat(e.target.value) || 1.4,
                                    })
                                }
                                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>

                    <div className="space-y-0.5">
                        <label className="text-[10px] uppercase text-neutral-600">
                            Color
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={selectedBlock.style.color}
                                onChange={(e) =>
                                    updateTextStyle(selectedBlock.id, { color: e.target.value })
                                }
                                className="h-7 w-7 cursor-pointer rounded border border-neutral-700 bg-transparent"
                            />
                            <input
                                type="text"
                                value={selectedBlock.style.color}
                                onChange={(e) =>
                                    updateTextStyle(selectedBlock.id, { color: e.target.value })
                                }
                                className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>

                    <div className="space-y-0.5">
                        <label className="text-[10px] uppercase text-neutral-600">
                            Font Family
                        </label>
                        <select
                            value={selectedBlock.style.fontFamily}
                            onChange={(e) =>
                                updateTextStyle(selectedBlock.id, {
                                    fontFamily: e.target.value,
                                })
                            }
                            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                        >
                            <optgroup label="System">
                                <option value="sans-serif">Sans Serif</option>
                                <option value="serif">Serif</option>
                                <option value="monospace">Monospace</option>
                            </optgroup>
                            <optgroup label="Project Fonts">
                                <option value="var(--font-geist-sans)">Geist Sans</option>
                                <option value="var(--font-geist-mono)">Geist Mono</option>
                                <option value="var(--font-crimson-text)">Crimson Text (Serif)</option>
                                <option value="var(--font-caveat)">Caveat (Handwriting)</option>
                            </optgroup>
                        </select>
                    </div>
                </>
            )}

            {/* ── Image-specific controls ───────── */}
            {selectedBlock.type === "image" && (
                <>
                    <ImageUploadField
                        blockId={selectedBlock.id}
                        currentAssetPath={selectedBlock.assetPath}
                        onAssetUploaded={(url: string) =>
                            updateBlock(selectedBlock.id, { assetPath: url })
                        }
                    />

                    <div className="space-y-0.5">
                        <label className="text-[10px] uppercase text-neutral-600">
                            Object Fit
                        </label>
                        <select
                            value={selectedBlock.objectFit}
                            onChange={(e) =>
                                updateBlock(selectedBlock.id, {
                                    objectFit: e.target.value as "cover" | "contain",
                                })
                            }
                            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                        >
                            <option value="cover">Cover</option>
                            <option value="contain">Contain</option>
                        </select>
                    </div>
                </>
            )}

            {/* SVG-specific controls */}
            {selectedBlock.type === "svg" && (
                <>
                    <div className="space-y-1">
                        <label className="text-xs text-neutral-500">
                            Kode SVG
                        </label>
                        <textarea
                            value={selectedBlock.svgCode}
                            onChange={(e) =>
                                updateBlock(selectedBlock.id, { svgCode: e.target.value })
                            }
                            rows={8}
                            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs font-mono outline-none focus:border-amber-500 resize-y"
                            placeholder='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">...</svg>'
                        />
                        <p className="text-[10px] text-neutral-500">
                            Tempel SVG mentah dari icon tech stack.
                        </p>
                    </div>

                    <div className="space-y-0.5">
                        <label className="text-[10px] uppercase text-neutral-600">
                            Object Fit
                        </label>
                        <select
                            value={selectedBlock.objectFit}
                            onChange={(e) =>
                                updateBlock(selectedBlock.id, {
                                    objectFit: e.target.value as "cover" | "contain",
                                })
                            }
                            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                        >
                            <option value="contain">Contain</option>
                            <option value="cover">Cover</option>
                        </select>
                    </div>
                </>
            )}

            {selectedBlock.type === "link" && (
                <p className="text-xs text-neutral-500">
                    Blok link lama terdeteksi. Gunakan blok teks/gambar/SVG dan isi
                    Link Blok untuk flow terbaru.
                </p>
            )}

        </div>
    );
}
