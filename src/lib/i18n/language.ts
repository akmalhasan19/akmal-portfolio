import { atom } from "jotai";

export type LanguageCode = "id" | "en";

export const languageAtom = atom<LanguageCode>("id");

export const SHARED_TRANSLATIONS = {
    id: {
        navbarOpenMenu: "Buka menu utama",
        navHome: "Beranda",
        navAbout: "Tentang",
        navPortfolio: "Portofolio",
        navContact: "Kontak",
        previousPage: "Halaman Sebelumnya",
        nextPage: "Halaman Berikutnya",
        pageLabel: "Halaman",
    },
    en: {
        navbarOpenMenu: "Open main menu",
        navHome: "Home",
        navAbout: "About",
        navPortfolio: "Portfolio",
        navContact: "Contact",
        previousPage: "Previous Page",
        nextPage: "Next Page",
        pageLabel: "Page",
    },
} as const;
