"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface ImageCropperProps {
    /** The image file to crop */
    file: File | null;
    /** Called when user confirms the crop with the cropped WebP blob */
    onCropComplete: (blob: Blob) => void;
    /** Called when user cancels the crop */
    onCancel: () => void;
    /** Optional aspect ratio for the crop (width/height). If not set, free-form crop */
    aspectRatio?: number;
    /** Maximum dimension for the output image */
    maxDimension?: number;
    /** WebP quality (0-1) */
    quality?: number;
}

/**
 * Helper to create a centered crop that covers a certain percentage of the image
 */
function createCenteredCrop(
    imageWidth: number,
    imageHeight: number,
    aspectRatio?: number
): Crop {
    if (aspectRatio) {
        return centerCrop(
            makeAspectCrop(
                {
                    unit: "%",
                    width: 90,
                },
                aspectRatio,
                imageWidth,
                imageHeight
            ),
            imageWidth,
            imageHeight
        );
    }

    // Default: 90% centered crop without aspect ratio constraint
    return centerCrop(
        {
            unit: "%",
            width: 90,
            height: 90,
        },
        imageWidth,
        imageHeight
    );
}

/**
 * Modal component for cropping images before upload.
 * Automatically converts the cropped result to WebP format.
 */
export function ImageCropper({
    file,
    onCropComplete,
    onCancel,
    aspectRatio,
    maxDimension = 2048,
    quality = 0.82,
}: ImageCropperProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);
    const [processing, setProcessing] = useState(false);
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
    const imgRef = useRef<HTMLImageElement>(null);

    // Load image when file changes
    useEffect(() => {
        if (!file) {
            setImageUrl(null);
            return;
        }

        const url = URL.createObjectURL(file);
        setImageUrl(url);

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [file]);

    // Initialize crop when image loads
    const handleImageLoad = useCallback(
        (e: React.SyntheticEvent<HTMLImageElement>) => {
            const img = e.currentTarget;
            const { naturalWidth, naturalHeight } = img;
            setImageDimensions({ width: naturalWidth, height: naturalHeight });
            setCrop(createCenteredCrop(naturalWidth, naturalHeight, aspectRatio));
            setCompletedCrop(null);
        },
        [aspectRatio]
    );

    // Process the crop and convert to WebP
    const handleConfirm = useCallback(async () => {
        const img = imgRef.current;
        if (!img || !completedCrop) return;

        setProcessing(true);

        try {
            const canvas = document.createElement("canvas");

            // Calculate the actual pixel dimensions of the crop
            const scaleX = img.naturalWidth / img.width;
            const scaleY = img.naturalHeight / img.height;

            let cropWidth = completedCrop.width;
            let cropHeight = completedCrop.height;
            let cropX = completedCrop.x;
            let cropY = completedCrop.y;

            // Handle percentage-based crop
            if (completedCrop.unit === "%") {
                cropWidth = (completedCrop.width / 100) * img.naturalWidth;
                cropHeight = (completedCrop.height / 100) * img.naturalHeight;
                cropX = (completedCrop.x / 100) * img.naturalWidth;
                cropY = (completedCrop.y / 100) * img.naturalHeight;
            } else {
                cropWidth *= scaleX;
                cropHeight *= scaleY;
                cropX *= scaleX;
                cropY *= scaleY;
            }

            // Calculate output dimensions (resize if needed)
            let outputWidth = Math.round(cropWidth);
            let outputHeight = Math.round(cropHeight);

            if (outputWidth > maxDimension || outputHeight > maxDimension) {
                const scale = maxDimension / Math.max(outputWidth, outputHeight);
                outputWidth = Math.round(outputWidth * scale);
                outputHeight = Math.round(outputHeight * scale);
            }

            canvas.width = outputWidth;
            canvas.height = outputHeight;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                throw new Error("Gagal membuat canvas context.");
            }

            // Draw the cropped image
            ctx.drawImage(
                img,
                Math.round(cropX),
                Math.round(cropY),
                Math.round(cropWidth),
                Math.round(cropHeight),
                0,
                0,
                outputWidth,
                outputHeight
            );

            // Convert to WebP blob
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(
                    (b) => {
                        if (b) {
                            resolve(b);
                        } else {
                            reject(new Error("Gagal mengkonversi gambar ke WebP."));
                        }
                    },
                    "image/webp",
                    quality
                );
            });

            onCropComplete(blob);
        } catch (error) {
            console.error("Crop error:", error);
            alert(error instanceof Error ? error.message : "Gagal memproses gambar.");
        } finally {
            setProcessing(false);
        }
    }, [completedCrop, maxDimension, onCropComplete, quality]);

    if (!file || !imageUrl) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 p-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-neutral-200">Crop Gambar</h3>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-neutral-400 hover:text-neutral-200"
                        disabled={processing}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Crop Area */}
                <div className="flex flex-1 items-center justify-center overflow-auto">
                    <ReactCrop
                        crop={crop}
                        onChange={(c) => setCrop(c)}
                        onComplete={(c) => setCompletedCrop(c)}
                        aspect={aspectRatio}
                        minWidth={50}
                        minHeight={50}
                        className="max-h-[60vh]"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            ref={imgRef}
                            src={imageUrl}
                            alt="Crop preview"
                            onLoad={handleImageLoad}
                            className="max-h-[60vh] w-auto object-contain"
                            style={{ maxWidth: "100%" }}
                        />
                    </ReactCrop>
                </div>

                {/* Info & Actions */}
                <div className="flex flex-col gap-3 border-t border-neutral-800 pt-4">
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                        <span>
                            Ukuran asli: {imageDimensions.width} × {imageDimensions.height} px
                        </span>
                        <span>
                            {aspectRatio
                                ? `Aspect ratio: ${aspectRatio}:1`
                                : "Aspect ratio: bebas"}
                        </span>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={processing}
                            className="rounded-lg border border-neutral-700 px-4 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-50"
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={processing || !completedCrop}
                            className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
                        >
                            {processing ? "Memproses..." : "Crop & Upload"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
