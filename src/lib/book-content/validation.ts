import type { LayoutBlock, PageSideLayout, TextStyleConfig } from "@/types/book-content";

// ── Constants ────────────────────────────────

const MAX_BLOCKS_PER_SIDE = 8;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 200;
const MIN_FONT_WEIGHT = 100;
const MAX_FONT_WEIGHT = 900;
const MIN_LINE_HEIGHT = 0.8;
const MAX_LINE_HEIGHT = 3.0;

// ── Helpers ──────────────────────────────────

/** Clamps a value between min and max. */
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

// ── Normalized rect ──────────────────────────

/**
 * Clamps a block's normalized rect (x, y, w, h) so it stays within
 * the 0–1 safe content area.
 */
export function clampNormalizedRect(block: LayoutBlock): LayoutBlock {
    const x = clamp(block.x, 0, 1);
    const y = clamp(block.y, 0, 1);
    const w = clamp(block.w, 0.01, 1 - x);
    const h = clamp(block.h, 0.01, 1 - y);
    return { ...block, x, y, w, h };
}

// ── Text style ───────────────────────────────

/**
 * Validates and clamps text style values to their allowed ranges.
 */
export function validateTextStyle(style: TextStyleConfig): TextStyleConfig {
    return {
        fontSize: clamp(style.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE),
        fontWeight: clamp(
            Math.round(style.fontWeight / 100) * 100,
            MIN_FONT_WEIGHT,
            MAX_FONT_WEIGHT,
        ),
        textAlign: ["left", "center", "right"].includes(style.textAlign)
            ? style.textAlign
            : "left",
        color: style.color || "#000000",
        lineHeight: clamp(style.lineHeight, MIN_LINE_HEIGHT, MAX_LINE_HEIGHT),
        fontFamily: style.fontFamily || "sans-serif",
    };
}

// ── Layout validation ────────────────────────

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    layout: PageSideLayout;
}

/**
 * Validates a full page-side layout.
 * Returns a cleaned/clamped layout along with any errors.
 */
export function validateLayout(layout: PageSideLayout): ValidationResult {
    const errors: string[] = [];
    let blocks = [...layout.blocks];

    // Enforce max blocks
    if (blocks.length > MAX_BLOCKS_PER_SIDE) {
        errors.push(
            `Maksimal ${MAX_BLOCKS_PER_SIDE} blok per sisi. ${blocks.length} blok ditemukan.`,
        );
        blocks = blocks.slice(0, MAX_BLOCKS_PER_SIDE);
    }

    // Validate each block
    const validatedBlocks: LayoutBlock[] = blocks.map((block) => {
        const clamped = clampNormalizedRect(block);

        if (clamped.type === "text") {
            return {
                ...clamped,
                style: validateTextStyle(clamped.style),
            };
        }

        return clamped;
    });

    // Validate padding override if present
    const paddingOverride = layout.paddingOverride
        ? {
            padXRatio: clamp(layout.paddingOverride.padXRatio, 0, 0.4),
            padYRatio: clamp(layout.paddingOverride.padYRatio, 0, 0.4),
        }
        : undefined;

    return {
        valid: errors.length === 0,
        errors,
        layout: {
            blocks: validatedBlocks,
            paddingOverride,
            backgroundColor: layout.backgroundColor || "#ffffff",
        },
    };
}

/**
 * Checks whether an additional block can be added.
 */
export function canAddBlock(layout: PageSideLayout): boolean {
    return layout.blocks.length < MAX_BLOCKS_PER_SIDE;
}
