import type {
    ImageBlock,
    LayoutBlock,
    LinkBlock,
    PageSideLayout,
    ShapeBlock,
    SvgBlock,
    TextBlock,
} from "@/types/book-content";
import { normalizeAspectRatio, parseSvgAspectRatio } from "./aspect-ratio";
import { computeSafeArea } from "./padding";
import { sanitizeSvgCode, svgToBase64DataUrl, svgToDataUrl } from "./svg-utils";
import { normalizePaperBackground } from "./paper-tone";
import { getVisualCropSourceRect } from "./visual-crop";

// ── Constants ────────────────────────────────

export const CANVAS_RENDERER_VERSION = "16";
export const BASE_CANVAS_HEIGHT = 1536;
const DEFAULT_BG_COLOR = normalizePaperBackground();
const MAX_IMAGE_CACHE_ENTRIES = 96;
const SVG_RASTER_BASE_WIDTH = 1024;
const resolvedFontFamilyCache = new Map<string, string>();
const loadedCanvasFontDescriptors = new Set<string>();

type RenderLanguageCode = "id" | "en";

interface LoadedVisualSource {
    source: CanvasImageSource;
    width: number;
    height: number;
}

// ── Image cache ──────────────────────────────

const imageCache = new Map<string, HTMLImageElement>();
const imageLoadPromiseCache = new Map<string, Promise<HTMLImageElement>>();

function touchImageCache(url: string, img: HTMLImageElement) {
    if (imageCache.has(url)) {
        imageCache.delete(url);
    }
    imageCache.set(url, img);

    if (imageCache.size > MAX_IMAGE_CACHE_ENTRIES) {
        const oldestKey = imageCache.keys().next().value;
        if (oldestKey) {
            imageCache.delete(oldestKey);
        }
    }
}

function loadImage(url: string): Promise<HTMLImageElement> {
    const cached = imageCache.get(url);
    if (cached?.complete) {
        touchImageCache(url, cached);
        return Promise.resolve(cached);
    }

    const pending = imageLoadPromiseCache.get(url);
    if (pending) {
        return pending;
    }

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        if (!url.startsWith("data:") && !url.startsWith("blob:")) {
            img.crossOrigin = "anonymous";
        }
        img.onload = () => {
            imageLoadPromiseCache.delete(url);
            touchImageCache(url, img);
            resolve(img);
        };
        img.onerror = () => {
            imageLoadPromiseCache.delete(url);
            reject(new Error(`Failed to load image: ${url}`));
        };
        img.src = url;
    });

    imageLoadPromiseCache.set(url, promise);
    return promise;
}

// ── Text wrapping ────────────────────────────

interface WrappedLine {
    text: string;
    isParagraphEnd: boolean;
}

interface ParsedListLine {
    marker: string;
    content: string;
}

const LIST_LINE_PATTERN = /^\s*([•\-*]|\d+[.)]|[a-zA-Z]+[.)])\s*(.*)$/;
const LIST_MARKER_FALLBACK_GAP_PX = 8;

function parseListLine(paragraph: string): ParsedListLine | null {
    const match = paragraph.match(LIST_LINE_PATTERN);
    if (!match) {
        return null;
    }

    return {
        marker: match[1],
        content: match[2] ?? "",
    };
}

function resolveTextContentByLanguage(
    block: TextBlock,
    language: RenderLanguageCode,
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

function splitTokenByWidth(
    ctx: CanvasRenderingContext2D,
    token: string,
    maxWidth: number,
): string[] {
    if (!token) {
        return [];
    }
    if (ctx.measureText(token).width <= maxWidth) {
        return [token];
    }

    const chars = [...token];
    const segments: string[] = [];
    let current = "";

    for (const char of chars) {
        const test = `${current}${char}`;
        if (current && ctx.measureText(test).width > maxWidth) {
            segments.push(current);
            current = char;
            continue;
        }

        if (!current && ctx.measureText(char).width > maxWidth) {
            // Extremely narrow blocks: still emit at least one character.
            segments.push(char);
            continue;
        }

        current = test;
    }

    if (current) {
        segments.push(current);
    }

    return segments.length > 0 ? segments : [token];
}

function wrapTextDetailed(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
): WrappedLine[] {
    const lines: WrappedLine[] = [];
    const paragraphs = text.split("\n");

    for (const paragraph of paragraphs) {
        if (paragraph === "") {
            lines.push({ text: "", isParagraphEnd: true });
            continue;
        }

        const words = paragraph.split(/\s+/).filter(Boolean);
        let currentLine = "";

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const metrics = ctx.measureText(testLine);

            if (metrics.width > maxWidth && currentLine) {
                lines.push({ text: currentLine, isParagraphEnd: false });
                const segments = splitTokenByWidth(ctx, word, maxWidth);
                if (segments.length > 1) {
                    for (let i = 0; i < segments.length - 1; i += 1) {
                        lines.push({ text: segments[i], isParagraphEnd: false });
                    }
                }
                currentLine = segments[segments.length - 1] ?? "";
            } else {
                if (currentLine) {
                    currentLine = testLine;
                    continue;
                }

                const segments = splitTokenByWidth(ctx, word, maxWidth);
                if (segments.length > 1) {
                    for (let i = 0; i < segments.length - 1; i += 1) {
                        lines.push({ text: segments[i], isParagraphEnd: false });
                    }
                }
                currentLine = segments[segments.length - 1] ?? "";
            }
        }

        if (currentLine) {
            lines.push({ text: currentLine, isParagraphEnd: true });
        }
    }

    return lines;
}

function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
): string[] {
    const lines = wrapTextDetailed(ctx, text, maxWidth);
    return lines.map((line) => line.text);
}

function drawJustifiedTextLine(
    ctx: CanvasRenderingContext2D,
    line: string,
    x: number,
    y: number,
    width: number,
) {
    const words = line.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 1) {
        ctx.fillText(line, x, y);
        return;
    }

    const textWithoutSpaces = words.join("");
    const wordsWidth = ctx.measureText(textWithoutSpaces).width;
    const gapCount = words.length - 1;
    const gapWidth = (width - wordsWidth) / gapCount;

    if (!Number.isFinite(gapWidth) || gapWidth <= 0) {
        ctx.fillText(line, x, y);
        return;
    }

    let cursorX = x;
    for (let i = 0; i < words.length; i += 1) {
        const word = words[i];
        ctx.fillText(word, cursorX, y);
        cursorX += ctx.measureText(word).width;
        if (i < words.length - 1) {
            cursorX += gapWidth;
        }
    }
}

function shouldJustifyLine(line: WrappedLine, textAlign: TextBlock["style"]["textAlign"]): boolean {
    return textAlign === "justify" && !line.isParagraphEnd && /\s/.test(line.text);
}

function drawAlignedTextLine(
    ctx: CanvasRenderingContext2D,
    line: WrappedLine,
    textAlign: TextBlock["style"]["textAlign"],
    x: number,
    y: number,
    width: number,
) {
    if (shouldJustifyLine(line, textAlign)) {
        ctx.textAlign = "left";
        drawJustifiedTextLine(ctx, line.text, x, y, width);
        return;
    }

    let lineX = x;
    if (textAlign === "center") {
        lineX = x + width / 2;
        ctx.textAlign = "center";
    } else if (textAlign === "right") {
        lineX = x + width;
        ctx.textAlign = "right";
    } else {
        ctx.textAlign = "left";
    }

    ctx.fillText(line.text, lineX, y);
}

function drawTextLines(
    ctx: CanvasRenderingContext2D,
    lines: WrappedLine[],
    textAlign: TextBlock["style"]["textAlign"],
    x: number,
    y: number,
    width: number,
    height: number,
    linePixelHeight: number,
) {
    const maxDrawY = y + height + linePixelHeight * 0.35;
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const lineY = y + i * linePixelHeight;
        if (lineY > maxDrawY) break;
        drawAlignedTextLine(ctx, line, textAlign, x, lineY, width);
    }
}

function drawTextBlock(
    ctx: CanvasRenderingContext2D,
    block: TextBlock,
    safeX: number,
    safeY: number,
    safeW: number,
    safeH: number,
    fontScale: number,
    language: RenderLanguageCode,
) {
    const x = safeX + block.x * safeW;
    const y = safeY + block.y * safeH;
    const w = block.w * safeW;
    const h = block.h * safeH;

    const { fontSize, fontWeight, textAlign, color, lineHeight, fontFamily } =
        block.style;
    const resolvedFontFamily = resolveCanvasFontFamily(fontFamily);

    ctx.save();
    const cornerRadiusPx = (block.cornerRadius ?? 0) * fontScale;
    ctx.beginPath();
    if (cornerRadiusPx > 0) {
        drawRoundedRectPath(ctx, x, y, w, h, cornerRadiusPx);
    } else {
        ctx.rect(x, y, w, h);
    }
    ctx.clip();

    const effectiveFontSize = Math.max(1, fontSize * fontScale);
    ctx.font = `${fontWeight} ${effectiveFontSize}px ${resolvedFontFamily}`;
    ctx.fillStyle = color;
    ctx.textBaseline = "top";

    const linePixelHeight = effectiveFontSize * lineHeight;
    // CSS line-height distributes extra leading equally above and below each
    // line (half-leading).  Canvas textBaseline="top" starts glyphs flush at
    // the given y, so without an offset the first line sits higher than CSS
    // and the last line's descenders can extend past the block boundary,
    // causing visible clipping.  Adding the half-leading offset here aligns
    // the canvas output with the admin panel's CSS rendering.
    const halfLeading = effectiveFontSize * (lineHeight - 1) * 0.5;
    const textContent = resolveTextContentByLanguage(block, language);
    const listType = block.style.listType ?? "none";
    const maxDrawY = y + h + linePixelHeight * 0.35;
    if (listType !== "none") {
        const paragraphs = textContent.split("\n");
        const markerGapWidth = Math.max(
            LIST_MARKER_FALLBACK_GAP_PX,
            ctx.measureText(" ").width,
        );
        let currentY = y + halfLeading;

        for (const paragraph of paragraphs) {
            if (currentY > maxDrawY) {
                break;
            }

            if (paragraph === "") {
                currentY += linePixelHeight;
                continue;
            }

            const parsedListLine = parseListLine(paragraph);
            if (!parsedListLine) {
                const wrapped = wrapTextDetailed(ctx, paragraph, w);
                for (const wrappedLine of wrapped) {
                    if (currentY > maxDrawY) {
                        break;
                    }
                    drawAlignedTextLine(ctx, wrappedLine, "left", x, currentY, w);
                    currentY += linePixelHeight;
                }
                continue;
            }

            const markerWidth = ctx.measureText(parsedListLine.marker).width + markerGapWidth;
            const hangingIndentWidth = Math.max(1, Math.min(w - 1, markerWidth));
            const contentWidth = Math.max(1, w - hangingIndentWidth);
            const wrappedContent = wrapTextDetailed(ctx, parsedListLine.content, contentWidth);

            if (currentY <= maxDrawY) {
                ctx.textAlign = "left";
                ctx.fillText(parsedListLine.marker, x, currentY);
            }

            if (wrappedContent.length === 0) {
                currentY += linePixelHeight;
                continue;
            }

            for (const wrappedLine of wrappedContent) {
                if (currentY > maxDrawY) {
                    break;
                }
                drawAlignedTextLine(
                    ctx,
                    wrappedLine,
                    "left",
                    x + hangingIndentWidth,
                    currentY,
                    contentWidth,
                );
                currentY += linePixelHeight;
            }
        }
    } else {
        const wrappedLines = wrapTextDetailed(ctx, textContent, w);
        drawTextLines(ctx, wrappedLines, textAlign, x, y + halfLeading, w, h, linePixelHeight);
    }
    ctx.restore();
}

function drawShapePath(
    ctx: CanvasRenderingContext2D,
    shapeType: ShapeBlock["shapeType"],
    x: number,
    y: number,
    w: number,
    h: number,
    cornerRadiusPx: number,
) {
    ctx.beginPath();

    if (shapeType === "circle") {
        ctx.ellipse(
            x + w * 0.5,
            y + h * 0.5,
            Math.max(0, w * 0.5),
            Math.max(0, h * 0.5),
            0,
            0,
            Math.PI * 2,
        );
        ctx.closePath();
        return;
    }

    if (shapeType === "triangle") {
        ctx.moveTo(x + w * 0.5, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        return;
    }

    if (shapeType === "diamond") {
        ctx.moveTo(x + w * 0.5, y);
        ctx.lineTo(x + w, y + h * 0.5);
        ctx.lineTo(x + w * 0.5, y + h);
        ctx.lineTo(x, y + h * 0.5);
        ctx.closePath();
        return;
    }

    if (shapeType === "pill") {
        drawRoundedRectPath(ctx, x, y, w, h, h * 0.5);
        return;
    }

    if (cornerRadiusPx > 0) {
        drawRoundedRectPath(ctx, x, y, w, h, cornerRadiusPx);
        return;
    }

    ctx.rect(x, y, w, h);
    ctx.closePath();
}

function drawShapeBlock(
    ctx: CanvasRenderingContext2D,
    block: ShapeBlock,
    safeX: number,
    safeY: number,
    safeW: number,
    safeH: number,
    fontScale: number,
) {
    const x = safeX + block.x * safeW;
    const y = safeY + block.y * safeH;
    const w = block.w * safeW;
    const h = block.h * safeH;
    const cornerRadiusPx = (block.cornerRadius ?? 0) * fontScale;

    if (w <= 0 || h <= 0) {
        return;
    }

    const fillColor = block.fillColor || "transparent";
    const strokeColor = block.strokeColor || "transparent";
    const strokeWidth = Math.max(0, block.strokeWidth * fontScale);
    const hasFill = fillColor !== "transparent";
    const hasStroke = strokeWidth > 0 && strokeColor !== "transparent";

    ctx.save();
    drawShapePath(ctx, block.shapeType, x, y, w, h, cornerRadiusPx);
    if (hasFill) {
        ctx.fillStyle = fillColor;
        ctx.fill();
    }
    if (hasStroke) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
    }

    const text = block.content ?? "";
    if (text.trim().length > 0) {
        const resolvedFontFamily = resolveCanvasFontFamily(block.style.fontFamily);
        const effectiveFontSize = Math.max(1, block.style.fontSize * fontScale);
        const linePixelHeight = effectiveFontSize * block.style.lineHeight;
        const halfLeading = effectiveFontSize * (block.style.lineHeight - 1) * 0.5;
        const textPaddingX = Math.max(2, effectiveFontSize * 0.2);
        const textPaddingY = Math.max(2, effectiveFontSize * 0.18);
        const textX = x + textPaddingX;
        const textW = Math.max(1, w - textPaddingX * 2);
        const textH = Math.max(1, h - textPaddingY * 2);

        drawShapePath(ctx, block.shapeType, x, y, w, h, cornerRadiusPx);
        ctx.clip();
        ctx.font = `${block.style.fontWeight} ${effectiveFontSize}px ${resolvedFontFamily}`;
        ctx.fillStyle = block.style.color;
        ctx.textBaseline = "top";
        const wrapped = wrapTextDetailed(ctx, text, textW);

        // Center text vertically within the shape
        const totalTextHeight = wrapped.length * linePixelHeight;
        const verticalOffset = Math.max(0, (textH - totalTextHeight) / 2);
        const textY = y + textPaddingY + halfLeading + verticalOffset;

        drawTextLines(
            ctx,
            wrapped,
            block.style.textAlign,
            textX,
            textY,
            textW,
            textH,
            linePixelHeight,
        );
    }

    ctx.restore();
}

function stripClipPathArtifacts(svgMarkup: string): string {
    return svgMarkup
        .replace(
            /\sclip-path\s*=\s*(?:"url\(#.*?\)"|'url\(#.*?\)'|url\(#.*?\))/gi,
            "",
        )
        .replace(/<clipPath[\s\S]*?<\/clipPath>/gi, "")
        .replace(/<defs>\s*<\/defs>/gi, "");
}

function createSvgBlobUrl(svgMarkup: string): string | null {
    if (typeof URL === "undefined" || typeof Blob === "undefined" || !svgMarkup) {
        return null;
    }
    try {
        const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
        return URL.createObjectURL(blob);
    } catch {
        return null;
    }
}

function buildSvgLoadCandidates(svgCode: string): string[] {
    const sanitized = sanitizeSvgCode(svgCode);
    if (!sanitized) {
        return [];
    }

    const variants = [
        sanitized,
        stripClipPathArtifacts(sanitized),
    ].filter((value, index, list) => value && list.indexOf(value) === index);

    const candidates: string[] = [];
    for (const variant of variants) {
        const utf8 = svgToDataUrl(variant);
        const base64 = svgToBase64DataUrl(variant);
        const blobUrl = createSvgBlobUrl(variant);
        if (utf8) {
            candidates.push(utf8);
        }
        if (base64) {
            candidates.push(base64);
        }
        if (blobUrl) {
            candidates.push(blobUrl);
        }
    }

    return candidates;
}

async function rasterizeSvgWithCanvg(svgCode: string, fallbackAspectRatio: number): Promise<LoadedVisualSource | null> {
    const sanitized = sanitizeSvgCode(svgCode);
    if (!sanitized || typeof document === "undefined") {
        return null;
    }

    const aspectRatio = normalizeAspectRatio(
        parseSvgAspectRatio(sanitized),
        fallbackAspectRatio,
    );
    const width = SVG_RASTER_BASE_WIDTH;
    const height = Math.max(1, Math.round(width / aspectRatio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return null;
    }

    const { Canvg } = await import("canvg");
    const canvg = Canvg.fromString(ctx, sanitized, {
        ignoreAnimation: true,
        ignoreMouse: true,
        ignoreDimensions: true,
        ignoreClear: true,
    });
    await canvg.render();

    return {
        source: canvas,
        width,
        height,
    };
}

async function loadSvgBlockImage(block: SvgBlock): Promise<LoadedVisualSource | null> {
    const canvgRasterized = await rasterizeSvgWithCanvg(
        block.svgCode,
        normalizeAspectRatio(block.aspectRatio, 1),
    ).catch(() => null);
    if (canvgRasterized) {
        return canvgRasterized;
    }

    const candidates = buildSvgLoadCandidates(block.svgCode);

    for (const url of candidates) {
        try {
            const loaded = await loadImage(url);
            if (url.startsWith("blob:") && typeof URL !== "undefined") {
                URL.revokeObjectURL(url);
            }
            return {
                source: loaded,
                width: Math.max(1, loaded.naturalWidth || loaded.width || 1),
                height: Math.max(1, loaded.naturalHeight || loaded.height || 1),
            };
        } catch {
            if (url.startsWith("blob:") && typeof URL !== "undefined") {
                URL.revokeObjectURL(url);
            }
            // Try next candidate.
        }
    }

    return null;
}

function drawRoundedRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
) {
    const r = Math.max(0, Math.min(radius, Math.min(w, h) * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ── Draw functions ───────────────────────────


function resolveCanvasFontFamily(input: string): string {
    const fallback = "sans-serif";
    const raw = input?.trim() || fallback;
    const cached = resolvedFontFamilyCache.get(raw);
    if (cached) {
        return cached;
    }

    const cssVarMatch = /^var\((--[^)]+)\)$/.exec(raw);
    if (!cssVarMatch) {
        resolvedFontFamilyCache.set(raw, raw);
        return raw;
    }

    if (typeof window === "undefined" || typeof document === "undefined") {
        resolvedFontFamilyCache.set(raw, fallback);
        return fallback;
    }

    const variableName = cssVarMatch[1];
    const rootValue = getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();
    const bodyValue = getComputedStyle(document.body)
        .getPropertyValue(variableName)
        .trim();
    const resolved = rootValue || bodyValue;
    const normalized = resolved ? `${resolved}, ${fallback}` : fallback;
    resolvedFontFamilyCache.set(raw, normalized);
    return normalized;
}

function buildCanvasFontDescriptor(
    fontWeight: string | number,
    fontSize: number,
    fontFamily: string,
): string {
    const safeSize = Math.max(1, Number.isFinite(fontSize) ? fontSize : 12);
    const roundedSize = Math.round(safeSize * 100) / 100;
    return `${fontWeight} ${roundedSize}px ${fontFamily}`;
}

async function ensureLayoutFontsReady(
    layout: PageSideLayout,
    fontScale: number,
): Promise<void> {
    if (typeof document === "undefined" || !("fonts" in document)) {
        return;
    }

    const fontFaceSet = document.fonts;
    const descriptors = new Set<string>();

    for (const block of layout.blocks) {
        if (block.type === "text") {
            const resolvedFamily = resolveCanvasFontFamily(block.style.fontFamily);
            const descriptor = buildCanvasFontDescriptor(
                block.style.fontWeight,
                block.style.fontSize * fontScale,
                resolvedFamily,
            );
            descriptors.add(descriptor);
            continue;
        }

        if (block.type === "link") {
            const resolvedFamily = resolveCanvasFontFamily(block.style.fontFamily);
            const descriptor = buildCanvasFontDescriptor(
                block.style.fontWeight,
                block.style.fontSize * fontScale,
                resolvedFamily,
            );
            descriptors.add(descriptor);
            continue;
        }

        if (block.type === "shape") {
            const resolvedFamily = resolveCanvasFontFamily(block.style.fontFamily);
            const descriptor = buildCanvasFontDescriptor(
                block.style.fontWeight,
                block.style.fontSize * fontScale,
                resolvedFamily,
            );
            descriptors.add(descriptor);
        }
    }

    if (descriptors.size === 0) {
        return;
    }

    const loadTasks: Promise<unknown>[] = [];
    for (const descriptor of descriptors) {
        if (loadedCanvasFontDescriptors.has(descriptor)) {
            continue;
        }

        try {
            if (fontFaceSet.check(descriptor)) {
                loadedCanvasFontDescriptors.add(descriptor);
                continue;
            }
        } catch {
            // Fall through to load attempt.
        }

        loadTasks.push(
            fontFaceSet
                .load(descriptor)
                .then(() => {
                    loadedCanvasFontDescriptors.add(descriptor);
                })
                .catch(() => {
                    // Keep rendering even if font load fails.
                }),
        );
    }

    if (loadTasks.length > 0) {
        await Promise.allSettled(loadTasks);
    }
}

function drawVisualBlock(
    ctx: CanvasRenderingContext2D,
    block: ImageBlock | SvgBlock,
    sourceAsset: LoadedVisualSource,
    safeX: number,
    safeY: number,
    safeW: number,
    safeH: number,
    scale: number,
) {
    const x = safeX + block.x * safeW;
    const y = safeY + block.y * safeH;
    const w = block.w * safeW;
    const h = block.h * safeH;
    const isCircleImage = block.type === "image" && block.shape === "circle";
    const drawBoxSize = isCircleImage ? Math.min(w, h) : 0;
    const drawX = isCircleImage ? x + (w - drawBoxSize) * 0.5 : x;
    const drawY = isCircleImage ? y + (h - drawBoxSize) * 0.5 : y;
    const drawW = isCircleImage ? drawBoxSize : w;
    const drawH = isCircleImage ? drawBoxSize : h;
    const sourceWidth = Math.max(1, sourceAsset.width);
    const sourceHeight = Math.max(1, sourceAsset.height);
    const source = getVisualCropSourceRect(sourceWidth, sourceHeight, block.crop);
    const sourceAspect = block.type === "svg"
        ? normalizeAspectRatio(block.aspectRatio, source.width / source.height)
        : source.width / source.height;

    if (drawW <= 0 || drawH <= 0 || source.width <= 0 || source.height <= 0) {
        return;
    }

    ctx.save();
    const cornerRadiusPx = (block.cornerRadius ?? 0) * scale;
    if (isCircleImage) {
        const radius = drawBoxSize * 0.5;
        ctx.beginPath();
        ctx.arc(drawX + drawW * 0.5, drawY + drawH * 0.5, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
    } else if (cornerRadiusPx > 0) {
        ctx.beginPath();
        drawRoundedRectPath(ctx, drawX, drawY, drawW, drawH, cornerRadiusPx);
        ctx.clip();
    } else {
        ctx.beginPath();
        ctx.rect(drawX, drawY, drawW, drawH);
        ctx.clip();
    }

    if (block.objectFit === "contain") {
        // Fit the cropped source inside the block.
        const imgAspect = sourceAspect;
        const blockAspect = drawW / drawH;
        let targetW = drawW;
        let targetH = drawH;
        let targetX = drawX;
        let targetY = drawY;

        if (imgAspect > blockAspect) {
            targetH = drawW / imgAspect;
            targetY = drawY + (drawH - targetH) / 2;
        } else {
            targetW = drawH * imgAspect;
            targetX = drawX + (drawW - targetW) / 2;
        }

        ctx.drawImage(
            sourceAsset.source,
            source.x,
            source.y,
            source.width,
            source.height,
            targetX,
            targetY,
            targetW,
            targetH,
        );
    } else {
        // Cover the block using the cropped source as the starting viewport.
        const imgAspect = sourceAspect;
        const blockAspect = drawW / drawH;
        let sx = source.x;
        let sy = source.y;
        let sW = source.width;
        let sH = source.height;

        if (imgAspect > blockAspect) {
            sW = source.height * blockAspect;
            sx = source.x + (source.width - sW) / 2;
        } else {
            sH = source.width / blockAspect;
            sy = source.y + (source.height - sH) / 2;
        }

        ctx.drawImage(sourceAsset.source, sx, sy, sW, sH, drawX, drawY, drawW, drawH);
    }

    ctx.restore();
}

function drawLinkBlock(
    ctx: CanvasRenderingContext2D,
    block: LinkBlock,
    safeX: number,
    safeY: number,
    safeW: number,
    safeH: number,
    fontScale: number,
) {
    const x = safeX + block.x * safeW;
    const y = safeY + block.y * safeH;
    const w = block.w * safeW;
    const h = block.h * safeH;

    const { backgroundColor, textColor, fontFamily, textAlign, fontSize, fontWeight } =
        block.style;
    const radius = block.style.borderRadius * fontScale;
    const resolvedFontFamily = resolveCanvasFontFamily(fontFamily);
    const effectiveFontSize = Math.max(1, fontSize * fontScale);
    const paddingX = Math.max(4, effectiveFontSize * 0.35);
    const paddingY = Math.max(3, effectiveFontSize * 0.25);
    const textAreaX = x + paddingX;
    const textAreaY = y + paddingY;
    const textAreaW = Math.max(1, w - paddingX * 2);
    const textAreaH = Math.max(1, h - paddingY * 2);

    ctx.save();

    drawRoundedRectPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = backgroundColor;
    ctx.fill();

    drawRoundedRectPath(ctx, x, y, w, h, radius);
    ctx.clip();

    ctx.font = `${fontWeight} ${effectiveFontSize}px ${resolvedFontFamily}`;
    ctx.fillStyle = textColor;
    ctx.textBaseline = "top";

    const lineHeightPx = effectiveFontSize * 1.2;
    const wrappedLines = wrapText(ctx, block.label, textAreaW);
    for (let i = 0; i < wrappedLines.length; i += 1) {
        const lineY = textAreaY + i * lineHeightPx;
        if (lineY + lineHeightPx > textAreaY + textAreaH) {
            break;
        }

        let lineX = textAreaX;
        if (textAlign === "center") {
            lineX = textAreaX + textAreaW * 0.5;
            ctx.textAlign = "center";
        } else if (textAlign === "right") {
            lineX = textAreaX + textAreaW;
            ctx.textAlign = "right";
        } else {
            ctx.textAlign = "left";
        }

        ctx.fillText(wrappedLines[i], lineX, lineY);
    }

    ctx.restore();
}

function drawBlockOutline(
    ctx: CanvasRenderingContext2D,
    block: LayoutBlock,
    safeX: number,
    safeY: number,
    safeW: number,
    safeH: number,
    scale: number,
) {
    const outline = block.outline;
    if (!outline) {
        return;
    }

    const rawWidth = outline.width * scale;
    if (rawWidth <= 0) {
        return;
    }

    const x = safeX + block.x * safeW;
    const y = safeY + block.y * safeH;
    const w = block.w * safeW;
    const h = block.h * safeH;
    const isCircleImage = block.type === "image" && block.shape === "circle";

    ctx.save();
    ctx.strokeStyle = outline.color;
    ctx.lineWidth = rawWidth;
    // Stroke is centered on the path. Expand outward by half line width so the
    // outline grows outside the block boundary without clipping its content.
    const half = rawWidth / 2;

    if (isCircleImage) {
        const drawBoxSize = Math.min(w, h);
        const cx = x + w / 2;
        const cy = y + h / 2;
        const radius = drawBoxSize / 2 + half;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
    } else if (block.type === "link") {
        // For link blocks use their style borderRadius (scaled outward).
        const linkRadius = block.style.borderRadius * scale;
        drawRoundedRectPath(
            ctx,
            x - half,
            y - half,
            w + rawWidth,
            h + rawWidth,
            linkRadius + half,
        );
        ctx.stroke();
    } else {
        const cornerPx = (block.cornerRadius ?? 0) * scale;
        if (cornerPx > 0) {
            drawRoundedRectPath(
                ctx,
                x - half,
                y - half,
                w + rawWidth,
                h + rawWidth,
                cornerPx + half,
            );
            ctx.stroke();
        } else {
            ctx.strokeRect(x - half, y - half, w + rawWidth, h + rawWidth);
        }
    }

    ctx.restore();
}

// ── Main render function ─────────────────────

/**
 * Renders a PageSideLayout to an HTMLCanvasElement.
 *
 * @param layout       – the page side layout to render
 * @param canvasWidth  – target canvas width in pixels
 * @param canvasHeight – target canvas height in pixels
 * @returns Promise resolving to the rendered canvas element
 */
export async function renderPageSideToCanvas(
    layout: PageSideLayout,
    canvasWidth: number,
    canvasHeight: number,
    language: RenderLanguageCode = "id",
    /** Optional display page number drawn at the bottom center. */
    pageNumber?: number,
): Promise<HTMLCanvasElement> {
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Cannot get 2D context");
    }

    // 1. Draw background
    ctx.fillStyle = normalizePaperBackground(layout.backgroundColor) || DEFAULT_BG_COLOR;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. Compute safe area
    const scaleY = canvasHeight / BASE_CANVAS_HEIGHT;
    const baseCanvasWidth = canvasWidth / scaleY;
    const scaleX = canvasWidth / baseCanvasWidth;

    const baseSafe = computeSafeArea(baseCanvasWidth, BASE_CANVAS_HEIGHT, layout.paddingOverride);
    const safe = {
        x: baseSafe.x * scaleX,
        y: baseSafe.y * scaleY,
        w: baseSafe.w * scaleX,
        h: baseSafe.h * scaleY
    };

    // 3. Sort blocks by z-index
    const sortedBlocks = [...layout.blocks].sort((a, b) => a.zIndex - b.zIndex);
    await ensureLayoutFontsReady(layout, scaleY);

    // 4. Pre-load all images
    const imageBlocks = sortedBlocks.filter(
        (b): b is ImageBlock => b.type === "image" && !!b.assetPath,
    );
    const svgBlocks = sortedBlocks.filter(
        (b): b is SvgBlock => b.type === "svg",
    );

    const loadedImages = new Map<string, LoadedVisualSource>();
    await Promise.all(
        imageBlocks.map(async (block) => {
            try {
                const img = await loadImage(block.assetPath);
                loadedImages.set(block.id, {
                    source: img,
                    width: Math.max(1, img.naturalWidth || img.width || 1),
                    height: Math.max(1, img.naturalHeight || img.height || 1),
                });
            } catch {
                // Skip failed images silently
            }
        }),
    );

    await Promise.all(
        svgBlocks.map(async (block) => {
            try {
                const loaded = await loadSvgBlockImage(block);

                if (loaded) {
                    loadedImages.set(block.id, loaded);
                } else if (process.env.NODE_ENV !== "production") {
                    console.warn(
                        "[render-canvas] Failed to load SVG block",
                        block.id,
                    );
                }
            } catch {
                // Skip failed SVGs silently
            }
        }),
    );

    // 5. Draw each block
    for (const block of sortedBlocks) {
        try {
            if (block.type === "text") {
                drawTextBlock(ctx, block, safe.x, safe.y, safe.w, safe.h, scaleY, language);
            } else if (block.type === "image") {
                const img = loadedImages.get(block.id);
                if (img) {
                    drawVisualBlock(ctx, block, img, safe.x, safe.y, safe.w, safe.h, scaleY);
                }
            } else if (block.type === "svg") {
                const img = loadedImages.get(block.id);
                if (img) {
                    drawVisualBlock(ctx, block, img, safe.x, safe.y, safe.w, safe.h, scaleY);
                }
            } else if (block.type === "link") {
                drawLinkBlock(ctx, block, safe.x, safe.y, safe.w, safe.h, scaleY);
            } else if (block.type === "shape") {
                drawShapeBlock(ctx, block, safe.x, safe.y, safe.w, safe.h, scaleY);
            }

            // Draw outline on top of block content (if configured)
            drawBlockOutline(ctx, block, safe.x, safe.y, safe.w, safe.h, scaleY);
        } catch {
            if (process.env.NODE_ENV !== "production") {
                console.warn("[render-canvas] Failed to draw block", block.id);
            }
        }
    }

    // 6. Draw page number at the bottom center (if provided)
    if (pageNumber != null && pageNumber > 0) {
        const pageNumFontSize = Math.round(42 * scaleY);
        const pageNumFont = `500 ${pageNumFontSize}px serif`;
        const pageNumColor = "#4a3d32";
        const bottomMargin = Math.round(36 * scaleY);

        ctx.save();
        ctx.font = pageNumFont;
        ctx.fillStyle = pageNumColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(
            String(pageNumber),
            canvasWidth / 2,
            canvasHeight - bottomMargin,
        );
        ctx.restore();
    }

    return canvas;
}
