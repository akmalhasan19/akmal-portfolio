"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BookKey } from "@/types/book-content";

interface UseBookProfileImageOptions {
    bookKey: BookKey;
    enabled?: boolean;
}

export function useBookProfileImage({
    bookKey,
    enabled = true,
}: UseBookProfileImageOptions): string | null {
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        let cancelled = false;

        const fetchProfileImage = async () => {
            const supabase = getSupabaseBrowserClient();
            const { data, error } = await supabase
                .from("book_profile_images")
                .select("image_url")
                .eq("book_key", bookKey)
                .single();

            if (cancelled) return;

            if (error && error.code !== "PGRST116") {
                setImageUrl(null);
                return;
            }

            setImageUrl(data?.image_url ?? null);
        };

        fetchProfileImage();

        return () => {
            cancelled = true;
        };
    }, [bookKey, enabled]);

    return imageUrl;
}
