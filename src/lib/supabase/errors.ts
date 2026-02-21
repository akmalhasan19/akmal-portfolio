export function getSupabaseErrorMessage(
    error: unknown,
    fallbackMessage: string,
) {
    if (error instanceof TypeError && /failed to fetch/i.test(error.message)) {
        return "Supabase endpoint tidak bisa diakses. Cek NEXT_PUBLIC_SUPABASE_URL, internet, atau firewall/VPN.";
    }

    if (error instanceof Error) {
        const message = error.message.trim();
        if (message.length > 0) {
            return message;
        }
    }

    return fallbackMessage;
}