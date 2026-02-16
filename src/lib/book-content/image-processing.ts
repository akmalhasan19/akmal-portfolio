import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookKey, PageSide } from "@/types/book-content";

// ── Constants ────────────────────────────────

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_DIMENSION = 2048;
const WEBP_QUALITY = 0.82;
const STORAGE_BUCKET = "book-page-assets";

// ── Validation ───────────────────────────────

/**
 * Validates that the file is an image and does not exceed 2 MB.
 * Returns an error string if invalid, or null if OK.
 */
export function validateImageFile(file: File): string | null {
    if (!file.type.startsWith("image/")) {
        return "File bukan gambar.";
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        return `Ukuran file ${sizeMB} MB melebihi batas 2 MB.`;
    }
    return null;
}

// ── Resize + WebP conversion ─────────────────

/**
 * Loads an image file, resizes its longest side to at most 2048 px
 * (maintaining aspect ratio), and returns a WebP Blob.
 */
export async function resizeAndConvertToWebP(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;

    let targetWidth = width;
    let targetHeight = height;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        targetWidth = Math.round(width * scale);
        targetHeight = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Gagal membuat canvas context untuk resize gambar.");
    }

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Gagal mengkonversi gambar ke WebP."));
                }
            },
            "image/webp",
            WEBP_QUALITY,
        );
    });
}

// ── Upload ───────────────────────────────────

/**
 * Uploads a processed image blob to Supabase Storage.
 *
 * @returns The public URL of the uploaded asset.
 */
export async function uploadPageAsset(
    supabase: SupabaseClient,
    bookKey: BookKey,
    pageIndex: number,
    side: PageSide,
    blockId: string,
    blob: Blob,
): Promise<string> {
    const timestamp = Date.now();
    const path = `${bookKey}/p${pageIndex}/${side}/${blockId}-${timestamp}.webp`;

    const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, blob, {
            contentType: "image/webp",
            upsert: true,
        });

    if (uploadError) {
        throw new Error(`Upload gagal: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
}

/**
 * Uploads a profile image for a book to Supabase Storage.
 *
 * @returns The public URL of the uploaded profile image.
 */
export async function uploadBookProfileAsset(
    supabase: SupabaseClient,
    bookKey: BookKey,
    blob: Blob,
): Promise<string> {
    const timestamp = Date.now();
    const path = `${bookKey}/profile/avatar-${timestamp}.webp`;

    const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, blob, {
            contentType: "image/webp",
            upsert: true,
        });

    if (uploadError) {
        throw new Error(`Upload gagal: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
}

/**
 * Deletes a previously uploaded asset from Supabase Storage.
 */
export async function deletePageAsset(
    supabase: SupabaseClient,
    assetPath: string,
): Promise<void> {
    // Extract the storage path from the full public URL
    const bucketPrefix = `${STORAGE_BUCKET}/`;
    const pathIndex = assetPath.indexOf(bucketPrefix);
    if (pathIndex === -1) {
        return; // Not a managed asset, skip
    }

    const storagePath = assetPath.substring(pathIndex + bucketPrefix.length);
    const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([storagePath]);

    if (error) {
        console.warn("Gagal menghapus asset:", error.message);
    }
}
