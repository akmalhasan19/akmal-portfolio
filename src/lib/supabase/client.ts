import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Returns a singleton Supabase client for browser-side usage.
 * Safe to call multiple times — always returns the same instance.
 */
export function getSupabaseBrowserClient() {
    if (browserClient) {
        return browserClient;
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
        throw new Error(
            "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars",
        );
    }

    browserClient = createBrowserClient(url, anonKey);
    return browserClient;
}
