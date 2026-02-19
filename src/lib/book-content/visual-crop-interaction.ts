import type { LayoutBlock, VisualCrop } from "@/types/book-content";
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
