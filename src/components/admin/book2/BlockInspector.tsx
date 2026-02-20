"use client";

import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import {
    nudgeStepAtom,
    selectedBlockIdAtom,
    selectedBlockIdsAtom,
} from "@/lib/book-content/editor-atoms-book2";
import type {
    LayoutBlock,
    PageSideLayout,
    TextBlock,
} from "@/types/book-content";
import { ImageUploadField } from "./ImageUploadField";
import { normalizePaperBackground } from "@/lib/book-content/paper-tone";
import {
    getBlockAspectRatio,
    getImageAspectRatio,
    imagePixelRatioToBlockRatio,
    parseSvgAspectRatio,
} from "@/lib/book-content/aspect-ratio";
import {
    applyVisualCropToAspectRatio,
    deriveVisualCropBaseAspectRatio,
} from "@/lib/book-content/visual-crop";
import type { LanguageCode } from "@/lib/i18n/language";

interface BlockInspectorProps {
    layout: PageSideLayout;
    onLayoutChange: (updater: (prev: PageSideLayout) => PageSideLayout) => void;
}

const DEFAULT_MOVE_STEP = 0.01;
const MIN_MOVE_STEP = 0.001;
const MAX_MOVE_STEP = 0.2;
const RESUME_SVG_MARKER = 'data-block-role="resume-button"';
const RESUME_LABEL_TEXT_ID = "resume-label";
const DEFAULT_RESUME_FONT_SIZE = 46;
const MIN_RESUME_FONT_SIZE = 10;
const MAX_RESUME_FONT_SIZE = 96;
const DEFAULT_RESUME_FONT_FAMILY = "Arial, sans-serif";
const LIST_PREFIX_PATTERN = /^\s*(?:[•\-*]|\d+[.)]|[a-zA-Z][.)])\s+/;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

type TextListType = NonNullable<TextBlock["style"]["listType"]>;

function toAlphaSequence(index: number): string {
    let value = Math.max(1, Math.floor(index));
    let result = "";

    while (value > 0) {
        value -= 1;
        result = String.fromCharCode(97 + (value % 26)) + result;
        value = Math.floor(value / 26);
    }

    return result;
}

function parseNumericListIndex(line: string): number | null {
    const match = line.match(/^\s*(\d+)[.)]\s+/);
    if (!match) {
        return null;
    }
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseAlphaListIndex(line: string): number | null {
    const match = line.match(/^\s*([a-zA-Z]+)[.)]\s+/);
    if (!match) {
        return null;
    }

    const normalized = match[1].toLowerCase();
    let value = 0;
    for (const char of normalized) {
        value = value * 26 + (char.charCodeAt(0) - 96);
    }
    return value > 0 ? value : null;
}

function getLineRange(text: string, cursor: number): { start: number; end: number } {
    const start = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
    const endIndex = text.indexOf("\n", cursor);
    return {
        start,
        end: endIndex === -1 ? text.length : endIndex,
    };
}

function buildNextListPrefix(listType: TextListType, currentLine: string): string {
    if (listType === "bullet") {
        return "• ";
    }

    if (listType === "number") {
        const current = parseNumericListIndex(currentLine) ?? 0;
        return `${Math.max(1, current + 1)}. `;
    }

    if (listType === "alpha") {
        const current = parseAlphaListIndex(currentLine) ?? 0;
        return `${toAlphaSequence(Math.max(1, current + 1))}. `;
    }

    return "";
}

function applyListTypeToContent(content: string, listType: TextListType): string {
    const lines = content.split("\n");
    let listIndex = 1;

    return lines
        .map((line) => {
            const withoutPrefix = line.replace(LIST_PREFIX_PATTERN, "");
            if (withoutPrefix.trim().length === 0) {
                return "";
            }

            const normalized = withoutPrefix.trimStart();
            if (listType === "none") {
                return normalized;
            }
            if (listType === "bullet") {
                return `• ${normalized}`;
            }
            if (listType === "number") {
                const currentIndex = listIndex;
                listIndex += 1;
                return `${currentIndex}. ${normalized}`;
            }

            const alphaMarker = toAlphaSequence(listIndex);
            listIndex += 1;
            return `${alphaMarker}. ${normalized}`;
        })
        .join("\n");
}

function resolveTextContentByLanguage(
    block: TextBlock,
    language: LanguageCode,
): string {
    const localized = block.contentByLanguage;
    if (!localized) {
        return block.content;
    }

    if (language === "en") {
        return localized.en ?? localized.id ?? block.content;
    }
    return localized.id ?? block.content;
}

function isResumeButtonSvg(svgCode: string): boolean {
    const source = typeof svgCode === "string" ? svgCode : "";
    if (!source) {
        return false;
    }
    return source.includes(RESUME_SVG_MARKER)
        || source.includes(`id="${RESUME_LABEL_TEXT_ID}"`)
        || source.includes(`id='${RESUME_LABEL_TEXT_ID}'`)
        || /<text\b[^>]*>\s*Resume\s*<\/text>/i.test(source);
}

function getResumeLabelOpenTag(svgCode: string): string | null {
    const byId = svgCode.match(
        /<text\b[^>]*\bid\s*=\s*(?:"resume-label"|'resume-label')[^>]*>/i,
    );
    if (byId?.[0]) {
        return byId[0];
    }

    const byContent = svgCode.match(/<text\b[^>]*>(?=\s*Resume\s*<\/text>)/i);
    return byContent?.[0] ?? null;
}

function readResumeFontSize(svgCode: string): number {
    const tag = getResumeLabelOpenTag(svgCode);
    if (!tag) {
        return DEFAULT_RESUME_FONT_SIZE;
    }

    const match = tag.match(/\bfont-size\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    const parsed = Number.parseFloat((match?.[1] || match?.[2] || "").trim());
    if (!Number.isFinite(parsed)) {
        return DEFAULT_RESUME_FONT_SIZE;
    }
    return clamp(parsed, MIN_RESUME_FONT_SIZE, MAX_RESUME_FONT_SIZE);
}

function readResumeFontFamily(svgCode: string): string {
    const tag = getResumeLabelOpenTag(svgCode);
    if (!tag) {
        return DEFAULT_RESUME_FONT_FAMILY;
    }

    const match = tag.match(/\bfont-family\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    const family = (match?.[1] || match?.[2] || "").trim();
    return family || DEFAULT_RESUME_FONT_FAMILY;
}

function ensureResumeMarker(svgCode: string): string {
    if (svgCode.includes(RESUME_SVG_MARKER)) {
        return svgCode;
    }
    return svgCode.replace(/<svg\b/i, `<svg ${RESUME_SVG_MARKER}`);
}

function setResumeLabelAttribute(svgCode: string, attrName: string, attrValue: string): string {
    const openTag = getResumeLabelOpenTag(svgCode);
    if (!openTag) {
        return svgCode;
    }

    let nextOpenTag = openTag;
    if (!/\bid\s*=/.test(nextOpenTag)) {
        nextOpenTag = nextOpenTag.replace(
            /<text\b/i,
            `<text id="${RESUME_LABEL_TEXT_ID}"`,
        );
    }

    const attrPattern = new RegExp(`\\b${attrName}\\s*=\\s*(?:"[^"]*"|'[^']*')`, "i");
    if (attrPattern.test(nextOpenTag)) {
        nextOpenTag = nextOpenTag.replace(attrPattern, `${attrName}="${attrValue}"`);
    } else {
        nextOpenTag = nextOpenTag.replace(/>$/, ` ${attrName}="${attrValue}">`);
    }

    return svgCode.replace(openTag, nextOpenTag);
}

function getBounds(blocks: LayoutBlock[]) {
    if (blocks.length === 0) {
        return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const block of blocks) {
        minX = Math.min(minX, block.x);
        minY = Math.min(minY, block.y);
        maxX = Math.max(maxX, block.x + block.w);
        maxY = Math.max(maxY, block.y + block.h);
    }

    return {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
    };
}

export function BlockInspector({
    layout,
    onLayoutChange,
}: BlockInspectorProps) {
    const [moveStep, setMoveStep] = useAtom(nudgeStepAtom);
    const [contentLanguage, setContentLanguage] = useState<LanguageCode>("id");
    const selectedBlockIds = useAtomValue(selectedBlockIdsAtom);
    const selectedBlockId = useAtomValue(selectedBlockIdAtom);
    const selectedBlocks = layout.blocks.filter((b) => selectedBlockIds.includes(b.id));
    const isGroupSelection = selectedBlocks.length > 1;
    const groupBounds = isGroupSelection ? getBounds(selectedBlocks) : null;
    const selectedBlock = isGroupSelection
        ? null
        : selectedBlocks[0] ?? layout.blocks.find((b) => b.id === selectedBlockId);
    const selectedSvgCode = selectedBlock?.type === "svg" ? selectedBlock.svgCode : "";
    const isResumeSvg = selectedBlock?.type === "svg" && isResumeButtonSvg(selectedSvgCode);
    const resumeFontSize = isResumeSvg
        ? readResumeFontSize(selectedSvgCode)
        : DEFAULT_RESUME_FONT_SIZE;
    const resumeFontFamily = isResumeSvg
        ? readResumeFontFamily(selectedSvgCode)
        : DEFAULT_RESUME_FONT_FAMILY;

    const resetVisualCrop = (
        block: Extract<LayoutBlock, { type: "image" | "svg" }>,
    ) => {
        const targetRatio = block.type === "image" && block.shape === "circle"
            ? 1
            : deriveVisualCropBaseAspectRatio(
                getBlockAspectRatio(block),
                block.crop,
            );
        updateBlock(block.id, {
            crop: undefined,
            aspectRatio: targetRatio,
        });
    };

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

    const updateTextListType = (blockId: string, listType: TextListType) => {
        onLayoutChange((prev) => ({
            ...prev,
            blocks: prev.blocks.map((block) => {
                if (block.id !== blockId || block.type !== "text") {
                    return block;
                }

                const activeContent = resolveTextContentByLanguage(block, contentLanguage);
                const nextActiveContent = applyListTypeToContent(activeContent, listType);
                const nextContentByLanguage = {
                    ...(block.contentByLanguage ?? {}),
                    [contentLanguage]: nextActiveContent,
                };
                const nextLegacyContent = contentLanguage === "id"
                    ? nextActiveContent
                    : (nextContentByLanguage.id ?? block.content);

                return {
                    ...block,
                    content: nextLegacyContent,
                    contentByLanguage: nextContentByLanguage,
                    style: {
                        ...block.style,
                        listType,
                    },
                };
            }),
        }));
    };

    const updateTextContent = (
        blockId: string,
        language: LanguageCode,
        content: string,
    ) => {
        onLayoutChange((prev) => ({
            ...prev,
            blocks: prev.blocks.map((block) => {
                if (block.id !== blockId || block.type !== "text") {
                    return block;
                }

                const nextContentByLanguage = {
                    ...(block.contentByLanguage ?? {}),
                    [language]: content,
                };
                const nextLegacyContent = language === "id"
                    ? content
                    : (nextContentByLanguage.id ?? block.content);

                return {
                    ...block,
                    content: nextLegacyContent,
                    contentByLanguage: nextContentByLanguage,
                };
            }),
        }));
    };

    const handleTextContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (selectedBlock?.type !== "text") {
            return;
        }

        if (
            e.key !== "Enter"
            || e.shiftKey
            || e.altKey
            || e.ctrlKey
            || e.metaKey
        ) {
            return;
        }

        const listType = selectedBlock.style.listType ?? "none";
        if (listType === "none") {
            return;
        }

        const target = e.currentTarget;
        const value = target.value;
        const selectionStart = target.selectionStart;
        const selectionEnd = target.selectionEnd;
        const lineRange = getLineRange(value, selectionStart);
        const currentLine = value.slice(lineRange.start, lineRange.end);
        const plainText = currentLine.replace(LIST_PREFIX_PATTERN, "").trim();
        const hasListPrefix = LIST_PREFIX_PATTERN.test(currentLine);

        if (hasListPrefix && plainText.length === 0) {
            e.preventDefault();
            const clearedLine = currentLine.replace(LIST_PREFIX_PATTERN, "");
            const nextContent = `${value.slice(0, lineRange.start)}${clearedLine}${value.slice(lineRange.end)}`;
            const nextCursorPos = lineRange.start + clearedLine.length;
            updateTextContent(selectedBlock.id, contentLanguage, nextContent);
            requestAnimationFrame(() => {
                target.selectionStart = nextCursorPos;
                target.selectionEnd = nextCursorPos;
            });
            return;
        }

        const nextPrefix = buildNextListPrefix(listType, currentLine);
        e.preventDefault();

        const insertion = `\n${nextPrefix}`;
        const nextContent = `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionEnd)}`;
        const nextCursorPos = selectionStart + insertion.length;

        updateTextContent(selectedBlock.id, contentLanguage, nextContent);
        requestAnimationFrame(() => {
            target.selectionStart = nextCursorPos;
            target.selectionEnd = nextCursorPos;
        });
    };

    const selectedTextContent = selectedBlock?.type === "text"
        ? resolveTextContentByLanguage(selectedBlock, contentLanguage)
        : "";

    const updateResumeTypography = (
        block: Extract<LayoutBlock, { type: "svg" }>,
        updates: { fontSize?: number; fontFamily?: string },
    ) => {
        let nextSvgCode = ensureResumeMarker(block.svgCode);
        const currentSize = readResumeFontSize(nextSvgCode);
        const currentFamily = readResumeFontFamily(nextSvgCode);
        const requestedSize = updates.fontSize;
        const safeRequestedSize: number = Number.isFinite(requestedSize)
            ? requestedSize!
            : currentSize;
        const nextSize = clamp(
            safeRequestedSize,
            MIN_RESUME_FONT_SIZE,
            MAX_RESUME_FONT_SIZE,
        );
        const normalizedFamily = (updates.fontFamily ?? currentFamily)
            .replace(/["']/g, "")
            .trim() || DEFAULT_RESUME_FONT_FAMILY;

        nextSvgCode = setResumeLabelAttribute(nextSvgCode, "font-size", String(nextSize));
        nextSvgCode = setResumeLabelAttribute(nextSvgCode, "font-family", normalizedFamily);
        updateBlock(block.id, { svgCode: nextSvgCode });
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

    const moveSelectedBlocks = (
        deltaX: number,
        deltaY: number,
    ) => {
        if (selectedBlocks.length === 0) {
            return;
        }

        const selectedSet = new Set(selectedBlocks.map((b) => b.id));
        onLayoutChange((prev) => {
            const blocks = prev.blocks.filter((b) => selectedSet.has(b.id));
            if (blocks.length === 0) {
                return prev;
            }

            let minDx = Number.NEGATIVE_INFINITY;
            let maxDx = Number.POSITIVE_INFINITY;
            let minDy = Number.NEGATIVE_INFINITY;
            let maxDy = Number.POSITIVE_INFINITY;
            for (const block of blocks) {
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
                    selectedSet.has(block.id)
                        ? {
                            ...block,
                            x: block.x + appliedDx,
                            y: block.y + appliedDy,
                        }
                        : block,
                ),
            };
        });
    };

    const resizeGroup = (
        options: { w?: number; h?: number; x?: number; y?: number },
    ) => {
        if (!groupBounds || selectedBlocks.length === 0) {
            return;
        }

        const selectedSet = new Set(selectedBlocks.map((b) => b.id));
        const hasPositionChange = options.x !== undefined || options.y !== undefined;
        const hasSizeChange = options.w !== undefined || options.h !== undefined;

        if (hasPositionChange && !hasSizeChange) {
            const targetX = options.x !== undefined
                ? clamp(options.x, 0, 1 - groupBounds.w)
                : groupBounds.x;
            const targetY = options.y !== undefined
                ? clamp(options.y, 0, 1 - groupBounds.h)
                : groupBounds.y;
            const deltaX = targetX - groupBounds.x;
            const deltaY = targetY - groupBounds.y;

            if (deltaX === 0 && deltaY === 0) {
                return;
            }

            onLayoutChange((prev) => ({
                ...prev,
                blocks: prev.blocks.map((block) =>
                    selectedSet.has(block.id)
                        ? {
                            ...block,
                            x: clamp(block.x + deltaX, 0, 1 - block.w),
                            y: clamp(block.y + deltaY, 0, 1 - block.h),
                        }
                        : block,
                ),
            }));
            return;
        }

        let desiredScale = 1;
        if (options.w !== undefined && groupBounds.w > 0) {
            const safeW = clamp(options.w, 0.01, 1 - groupBounds.x);
            desiredScale = safeW / groupBounds.w;
        } else if (options.h !== undefined && groupBounds.h > 0) {
            const safeH = clamp(options.h, 0.01, 1 - groupBounds.y);
            desiredScale = safeH / groupBounds.h;
        }

        const maxScale = Math.min(
            groupBounds.w > 0 ? (1 - groupBounds.x) / groupBounds.w : 1,
            groupBounds.h > 0 ? (1 - groupBounds.y) / groupBounds.h : 1,
        );
        const minScale = Math.max(
            groupBounds.w > 0 ? 0.01 / groupBounds.w : 1,
            groupBounds.h > 0 ? 0.01 / groupBounds.h : 1,
        );
        const safeMinScale = Math.min(minScale, maxScale);
        const uniformScale = clamp(desiredScale, safeMinScale, maxScale);

        onLayoutChange((prev) => ({
            ...prev,
            blocks: prev.blocks.map((block) => {
                if (!selectedSet.has(block.id)) {
                    return block;
                }

                const nextX =
                    groupBounds.x + (block.x - groupBounds.x) * uniformScale;
                const nextY =
                    groupBounds.y + (block.y - groupBounds.y) * uniformScale;
                const nextW = block.w * uniformScale;
                const nextH = block.h * uniformScale;

                return {
                    ...block,
                    x: clamp(nextX, 0, 1),
                    y: clamp(nextY, 0, 1),
                    w: clamp(nextW, 0.01, 1 - clamp(nextX, 0, 1)),
                    h: clamp(nextH, 0.01, 1 - clamp(nextY, 0, 1)),
                };
            }),
        }));
    };

    if (!selectedBlock && !isGroupSelection) {
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

    if (isGroupSelection && groupBounds) {
        const canMoveLeft = groupBounds.x > 0;
        const canMoveRight = groupBounds.x < 1 - groupBounds.w;
        const canMoveUp = groupBounds.y > 0;
        const canMoveDown = groupBounds.y < 1 - groupBounds.h;

        return (
            <div className="p-4 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Grup Blok ({selectedBlocks.length})
                </h3>

                <div className="space-y-2">
                    <label className="text-xs text-neutral-500">Posisi & Ukuran Grup</label>
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
                                    value={groupBounds[prop]}
                                    onChange={(e) => {
                                        const parsed = parseFloat(e.target.value) || 0;
                                        if (prop === "x") {
                                            resizeGroup({ x: clamp(parsed, 0, 1 - groupBounds.w) });
                                        } else if (prop === "y") {
                                            resizeGroup({ y: clamp(parsed, 0, 1 - groupBounds.h) });
                                        } else if (prop === "w") {
                                            resizeGroup({ w: clamp(parsed, 0.01, 1 - groupBounds.x) });
                                        } else {
                                            resizeGroup({ h: clamp(parsed, 0.01, 1 - groupBounds.y) });
                                        }
                                    }}
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
                                onClick={() => moveSelectedBlocks(0, -moveStep)}
                                disabled={!canMoveUp}
                                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                &uarr;
                            </button>
                            <span />
                            <button
                                type="button"
                                onClick={() => moveSelectedBlocks(-moveStep, 0)}
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
                                onClick={() => moveSelectedBlocks(moveStep, 0)}
                                disabled={!canMoveRight}
                                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                &rarr;
                            </button>
                            <span />
                            <button
                                type="button"
                                onClick={() => moveSelectedBlocks(0, moveStep)}
                                disabled={!canMoveDown}
                                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                &darr;
                            </button>
                            <span />
                        </div>
                    </div>
                </div>

                <p className="text-xs text-neutral-500">
                    Mode grup aktif. Semua blok diperlakukan sebagai satu block virtual
                    sampai seleksi grup dibatalkan.
                </p>
            </div>
        );
    }

    if (!selectedBlock) {
        return null;
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
                                onChange={(e) => {
                                    const parsed = parseFloat(e.target.value) || 0;
                                    const ratio = getBlockAspectRatio(selectedBlock);

                                    if (prop === "x") {
                                        updateBlock(selectedBlock.id, {
                                            x: clamp(parsed, 0, 1 - selectedBlock.w),
                                        });
                                        return;
                                    }

                                    if (prop === "y") {
                                        updateBlock(selectedBlock.id, {
                                            y: clamp(parsed, 0, 1 - selectedBlock.h),
                                        });
                                        return;
                                    }

                                    if (prop === "w") {
                                        let nextW = clamp(parsed, 0.01, 1 - selectedBlock.x);
                                        let nextH = nextW / ratio;
                                        const maxH = 1 - selectedBlock.y;
                                        if (nextH > maxH) {
                                            nextH = maxH;
                                            nextW = nextH * ratio;
                                        }
                                        updateBlock(selectedBlock.id, {
                                            w: clamp(nextW, 0.01, 1 - selectedBlock.x),
                                            h: clamp(nextH, 0.01, 1 - selectedBlock.y),
                                            aspectRatio: ratio,
                                        });
                                        return;
                                    }

                                    let nextH = clamp(parsed, 0.01, 1 - selectedBlock.y);
                                    let nextW = nextH * ratio;
                                    const maxW = 1 - selectedBlock.x;
                                    if (nextW > maxW) {
                                        nextW = maxW;
                                        nextH = nextW / ratio;
                                    }
                                    updateBlock(selectedBlock.id, {
                                        w: clamp(nextW, 0.01, 1 - selectedBlock.x),
                                        h: clamp(nextH, 0.01, 1 - selectedBlock.y),
                                        aspectRatio: ratio,
                                    });
                                }}
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
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-0.5">
                                <label className="text-[10px] uppercase text-neutral-600">
                                    Bahasa Konten
                                </label>
                                <select
                                    value={contentLanguage}
                                    onChange={(e) =>
                                        setContentLanguage(e.target.value as LanguageCode)
                                    }
                                    className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                                >
                                    <option value="id">Indonesia (ID)</option>
                                    <option value="en">English (EN)</option>
                                </select>
                            </div>
                        </div>
                        <label className="text-xs text-neutral-500">Konten</label>
                        <textarea
                            value={selectedTextContent}
                            onChange={(e) =>
                                updateTextContent(
                                    selectedBlock.id,
                                    contentLanguage,
                                    e.target.value,
                                )
                            }
                            onKeyDown={handleTextContentKeyDown}
                            rows={3}
                            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs outline-none focus:border-amber-500 resize-y"
                        />
                    </div>

                    <div className="space-y-0.5">
                        <label className="text-[10px] uppercase text-neutral-600">
                            Daftar
                        </label>
                        <select
                            value={selectedBlock.style.listType ?? "none"}
                            onChange={(e) =>
                                updateTextListType(
                                    selectedBlock.id,
                                    e.target.value as TextListType,
                                )
                            }
                            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                        >
                            <option value="none">Tidak ada</option>
                            <option value="bullet">Bullet (•)</option>
                            <option value="number">Angka (1, 2, 3)</option>
                            <option value="alpha">Huruf (a, b, c)</option>
                        </select>
                        <p className="text-[10px] text-neutral-500">
                            Saat mode daftar aktif, Enter akan lanjut marker baris berikutnya.
                        </p>
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
                                        textAlign: e.target.value as "left" | "center" | "right" | "justify",
                                    })
                                }
                                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                            >
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                                <option value="justify">Rata kanan-kiri</option>
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
                        onAssetUploaded={async (url: string, uploadedAspectRatio: number | null) => {
                            const pixelRatio = uploadedAspectRatio ?? await getImageAspectRatio(url);
                            const fallbackBaseRatio = deriveVisualCropBaseAspectRatio(
                                getBlockAspectRatio(selectedBlock),
                                selectedBlock.crop,
                            );
                            const targetRatio = selectedBlock.type === "image" && selectedBlock.shape === "circle"
                                ? 1
                                : pixelRatio != null
                                    ? imagePixelRatioToBlockRatio(pixelRatio)
                                    : fallbackBaseRatio;
                            let nextW = selectedBlock.w;
                            let nextH = nextW / targetRatio;
                            if (nextH > 1 - selectedBlock.y) {
                                nextH = 1 - selectedBlock.y;
                                nextW = nextH * targetRatio;
                            }
                            if (nextW > 1 - selectedBlock.x) {
                                nextW = 1 - selectedBlock.x;
                                nextH = nextW / targetRatio;
                            }
                            updateBlock(selectedBlock.id, {
                                assetPath: url,
                                crop: undefined,
                                aspectRatio: targetRatio,
                                w: clamp(nextW, 0.01, 1 - selectedBlock.x),
                                h: clamp(nextH, 0.01, 1 - selectedBlock.y),
                            });
                        }}
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

                    {selectedBlock.crop && (
                        <button
                            type="button"
                            onClick={() => resetVisualCrop(selectedBlock)}
                            className="w-full rounded border border-amber-700/50 bg-amber-900/20 px-2 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-900/35"
                        >
                            Reset Crop
                        </button>
                    )}
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
                            onChange={(e) => {
                                const svgCode = e.target.value;
                                const baseSvgRatio =
                                    parseSvgAspectRatio(svgCode)
                                    ?? deriveVisualCropBaseAspectRatio(
                                        getBlockAspectRatio(selectedBlock),
                                        selectedBlock.crop,
                                    );
                                const targetRatio = applyVisualCropToAspectRatio(
                                    baseSvgRatio,
                                    selectedBlock.crop,
                                );
                                let nextW = selectedBlock.w;
                                let nextH = nextW / targetRatio;
                                if (nextH > 1 - selectedBlock.y) {
                                    nextH = 1 - selectedBlock.y;
                                    nextW = nextH * targetRatio;
                                }
                                if (nextW > 1 - selectedBlock.x) {
                                    nextW = 1 - selectedBlock.x;
                                    nextH = nextW / targetRatio;
                                }
                                updateBlock(selectedBlock.id, {
                                    svgCode,
                                    aspectRatio: targetRatio,
                                    w: clamp(nextW, 0.01, 1 - selectedBlock.x),
                                    h: clamp(nextH, 0.01, 1 - selectedBlock.y),
                                });
                            }}
                            rows={8}
                            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs font-mono outline-none focus:border-amber-500 resize-y"
                            placeholder='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">...</svg>'
                        />
                        <p className="text-[10px] text-neutral-500">
                            Tempel SVG mentah dari icon tech stack.
                        </p>
                    </div>

                    {isResumeSvg && (
                        <div className="space-y-2 rounded border border-neutral-800 bg-neutral-900/50 p-2">
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                Resume Text
                            </label>
                            <div className="space-y-0.5">
                                <label className="text-[10px] uppercase text-neutral-600">
                                    Font Size
                                </label>
                                <input
                                    type="number"
                                    min={MIN_RESUME_FONT_SIZE}
                                    max={MAX_RESUME_FONT_SIZE}
                                    value={resumeFontSize}
                                    onChange={(e) =>
                                        updateResumeTypography(selectedBlock, {
                                            fontSize: Number.parseFloat(e.target.value),
                                        })
                                    }
                                    className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                                />
                            </div>
                            <div className="space-y-0.5">
                                <label className="text-[10px] uppercase text-neutral-600">
                                    Font Family
                                </label>
                                <select
                                    value={resumeFontFamily}
                                    onChange={(e) =>
                                        updateResumeTypography(selectedBlock, {
                                            fontFamily: e.target.value,
                                        })
                                    }
                                    className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-amber-500"
                                >
                                    <option value="Arial, sans-serif">Arial</option>
                                    <option value="Helvetica, Arial, sans-serif">Helvetica</option>
                                    <option value="Verdana, Geneva, sans-serif">Verdana</option>
                                    <option value="Trebuchet MS, sans-serif">Trebuchet MS</option>
                                    <option value="Tahoma, Geneva, sans-serif">Tahoma</option>
                                    <option value="Georgia, serif">Georgia</option>
                                    <option value="Times New Roman, serif">Times New Roman</option>
                                    <option value="var(--font-geist-sans)">Geist Sans</option>
                                    <option value="var(--font-crimson-text)">Crimson Text</option>
                                    <option value="var(--font-caveat)">Caveat</option>
                                </select>
                            </div>
                        </div>
                    )}

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

                    {selectedBlock.crop && (
                        <button
                            type="button"
                            onClick={() => resetVisualCrop(selectedBlock)}
                            className="w-full rounded border border-amber-700/50 bg-amber-900/20 px-2 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-900/35"
                        >
                            Reset Crop
                        </button>
                    )}
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
