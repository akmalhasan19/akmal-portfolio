"use client";

import { atom } from "jotai";
import type { PageSide, PageSideLayout } from "@/types/book-content";

export const selectedPageIndexAtom = atom(1);
export const selectedSideAtom = atom<PageSide>("front");

const defaultLayout: PageSideLayout = {
    blocks: [],
    backgroundColor: "#ffffff",
};

export const layoutDraftAtom = atom<PageSideLayout>(defaultLayout);

export const dirtyAtom = atom(false);
export const savingAtom = atom(false);
export const saveErrorAtom = atom<string | null>(null);
export const loadingAtom = atom(false);
export const selectedBlockIdAtom = atom<string | null>(null);

// Book 2 total entries: 40 interior sheets + 2 covers.
export const totalInteriorPagesAtom = atom(42);
