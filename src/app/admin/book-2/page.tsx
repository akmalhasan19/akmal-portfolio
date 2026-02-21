"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Provider as JotaiProvider } from "jotai";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabaseErrorMessage } from "@/lib/supabase/errors";
import { Book2PageEditor } from "@/components/admin/book2/Book2PageEditor";

export default function AdminBook2Page() {
    const router = useRouter();
    const [authed, setAuthed] = useState(false);
    const [checking, setChecking] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const supabase = getSupabaseBrowserClient();
                const {
                    data: { user },
                } = await supabase.auth.getUser();

                if (!user) {
                    router.replace("/admin/login");
                    return;
                }

                const { data: adminRow } = await supabase
                    .from("app_admins")
                    .select("user_id")
                    .eq("user_id", user.id)
                    .single();

                if (!adminRow) {
                    await supabase.auth.signOut();
                    router.replace("/admin/login");
                    return;
                }

                setAuthed(true);
            } catch (error) {
                setAuthError(
                    getSupabaseErrorMessage(
                        error,
                        "Gagal memverifikasi akses admin. Coba lagi.",
                    ),
                );
            } finally {
                setChecking(false);
            }
        };

        checkAuth();
    }, [router]);

    if (checking) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="text-neutral-500 text-sm">Memverifikasi akses...</div>
            </div>
        );
    }

    if (authError) {
        return (
            <div className="flex min-h-screen items-center justify-center px-6">
                <div className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {authError}
                </div>
            </div>
        );
    }

    if (!authed) {
        return null;
    }

    return (
        <JotaiProvider>
            <Book2PageEditor />
        </JotaiProvider>
    );
}
