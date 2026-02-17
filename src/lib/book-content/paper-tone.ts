export const BOOK_PAPER_TONE = "#ece0c5";

export function normalizePaperBackground(
    backgroundColor?: string | null,
): string {
    const raw = typeof backgroundColor === "string" ? backgroundColor.trim() : "";
    if (!raw) {
        return BOOK_PAPER_TONE;
    }

    const normalized = raw.toLowerCase();
    if (normalized === "#fff" || normalized === "#ffffff") {
        return BOOK_PAPER_TONE;
    }

    return raw;
}
