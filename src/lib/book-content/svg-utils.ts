const SVG_OPEN_TAG = /<svg[\s>]/i;
const SVG_CLOSE_TAG = /<\/svg>/i;
const SVG_ROOT_OPEN_TAG = /<svg\b[^>]*>/i;
const XML_DECLARATION = /^\uFEFF?\s*<\?xml[\s\S]*?\?>\s*/i;
const DOCTYPE_DECLARATION = /<!doctype[\s\S]*?>/gi;

function parseSvgNumericAttr(svgOpenTag: string, attr: "width" | "height"): number | null {
    const regex = new RegExp(
        `\\b${attr}\\s*=\\s*(?:\"([^\"]+)\"|'([^']+)'|([^\\s>]+))`,
        "i",
    );
    const match = svgOpenTag.match(regex);
    if (!match) {
        return null;
    }

    const raw = (match[1] || match[2] || match[3] || "").trim();
    if (!raw || raw.includes("%")) {
        return null;
    }

    const numeric = Number.parseFloat(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeSvgRoot(svgMarkup: string): string {
    const rootMatch = svgMarkup.match(SVG_ROOT_OPEN_TAG);
    if (!rootMatch) {
        return svgMarkup;
    }

    let svgRoot = rootMatch[0];

    // Ensure SVG namespace exists.
    if (!/\bxmlns\s*=/.test(svgRoot)) {
        svgRoot = svgRoot.replace(
            /<svg\b/i,
            '<svg xmlns="http://www.w3.org/2000/svg"',
        );
    }

    // Force predictable intrinsic scaling so icon shape remains faithful.
    svgRoot = svgRoot.replace(
        /\s+preserveAspectRatio\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,
        "",
    );
    svgRoot = svgRoot.replace(
        /<svg\b/i,
        '<svg preserveAspectRatio="xMidYMid meet"',
    );

    // If no viewBox, derive one from width/height when possible.
    if (!/\bviewBox\s*=/.test(svgRoot)) {
        const width = parseSvgNumericAttr(svgRoot, "width");
        const height = parseSvgNumericAttr(svgRoot, "height");
        if (width && height) {
            svgRoot = svgRoot.replace(
                />$/,
                ` viewBox="0 0 ${width} ${height}">`,
            );
        }
    }

    return svgMarkup.replace(rootMatch[0], svgRoot);
}

function encodeSvgBase64(svgMarkup: string): string | null {
    try {
        const bytes = new TextEncoder().encode(svgMarkup);
        let binary = "";
        const CHUNK_SIZE = 0x8000;

        for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
            const chunk = bytes.subarray(i, i + CHUNK_SIZE);
            binary += String.fromCharCode(...chunk);
        }

        if (typeof btoa === "function") {
            return btoa(binary);
        }

        const maybeBuffer = (globalThis as { Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer;
        if (maybeBuffer) {
            return maybeBuffer.from(svgMarkup, "utf-8").toString("base64");
        }
    } catch {
        // Ignore and fall through.
    }

    return null;
}

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

    const strippedDeclarations = input
        .replace(XML_DECLARATION, "")
        .replace(DOCTYPE_DECLARATION, "");

    const sanitized = strippedDeclarations
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
        .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, "")
        .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
        .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
        .replace(/\s(?:href|xlink:href)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, "")
        .trim();

    return normalizeSvgRoot(sanitized);
}

export function svgToDataUrl(svgCode: string): string | null {
    const sanitized = sanitizeSvgCode(svgCode);
    if (!sanitized) {
        return null;
    }

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitized)}`;
}

export function svgToBase64DataUrl(svgCode: string): string | null {
    const sanitized = sanitizeSvgCode(svgCode);
    if (!sanitized) {
        return null;
    }

    const base64 = encodeSvgBase64(sanitized);
    if (!base64) {
        return null;
    }

    return `data:image/svg+xml;base64,${base64}`;
}
