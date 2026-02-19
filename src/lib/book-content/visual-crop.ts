import type { VisualCrop } from "@/types/book-content";

const MIN_CROP_VALUE = 0;
const MAX_CROP_VALUE = 0.95;
const ZERO_EPSILON = 1e-4;

export const MIN_VISUAL_CROP_REMAINING_RATIO = 0.05;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeVisualCrop(
    crop: Partial<VisualCrop> | VisualCrop | null | undefined,
): VisualCrop {
    let left = clamp(toNumber(crop?.left), MIN_CROP_VALUE, MAX_CROP_VALUE);
    let right = clamp(toNumber(crop?.right), MIN_CROP_VALUE, MAX_CROP_VALUE);
    let top = clamp(toNumber(crop?.top), MIN_CROP_VALUE, MAX_CROP_VALUE);
    let bottom = clamp(toNumber(crop?.bottom), MIN_CROP_VALUE, MAX_CROP_VALUE);

    const maxHorizontalCrop = 1 - MIN_VISUAL_CROP_REMAINING_RATIO;
    const maxVerticalCrop = 1 - MIN_VISUAL_CROP_REMAINING_RATIO;

    if (left + right > maxHorizontalCrop) {
        const scale = maxHorizontalCrop / (left + right);
        left *= scale;
        right *= scale;
    }
    if (top + bottom > maxVerticalCrop) {
        const scale = maxVerticalCrop / (top + bottom);
        top *= scale;
        bottom *= scale;
    }

    return { left, right, top, bottom };
}

export function isZeroVisualCrop(crop: VisualCrop): boolean {
    return Math.abs(crop.left) < ZERO_EPSILON
        && Math.abs(crop.right) < ZERO_EPSILON
        && Math.abs(crop.top) < ZERO_EPSILON
        && Math.abs(crop.bottom) < ZERO_EPSILON;
}

export function toOptionalVisualCrop(
    crop: Partial<VisualCrop> | VisualCrop | null | undefined,
): VisualCrop | undefined {
    const normalized = normalizeVisualCrop(crop);
    return isZeroVisualCrop(normalized) ? undefined : normalized;
}

export function getVisualCropRemainingRatios(
    crop: Partial<VisualCrop> | VisualCrop | null | undefined,
): { widthRatio: number; heightRatio: number } {
    const normalized = normalizeVisualCrop(crop);
    return {
        widthRatio: Math.max(
            MIN_VISUAL_CROP_REMAINING_RATIO,
            1 - normalized.left - normalized.right,
        ),
        heightRatio: Math.max(
            MIN_VISUAL_CROP_REMAINING_RATIO,
            1 - normalized.top - normalized.bottom,
        ),
    };
}

export function getVisualCropAspectRatioMultiplier(
    crop: Partial<VisualCrop> | VisualCrop | null | undefined,
): number {
    const remaining = getVisualCropRemainingRatios(crop);
    return remaining.widthRatio / remaining.heightRatio;
}

export function deriveVisualCropBaseAspectRatio(
    currentAspectRatio: number,
    currentCrop: Partial<VisualCrop> | VisualCrop | null | undefined,
): number {
    const safeAspect = Number.isFinite(currentAspectRatio) && currentAspectRatio > 0
        ? currentAspectRatio
        : 1;
    const multiplier = getVisualCropAspectRatioMultiplier(currentCrop);
    return safeAspect / Math.max(multiplier, MIN_VISUAL_CROP_REMAINING_RATIO);
}

export function applyVisualCropToAspectRatio(
    baseAspectRatio: number,
    crop: Partial<VisualCrop> | VisualCrop | null | undefined,
): number {
    const safeBase = Number.isFinite(baseAspectRatio) && baseAspectRatio > 0
        ? baseAspectRatio
        : 1;
    return safeBase * getVisualCropAspectRatioMultiplier(crop);
}

export function getVisualCropSourceRect(
    sourceWidth: number,
    sourceHeight: number,
    crop: Partial<VisualCrop> | VisualCrop | null | undefined,
): { x: number; y: number; width: number; height: number } {
    const safeSourceWidth = Math.max(1, sourceWidth);
    const safeSourceHeight = Math.max(1, sourceHeight);
    const normalized = normalizeVisualCrop(crop);
    const remaining = getVisualCropRemainingRatios(normalized);

    return {
        x: normalized.left * safeSourceWidth,
        y: normalized.top * safeSourceHeight,
        width: remaining.widthRatio * safeSourceWidth,
        height: remaining.heightRatio * safeSourceHeight,
    };
}
