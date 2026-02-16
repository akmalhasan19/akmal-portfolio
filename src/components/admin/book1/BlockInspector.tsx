"use client";

import { useAtomValue } from "jotai";
import { selectedBlockIdAtom } from "@/lib/book-content/editor-atoms";
import type {
    LayoutBlock,
    PageSideLayout,
    TextBlock,
} from "@/types/book-content";
import { ImageUploadField } from "./ImageUploadField";

interface BlockInspectorProps {
    layout: PageSideLayout;
    onLayoutChange: (updater: (prev: PageSideLayout) => PageSideLayout) => void;
}

export function BlockInspector({
    layout,
    onLayoutChange,
}: BlockInspectorProps) {
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
                            value={layout.backgroundColor || "#ffffff"}
                            onChange={(e) =>
                                onLayoutChange((prev) => ({
                                    ...prev,
                                    backgroundColor: e.target.value,
                                }))
                            }
                            className="h-8 w-8 cursor-pointer rounded border border-neutral-700 bg-transparent"
                        />
                        <span className="text-xs text-neutral-500">
                            {layout.backgroundColor || "#ffffff"}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                {selectedBlock.type === "text" ? "Blok Teks" : "Blok Gambar"}
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
                        <input
                            type="text"
                            value={selectedBlock.style.fontFamily}
                            onChange={(e) =>
                                updateTextStyle(selectedBlock.id, {
                                    fontFamily: e.target.value,
                                })
                            }
                            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                        />
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
        </div>
    );
}
