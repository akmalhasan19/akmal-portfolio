"use client";

import { useAtom } from "jotai";
import { useEffect, useMemo } from "react";
import {
    selectedPageIndexAtom,
    selectedSideAtom,
} from "@/lib/book-content/editor-atoms-book2";
import {
    BOOK2_EDITABLE_CONTEXTS,
    isBook2EditableContext,
    toLogicalPageNumber,
} from "@/lib/book-content/book2-constraints";

interface PageNavigatorProps {
    totalPages: number; // This is actually total SHEETS including covers (0..17)
}

export function PageNavigator({ totalPages }: PageNavigatorProps) {
    const [pageIndex, setPageIndex] = useAtom(selectedPageIndexAtom);
    const [side, setSide] = useAtom(selectedSideAtom);

    const editablePages = useMemo(
        () =>
            BOOK2_EDITABLE_CONTEXTS.map((ctx, idx) => ({
                id: idx + 1,
                sheetIndex: ctx.sheetIndex,
                side: ctx.side,
                logicalPage: toLogicalPageNumber(ctx.sheetIndex, ctx.side),
            })),
        [],
    );

    useEffect(() => {
        if (isBook2EditableContext(pageIndex, side)) {
            return;
        }
        const fallback = BOOK2_EDITABLE_CONTEXTS[0];
        setPageIndex(fallback.sheetIndex);
        setSide(fallback.side);
    }, [pageIndex, setPageIndex, setSide, side]);

    const currentLogicalPage = toLogicalPageNumber(pageIndex, side);

    const handlePageClick = (targetSheetIndex: number, targetSide: "front" | "back") => {
        setPageIndex(targetSheetIndex);
        setSide(targetSide);
    };

    return (
        <div className="flex h-full flex-col">
            <div className="border-b border-neutral-800 bg-neutral-900/60 p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Daftar Halaman
                </h2>
                <p className="mt-1 text-[10px] text-neutral-500">
                    Hanya 2 halaman tengah yang bisa diedit.
                </p>
                <p className="mt-1 text-[10px] text-neutral-600">
                    Total entry buku: {totalPages}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                <div className="space-y-1">
                    {editablePages.map((page) => {
                        const isSelected = currentLogicalPage === page.logicalPage;
                        return (
                            <button
                                key={page.id}
                                onClick={() => handlePageClick(page.sheetIndex, page.side)}
                                className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${isSelected
                                    ? "bg-amber-600/20 border border-amber-500/40 text-amber-200"
                                    : "border border-transparent text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                                    }`}
                            >
                                <span className="font-medium">
                                    Halaman Tengah {page.id} (P{page.logicalPage})
                                </span>
                                {isSelected && (
                                    <span className="ml-2 text-[10px] text-amber-500/70">
                                        (Aktif)
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
