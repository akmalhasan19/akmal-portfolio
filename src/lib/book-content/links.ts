const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const DEFAULT_LINK_LABEL = "Open Link";
const MAX_LINK_LABEL_LENGTH = 120;

export function sanitizeLinkLabel(input: string): string {
    const trimmed = (input || "").trim();
    if (!trimmed) {
        return DEFAULT_LINK_LABEL;
    }
    return trimmed.slice(0, MAX_LINK_LABEL_LENGTH);
}

export function sanitizeLinkUrl(input: string): string {
    const raw = (input || "").trim();
    if (!raw) {
        return "";
    }

    try {
        const parsed = new URL(raw);
        if (!ALLOWED_LINK_PROTOCOLS.has(parsed.protocol)) {
            return "";
        }

        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return parsed.toString();
        }

        // Keep mailto/tel compact and predictable.
        return raw;
    } catch {
        return "";
    }
}

export function openExternalLink(url: string): void {
    if (typeof window === "undefined") {
        return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
}
