"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
    deletePageAsset,
    uploadBookProfileAsset,
    validateImageFile,
} from "@/lib/book-content/image-processing";
import { ImageCropper } from "@/components/admin/ImageCropper";

const BOOK_KEY = "book-2";

export function Book2ProfileImageUploader() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);

    const loadCurrentImage = useCallback(async () => {
        setLoading(true);
        setError(null);

        const supabase = getSupabaseBrowserClient();
        const { data, error: fetchError } = await supabase
            .from("book_profile_images")
            .select("image_url")
            .eq("book_key", BOOK_KEY)
            .single();

        if (fetchError && fetchError.code !== "PGRST116") {
            setError("Gagal memuat profile picture.");
            setLoading(false);
            return;
        }

        setImageUrl(data?.image_url ?? null);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadCurrentImage();
    }, [loadCurrentImage]);

    const handleFileSelect = useCallback(
        (file: File) => {
            setError(null);

            const validationError = validateImageFile(file);
            if (validationError) {
                setError(validationError);
                return;
            }

            // Open the cropper modal with 1:1 aspect ratio for profile image
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
                const nextImageUrl = await uploadBookProfileAsset(
                    supabase,
                    BOOK_KEY,
                    webpBlob,
                );

                const {
                    data: { user },
                } = await supabase.auth.getUser();

                const { error: upsertError } = await supabase
                    .from("book_profile_images")
                    .upsert(
                        {
                            book_key: BOOK_KEY,
                            image_url: nextImageUrl,
                            updated_by: user?.id ?? null,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "book_key" },
                    );

                if (upsertError) {
                    throw new Error(upsertError.message);
                }

                const oldImageUrl = imageUrl;
                setImageUrl(nextImageUrl);

                if (oldImageUrl) {
                    await deletePageAsset(supabase, oldImageUrl);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Upload gagal.");
            } finally {
                setUploading(false);
            }
        },
        [imageUrl]
    );

    const handleCropCancel = useCallback(() => {
        setPendingFile(null);
        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }, []);

    return (
        <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2">
            <div className="h-10 w-10 overflow-hidden rounded-full border border-neutral-700 bg-neutral-800">
                {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={imageUrl}
                        alt="Book 2 profile"
                        className="h-full w-full object-cover"
                        draggable={false}
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-500">
                        {loading ? "..." : "None"}
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-1">
                <div className="text-[11px] text-neutral-400">
                    Profile picture cover Book 2
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || loading}
                        className="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-neutral-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {uploading ? "Uploading..." : "Upload"}
                    </button>
                    <span className="text-[10px] text-neutral-500">
                        Max 2 MB · Crop · WebP
                    </span>
                </div>
                {error && (
                    <div className="text-[10px] text-red-400">{error}</div>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                        handleFileSelect(file);
                    }
                    event.currentTarget.value = "";
                }}
            />

            {/* Image Cropper Modal - 1:1 aspect ratio for profile images */}
            {pendingFile && (
                <ImageCropper
                    file={pendingFile}
                    onCropComplete={handleCropComplete}
                    onCancel={handleCropCancel}
                    aspectRatio={1}
                />
            )}
        </div>
    );
}
