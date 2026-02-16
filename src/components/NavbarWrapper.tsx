"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function NavbarWrapper() {
    const pathname = usePathname();
    // Hide navbar on admin routes
    const isAdmin = pathname?.startsWith("/admin");

    if (isAdmin) return null;

    return <Navbar />;
}
