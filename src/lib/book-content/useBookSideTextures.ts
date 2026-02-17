"use client";

import { useEffect, useRef, useState } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { renderPageSideToCanvas } from "./render-canvas";
import { pageSideKey } from "@/types/book-content";
import type { BookKey, PageSideLayout, BookPageSideLayoutRow } from "@/types/book-content";

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

function layoutHash(layout: PageSideLayout): string {
    return JSON.stringify(layout);
}

function getRetainedPageIndices(
    totalPageEntries: number,
    currentPage: number,
    textureLoadRadius: number,
): Set<number> {
    const retained = new Set<number>();
    if (totalPageEntries <= 0) {
        return retained;
    }

    // Covers are frequently visible, keep them warm.
    retained.add(0);
    retained.add(totalPageEntries - 1);

    if (!Number.isFinite(textureLoadRadius)) {
        for (let i = 0; i < totalPageEntries; i += 1) {
            retained.add(i);
        }
        return retained;
    }

    const safeRadius = Math.max(0, Math.floor(textureLoadRadius));
    const safeCurrentPage = Math.max(
        0,
        Math.min(totalPageEntries - 1, Math.round(currentPage)),
    );
    const start = Math.max(0, safeCurrentPage - safeRadius);
    const end = Math.min(totalPageEntries - 1, safeCurrentPage + safeRadius);

    for (let i = start; i <= end; i += 1) {
        retained.add(i);
    }

    return retained;
}

function getRetainedTextureKeys(pageIndices: Set<number>): Set<string> {
    const keys = new Set<string>();
    for (const pageIndex of pageIndices) {
        keys.add(pageSideKey(pageIndex, "front"));
        keys.add(pageSideKey(pageIndex, "back"));
    }
    return keys;
}

/**
 * Fetches page-side layouts from Supabase,
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
    const layoutCacheRef = useRef<Map<string, string>>(new Map());
    const textureCacheRef = useRef<Map<string, CanvasTexture>>(new Map());
    const mountedRef = useRef(true);

    const canvasWidth = Math.round(canvasHeight * pageAspectRatio);

    useEffect(() => {
        mountedRef.current = true;
        const textureCache = textureCacheRef.current;
        const layoutCache = layoutCacheRef.current;
        return () => {
            mountedRef.current = false;
            for (const texture of textureCache.values()) {
                texture.dispose();
            }
            textureCache.clear();
            layoutCache.clear();
        };
    }, []);

    useEffect(() => {
        if (!enabled) {
            for (const texture of textureCacheRef.current.values()) {
                texture.dispose();
            }
            textureCacheRef.current.clear();
            layoutCacheRef.current.clear();
            setTextures({});
            return;
        }

        let cancelled = false;

        const fetchAndRender = async () => {
            const retainedPageIndices = getRetainedPageIndices(
                totalPageEntries,
                currentPage,
                textureLoadRadius,
            );
            const retainedKeys = getRetainedTextureKeys(retainedPageIndices);

            const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
            if (cancelled) {
                return;
            }

            const supabase = getSupabaseBrowserClient();
            const { data, error } = await supabase
                .from("book_page_side_layouts")
                .select("page_index,side,layout")
                .eq("book_key", bookKey);

            if (cancelled || error || !data) {
                return;
            }

            const rows = data as Pick<BookPageSideLayoutRow, "page_index" | "side" | "layout">[];
            const fetchedKeys = new Set<string>();
            const renderPromises: Promise<void>[] = [];

            for (const row of rows) {
                if (!retainedPageIndices.has(row.page_index)) {
                    continue;
                }

                const key = pageSideKey(row.page_index, row.side);
                fetchedKeys.add(key);
                const hash = layoutHash(row.layout);

                if (layoutCacheRef.current.get(key) === hash) {
                    continue;
                }

                renderPromises.push(
                    renderPageSideToCanvas(row.layout, canvasWidth, canvasHeight)
                        .then((canvas) => {
                            if (cancelled) {
                                return;
                            }

                            const old = textureCacheRef.current.get(key);
                            if (old) {
                                old.dispose();
                            }

                            const texture = new CanvasTexture(canvas);
                            texture.colorSpace = SRGBColorSpace;
                            texture.needsUpdate = true;

                            textureCacheRef.current.set(key, texture);
                            layoutCacheRef.current.set(key, hash);
                        })
                        .catch(() => {
                            // Skip failed render.
                        }),
                );
            }

            await Promise.all(renderPromises);
            if (cancelled) {
                return;
            }

            // Prune textures outside active radius and entries removed from DB.
            for (const [key, texture] of textureCacheRef.current.entries()) {
                const shouldKeep = retainedKeys.has(key) && fetchedKeys.has(key);
                if (!shouldKeep) {
                    texture.dispose();
                    textureCacheRef.current.delete(key);
                }
            }

            for (const key of layoutCacheRef.current.keys()) {
                const shouldKeep = retainedKeys.has(key) && fetchedKeys.has(key);
                if (!shouldKeep) {
                    layoutCacheRef.current.delete(key);
                }
            }

            if (mountedRef.current) {
                const merged: DynamicTextureMap = {};
                for (const [key, texture] of textureCacheRef.current.entries()) {
                    merged[key] = texture;
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
