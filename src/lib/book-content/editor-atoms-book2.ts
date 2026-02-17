"use client";

import { atom } from "jotai";
import type { PageSide, PageSideLayout } from "@/types/book-content";
import {
    BOOK2_EDITABLE_CONTEXTS,
    BOOK2_TOTAL_PAGE_ENTRIES,
} from "@/lib/book-content/book2-constraints";
import { BOOK_PAPER_TONE } from "@/lib/book-content/paper-tone";

export const selectedPageIndexAtom = atom(BOOK2_EDITABLE_CONTEXTS[0].sheetIndex);
export const selectedSideAtom = atom<PageSide>(BOOK2_EDITABLE_CONTEXTS[0].side);

const defaultLayout: PageSideLayout = {
    blocks: [],
    backgroundColor: BOOK_PAPER_TONE,
};

export const layoutDraftAtom = atom<PageSideLayout>(defaultLayout);

export const dirtyAtom = atom(false);
export const savingAtom = atom(false);
export const saveErrorAtom = atom<string | null>(null);
export const loadingAtom = atom(false);
export const selectedBlockIdAtom = atom<string | null>(null);

// Book 2 total entries: 40 interior sheets + 2 covers.
export const totalInteriorPagesAtom = atom(BOOK2_TOTAL_PAGE_ENTRIES);
