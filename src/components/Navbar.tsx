'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <nav className="fixed w-full z-50 top-0 start-0 border-b border-white/10 bg-black/30 backdrop-blur-md">
            <div className="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
                <Link href="/" className="flex items-center space-x-3 rtl:space-x-reverse">
                    <span className="self-center text-2xl font-semibold whitespace-nowrap text-white">
                        Akmal
                    </span>
                </Link>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    type="button"
                    className="inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-gray-400 rounded-lg md:hidden hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-gray-600"
                    aria-controls="navbar-default"
                    aria-expanded={isOpen}
                >
                    <span className="sr-only">Open main menu</span>
                    <svg
                        className="w-5 h-5"
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 17 14"
                    >
                        <path
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M1 1h15M1 7h15M1 13h15"
                        />
                    </svg>
                </button>
                <div className={`${isOpen ? 'block' : 'hidden'} w-full md:block md:w-auto`} id="navbar-default">
                    <ul className="font-medium flex flex-col p-4 md:p-0 mt-4 border border-white/10 rounded-lg bg-black/50 md:flex-row md:space-x-8 rtl:space-x-reverse md:mt-0 md:border-0 md:bg-transparent">
                        <li>
                            <Link
                                href="/"
                                className="block py-2 px-3 text-white bg-blue-700 rounded-md md:bg-transparent md:text-blue-500 md:p-0"
                                aria-current="page"
                            >
                                Home
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="#about"
                                className="block py-2 px-3 text-gray-300 rounded-md hover:bg-white/10 md:hover:bg-transparent md:border-0 md:hover:text-blue-500 md:p-0"
                            >
                                About
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="#portfolio"
                                className="block py-2 px-3 text-gray-300 rounded-md hover:bg-white/10 md:hover:bg-transparent md:border-0 md:hover:text-blue-500 md:p-0"
                            >
                                Portfolio
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="#contact"
                                className="block py-2 px-3 text-gray-300 rounded-md hover:bg-white/10 md:hover:bg-transparent md:border-0 md:hover:text-blue-500 md:p-0"
                            >
                                Contact
                            </Link>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
    );
}
