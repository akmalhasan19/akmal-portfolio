import type { PageSideLayout, ImageBlock, SvgBlock, TextBlock } from "@/types/book-content";
import { computeSafeArea } from "./padding";
import { svgToDataUrl } from "./svg-utils";
import { normalizePaperBackground } from "./paper-tone";

// ── Constants ────────────────────────────────

export const CANVAS_RENDERER_VERSION = "3";
const DEFAULT_BG_COLOR = normalizePaperBackground();
const MAX_IMAGE_CACHE_ENTRIES = 96;
const resolvedFontFamilyCache = new Map<string, string>();

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
        img.crossOrigin = "anonymous";
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

function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
): string[] {
    const lines: string[] = [];
    const paragraphs = text.split("\n");

    for (const paragraph of paragraphs) {
        if (paragraph === "") {
            lines.push("");
            continue;
        }

        const words = paragraph.split(/\s+/);
        let currentLine = "";

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const metrics = ctx.measureText(testLine);

            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }
    }

    return lines;
}

// ── Draw functions ───────────────────────────

function drawTextBlock(
    ctx: CanvasRenderingContext2D,
    block: TextBlock,
    safeX: number,
    safeY: number,
    safeW: number,
    safeH: number,
) {
    const x = safeX + block.x * safeW;
    const y = safeY + block.y * safeH;
    const w = block.w * safeW;
    const h = block.h * safeH;

    const { fontSize, fontWeight, textAlign, color, lineHeight, fontFamily } =
        block.style;
    const resolvedFontFamily = resolveCanvasFontFamily(fontFamily);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.font = `${fontWeight} ${fontSize}px ${resolvedFontFamily}`;
    ctx.fillStyle = color;
    ctx.textBaseline = "top";

    const linePixelHeight = fontSize * lineHeight;
    const wrappedLines = wrapText(ctx, block.content, w);

    for (let i = 0; i < wrappedLines.length; i++) {
        const lineY = y + i * linePixelHeight;
        if (lineY > y + h) break;

        let lineX = x;
        if (textAlign === "center") {
            lineX = x + w / 2;
            ctx.textAlign = "center";
        } else if (textAlign === "right") {
            lineX = x + w;
            ctx.textAlign = "right";
        } else {
            ctx.textAlign = "left";
        }

        ctx.fillText(wrappedLines[i], lineX, lineY);
    }

    ctx.restore();
}

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

function drawVisualBlock(
    ctx: CanvasRenderingContext2D,
    block: ImageBlock | SvgBlock,
    img: HTMLImageElement,
    safeX: number,
    safeY: number,
    safeW: number,
    safeH: number,
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

    ctx.save();
    if (isCircleImage) {
        const radius = drawBoxSize * 0.5;
        ctx.beginPath();
        ctx.arc(drawX + drawW * 0.5, drawY + drawH * 0.5, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
    } else {
        ctx.beginPath();
        ctx.rect(drawX, drawY, drawW, drawH);
        ctx.clip();
    }

    if (block.objectFit === "contain") {
        // Fit the image inside the block
        const imgAspect = img.width / img.height;
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

        ctx.drawImage(img, targetX, targetY, targetW, targetH);
    } else {
        // Cover the block
        const imgAspect = img.width / img.height;
        const blockAspect = drawW / drawH;
        let sx = 0;
        let sy = 0;
        let sW = img.width;
        let sH = img.height;

        if (imgAspect > blockAspect) {
            sW = img.height * blockAspect;
            sx = (img.width - sW) / 2;
        } else {
            sH = img.width / blockAspect;
            sy = (img.height - sH) / 2;
        }

        ctx.drawImage(img, sx, sy, sW, sH, drawX, drawY, drawW, drawH);
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
    const safe = computeSafeArea(canvasWidth, canvasHeight, layout.paddingOverride);

    // 3. Sort blocks by z-index
    const sortedBlocks = [...layout.blocks].sort((a, b) => a.zIndex - b.zIndex);

    // 4. Pre-load all images
    const imageBlocks = sortedBlocks.filter(
        (b): b is ImageBlock => b.type === "image" && !!b.assetPath,
    );
    const svgBlocks = sortedBlocks.filter(
        (b): b is SvgBlock => b.type === "svg",
    );

    const loadedImages = new Map<string, HTMLImageElement>();
    await Promise.all(
        imageBlocks.map(async (block) => {
            try {
                const img = await loadImage(block.assetPath);
                loadedImages.set(block.id, img);
            } catch {
                // Skip failed images silently
            }
        }),
    );

    await Promise.all(
        svgBlocks.map(async (block) => {
            try {
                const svgUrl = svgToDataUrl(block.svgCode);
                if (!svgUrl) {
                    return;
                }
                const img = await loadImage(svgUrl);
                loadedImages.set(block.id, img);
            } catch {
                // Skip failed SVGs silently
            }
        }),
    );

    // 5. Draw each block
    for (const block of sortedBlocks) {
        if (block.type === "text") {
            drawTextBlock(ctx, block, safe.x, safe.y, safe.w, safe.h);
        } else if (block.type === "image") {
            const img = loadedImages.get(block.id);
            if (img) {
                drawVisualBlock(ctx, block, img, safe.x, safe.y, safe.w, safe.h);
            }
        } else if (block.type === "svg") {
            const img = loadedImages.get(block.id);
            if (img) {
                drawVisualBlock(ctx, block, img, safe.x, safe.y, safe.w, safe.h);
            }
        }
    }

    return canvas;
}
