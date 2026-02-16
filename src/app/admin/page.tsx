"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AdminHomePage() {
    const router = useRouter();
    const [checking, setChecking] = useState(true);
    const [authed, setAuthed] = useState(false);

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
                <div className="text-neutral-500 text-sm">Memverifikasi akses...</div>
            </div>
        );
    }

    if (!authed) {
        return null;
    }

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-10">
            <div className="mb-8">
                <h1 className="text-xl font-semibold tracking-tight">Admin Panel</h1>
                <p className="mt-1 text-sm text-neutral-400">
                    Pilih editor buku yang ingin kamu ubah.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <Link
                    href="/admin/book-1"
                    className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                >
                    <h2 className="text-sm font-semibold">Book 1 Editor</h2>
                    <p className="mt-1 text-xs text-neutral-400">
                        Editor konten halaman untuk 3D Book pertama.
                    </p>
                </Link>

                <Link
                    href="/admin/book-2"
                    className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                >
                    <h2 className="text-sm font-semibold">Book 2 Editor</h2>
                    <p className="mt-1 text-xs text-neutral-400">
                        Editor konten halaman untuk 3D Book kedua.
                    </p>
                </Link>
            </div>
        </main>
    );
}
