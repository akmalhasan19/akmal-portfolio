import type {
    LayoutBlock,
    LinkStyleConfig,
    PageSideLayout,
    TextStyleConfig,
} from "@/types/book-content";
import { sanitizeLinkLabel, sanitizeLinkUrl } from "./links";
import { normalizePaperBackground } from "./paper-tone";
import { sanitizeSvgCode } from "./svg-utils";
import { normalizeAspectRatio, parseSvgAspectRatio } from "./aspect-ratio";

const MAX_BLOCKS_PER_SIDE = 20;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 200;
const MIN_FONT_WEIGHT = 100;
const MAX_FONT_WEIGHT = 900;
const MIN_LINE_HEIGHT = 0.8;
const MAX_LINE_HEIGHT = 3.0;

const MIN_LINK_FONT_SIZE = 10;
const MAX_LINK_FONT_SIZE = 96;
const MIN_LINK_BORDER_RADIUS = 0;
const MAX_LINK_BORDER_RADIUS = 200;

function toFiniteNumber(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function validateBlockLinkUrl(linkUrl: unknown): string {
    return sanitizeLinkUrl(typeof linkUrl === "string" ? linkUrl : "");
}

export function clampNormalizedRect(block: LayoutBlock): LayoutBlock {
    const x = clamp(toFiniteNumber(block.x), 0, 1);
    const y = clamp(toFiniteNumber(block.y), 0, 1);
    const w = clamp(toFiniteNumber(block.w, 0.01), 0.01, 1 - x);
    const h = clamp(toFiniteNumber(block.h, 0.01), 0.01, 1 - y);
    return {
        ...block,
        x,
        y,
        w,
        h,
        aspectRatio: normalizeAspectRatio((block as { aspectRatio?: number }).aspectRatio, w / h),
    };
}

export function validateTextStyle(
    style: Partial<TextStyleConfig> | TextStyleConfig | null | undefined,
): TextStyleConfig {
    const fontSize = toFiniteNumber(style?.fontSize, 24);
    const fontWeight = toFiniteNumber(style?.fontWeight, 400);
    const lineHeight = toFiniteNumber(style?.lineHeight, 1.4);
    return {
        fontSize: clamp(fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE),
        fontWeight: clamp(
            Math.round(fontWeight / 100) * 100,
            MIN_FONT_WEIGHT,
            MAX_FONT_WEIGHT,
        ),
        textAlign:
            style?.textAlign === "center" || style?.textAlign === "right"
                ? style.textAlign
                : "left",
        color:
            typeof style?.color === "string" && style.color.trim()
                ? style.color
                : "#000000",
        lineHeight: clamp(lineHeight, MIN_LINE_HEIGHT, MAX_LINE_HEIGHT),
        fontFamily:
            typeof style?.fontFamily === "string" && style.fontFamily.trim()
                ? style.fontFamily
                : "sans-serif",
    };
}

export function validateLinkStyle(
    style: Partial<LinkStyleConfig> | LinkStyleConfig | null | undefined,
): LinkStyleConfig {
    const fontSize = toFiniteNumber(style?.fontSize, 24);
    const fontWeight = toFiniteNumber(style?.fontWeight, 600);
    const borderRadius = toFiniteNumber(style?.borderRadius, 16);
    return {
        backgroundColor:
            typeof style?.backgroundColor === "string" && style.backgroundColor.trim()
                ? style.backgroundColor
                : "#1f2937",
        textColor:
            typeof style?.textColor === "string" && style.textColor.trim()
                ? style.textColor
                : "#ffffff",
        fontSize: clamp(fontSize, MIN_LINK_FONT_SIZE, MAX_LINK_FONT_SIZE),
        fontFamily:
            typeof style?.fontFamily === "string" && style.fontFamily.trim()
                ? style.fontFamily
                : "sans-serif",
        borderRadius: clamp(
            Math.round(borderRadius),
            MIN_LINK_BORDER_RADIUS,
            MAX_LINK_BORDER_RADIUS,
        ),
        textAlign:
            style?.textAlign === "left"
            || style?.textAlign === "center"
            || style?.textAlign === "right"
                ? style.textAlign
                : "center",
        fontWeight: clamp(
            Math.round(fontWeight / 100) * 100,
            MIN_FONT_WEIGHT,
            MAX_FONT_WEIGHT,
        ),
    };
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    layout: PageSideLayout;
}

export function validateLayout(layout: PageSideLayout): ValidationResult {
    const errors: string[] = [];
    const sourceBlocks = Array.isArray(layout.blocks) ? layout.blocks : [];
    let blocks = [...sourceBlocks];

    if (!Array.isArray(layout.blocks)) {
        errors.push("Format blok tidak valid. Menggunakan array kosong.");
    }

    if (blocks.length > MAX_BLOCKS_PER_SIDE) {
        errors.push(
            `Maksimal ${MAX_BLOCKS_PER_SIDE} blok per sisi. ${blocks.length} blok ditemukan.`,
        );
        blocks = blocks.slice(0, MAX_BLOCKS_PER_SIDE);
    }

    const validatedBlocks: LayoutBlock[] = [];

    for (const rawBlock of blocks as Array<LayoutBlock | { type?: unknown }>) {
        const type = typeof rawBlock?.type === "string" ? rawBlock.type : "";
        if (
            type !== "text"
            && type !== "image"
            && type !== "svg"
            && type !== "link"
        ) {
            errors.push(`Tipe blok tidak dikenali: ${type || "unknown"}. Blok diabaikan.`);
            continue;
        }

        const clamped = clampNormalizedRect(rawBlock as LayoutBlock);

        if (clamped.type === "text") {
            validatedBlocks.push({
                ...clamped,
                content: clamped.content ?? "",
                style: validateTextStyle(clamped.style),
                linkUrl: validateBlockLinkUrl(clamped.linkUrl),
            });
            continue;
        }

        if (clamped.type === "svg") {
            const sanitizedSvgCode = sanitizeSvgCode(clamped.svgCode);
            const svgAspectRatio = parseSvgAspectRatio(sanitizedSvgCode);
            validatedBlocks.push({
                ...clamped,
                svgCode: sanitizedSvgCode,
                objectFit: clamped.objectFit === "contain" ? "contain" : "cover",
                aspectRatio: normalizeAspectRatio(svgAspectRatio, clamped.w / clamped.h),
                linkUrl: validateBlockLinkUrl(clamped.linkUrl),
            });
            continue;
        }

        if (clamped.type === "image") {
            validatedBlocks.push({
                ...clamped,
                assetPath: clamped.assetPath ?? "",
                objectFit: clamped.objectFit === "contain" ? "contain" : "cover",
                shape: clamped.shape === "circle" ? "circle" : "rect",
                linkUrl: validateBlockLinkUrl(clamped.linkUrl),
            });
            continue;
        }

        const normalizedLinkUrl = validateBlockLinkUrl(clamped.linkUrl || clamped.url);
        validatedBlocks.push({
            ...clamped,
            label: sanitizeLinkLabel(clamped.label),
            url: sanitizeLinkUrl(clamped.url || clamped.linkUrl || ""),
            linkUrl: normalizedLinkUrl,
            style: validateLinkStyle(clamped.style),
        });
    }

    const paddingOverride = layout.paddingOverride
        ? {
            padXRatio: clamp(toFiniteNumber(layout.paddingOverride.padXRatio), 0, 0.4),
            padYRatio: clamp(toFiniteNumber(layout.paddingOverride.padYRatio), 0, 0.4),
        }
        : undefined;

    return {
        valid: errors.length === 0,
        errors,
        layout: {
            blocks: validatedBlocks,
            paddingOverride,
            backgroundColor: normalizePaperBackground(layout.backgroundColor),
        },
    };
}

export function canAddBlock(layout: PageSideLayout): boolean {
    return layout.blocks.length < MAX_BLOCKS_PER_SIDE;
}
