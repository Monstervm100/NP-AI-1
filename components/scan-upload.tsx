"use client";

import { useState, useCallback } from "react";
import { Upload, FileImage, X, Brain, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ScanUploadProps {
  onAnalyze: (file: File) => void;
  isAnalyzing: boolean;
}

const ACCEPTED_FORMATS = [".dcm", ".nii", ".nii.gz", ".mha", ".png", ".jpg", ".jpeg"];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ScanUpload({ onAnalyze, isAnalyzing }: ScanUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    setFile(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile]
  );

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer
          ${dragOver
            ? "border-[#f9a8d4] bg-[#f9a8d4]/5 shadow-[0_0_40px_rgba(249,168,212,0.15)]"
            : "border-[rgba(249,168,212,0.2)] hover:border-[rgba(249,168,212,0.4)]"
          }`}
      >
        <label className="flex flex-col items-center justify-center py-14 px-8 cursor-pointer">
          <input
            type="file"
            accept={ACCEPTED_FORMATS.join(",")}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          <motion.div
            animate={dragOver ? { scale: 1.1, y: -4 } : { scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300 }}
            className="w-16 h-16 rounded-2xl bg-[#f9a8d4]/10 border border-[#f9a8d4]/20 flex items-center justify-center mb-5"
          >
            <Upload className="w-7 h-7 text-[#f9a8d4]" />
          </motion.div>

          <p className="text-white font-medium text-lg mb-2">Drop your scan here</p>
          <p className="text-white/40 text-sm text-center mb-4">or click to browse files</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {ACCEPTED_FORMATS.map((ext) => (
              <span key={ext} className="px-2.5 py-0.5 rounded-full bg-[rgba(249,168,212,0.08)] border border-[rgba(249,168,212,0.15)] text-[#f9a8d4]/70 text-xs font-mono">
                {ext}
              </span>
            ))}
          </div>
        </label>
      </div>

      <AnimatePresence>
        {file && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-4 p-4 rounded-xl glass-card"
          >
            <div className="w-10 h-10 rounded-lg bg-[#f9a8d4]/10 flex items-center justify-center flex-shrink-0">
              <FileImage className="w-5 h-5 text-[#f9a8d4]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{file.name}</p>
              <p className="text-white/40 text-xs mt-0.5">{formatBytes(file.size)}</p>
            </div>
            <button onClick={() => setFile(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => file && onAnalyze(file)}
        disabled={!file || isAnalyzing}
        className={`w-full py-4 rounded-2xl font-semibold text-sm flex items-center justify-center gap-3 transition-all duration-300
          ${file && !isAnalyzing
            ? "bg-[#f9a8d4] text-black hover:bg-[#fbcfe8] hover:shadow-[0_0_30px_rgba(249,168,212,0.4)] active:scale-[0.98]"
            : "bg-white/5 text-white/25 cursor-not-allowed"
          }`}
      >
        {isAnalyzing ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
            />
            Analyzing scan…
          </>
        ) : (
          <>
            <Brain className="w-4 h-4" />
            Analyze with AI
            <Zap className="w-3.5 h-3.5" />
          </>
        )}
      </button>

      <p className="text-center text-white/25 text-xs">
        Scans are processed securely and never stored permanently.
      </p>
    </div>
  );
}
