import type { Metadata } from "next";
// Fonts are now loaded in the root layout (src/app/layout.tsx)
import "./admin.css";

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
        <div className="min-h-screen bg-neutral-950 text-neutral-100">
            {children}
        </div>
    );
}
