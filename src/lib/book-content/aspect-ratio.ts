import type { LayoutBlock } from "@/types/book-content";

const MIN_RATIO = 0.05;
const MAX_RATIO = 20;

/**
 * Height-to-width ratio of a book page in the 3D model (1.71 tall × 1.28 wide).
 *
 * Block coordinates use normalised [0, 1] space where w = 1 means full page
 * width and h = 1 means full page height.  Because the page is taller than it
 * is wide, a pixel-space aspect ratio must be multiplied by this factor to
 * obtain the correct normalised-coordinate ratio (block.w / block.h).
 */
export const PAGE_HEIGHT_WIDTH_RATIO = 1.71 / 1.28;

/**
 * Converts an image's pixel aspect ratio (naturalWidth / naturalHeight) to the
 * block normalised-coordinate ratio that preserves the image's visual
 * proportions on the non-square book page.
 */
export function imagePixelRatioToBlockRatio(pixelRatio: number): number {
    const safe = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
    return normalizeAspectRatio(safe * PAGE_HEIGHT_WIDTH_RATIO);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function normalizeAspectRatio(
    value: unknown,
    fallback = 1,
): number {
    const numeric = typeof value === "number" && Number.isFinite(value)
        ? value
        : fallback;
    const safeFallback = Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
    const positive = numeric > 0 ? numeric : safeFallback;
    return clamp(positive, MIN_RATIO, MAX_RATIO);
}

export function getBlockAspectRatio(
    block: Pick<LayoutBlock, "w" | "h"> & { aspectRatio?: number },
): number {
    const fallback = block.h > 0 ? block.w / block.h : 1;
    return normalizeAspectRatio(block.aspectRatio, fallback);
}

export function parseSvgAspectRatio(svgCode: string): number | null {
    const viewBoxMatch = svgCode.match(
        /viewBox\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i,
    );
    if (viewBoxMatch) {
        const rawViewBox = viewBoxMatch[1] || viewBoxMatch[2] || viewBoxMatch[3] || "";
        const parts = rawViewBox
            .trim()
            .split(/[\s,]+/)
            .map((v) => Number.parseFloat(v));
        if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3]) && parts[3] > 0) {
            return normalizeAspectRatio(parts[2] / parts[3]);
        }
    }

    const widthMatch = svgCode.match(
        /\bwidth\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i,
    );
    const heightMatch = svgCode.match(
        /\bheight\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i,
    );
    if (widthMatch && heightMatch) {
        const width = Number.parseFloat(widthMatch[1] || widthMatch[2] || widthMatch[3] || "");
        const height = Number.parseFloat(heightMatch[1] || heightMatch[2] || heightMatch[3] || "");
        if (Number.isFinite(width) && Number.isFinite(height) && height > 0) {
            return normalizeAspectRatio(width / height);
        }
    }

    return null;
}

export async function getImageAspectRatio(assetUrl: string): Promise<number | null> {
    if (!assetUrl) {
        return null;
    }

    return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                resolve(normalizeAspectRatio(img.naturalWidth / img.naturalHeight));
                return;
            }
            resolve(null);
        };
        img.onerror = () => resolve(null);
        img.src = assetUrl;
    });
}
