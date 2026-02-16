// ──────────────────────────────────────────────
// Domain types for Book dynamic page authoring
// ──────────────────────────────────────────────

/** Identifies a specific book. Extensible to other books later. */
export type BookKey = "book-1" | (string & {});

/** Which face of a physical sheet. */
export type PageSide = "front" | "back";

// ── Padding ──────────────────────────────────

export interface PaddingConfig {
    /** Horizontal padding ratio (0–1 of canvas width). Default 0.08. */
    padXRatio: number;
    /** Vertical padding ratio (0–1 of canvas height). Default 0.10. */
    padYRatio: number;
}

// ── Text styling ─────────────────────────────

export interface TextStyleConfig {
    /** Font size in px (rendered on texture canvas). */
    fontSize: number;
    /** CSS font-weight value (100–900). */
    fontWeight: number;
    /** Text alignment. */
    textAlign: "left" | "center" | "right";
    /** CSS color string. */
    color: string;
    /** Line-height multiplier (e.g. 1.4). */
    lineHeight: number;
    /** Font family name. */
    fontFamily: string;
}

// ── Blocks ───────────────────────────────────

interface BlockBase {
    /** Unique ID within this page-side (UUID). */
    id: string;
    /**
     * All coordinates are normalized 0..1 relative to the safe content area
     * (after padding is applied).
     */
    x: number;
    y: number;
    w: number;
    h: number;
    /** Z-order within the page-side. Higher = on top. */
    zIndex: number;
}

export interface TextBlock extends BlockBase {
    type: "text";
    /** Multi-line text content. */
    content: string;
    style: TextStyleConfig;
}

export interface ImageBlock extends BlockBase {
    type: "image";
    /**
     * Public URL or Supabase Storage path for the image asset.
     * Empty string means the image hasn't been uploaded yet.
     */
    assetPath: string;
    /** Object-fit mode for rendering. */
    objectFit: "cover" | "contain";
}

/** Discriminated union of all block types. */
export type LayoutBlock = TextBlock | ImageBlock;

// ── Page side layout ─────────────────────────

export interface PageSideLayout {
    /** All content blocks on this page-side. Max 8. */
    blocks: LayoutBlock[];
    /** Optional padding override. If omitted, global defaults are used. */
    paddingOverride?: PaddingConfig;
    /** Background color. Defaults to white (#ffffff). */
    backgroundColor?: string;
}

// ── Database row shape ───────────────────────

export interface BookPageSideLayoutRow {
    id: string;
    book_key: string;
    page_index: number;
    side: PageSide;
    layout: PageSideLayout;
    updated_by: string | null;
    updated_at: string;
}

// ── Resolver key ─────────────────────────────

/**
 * Builds the internal key used to look up content for a specific page-side.
 * Format: `p{pageIndex}:front` or `p{pageIndex}:back`
 */
export function pageSideKey(pageIndex: number, side: PageSide): string {
    return `p${pageIndex}:${side}`;
}
