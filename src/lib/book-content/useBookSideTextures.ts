"use client";

import { useEffect, useRef, useState } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import type {
    BookKey,
    BookPageSideLayoutRow,
    LinkHitRegion,
    LinkRegionMap,
    PageSideLayout,
} from "@/types/book-content";
import { pageSideKey } from "@/types/book-content";
import { computeSafeArea } from "./padding";
import { CANVAS_RENDERER_VERSION, renderPageSideToCanvas } from "./render-canvas";
import { svgToDataUrl } from "./svg-utils";
import { validateLayout } from "./validation";

export type DynamicTextureMap = Record<string, CanvasTexture>;
const RESUME_BUTTON_MARKER = /data-block-role\s*=\s*["']resume-button["']/i;
const RESUME_LABEL_CONTENT = /<text\b[^>]*>\s*Resume\s*<\/text>/i;

interface UseBookSideTexturesOptions {
    bookKey: BookKey;
    totalPageEntries: number;
    canvasHeight: number;
    pageAspectRatio?: number;
    textureLoadRadius?: number;
    currentPage?: number;
    enabled?: boolean;
}

interface UseBookSideContentResult {
    textures: DynamicTextureMap;
    linkRegions: LinkRegionMap;
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function layoutHash(layout: PageSideLayout, width: number, height: number): string {
    return `${CANVAS_RENDERER_VERSION}:${width}x${height}:${JSON.stringify(layout)}`;
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

function buildLinkHitRegions(
    layout: PageSideLayout,
    canvasWidth: number,
    canvasHeight: number,
): LinkHitRegion[] {
    if (canvasWidth <= 0 || canvasHeight <= 0) {
        return [];
    }

    const safe = computeSafeArea(canvasWidth, canvasHeight, layout.paddingOverride);
    const regions: LinkHitRegion[] = [];

    for (const block of layout.blocks) {
        const isResumeSvgBlock = block.type === "svg"
            && (RESUME_BUTTON_MARKER.test(block.svgCode) || RESUME_LABEL_CONTENT.test(block.svgCode));
        const blockUrl = block.type === "link"
            ? (block.linkUrl || block.url)
            : block.linkUrl;
        if (!blockUrl && !isResumeSvgBlock) {
            continue;
        }

        const xPx = safe.x + block.x * safe.w;
        const yPx = safe.y + block.y * safe.h;
        const wPx = block.w * safe.w;
        const hPx = block.h * safe.h;
        const x = clamp01(xPx / canvasWidth);
        const y = clamp01(yPx / canvasHeight);
        const maxX = clamp01((xPx + wPx) / canvasWidth);
        const maxY = clamp01((yPx + hPx) / canvasHeight);

        regions.push({
            x,
            y,
            w: Math.max(0, maxX - x),
            h: Math.max(0, maxY - y),
            url: blockUrl ?? "",
            zIndex: block.zIndex,
            interactionType: isResumeSvgBlock ? "resume_modal" : "external_url",
            highlightShape: block.type === "svg" ? "svg" : "block",
            svgDataUrl: block.type === "svg" ? (svgToDataUrl(block.svgCode) ?? undefined) : undefined,
            objectFit: block.type === "svg" ? block.objectFit : undefined,
            aspectRatio: block.type === "svg" ? block.aspectRatio : undefined,
            crop: block.type === "svg" ? block.crop : undefined,
        });
    }

    regions.sort((a, b) => b.zIndex - a.zIndex);
    return regions;
}

export function useBookSideContent({
    bookKey,
    totalPageEntries,
    canvasHeight,
    pageAspectRatio = 1.28 / 1.71,
    textureLoadRadius = Number.POSITIVE_INFINITY,
    currentPage = 0,
    enabled = true,
}: UseBookSideTexturesOptions): UseBookSideContentResult {
    const [textures, setTextures] = useState<DynamicTextureMap>({});
    const [linkRegions, setLinkRegions] = useState<LinkRegionMap>({});
    const [refreshToken, setRefreshToken] = useState(0);

    const layoutCacheRef = useRef<Map<string, string>>(new Map());
    const textureCacheRef = useRef<Map<string, CanvasTexture>>(new Map());
    const linkRegionCacheRef = useRef<Map<string, LinkHitRegion[]>>(new Map());
    const mountedRef = useRef(true);
    const lastResolutionKeyRef = useRef<string>("");

    const canvasWidth = Math.round(canvasHeight * pageAspectRatio);

    useEffect(() => {
        mountedRef.current = true;
        const textureCache = textureCacheRef.current;
        const layoutCache = layoutCacheRef.current;
        const regionCache = linkRegionCacheRef.current;
        return () => {
            mountedRef.current = false;
            for (const texture of textureCache.values()) {
                texture.dispose();
            }
            textureCache.clear();
            layoutCache.clear();
            regionCache.clear();
        };
    }, []);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const bumpRefresh = () => {
            setRefreshToken((prev) => prev + 1);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                bumpRefresh();
            }
        };

        window.addEventListener("focus", bumpRefresh);
        window.addEventListener("pageshow", bumpRefresh);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.removeEventListener("focus", bumpRefresh);
            window.removeEventListener("pageshow", bumpRefresh);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [enabled]);

    useEffect(() => {
        const resolutionKey = `${canvasWidth}x${canvasHeight}`;
        if (lastResolutionKeyRef.current !== resolutionKey) {
            for (const texture of textureCacheRef.current.values()) {
                texture.dispose();
            }
            textureCacheRef.current.clear();
            layoutCacheRef.current.clear();
            linkRegionCacheRef.current.clear();
            setTextures({});
            setLinkRegions({});
            lastResolutionKeyRef.current = resolutionKey;
        }

        if (!enabled) {
            if (textureCacheRef.current.size > 0 || linkRegionCacheRef.current.size > 0) {
                for (const texture of textureCacheRef.current.values()) {
                    texture.dispose();
                }
                textureCacheRef.current.clear();
                layoutCacheRef.current.clear();
                linkRegionCacheRef.current.clear();
                setTextures({});
                setLinkRegions({});
            }
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

                const { layout: validatedLayout } = validateLayout(row.layout);
                const hash = layoutHash(validatedLayout, canvasWidth, canvasHeight);

                linkRegionCacheRef.current.set(
                    key,
                    buildLinkHitRegions(validatedLayout, canvasWidth, canvasHeight),
                );

                if (layoutCacheRef.current.get(key) === hash) {
                    continue;
                }

                renderPromises.push(
                    renderPageSideToCanvas(validatedLayout, canvasWidth, canvasHeight)
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

            for (const key of linkRegionCacheRef.current.keys()) {
                const shouldKeep = retainedKeys.has(key) && fetchedKeys.has(key);
                if (!shouldKeep) {
                    linkRegionCacheRef.current.delete(key);
                }
            }

            if (mountedRef.current) {
                const nextTextures: DynamicTextureMap = {};
                for (const [key, texture] of textureCacheRef.current.entries()) {
                    nextTextures[key] = texture;
                }

                const nextRegions: LinkRegionMap = {};
                for (const [key, regions] of linkRegionCacheRef.current.entries()) {
                    nextRegions[key] = regions;
                }

                setTextures(nextTextures);
                setLinkRegions(nextRegions);
            }
        };

        fetchAndRender();

        return () => {
            cancelled = true;
        };
    }, [
        bookKey,
        totalPageEntries,
        canvasHeight,
        canvasWidth,
        textureLoadRadius,
        currentPage,
        enabled,
        refreshToken,
    ]);

    return { textures, linkRegions };
}

export function useBookSideTextures(options: UseBookSideTexturesOptions): DynamicTextureMap {
    return useBookSideContent(options).textures;
}
