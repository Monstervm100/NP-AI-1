import Link from "next/link";
import { Brain } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 md:px-10 py-5">
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/15 to-transparent pointer-events-none" />

      <Link href="/" className="relative flex items-center gap-2.5 group">
        <div className="w-8 h-8 rounded-full bg-[#f9a8d4]/10 border border-[#f9a8d4]/30 flex items-center justify-center group-hover:bg-[#f9a8d4]/20 transition-all">
          <Brain className="w-4 h-4 text-[#f9a8d4]" />
        </div>
        <span className="text-white font-medium tracking-wide text-sm">
          Neuro<span className="text-[#f9a8d4]">Scan</span>
        </span>
      </Link>

      <Link
        href="/analyze"
        className="relative inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-black bg-[#f9a8d4] hover:bg-[#fbcfe8] transition-all hover:shadow-[0_0_20px_rgba(249,168,212,0.4)] active:scale-95"
      >
        Try the AI
      </Link>
    </nav>
  );
}
