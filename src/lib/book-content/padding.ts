import type { PaddingConfig } from "@/types/book-content";

// ── Global defaults ──────────────────────────

const DEFAULT_PAD_X_RATIO = 0.08;
const DEFAULT_PAD_Y_RATIO = 0.10;
const PAD_X_MIN = 24;
const PAD_X_MAX = 140;
const PAD_Y_MIN = 24;
const PAD_Y_MAX = 180;

// ── Types ────────────────────────────────────

export interface SafeArea {
    /** Pixel X offset of content area start. */
    x: number;
    /** Pixel Y offset of content area start. */
    y: number;
    /** Pixel width of the content area. */
    w: number;
    /** Pixel height of the content area. */
    h: number;
}

// ── Computation ──────────────────────────────

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Computes the safe content area (after padding) for a given canvas size.
 *
 * @param canvasWidth  – total canvas width in pixels
 * @param canvasHeight – total canvas height in pixels
 * @param override     – optional per-page-side padding ratios
 */
export function computeSafeArea(
    canvasWidth: number,
    canvasHeight: number,
    override?: PaddingConfig,
): SafeArea {
    const ratioX = override?.padXRatio ?? DEFAULT_PAD_X_RATIO;
    const ratioY = override?.padYRatio ?? DEFAULT_PAD_Y_RATIO;

    const padX = clamp(canvasWidth * ratioX, PAD_X_MIN, PAD_X_MAX);
    const padY = clamp(canvasHeight * ratioY, PAD_Y_MIN, PAD_Y_MAX);

    return {
        x: padX,
        y: padY,
        w: canvasWidth - 2 * padX,
        h: canvasHeight - 2 * padY,
    };
}
