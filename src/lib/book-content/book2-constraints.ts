import type { PageSide } from "@/types/book-content";

export interface Book2EditableContext {
    sheetIndex: number;
    side: PageSide;
}

export const BOOK2_INTERIOR_SHEET_COUNT = 40;
export const BOOK2_TOTAL_PAGE_ENTRIES = BOOK2_INTERIOR_SHEET_COUNT + 2;
export const BOOK2_LEFT_MIDDLE_SHEET_INDEX = Math.floor(BOOK2_INTERIOR_SHEET_COUNT / 2);
export const BOOK2_RIGHT_MIDDLE_SHEET_INDEX = BOOK2_LEFT_MIDDLE_SHEET_INDEX + 1;
export const BOOK2_CENTER_SPREAD_PIVOT = BOOK2_RIGHT_MIDDLE_SHEET_INDEX;

export const BOOK2_EDITABLE_CONTEXTS: readonly Book2EditableContext[] = [
    // Two middle visible pages when the book is opened at center spread:
    // left page = left middle sheet back, right page = right middle sheet front.
    { sheetIndex: BOOK2_LEFT_MIDDLE_SHEET_INDEX, side: "back" },
    { sheetIndex: BOOK2_RIGHT_MIDDLE_SHEET_INDEX, side: "front" },
];

export function isBook2EditableContext(
    pageIndex: number,
    side: PageSide,
): boolean {
    return BOOK2_EDITABLE_CONTEXTS.some(
        (ctx) => ctx.sheetIndex === pageIndex && ctx.side === side,
    );
}

export function toLogicalPageNumber(pageIndex: number, side: PageSide): number {
    return (pageIndex - 1) * 2 + (side === "front" ? 1 : 2);
}
