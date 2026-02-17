const SVG_OPEN_TAG = /<svg[\s>]/i;
const SVG_CLOSE_TAG = /<\/svg>/i;

/**
 * Removes clearly unsafe SVG constructs while keeping common icon markup.
 * This is a lightweight sanitizer tailored for inline tech-stack icons.
 */
export function sanitizeSvgCode(svgCode: string): string {
    const input = typeof svgCode === "string" ? svgCode.trim() : "";
    if (!input) {
        return "";
    }

    if (!SVG_OPEN_TAG.test(input) || !SVG_CLOSE_TAG.test(input)) {
        return "";
    }

    return input
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
        .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, "")
        .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
        .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
        .replace(/\s(?:href|xlink:href)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, "")
        .trim();
}

export function svgToDataUrl(svgCode: string): string | null {
    const sanitized = sanitizeSvgCode(svgCode);
    if (!sanitized) {
        return null;
    }

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitized)}`;
}
