const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const DEFAULT_LINK_LABEL = "Open Link";
const MAX_LINK_LABEL_LENGTH = 120;
const URL_SCHEME_PREFIX = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const LIKELY_HOST_PREFIX = /^(localhost(?::\d+)?|(?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]|$)/i;

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

    const candidate = URL_SCHEME_PREFIX.test(raw) || raw.startsWith("//")
        ? raw
        : LIKELY_HOST_PREFIX.test(raw)
            ? `https://${raw}`
            : raw;

    try {
        const parsed = new URL(candidate);
        if (!ALLOWED_LINK_PROTOCOLS.has(parsed.protocol)) {
            return "";
        }

        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return parsed.toString();
        }

        // Keep mailto/tel compact and predictable.
        return candidate;
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
