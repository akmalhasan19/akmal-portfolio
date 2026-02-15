import { useAtom, type PrimitiveAtom } from "jotai";
import { pageAtom, pages } from "./Book3D";

interface BookControllerProps {
    totalPages?: number;
    bookAtom?: PrimitiveAtom<number>;
}

export const BookController = ({ totalPages, bookAtom: externalAtom }: BookControllerProps) => {
    const [page, setPage] = useAtom(externalAtom ?? pageAtom);
    const pageStops = totalPages ?? pages.length + 1;
    const lastPageIndex = pageStops - 1;

    return (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-4 bg-white/10 backdrop-blur-md p-4 rounded-xl z-50">
            <button
                className={`px-4 py-2 rounded-lg font-bold text-white transition-all ${page === 0 ? "bg-gray-500 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"
                    }`}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
            >
                Previous Page
            </button>

            <span className="text-white font-mono flex items-center">
                Page {page} / {lastPageIndex}
            </span>

            <button
                className={`px-4 py-2 rounded-lg font-bold text-white transition-all ${page === lastPageIndex ? "bg-gray-500 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"
                    }`}
                onClick={() => setPage((current) => Math.min(lastPageIndex, current + 1))}
                disabled={page === lastPageIndex}
            >
                Next Page
            </button>
        </div>
    );
};
