import type { LayoutBlock, VisualCrop } from "@/types/book-content";
import type { SnapRect } from "./block-snap";
import { getBlockAspectRatio } from "./aspect-ratio";
import {
    MIN_VISUAL_CROP_REMAINING_RATIO,
    applyVisualCropToAspectRatio,
    deriveVisualCropBaseAspectRatio,
    normalizeVisualCrop,
    toOptionalVisualCrop,
} from "./visual-crop";

export type VisualCropEdge = "left" | "right" | "top" | "bottom";

export interface CropDragState {
    edge: VisualCropEdge;
    startX: number;
    startY: number;
    startCrop: VisualCrop;
    startRect: { x: number; y: number; w: number; h: number };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function isVisualBlock(block: LayoutBlock): block is LayoutBlock & (
    { type: "image"; crop?: VisualCrop }
    | { type: "svg"; crop?: VisualCrop }
) {
    return block.type === "image" || block.type === "svg";
}

type CropSnapAnchor = "edge" | "center";

export function buildDraggedCrop(
    drag: CropDragState,
    pointerX: number,
    pointerY: number,
    unitWidthPx: number,
    unitHeightPx: number,
): VisualCrop {
    const next = { ...drag.startCrop };
    const remainingWidth = Math.max(
        MIN_VISUAL_CROP_REMAINING_RATIO,
        1 - drag.startCrop.left - drag.startCrop.right,
    );
    const remainingHeight = Math.max(
        MIN_VISUAL_CROP_REMAINING_RATIO,
        1 - drag.startCrop.top - drag.startCrop.bottom,
    );
    const blockWidthPx = Math.max(1, drag.startRect.w * unitWidthPx);
    const blockHeightPx = Math.max(1, drag.startRect.h * unitHeightPx);
    const dx = pointerX - drag.startX;
    const dy = pointerY - drag.startY;

    if (drag.edge === "left") {
        const nextLeft = drag.startCrop.left + (dx / blockWidthPx) * remainingWidth;
        next.left = clamp(
            nextLeft,
            0,
            1 - drag.startCrop.right - MIN_VISUAL_CROP_REMAINING_RATIO,
        );
    } else if (drag.edge === "right") {
        const nextRight = drag.startCrop.right - (dx / blockWidthPx) * remainingWidth;
        next.right = clamp(
            nextRight,
            0,
            1 - drag.startCrop.left - MIN_VISUAL_CROP_REMAINING_RATIO,
        );
    } else if (drag.edge === "top") {
        const nextTop = drag.startCrop.top + (dy / blockHeightPx) * remainingHeight;
        next.top = clamp(
            nextTop,
            0,
            1 - drag.startCrop.bottom - MIN_VISUAL_CROP_REMAINING_RATIO,
        );
    } else {
        const nextBottom = drag.startCrop.bottom - (dy / blockHeightPx) * remainingHeight;
        next.bottom = clamp(
            nextBottom,
            0,
            1 - drag.startCrop.top - MIN_VISUAL_CROP_REMAINING_RATIO,
        );
    }

    return normalizeVisualCrop(next);
}

export function buildVisualCropBlockForEdge(
    block: LayoutBlock,
    nextCrop: VisualCrop,
    minBlockSize: number,
    edge: VisualCropEdge,
): LayoutBlock {
    if (!isVisualBlock(block)) {
        return block;
    }

    const optionalCrop = toOptionalVisualCrop(nextCrop);
    const targetRatio = block.type === "image" && block.shape === "circle"
        ? 1
        : applyVisualCropToAspectRatio(
            deriveVisualCropBaseAspectRatio(
                getBlockAspectRatio(block),
                block.crop,
            ),
            optionalCrop,
        );

    let nextX = block.x;
    let nextY = block.y;
    let nextW = block.w;
    let nextH = block.h;

    if (edge === "left" || edge === "right") {
        const right = block.x + block.w;
        nextW = block.h * targetRatio;
        if (edge === "left") {
            nextX = clamp(right - nextW, 0, right - minBlockSize);
            nextW = clamp(right - nextX, minBlockSize, 1 - nextX);
        } else {
            nextW = clamp(nextW, minBlockSize, 1 - block.x);
            nextX = block.x;
        }
    } else {
        const bottom = block.y + block.h;
        nextH = block.w / targetRatio;
        if (edge === "top") {
            nextY = clamp(bottom - nextH, 0, bottom - minBlockSize);
            nextH = clamp(bottom - nextY, minBlockSize, 1 - nextY);
        } else {
            nextH = clamp(nextH, minBlockSize, 1 - block.y);
            nextY = block.y;
        }
    }

    return {
        ...block,
        crop: optionalCrop,
        aspectRatio: targetRatio,
        x: nextX,
        y: nextY,
        w: nextW,
        h: nextH,
    };
}

function getAxisAnchors(rect: SnapRect, axis: "x" | "y"): number[] {
    if (axis === "x") {
        return [rect.x, rect.x + rect.w * 0.5, rect.x + rect.w];
    }
    return [rect.y, rect.y + rect.h * 0.5, rect.y + rect.h];
}

function getEdgeAndCenterForCrop(rect: SnapRect, edge: VisualCropEdge): { edge: number; center: number } {
    if (edge === "left") {
        return { edge: rect.x, center: rect.x + rect.w * 0.5 };
    }
    if (edge === "right") {
        return { edge: rect.x + rect.w, center: rect.x + rect.w * 0.5 };
    }
    if (edge === "top") {
        return { edge: rect.y, center: rect.y + rect.h * 0.5 };
    }
    return { edge: rect.y + rect.h, center: rect.y + rect.h * 0.5 };
}

function buildCropCandidateForTarget(
    block: LayoutBlock & ({ type: "image" } | { type: "svg" }),
    currentCrop: VisualCrop,
    edge: VisualCropEdge,
    targetAnchor: number,
    anchor: CropSnapAnchor,
): VisualCrop | null {
    const baseAspect = deriveVisualCropBaseAspectRatio(
        getBlockAspectRatio(block),
        block.crop,
    );
    const safeBaseAspect = Math.max(baseAspect, MIN_VISUAL_CROP_REMAINING_RATIO);
    const crop = normalizeVisualCrop(currentCrop);
    const safeBlockW = Math.max(block.w, MIN_VISUAL_CROP_REMAINING_RATIO);
    const safeBlockH = Math.max(block.h, MIN_VISUAL_CROP_REMAINING_RATIO);

    if (edge === "left") {
        const fixedRight = block.x + block.w;
        const desiredWidth = anchor === "edge"
            ? fixedRight - targetAnchor
            : 2 * (fixedRight - targetAnchor);
        if (desiredWidth <= 0) return null;
        const targetRatio = desiredWidth / safeBlockH;
        const remainingH = Math.max(
            MIN_VISUAL_CROP_REMAINING_RATIO,
            1 - crop.top - crop.bottom,
        );
        const remainingW = (targetRatio / safeBaseAspect) * remainingH;
        return normalizeVisualCrop({
            ...crop,
            left: 1 - crop.right - remainingW,
        });
    }

    if (edge === "right") {
        const fixedLeft = block.x;
        const desiredWidth = anchor === "edge"
            ? targetAnchor - fixedLeft
            : 2 * (targetAnchor - fixedLeft);
        if (desiredWidth <= 0) return null;
        const targetRatio = desiredWidth / safeBlockH;
        const remainingH = Math.max(
            MIN_VISUAL_CROP_REMAINING_RATIO,
            1 - crop.top - crop.bottom,
        );
        const remainingW = (targetRatio / safeBaseAspect) * remainingH;
        return normalizeVisualCrop({
            ...crop,
            right: 1 - crop.left - remainingW,
        });
    }

    if (edge === "top") {
        const fixedBottom = block.y + block.h;
        const desiredHeight = anchor === "edge"
            ? fixedBottom - targetAnchor
            : 2 * (fixedBottom - targetAnchor);
        if (desiredHeight <= 0) return null;
        const targetRatio = safeBlockW / desiredHeight;
        const remainingW = Math.max(
            MIN_VISUAL_CROP_REMAINING_RATIO,
            1 - crop.left - crop.right,
        );
        const remainingH = (safeBaseAspect * remainingW) / Math.max(targetRatio, MIN_VISUAL_CROP_REMAINING_RATIO);
        return normalizeVisualCrop({
            ...crop,
            top: 1 - crop.bottom - remainingH,
        });
    }

    const fixedTop = block.y;
    const desiredHeight = anchor === "edge"
        ? targetAnchor - fixedTop
        : 2 * (targetAnchor - fixedTop);
    if (desiredHeight <= 0) return null;
    const targetRatio = safeBlockW / desiredHeight;
    const remainingW = Math.max(
        MIN_VISUAL_CROP_REMAINING_RATIO,
        1 - crop.left - crop.right,
    );
    const remainingH = (safeBaseAspect * remainingW) / Math.max(targetRatio, MIN_VISUAL_CROP_REMAINING_RATIO);
    return normalizeVisualCrop({
        ...crop,
        bottom: 1 - crop.top - remainingH,
    });
}

function getRectFromBlock(block: LayoutBlock): SnapRect {
    return { x: block.x, y: block.y, w: block.w, h: block.h };
}

export function getSnappedCropForEdge(
    block: LayoutBlock,
    nextCrop: VisualCrop,
    edge: VisualCropEdge,
    targetRects: SnapRect[],
    thresholdX: number,
    thresholdY: number,
    minBlockSize: number,
): { crop: VisualCrop; guideX: number | null; guideY: number | null } {
    if (!isVisualBlock(block) || targetRects.length === 0) {
        return {
            crop: normalizeVisualCrop(nextCrop),
            guideX: null,
            guideY: null,
        };
    }

    const axis: "x" | "y" = edge === "left" || edge === "right" ? "x" : "y";
    const threshold = axis === "x" ? thresholdX : thresholdY;
    const targetAnchors = targetRects.flatMap((rect) => getAxisAnchors(rect, axis));
    const normalized = normalizeVisualCrop(nextCrop);
    const preview = getRectFromBlock(
        buildVisualCropBlockForEdge(block, normalized, minBlockSize, edge),
    );
    const current = getEdgeAndCenterForCrop(preview, edge);

    let bestCrop: VisualCrop | null = null;
    let bestGuide: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const target of targetAnchors) {
        const checkEdge = Math.abs(current.edge - target) <= threshold;
        const checkCenter = Math.abs(current.center - target) <= threshold;
        if (!checkEdge && !checkCenter) {
            continue;
        }

        const anchors: CropSnapAnchor[] = [];
        if (checkEdge) anchors.push("edge");
        if (checkCenter) anchors.push("center");

        for (const anchor of anchors) {
            const candidate = buildCropCandidateForTarget(
                block,
                normalized,
                edge,
                target,
                anchor,
            );
            if (!candidate) {
                continue;
            }
            const candidateRect = getRectFromBlock(
                buildVisualCropBlockForEdge(block, candidate, minBlockSize, edge),
            );
            const candidateAnchors = getEdgeAndCenterForCrop(candidateRect, edge);
            const distance = anchor === "edge"
                ? Math.abs(candidateAnchors.edge - target)
                : Math.abs(candidateAnchors.center - target);
            if (distance < bestDistance && distance <= threshold) {
                bestDistance = distance;
                bestCrop = candidate;
                bestGuide = target;
            }
        }
    }

    if (!bestCrop) {
        return {
            crop: normalized,
            guideX: null,
            guideY: null,
        };
    }

    return {
        crop: bestCrop,
        guideX: axis === "x" ? bestGuide : null,
        guideY: axis === "y" ? bestGuide : null,
    };
}
