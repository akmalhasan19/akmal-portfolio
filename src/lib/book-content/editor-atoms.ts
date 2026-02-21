"use client";

import { atom } from "jotai";
import type { PageSide, PageSideLayout } from "@/types/book-content";
import { BOOK_PAPER_TONE } from "@/lib/book-content/paper-tone";
import type { LanguageCode } from "@/lib/i18n/language";

// ── Selected page / side ─────────────────────

export const selectedPageIndexAtom = atom(0);
export const selectedSideAtom = atom<PageSide>("front");

// ── Layout draft ─────────────────────────────

const defaultLayout: PageSideLayout = {
    blocks: [],
    backgroundColor: BOOK_PAPER_TONE,
};

export const layoutDraftAtom = atom<PageSideLayout>(defaultLayout);

// ── Save status flags ────────────────────────

export const dirtyAtom = atom(false);
export const savingAtom = atom(false);
export const saveErrorAtom = atom<string | null>(null);

// ── Loading state ────────────────────────────

export const loadingAtom = atom(false);

// ── Selected block ───────────────────────────

export const selectedBlockIdAtom = atom<string | null>(null);
export const selectedBlockIdsAtom = atom<string[]>([]);
export const nudgeStepAtom = atom(0.01);
export const contentLanguageAtom = atom<LanguageCode>("id");

// ── Total page count for Book 1 ──────────────
// This should match the number of interior pages in Book3D.
// Cover pages are excluded — this is only for interior page indices.

export const totalInteriorPagesAtom = atom(18);
