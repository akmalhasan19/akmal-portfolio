export interface SnapRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface SnapDragParams {
    proposedDx: number;
    proposedDy: number;
    movingRects: SnapRect[];
    targetRects: SnapRect[];
    thresholdX: number;
    thresholdY: number;
}

interface UniformResizeSnapParams {
    desiredScale: number;
    minScale: number;
    maxScale: number;
    bounds: SnapRect;
    targetRects: SnapRect[];
    thresholdX: number;
    thresholdY: number;
}

interface ClosestSnapMatch {
    offset: number;
    target: number;
}

function getClosestSnapMatch(
    movingAnchors: number[],
    targetAnchors: number[],
    threshold: number,
): ClosestSnapMatch | null {
    if (movingAnchors.length === 0 || targetAnchors.length === 0 || threshold <= 0) {
        return null;
    }

    let bestMatch: ClosestSnapMatch | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const moving of movingAnchors) {
        for (const target of targetAnchors) {
            const offset = target - moving;
            const distance = Math.abs(offset);
            if (distance <= threshold && distance < bestDistance) {
                bestDistance = distance;
                bestMatch = { offset, target };
            }
        }
    }

    return bestMatch;
}

function getHorizontalAnchors(rect: SnapRect, dx = 0): number[] {
    const left = rect.x + dx;
    const center = left + rect.w * 0.5;
    const right = left + rect.w;
    return [left, center, right];
}

function getVerticalAnchors(rect: SnapRect, dy = 0): number[] {
    const top = rect.y + dy;
    const center = top + rect.h * 0.5;
    const bottom = top + rect.h;
    return [top, center, bottom];
}

function getClosestGuide(
    movingAnchors: number[],
    targetAnchors: number[],
    threshold: number,
): number | null {
    const match = getClosestSnapMatch(movingAnchors, targetAnchors, threshold);
    return match?.target ?? null;
}

export function getSnappedDragDelta({
    proposedDx,
    proposedDy,
    movingRects,
    targetRects,
    thresholdX,
    thresholdY,
}: SnapDragParams): { dx: number; dy: number; guideX: number | null; guideY: number | null } {
    if (movingRects.length === 0 || targetRects.length === 0) {
        return { dx: proposedDx, dy: proposedDy, guideX: null, guideY: null };
    }

    const movingXAnchors = movingRects.flatMap((rect) =>
        getHorizontalAnchors(rect, proposedDx),
    );
    const movingYAnchors = movingRects.flatMap((rect) =>
        getVerticalAnchors(rect, proposedDy),
    );
    const targetXAnchors = targetRects.flatMap((rect) =>
        getHorizontalAnchors(rect),
    );
    const targetYAnchors = targetRects.flatMap((rect) =>
        getVerticalAnchors(rect),
    );

    const snapX = getClosestSnapMatch(movingXAnchors, targetXAnchors, thresholdX);
    const snapY = getClosestSnapMatch(movingYAnchors, targetYAnchors, thresholdY);

    return {
        dx: proposedDx + (snapX?.offset ?? 0),
        dy: proposedDy + (snapY?.offset ?? 0),
        guideX: snapX?.target ?? null,
        guideY: snapY?.target ?? null,
    };
}

function getClosestResizeScaleCandidate(
    desiredScale: number,
    candidates: number[],
    minScale: number,
    maxScale: number,
): number | null {
    let best: number | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
        if (!Number.isFinite(candidate)) {
            continue;
        }
        const clamped = Math.min(maxScale, Math.max(minScale, candidate));
        const delta = Math.abs(clamped - desiredScale);
        if (delta < bestDelta) {
            bestDelta = delta;
            best = clamped;
        }
    }

    return best;
}

export function getSnappedUniformResizeScale({
    desiredScale,
    minScale,
    maxScale,
    bounds,
    targetRects,
    thresholdX,
    thresholdY,
}: UniformResizeSnapParams): { scale: number; guideX: number | null; guideY: number | null } {
    const clampedDesired = Math.min(maxScale, Math.max(minScale, desiredScale));
    if (targetRects.length === 0) {
        return { scale: clampedDesired, guideX: null, guideY: null };
    }

    const targetXAnchors = targetRects.flatMap((rect) => getHorizontalAnchors(rect));
    const targetYAnchors = targetRects.flatMap((rect) => getVerticalAnchors(rect));
    const desiredRight = bounds.x + bounds.w * clampedDesired;
    const desiredCenterX = bounds.x + (bounds.w * clampedDesired) * 0.5;
    const desiredBottom = bounds.y + bounds.h * clampedDesired;
    const desiredCenterY = bounds.y + (bounds.h * clampedDesired) * 0.5;

    const xCandidates: number[] = [];
    for (const target of targetXAnchors) {
        if (Math.abs(desiredRight - target) <= thresholdX && bounds.w > 0) {
            xCandidates.push((target - bounds.x) / bounds.w);
        }
        if (Math.abs(desiredCenterX - target) <= thresholdX && bounds.w > 0) {
            xCandidates.push((2 * (target - bounds.x)) / bounds.w);
        }
    }

    const yCandidates: number[] = [];
    for (const target of targetYAnchors) {
        if (Math.abs(desiredBottom - target) <= thresholdY && bounds.h > 0) {
            yCandidates.push((target - bounds.y) / bounds.h);
        }
        if (Math.abs(desiredCenterY - target) <= thresholdY && bounds.h > 0) {
            yCandidates.push((2 * (target - bounds.y)) / bounds.h);
        }
    }

    const bestX = getClosestResizeScaleCandidate(
        clampedDesired,
        xCandidates,
        minScale,
        maxScale,
    );
    const bestY = getClosestResizeScaleCandidate(
        clampedDesired,
        yCandidates,
        minScale,
        maxScale,
    );

    let snappedScale = clampedDesired;
    if (bestX !== null && bestY !== null) {
        snappedScale = Math.abs(bestX - clampedDesired) <= Math.abs(bestY - clampedDesired)
            ? bestX
            : bestY;
    } else if (bestX !== null) {
        snappedScale = bestX;
    } else if (bestY !== null) {
        snappedScale = bestY;
    }

    const movingXAnchors = [
        bounds.x,
        bounds.x + (bounds.w * snappedScale) * 0.5,
        bounds.x + bounds.w * snappedScale,
    ];
    const movingYAnchors = [
        bounds.y,
        bounds.y + (bounds.h * snappedScale) * 0.5,
        bounds.y + bounds.h * snappedScale,
    ];

    return {
        scale: snappedScale,
        guideX: getClosestGuide(movingXAnchors, targetXAnchors, thresholdX),
        guideY: getClosestGuide(movingYAnchors, targetYAnchors, thresholdY),
    };
}
