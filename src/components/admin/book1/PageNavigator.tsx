"use client";

import { useAtom } from "jotai";
import {
    selectedPageIndexAtom,
    selectedSideAtom,
} from "@/lib/book-content/editor-atoms";
import type { PageSide } from "@/types/book-content";

interface PageNavigatorProps {
    totalPages: number;
}

export function PageNavigator({ totalPages }: PageNavigatorProps) {
    const [pageIndex, setPageIndex] = useAtom(selectedPageIndexAtom);
    const [side, setSide] = useAtom(selectedSideAtom);

    const sides: PageSide[] = ["front", "back"];

    return (
        <div className="p-3 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Pages
            </h2>

            {/* Side toggle */}
            <div className="flex rounded-lg overflow-hidden border border-neutral-700">
                {sides.map((s) => (
                    <button
                        key={s}
                        onClick={() => setSide(s)}
                        className={`flex-1 py-1.5 text-xs font-medium transition-colors ${side === s
                                ? "bg-amber-600 text-white"
                                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                            }`}
                    >
                        {s === "front" ? "Front" : "Back"}
                    </button>
                ))}
            </div>

            {/* Page list */}
            <div className="space-y-1">
                {Array.from({ length: totalPages }, (_, i) => (
                    <button
                        key={i}
                        onClick={() => setPageIndex(i)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${pageIndex === i
                                ? "bg-amber-600/20 border border-amber-500/40 text-amber-200"
                                : "border border-transparent text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                            }`}
                    >
                        <span className="font-medium">Page {i}</span>
                        <span className="ml-1.5 text-neutral-500">
                            · {side}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
