"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Activity,
  Brain,
  TrendingUp,
  Info,
  Download,
  Stethoscope,
} from "lucide-react";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Condition {
  id: string;
  name: string;
  likelihood: "possible" | "probable";
  evidence: string[];
  recommendation: string;
}

export interface AnalysisResult {
  scanId: string;
  timestamp: string;
  scanType: string;
  findings: Finding[];
  regions: BrainRegion[];
  confidence: number;
  summary: string;
  conditions?: Condition[];
}

interface Finding {
  id: string;
  label: string;
  severity: "normal" | "mild" | "moderate" | "severe";
  description: string;
}

interface BrainRegion {
  name: string;
  activity: number;
  status: "normal" | "elevated" | "reduced";
}

// ── Style maps ────────────────────────────────────────────────────────────────

const SEVERITY_STYLES = {
  normal:   "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  mild:     "text-yellow-400  bg-yellow-400/10  border-yellow-400/20",
  moderate: "text-orange-400  bg-orange-400/10  border-orange-400/20",
  severe:   "text-red-400     bg-red-400/10     border-red-400/20",
};

const SEVERITY_ICONS = {
  normal:   CheckCircle2,
  mild:     Info,
  moderate: AlertCircle,
  severe:   AlertCircle,
};

const LIKELIHOOD_STYLES = {
  possible: "text-amber-400  bg-amber-400/10  border-amber-400/25",
  probable: "text-orange-400 bg-orange-400/10 border-orange-400/25",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ActivityBar({ value, status }: { value: number; status: BrainRegion["status"] }) {
  const color = status === "normal" ? "#f9a8d4" : status === "elevated" ? "#f97316" : "#60a5fa";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-white/40 w-8 text-right">{value}%</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnalysisResults({ result }: { result: AnalysisResult }) {
  const [downloading, setDownloading] = useState(false);

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 18;

      // Header
      doc.setFillColor(10, 10, 10);
      doc.rect(0, 0, pageW, 30, "F");
      doc.setTextColor(249, 168, 212);
      doc.setFontSize(17);
      doc.setFont("helvetica", "bold");
      doc.text("NueroScan AI", margin, 18);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(200, 200, 200);
      doc.text("Brain Scan Analysis Report", pageW - margin, 18, { align: "right" });

      // Meta
      let y = 40;
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(`Scan ID: ${result.scanId}`, margin, y);
      doc.text(`Type: ${result.scanType}`, pageW / 2, y);
      y += 6;
      doc.text(`Date: ${new Date(result.timestamp).toLocaleString()}`, margin, y);
      doc.text(`Confidence: ${result.confidence}%`, pageW / 2, y);

      // Divider
      y += 9;
      doc.setDrawColor(249, 168, 212);
      doc.setLineWidth(0.4);
      doc.line(margin, y, pageW - margin, y);

      // Summary
      y += 8;
      doc.setFontSize(10.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text("Summary", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(55, 55, 55);
      const summaryLines = doc.splitTextToSize(result.summary, pageW - margin * 2);
      doc.text(summaryLines, margin, y);
      y += summaryLines.length * 5 + 8;

      // Detected conditions
      if (result.conditions && result.conditions.length > 0) {
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 20, 20);
        doc.text("Detected Conditions", margin, y);
        y += 3;
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [["Condition", "Likelihood", "Supporting Evidence", "Recommendation"]],
          body: result.conditions.map((c) => [
            c.name,
            c.likelihood.toUpperCase(),
            c.evidence.join("; "),
            c.recommendation,
          ]),
          headStyles: { fillColor: [251, 146, 60], textColor: [0, 0, 0], fontSize: 8, fontStyle: "bold" },
          bodyStyles: { fontSize: 7.5, textColor: [40, 40, 40] },
          columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 22 } },
          alternateRowStyles: { fillColor: [255, 253, 248] },
          styles: { overflow: "linebreak" },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = (doc as any).lastAutoTable?.finalY ?? y + 30;
        y += 10;
      }

      // Findings
      doc.setFontSize(10.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text("Findings", margin, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Finding", "Severity", "Description"]],
        body: result.findings.map((f) => [f.label, f.severity.toUpperCase(), f.description]),
        headStyles: { fillColor: [249, 168, 212], textColor: [0, 0, 0], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5, textColor: [40, 40, 40] },
        columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 24 } },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        styles: { overflow: "linebreak" },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable?.finalY ?? y + 40;
      y += 10;

      // Regional activity
      doc.setFontSize(10.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text("Signal / Regional Activity", margin, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Region / Band", "Activity", "Status"]],
        body: result.regions.map((r) => [r.name, `${r.activity}%`, r.status.toUpperCase()]),
        headStyles: { fillColor: [249, 168, 212], textColor: [0, 0, 0], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5, textColor: [40, 40, 40] },
        alternateRowStyles: { fillColor: [250, 250, 250] },
      });

      // Footer
      const totalPages = doc.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(160, 160, 160);
        doc.text("For research use only. Not intended for clinical diagnosis.", margin, 288);
        doc.text(`Page ${i} of ${totalPages}`, pageW - margin, 288, { align: "right" });
      }

      doc.save(`NueroScan-${result.scanId}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header card */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-[#f9a8d4]" />
              <span className="text-[#f9a8d4] text-sm font-medium">{result.scanType}</span>
            </div>
            <p className="text-white/40 text-xs font-mono">ID: {result.scanId}</p>
          </div>
          <div className="flex items-start gap-3">
            <button
              onClick={downloadPDF}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#f9a8d4] border border-[rgba(249,168,212,0.25)] hover:bg-[rgba(249,168,212,0.08)] hover:border-[rgba(249,168,212,0.45)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              {downloading ? "Generating…" : "Download PDF"}
            </button>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">{result.confidence}%</div>
              <div className="text-white/40 text-xs">confidence</div>
            </div>
          </div>
        </div>
        <div className="h-px bg-[rgba(249,168,212,0.1)] mb-4" />
        <p className="text-white/70 text-sm leading-relaxed">{result.summary}</p>
      </div>

      {/* Detected Conditions */}
      {result.conditions && result.conditions.length > 0 && (
        <div>
          <h3 className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
            <Stethoscope className="w-3.5 h-3.5" /> Detected Conditions
          </h3>
          <div className="space-y-3">
            {result.conditions.map((condition, i) => (
              <motion.div
                key={condition.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-xl p-4 border border-orange-400/15 bg-orange-400/[0.04]"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="text-white font-semibold text-sm">{condition.name}</span>
                  <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs border font-medium ${LIKELIHOOD_STYLES[condition.likelihood]}`}>
                    {condition.likelihood}
                  </span>
                </div>
                <ul className="space-y-0.5 mb-2.5">
                  {condition.evidence.map((e, j) => (
                    <li key={j} className="text-white/50 text-xs flex items-start gap-1.5">
                      <span className="text-orange-400/60 mt-0.5 flex-shrink-0">›</span>
                      {e}
                    </li>
                  ))}
                </ul>
                <p className="text-white/35 text-xs italic leading-relaxed border-t border-white/5 pt-2">
                  {condition.recommendation}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Findings */}
      <div>
        <h3 className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" /> Findings
        </h3>
        <div className="space-y-3">
          {result.findings.map((finding, i) => {
            const Icon = SEVERITY_ICONS[finding.severity];
            return (
              <motion.div
                key={finding.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="glass-card rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex-shrink-0 p-1 rounded-lg border ${SEVERITY_STYLES[finding.severity]}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white text-sm font-medium">{finding.label}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${SEVERITY_STYLES[finding.severity]}`}>
                        {finding.severity}
                      </span>
                    </div>
                    <p className="text-white/50 text-xs leading-relaxed">{finding.description}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Signal / Regional activity */}
      <div>
        <h3 className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" /> Signal / Regional Activity
        </h3>
        <div className="glass-card rounded-2xl p-5 space-y-4">
          {result.regions.map((region, i) => (
            <motion.div key={region.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.06 }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-white/70 text-xs">{region.name}</span>
                <span className={`text-xs ${region.status === "normal" ? "text-[#f9a8d4]" : region.status === "elevated" ? "text-orange-400" : "text-blue-400"}`}>
                  {region.status}
                </span>
              </div>
              <ActivityBar value={region.activity} status={region.status} />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex gap-3 p-4 rounded-xl bg-[rgba(249,168,212,0.04)] border border-[rgba(249,168,212,0.1)]">
        <TrendingUp className="w-4 h-4 text-[#f9a8d4]/60 flex-shrink-0 mt-0.5" />
        <p className="text-white/35 text-xs leading-relaxed">
          This analysis is AI-generated for research purposes only and does not constitute medical advice.
          Always consult a qualified neurologist or clinician for diagnosis and treatment decisions.
        </p>
      </div>
    </motion.div>
  );
}
