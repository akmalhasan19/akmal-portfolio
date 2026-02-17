"use client";

import { useEffect, useRef, useState } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { renderPageSideToCanvas } from "./render-canvas";
import { pageSideKey } from "@/types/book-content";
import type { BookKey, PageSideLayout, BookPageSideLayoutRow } from "@/types/book-content";

// ── Types ────────────────────────────────────

export type DynamicTextureMap = Record<string, CanvasTexture>;

interface UseBookSideTexturesOptions {
    bookKey: BookKey;
    /**
     * Total number of page entries (including covers) in the activePages array.
     * This determines which page indices to query.
     */
    totalPageEntries: number;
    /** Canvas height for texture resolution. Desktop: 1536, Mobile: 1024. */
    canvasHeight: number;
    /** Page aspect ratio (width/height). Defaults to 1.28/1.71. */
    pageAspectRatio?: number;
    /** Only render textures within this radius of the current page. */
    textureLoadRadius?: number;
    /** Current page index (for radius-based culling). */
    currentPage?: number;
    /** Whether dynamic content is enabled. */
    enabled?: boolean;
}

// ── Hash helper ──────────────────────────────

function layoutHash(layout: PageSideLayout): string {
    return JSON.stringify(layout);
}

// ── Hook ─────────────────────────────────────

/**
 * Fetches all page-side layouts for a book from Supabase,
 * renders them to CanvasTextures, and returns a map keyed by
 * `p{index}:front` / `p{index}:back`.
 */
export function useBookSideTextures({
    bookKey,
    totalPageEntries,
    canvasHeight,
    pageAspectRatio = 1.28 / 1.71,
    textureLoadRadius = Number.POSITIVE_INFINITY,
    currentPage = 0,
    enabled = true,
}: UseBookSideTexturesOptions): DynamicTextureMap {
    const [textures, setTextures] = useState<DynamicTextureMap>({});
    const layoutCacheRef = useRef<Map<string, string>>(new Map()); // key → hash
    const textureCacheRef = useRef<Map<string, CanvasTexture>>(new Map());
    const mountedRef = useRef(true);

    const canvasWidth = Math.round(canvasHeight * pageAspectRatio);

    // Cleanup on unmount
    useEffect(() => {
        mountedRef.current = true;
        const textureCache = textureCacheRef.current;
        return () => {
            mountedRef.current = false;
            // Dispose all textures
            for (const texture of textureCache.values()) {
                texture.dispose();
            }
            textureCache.clear();
        };
    }, []);

    // Fetch and render
    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;

        const fetchAndRender = async () => {
            const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
            if (cancelled) {
                return;
            }
            const supabase = getSupabaseBrowserClient();

            const { data, error } = await supabase
                .from("book_page_side_layouts")
                .select("*")
                .eq("book_key", bookKey);

            if (cancelled || error || !data) return;

            const rows = data as BookPageSideLayoutRow[];
            const newTextures: DynamicTextureMap = {};
            const renderPromises: Promise<void>[] = [];

            for (const row of rows) {
                // Skip pages outside load radius
                if (
                    Number.isFinite(textureLoadRadius) &&
                    Math.abs(row.page_index - currentPage) > textureLoadRadius
                ) {
                    continue;
                }

                const key = pageSideKey(row.page_index, row.side);
                const hash = layoutHash(row.layout);

                // Skip if layout hasn't changed
                if (layoutCacheRef.current.get(key) === hash) {
                    const existing = textureCacheRef.current.get(key);
                    if (existing) {
                        newTextures[key] = existing;
                    }
                    continue;
                }

                // Layout changed — re-render
                renderPromises.push(
                    renderPageSideToCanvas(row.layout, canvasWidth, canvasHeight)
                        .then((canvas) => {
                            if (cancelled) return;

                            // Dispose old texture
                            const old = textureCacheRef.current.get(key);
                            if (old) old.dispose();

                            const texture = new CanvasTexture(canvas);
                            texture.colorSpace = SRGBColorSpace;
                            texture.needsUpdate = true;

                            textureCacheRef.current.set(key, texture);
                            layoutCacheRef.current.set(key, hash);
                            newTextures[key] = texture;
                        })
                        .catch(() => {
                            // Silently skip failed renders
                        }),
                );
            }

            await Promise.all(renderPromises);

            if (!cancelled && mountedRef.current) {
                // Merge with existing textures that are still valid
                const merged: DynamicTextureMap = {};
                for (const [k, v] of textureCacheRef.current.entries()) {
                    merged[k] = v;
                }
                setTextures(merged);
            }
        };

        fetchAndRender();

        return () => {
            cancelled = true;
        };
    }, [bookKey, totalPageEntries, canvasHeight, canvasWidth, textureLoadRadius, currentPage, enabled]);

    return textures;
}
