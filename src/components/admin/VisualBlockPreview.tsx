"use client";

import type { CSSProperties } from "react";
import type { VisualCrop } from "@/types/book-content";
import { getVisualCropRemainingRatios, normalizeVisualCrop } from "@/lib/book-content/visual-crop";

interface VisualBlockPreviewProps {
    src: string;
    alt: string;
    objectFit: "cover" | "contain";
    crop?: VisualCrop;
    className?: string;
}

export function VisualBlockPreview({
    src,
    alt,
    objectFit,
    crop,
    className,
}: VisualBlockPreviewProps) {
    const normalizedCrop = normalizeVisualCrop(crop);
    const remaining = getVisualCropRemainingRatios(normalizedCrop);
    const innerStyle: CSSProperties = {
        left: `${(-normalizedCrop.left / remaining.widthRatio) * 100}%`,
        top: `${(-normalizedCrop.top / remaining.heightRatio) * 100}%`,
        width: `${100 / remaining.widthRatio}%`,
        height: `${100 / remaining.heightRatio}%`,
        objectFit,
        objectPosition: "left top",
    };

    return (
        <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`.trim()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={alt}
                className="absolute max-w-none"
                style={innerStyle}
                draggable={false}
            />
        </div>
    );
}
