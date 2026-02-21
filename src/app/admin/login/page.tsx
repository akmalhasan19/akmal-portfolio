"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabaseErrorMessage } from "@/lib/supabase/errors";

export default function AdminLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const supabase = getSupabaseBrowserClient();
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError) {
                setError("Login gagal. Periksa email dan password.");
                setLoading(false);
                return;
            }

            // Check if user is in app_admins
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                setError("Login gagal.");
                setLoading(false);
                return;
            }

            const { data: adminRow } = await supabase
                .from("app_admins")
                .select("user_id")
                .eq("user_id", user.id)
                .single();

            if (!adminRow) {
                await supabase.auth.signOut();
                setError("Akun ini bukan admin.");
                setLoading(false);
                return;
            }

            router.push("/admin");
        } catch (error) {
            setError(
                getSupabaseErrorMessage(error, "Terjadi kesalahan. Coba lagi."),
            );
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <form
                onSubmit={handleLogin}
                className="w-full max-w-sm space-y-5 rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl"
            >
                <h1 className="text-center text-xl font-semibold tracking-tight">
                    Admin Login
                </h1>

                {error && (
                    <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2.5 text-sm text-red-400">
                        {error}
                    </div>
                )}

                <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-sm text-neutral-400">
                        Email
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                    />
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="password" className="block text-sm text-neutral-400">
                        Password
                    </label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-amber-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? "Logging in…" : "Login"}
                </button>
            </form>
        </div>
    );
}
