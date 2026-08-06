"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowRight, Brain, ChevronRight, FileStack, Activity, Layers, Lock, Eye, History, FileText, Sparkles } from "lucide-react";
import Navbar from "@/components/navbar";
import dynamic from "next/dynamic";

const ParticleCanvas = dynamic(
  () => import("@/components/ui/particle-effect-for-hero"),
  { ssr: false }
);

const Brain3D = dynamic(() => import("@/components/brain-3d"), { ssr: false });

// The things NeuroScan does that a general AI chatbot can't — the UVPs.
const FEATURES = [
  { icon: FileStack, title: "Opens real scan files", description: "MRI, PET, CT, NIfTI, DICOM and EEG — formats a normal chatbot can't even open." },
  { icon: Activity, title: "Real signal processing", description: "Runs genuine frequency analysis on raw EEG brainwaves, not just a description of them." },
  { icon: Layers, title: "Reads 3D volumes", description: "Decodes a full brain volume and reviews several slices, so nothing gets missed." },
  { icon: Lock, title: "Private by design", description: "Files are decoded in your browser — the raw scan never leaves your device." },
  { icon: Eye, title: "Full transparency", description: "Every report shows you the exact image the AI looked at — no black box." },
  { icon: History, title: "History & compare", description: "Saves your past scans and lets you line up two side by side." },
  { icon: FileText, title: "Easy-to-read reports", description: "Plain-language results, a brain-region map, and the best scan to confirm it." },
  { icon: Sparkles, title: "150+ conditions", description: "Built-in knowledge across more than 150 neurological conditions." },
];

const STEPS = [
  { step: "01", title: "Upload your scan", body: "Drag in an MRI, PET, CT, NIfTI, DICOM or EEG file straight from your device." },
  { step: "02", title: "The AI reads it", body: "Your file is decoded and analysed — structure, regions, and brain-wave patterns." },
  { step: "03", title: "Get a clear report", body: "A plain-language result with the affected regions and what to do next." },
];

export default function Home() {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/views").then((r) => r.json()).then((d) => setViews(d.count)).catch(() => {});
  }, []);

  return (
    <main className="bg-black min-h-screen">
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative w-full h-screen overflow-hidden">
        <ParticleCanvas />
        <div className="absolute inset-0 z-[1] pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_40%,black_100%)]" />

        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none px-4">
          <div className="max-w-4xl w-full text-center space-y-8">
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-semibold tracking-tighter leading-none">
              <span className="gradient-text pink-text-glow">AI-Powered</span>
              <br />
              <span className="text-white">Neuroimaging</span>
            </h1>

            <p className="max-w-xl mx-auto text-lg text-white/50 font-light leading-relaxed">
              Upload a brain scan and get a clear, easy-to-read report in seconds —
              MRI, PET, CT, NIfTI, DICOM or EEG.
            </p>

            <div className="pt-4 pointer-events-auto flex items-center justify-center gap-4 flex-wrap">
              <Link
                href="/analyze"
                className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full font-medium text-sm text-black bg-[#f9a8d4] hover:bg-[#fbcfe8] transition-all hover:shadow-[0_0_30px_rgba(249,168,212,0.45)] active:scale-95"
              >
                Analyze a scan
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-medium text-sm text-white/70 border border-white/15 hover:border-[rgba(249,168,212,0.3)] hover:text-white transition-all"
              >
                See how it works
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── UVPs ── */}
      <section id="features" className="py-24 px-6 md:px-10 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[#f9a8d4] text-xs font-medium uppercase tracking-[0.2em] mb-4">What NeuroScan can do</p>
          <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
            Things a normal AI can&rsquo;t
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-10">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex gap-4">
              <Icon className="w-5 h-5 text-[#f9a8d4] flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <div>
                <h3 className="text-white font-medium text-base mb-1">{title}</h3>
                <p className="text-white/45 text-sm leading-relaxed font-light">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3D Brain / How it works ── */}
      <section id="how-it-works" className="py-12 px-6 md:px-10 max-w-6xl mx-auto">
        <div className="rounded-3xl overflow-hidden border border-[rgba(249,168,212,0.1)] bg-[#080408] relative">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#f9a8d4]/4 blur-[120px]" />
          </div>

          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-[560px]">
            <div className="relative h-[360px] lg:h-auto">
              <Brain3D />
            </div>

            <div className="flex flex-col justify-center p-10 lg:p-14">
              <p className="text-[#f9a8d4] text-xs font-medium uppercase tracking-[0.2em] mb-5">How it works</p>
              <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight mb-10">
                AI that understands neuroanatomy
              </h2>

              <div className="space-y-8">
                {STEPS.map(({ step, title, body }) => (
                  <div key={step} className="flex gap-5">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full border border-[rgba(249,168,212,0.25)] bg-[rgba(249,168,212,0.06)] flex items-center justify-center">
                      <span className="text-[#f9a8d4] text-xs font-mono font-medium">{step}</span>
                    </div>
                    <div>
                      <h4 className="text-white font-medium mb-1 text-sm">{title}</h4>
                      <p className="text-white/45 text-sm leading-relaxed font-light">{body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                href="/analyze"
                className="mt-10 inline-flex items-center gap-2 text-[#f9a8d4] text-sm font-medium hover:gap-3 transition-all"
              >
                Try it now <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 px-6 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-3xl md:text-5xl font-semibold text-white tracking-tight">Ready to see inside?</h2>
          <p className="text-white/45 text-lg font-light">Upload your first scan and get an easy-to-read report in seconds.</p>
          <Link
            href="/analyze"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full font-medium text-black bg-[#f9a8d4] hover:bg-[#fbcfe8] transition-all hover:shadow-[0_0_40px_rgba(249,168,212,0.4)] active:scale-95"
          >
            Start analyzing <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[rgba(249,168,212,0.08)] py-8 px-6 md:px-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-white/30 text-xs">
          <div className="flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-[#f9a8d4]/50" />
            <span>NeuroScan AI — For research use only</span>
          </div>
          <span>© 2026 NeuroScan. All rights reserved.</span>
          <div className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-[#f9a8d4]/40" />
            <span>{views !== null ? `${views.toLocaleString()} views` : "—"}</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
