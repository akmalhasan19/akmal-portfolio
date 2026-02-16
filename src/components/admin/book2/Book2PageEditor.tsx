"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
    selectedPageIndexAtom,
    selectedSideAtom,
    layoutDraftAtom,
    dirtyAtom,
    savingAtom,
    saveErrorAtom,
    loadingAtom,
    totalInteriorPagesAtom,
} from "@/lib/book-content/editor-atoms-book2";
import type { PageSideLayout } from "@/types/book-content";
import { validateLayout } from "@/lib/book-content/validation";
import { PageNavigator } from "./PageNavigator";
import { PageCanvasStage } from "./PageCanvasStage";
import { BlockInspector } from "./BlockInspector";
import { Book2ProfileImageUploader } from "./Book2ProfileImageUploader";

const AUTOSAVE_DEBOUNCE_MS = 600;
const BOOK_KEY = "book-2";

export function Book2PageEditor() {
    const pageIndex = useAtomValue(selectedPageIndexAtom);
    const side = useAtomValue(selectedSideAtom);
    const [layout, setLayout] = useAtom(layoutDraftAtom);
    const setDirty = useSetAtom(dirtyAtom);
    const setSaving = useSetAtom(savingAtom);
    const setSaveError = useSetAtom(saveErrorAtom);
    const setLoading = useSetAtom(loadingAtom);
    const saving = useAtomValue(savingAtom);
    const dirty = useAtomValue(dirtyAtom);
    const saveError = useAtomValue(saveErrorAtom);
    const loading = useAtomValue(loadingAtom);
    const totalPages = useAtomValue(totalInteriorPagesAtom);

    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestLayoutRef = useRef(layout);

    useEffect(() => {
        latestLayoutRef.current = layout;
    }, [layout]);

    useEffect(() => {
        let cancelled = false;

        const fetchLayout = async () => {
            setLoading(true);
            setSaveError(null);

            const supabase = getSupabaseBrowserClient();
            const { data, error } = await supabase
                .from("book_page_side_layouts")
                .select("layout")
                .eq("book_key", BOOK_KEY)
                .eq("page_index", pageIndex)
                .eq("side", side)
                .single();

            if (cancelled) return;

            if (error && error.code !== "PGRST116") {
                setSaveError("Gagal memuat layout.");
            }

            const fetchedLayout: PageSideLayout = data?.layout ?? {
                blocks: [],
                backgroundColor: "#ffffff",
            };

            setLayout(fetchedLayout);
            setDirty(false);
            setLoading(false);
        };

        fetchLayout();

        return () => {
            cancelled = true;
        };
    }, [pageIndex, side, setLayout, setDirty, setLoading, setSaveError]);

    const saveLayout = useCallback(
        async (layoutToSave: PageSideLayout) => {
            setSaving(true);
            setSaveError(null);

            const { layout: validated } = validateLayout(layoutToSave);
            const supabase = getSupabaseBrowserClient();
            const {
                data: { user },
            } = await supabase.auth.getUser();

            const { error } = await supabase
                .from("book_page_side_layouts")
                .upsert(
                    {
                        book_key: BOOK_KEY,
                        page_index: pageIndex,
                        side,
                        layout: validated,
                        updated_by: user?.id ?? null,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "book_key,page_index,side" },
                );

            if (error) {
                setSaveError("Gagal menyimpan: " + error.message);
            } else {
                setDirty(false);
            }

            setSaving(false);
        },
        [pageIndex, side, setDirty, setSaving, setSaveError],
    );

    const handleLayoutChange = useCallback(
        (updater: (prev: PageSideLayout) => PageSideLayout) => {
            setLayout((prev) => {
                const next = updater(prev);
                latestLayoutRef.current = next;
                return next;
            });
            setDirty(true);

            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
            }

            autosaveTimerRef.current = setTimeout(() => {
                saveLayout(latestLayoutRef.current);
            }, AUTOSAVE_DEBOUNCE_MS);
        },
        [setLayout, setDirty, saveLayout],
    );

    useEffect(() => {
        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
            }
        };
    }, []);

    return (
        <div className="flex h-screen flex-col">
            <header className="flex items-center gap-4 border-b border-neutral-800 bg-neutral-900 px-4 py-2.5">
                <h1 className="text-sm font-semibold tracking-tight">
                    Book 2 Editor
                </h1>

                <div className="flex-1" />

                <div className="flex items-center gap-2 text-xs">
                    {loading && (
                        <span className="text-neutral-500">Memuat...</span>
                    )}
                    {saving && (
                        <span className="text-amber-400">Menyimpan...</span>
                    )}
                    {dirty && !saving && (
                        <span className="text-amber-400">Belum disimpan</span>
                    )}
                    {!dirty && !saving && !loading && !saveError && (
                        <span className="text-green-400">Tersimpan</span>
                    )}
                    {saveError && (
                        <span className="text-red-400" title={saveError}>
                            Error
                        </span>
                    )}
                </div>

                <Book2ProfileImageUploader />

                <button
                    onClick={() => window.open("/", "_blank")}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-700"
                >
                    Buka 3D Preview
                </button>
            </header>

            <div className="flex flex-1 overflow-hidden">
                <aside className="w-52 shrink-0 border-r border-neutral-800 overflow-y-auto bg-neutral-900/60">
                    <PageNavigator totalPages={totalPages} />
                </aside>

                <main className="flex-1 overflow-auto bg-neutral-950 p-4">
                    <PageCanvasStage
                        layout={layout}
                        onLayoutChange={handleLayoutChange}
                    />
                </main>

                <aside className="w-72 shrink-0 border-l border-neutral-800 overflow-y-auto bg-neutral-900/60">
                    <BlockInspector
                        layout={layout}
                        onLayoutChange={handleLayoutChange}
                    />
                </aside>
            </div>
        </div>
    );
}
