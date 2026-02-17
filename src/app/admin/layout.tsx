import type { Metadata } from "next";
import { Geist_Mono, Crimson_Text, Caveat } from "next/font/google";
import "./admin.css";

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

const crimsonText = Crimson_Text({
    variable: "--font-crimson-text",
    weight: ["400", "600", "700"],
    subsets: ["latin"],
});

const caveat = Caveat({
    variable: "--font-caveat",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Admin — Book Editor",
    robots: { index: false, follow: false },
};

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className={`${geistMono.variable} ${crimsonText.variable} ${caveat.variable} min-h-screen bg-neutral-950 text-neutral-100`}>
            {children}
        </div>
    );
}
