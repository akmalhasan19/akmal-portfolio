"use client";

import { useCallback, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { selectedPageIndexAtom, selectedSideAtom } from "@/lib/book-content/editor-atoms";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { validateImageFile, uploadPageAsset } from "@/lib/book-content/image-processing";
import { ImageCropper } from "@/components/admin/ImageCropper";

interface ImageUploadFieldProps {
    blockId: string;
    currentAssetPath: string;
    onAssetUploaded: (publicUrl: string) => void;
}

export function ImageUploadField({
    blockId,
    currentAssetPath,
    onAssetUploaded,
}: ImageUploadFieldProps) {
    const pageIndex = useAtomValue(selectedPageIndexAtom);
    const side = useAtomValue(selectedSideAtom);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);

    const handleFileSelect = useCallback(
        (file: File) => {
            setError(null);

            const validationError = validateImageFile(file);
            if (validationError) {
                setError(validationError);
                return;
            }

            // Open the cropper modal
            setPendingFile(file);
        },
        []
    );

    const handleCropComplete = useCallback(
        async (webpBlob: Blob) => {
            setPendingFile(null);
            setUploading(true);

            try {
                const supabase = getSupabaseBrowserClient();
                const publicUrl = await uploadPageAsset(
                    supabase,
                    "book-1",
                    pageIndex,
                    side,
                    blockId,
                    webpBlob,
                );
                onAssetUploaded(publicUrl);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Upload gagal.");
            } finally {
                setUploading(false);
            }
        },
        [blockId, pageIndex, side, onAssetUploaded]
    );

    const handleCropCancel = useCallback(() => {
        setPendingFile(null);
        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }, []);

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) {
                handleFileSelect(file);
            }
            // Reset input so same file can be selected again
            e.currentTarget.value = "";
        },
        [handleFileSelect]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) {
                handleFileSelect(file);
            }
        },
        [handleFileSelect]
    );

    return (
        <div className="space-y-2">
            <label className="text-xs text-neutral-500">Gambar</label>

            {/* Drop zone */}
            <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-800/50 px-4 py-5 transition-colors hover:border-amber-500/40 hover:bg-neutral-800"
            >
                {uploading ? (
                    <span className="text-xs text-amber-400">Mengupload…</span>
                ) : (
                    <>
                        <span className="text-xs text-neutral-400">
                            Klik atau drop gambar
                        </span>
                        <span className="text-[10px] text-neutral-600">
                            Max 2 MB · Crop otomatis · WebP
                        </span>
                    </>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleInputChange}
            />

            {error && (
                <p className="text-xs text-red-400">{error}</p>
            )}

            {currentAssetPath && (
                <p className="truncate text-[10px] text-neutral-600" title={currentAssetPath}>
                    {currentAssetPath.split("/").pop()}
                </p>
            )}

            {/* Image Cropper Modal */}
            {pendingFile && (
                <ImageCropper
                    file={pendingFile}
                    onCropComplete={handleCropComplete}
                    onCancel={handleCropCancel}
                />
            )}
        </div>
    );
}
