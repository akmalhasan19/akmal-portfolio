import type { PageSideLayout, ImageBlock, TextBlock } from "@/types/book-content";
import { computeSafeArea } from "./padding";

// ── Constants ────────────────────────────────

const DEFAULT_BG_COLOR = "#ffffff";

// ── Image cache ──────────────────────────────

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(url: string): Promise<HTMLImageElement> {
    const cached = imageCache.get(url);
    if (cached?.complete) {
        return Promise.resolve(cached);
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            imageCache.set(url, img);
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        img.src = url;
    });
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

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
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

function drawImageBlock(
    ctx: CanvasRenderingContext2D,
    block: ImageBlock,
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

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    if (block.objectFit === "contain") {
        // Fit the image inside the block
        const imgAspect = img.width / img.height;
        const blockAspect = w / h;
        let drawW = w;
        let drawH = h;
        let drawX = x;
        let drawY = y;

        if (imgAspect > blockAspect) {
            drawH = w / imgAspect;
            drawY = y + (h - drawH) / 2;
        } else {
            drawW = h * imgAspect;
            drawX = x + (w - drawW) / 2;
        }

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
        // Cover the block
        const imgAspect = img.width / img.height;
        const blockAspect = w / h;
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

        ctx.drawImage(img, sx, sy, sW, sH, x, y, w, h);
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
    ctx.fillStyle = layout.backgroundColor || DEFAULT_BG_COLOR;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. Compute safe area
    const safe = computeSafeArea(canvasWidth, canvasHeight, layout.paddingOverride);

    // 3. Sort blocks by z-index
    const sortedBlocks = [...layout.blocks].sort((a, b) => a.zIndex - b.zIndex);

    // 4. Pre-load all images
    const imageBlocks = sortedBlocks.filter(
        (b): b is ImageBlock => b.type === "image" && !!b.assetPath,
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

    // 5. Draw each block
    for (const block of sortedBlocks) {
        if (block.type === "text") {
            drawTextBlock(ctx, block, safe.x, safe.y, safe.w, safe.h);
        } else if (block.type === "image") {
            const img = loadedImages.get(block.id);
            if (img) {
                drawImageBlock(ctx, block, img, safe.x, safe.y, safe.w, safe.h);
            }
        }
    }

    return canvas;
}
