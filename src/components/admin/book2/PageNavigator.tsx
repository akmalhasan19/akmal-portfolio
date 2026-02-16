"use client";

import { useAtom } from "jotai";
import {
    selectedPageIndexAtom,
    selectedSideAtom,
} from "@/lib/book-content/editor-atoms-book2";

interface PageNavigatorProps {
    totalPages: number; // This is actually total SHEETS including covers (0..17)
}

export function PageNavigator({ totalPages }: PageNavigatorProps) {
    const [pageIndex, setPageIndex] = useAtom(selectedPageIndexAtom);
    const [side, setSide] = useAtom(selectedSideAtom);

    // Calculate interior sheets count (Total 18 -> 16 Interior Sheets)
    // Indices 1 to 16 are interior sheets.
    const interiorSheetsCount = totalPages - 2;

    // Total logical pages = Interior Sheets * 2 (Front + Back)
    const totalLogicalPages = interiorSheetsCount * 2;

    // Determine current logical page number for highlighting
    // Sheet 1 Front -> Page 1
    // Sheet 1 Back -> Page 2
    // Sheet 2 Front -> Page 3...
    // Formula: (SheetIndex - 1) * 2 + (side === 'front' ? 1 : 2)
    // Note: If pageIndex is 0 or 17 (Covers), this logic doesn't apply, but we filtered them out.
    const currentLogicalPage =
        pageIndex > 0 && pageIndex < totalPages - 1
            ? (pageIndex - 1) * 2 + (side === "front" ? 1 : 2)
            : null;

    const handlePageClick = (logicalPage: number) => {
        // Logical Page 1 -> Sheet 1
        // Logical Page 2 -> Sheet 1
        // Logical Page 3 -> Sheet 2
        const targetSheetIndex = Math.ceil(logicalPage / 2);
        const targetSide = logicalPage % 2 !== 0 ? "front" : "back";

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
                    Total {totalLogicalPages} Halaman (Isi Buku)
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                <div className="space-y-1">
                    {Array.from({ length: totalLogicalPages }, (_, i) => i + 1).map(
                        (p) => {
                            const isSelected = currentLogicalPage === p;
                            return (
                                <button
                                    key={p}
                                    onClick={() => handlePageClick(p)}
                                    className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${isSelected
                                        ? "bg-amber-600/20 border border-amber-500/40 text-amber-200"
                                        : "border border-transparent text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                                        }`}
                                >
                                    <span className="font-medium">Halaman {p}</span>
                                    {isSelected && (
                                        <span className="ml-2 text-[10px] text-amber-500/70">
                                            (Aktif)
                                        </span>
                                    )}
                                </button>
                            );
                        },
                    )}
                </div>
            </div>
        </div>
    );
}
