import type { Metadata } from "next";
import { Geist, Geist_Mono, Crimson_Text, Caveat } from "next/font/google"; // Updated imports
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
// import Navbar from "@/components/Navbar"; // Replaced by wrapper
// import NavbarWrapper from "@/components/NavbarWrapper"; // Removed: navbar hidden

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

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
  title: "Portofolio Akmal Hasan Mulyadi",
  description: "Portofolio interaktif 3D Akmal Hasan Mulyadi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${crimsonText.variable} ${caveat.variable} antialiased bg-black text-white`}
      >
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
