import type { Metadata } from "next";

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
