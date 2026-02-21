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
    textAlign: "left" | "center" | "right" | "justify";
    /** CSS color string. */
    color: string;
    /** Line-height multiplier (e.g. 1.4). */
    lineHeight: number;
    /** Font family name. */
    fontFamily: string;
    /** List formatting mode for multi-line text content. */
    listType?: "none" | "bullet" | "number" | "alpha";
}

export interface LinkStyleConfig {
    /** Button background color. */
    backgroundColor: string;
    /** Button text color. */
    textColor: string;
    /** Font size in px (rendered on texture canvas). */
    fontSize: number;
    /** Font family name. */
    fontFamily: string;
    /** Corner radius in px. */
    borderRadius: number;
    /** Text alignment. */
    textAlign: "left" | "center" | "right";
    /** CSS font-weight value (100-900). */
    fontWeight: number;
}

// ── Outline ──────────────────────────────────

export interface BlockOutline {
    /** CSS color string for the outline stroke. */
    color: string;
    /**
     * Stroke width in canvas pixels at the base canvas height (1536 px).
     * Automatically scaled proportionally on larger/smaller canvases.
     * Valid range: 1–100.
     */
    width: number;
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
    /** Width/height ratio used to keep resize proportional. */
    aspectRatio?: number;
    /** Z-order within the page-side. Higher = on top. */
    zIndex: number;
    /** Optional URL opened when this block is clicked in 3D view. */
    linkUrl?: string;
    /** Optional stroke outline drawn around the block boundary. */
    outline?: BlockOutline;
    /**
     * Corner radius in canvas pixels at the base canvas height (1536 px).
     * Automatically scaled. 0 = sharp corners. Valid range: 0–500.
     * Applies to clip shape for text/image/svg blocks.
     * For link blocks, use style.borderRadius instead.
     */
    cornerRadius?: number;
}

export interface TextBlock extends BlockBase {
    type: "text";
    /** Multi-line text content. */
    content: string;
    /** Optional per-language text content overrides. */
    contentByLanguage?: Partial<Record<"id" | "en", string>>;
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
    /** Visual clipping shape for image rendering. */
    shape?: "rect" | "circle";
    /** Optional crop values (0..1 per edge) applied to the source asset. */
    crop?: VisualCrop;
}

export interface SvgBlock extends BlockBase {
    type: "svg";
    /** Raw inline SVG markup (icon code pasted from source). */
    svgCode: string;
    /** Object-fit mode for rendering. */
    objectFit: "cover" | "contain";
    /** Optional crop values (0..1 per edge) applied to the rendered SVG source. */
    crop?: VisualCrop;
}

export interface ShapeBlock extends BlockBase {
    type: "shape";
    shapeType: "rectangle" | "circle" | "triangle" | "diamond" | "pill";
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    content: string;
    style: TextStyleConfig;
}

export interface VisualCrop {
    /** Cropped ratio from the left side of source media. */
    left: number;
    /** Cropped ratio from the right side of source media. */
    right: number;
    /** Cropped ratio from the top side of source media. */
    top: number;
    /** Cropped ratio from the bottom side of source media. */
    bottom: number;
}

export interface LinkBlock extends BlockBase {
    type: "link";
    /** Label rendered inside the button-like block. */
    label: string;
    /** Target URL opened on click. */
    url: string;
    style: LinkStyleConfig;
}

/** Discriminated union of all block types. */
export type LayoutBlock = TextBlock | ImageBlock | SvgBlock | LinkBlock | ShapeBlock;

export interface LinkHitRegion {
    /** Normalized x position in full page texture coordinates (0..1). */
    x: number;
    /** Normalized y position in full page texture coordinates (0..1). */
    y: number;
    /** Normalized width in full page texture coordinates (0..1). */
    w: number;
    /** Normalized height in full page texture coordinates (0..1). */
    h: number;
    /** Final sanitized URL for click action. */
    url: string;
    /** Z-order used to resolve overlap (higher wins). */
    zIndex: number;
    /** Action type used by runtime click handlers. */
    interactionType?: "external_url" | "resume_modal";
    /** Controls hover-highlight shape rendering. */
    highlightShape?: "block" | "svg";
    /** Optional inline SVG data URL when `highlightShape` is `svg`. */
    svgDataUrl?: string;
    /** Optional fit mode for SVG highlight rendering. */
    objectFit?: "cover" | "contain";
    /** Optional aspect ratio used by SVG highlight rendering. */
    aspectRatio?: number;
    /** Optional crop used by SVG highlight rendering. */
    crop?: VisualCrop;
}

export type LinkRegionMap = Record<string, LinkHitRegion[]>;

// ── Page side layout ─────────────────────────

export interface PageSideLayout {
    /** All content blocks on this page-side. Max 20. */
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
