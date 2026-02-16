"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Provider as JotaiProvider } from "jotai";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Book1PageEditor } from "@/components/admin/book1/Book1PageEditor";

export default function AdminBook1Page() {
    const router = useRouter();
    const [authed, setAuthed] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
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
            setChecking(false);
        };

        checkAuth();
    }, [router]);

    if (checking) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="text-neutral-500 text-sm">Memverifikasi akses…</div>
            </div>
        );
    }

    if (!authed) {
        return null;
    }

    return (
        <JotaiProvider>
            <Book1PageEditor />
        </JotaiProvider>
    );
}
