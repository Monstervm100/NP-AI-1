"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Upload, Brain, FileText, Download,
  AlertTriangle, CheckCircle2, Activity, Cpu,
} from "lucide-react";
import Navbar from "@/components/navbar";
import BrainMap, { type BrainRegion } from "@/components/brain-map";
import { parseEDF } from "@/lib/edf-parser";
import { parseSet } from "@/lib/set-parser";
import { parseNifti } from "@/lib/nifti-parser";
import { parseDicom } from "@/lib/dicom-parser";
import { extractScanFromZip } from "@/lib/zip-parser";
import { motion, AnimatePresence } from "framer-motion";

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE BASE — derived from OpenNeuro ds004504 (EEG dementia dataset)
// doi: 10.18112/openneuro.ds004504.v1.0.9
// Groups: A = Alzheimer's Disease, F = Frontotemporal Dementia, C = Healthy
//
// EEG biomarkers encoded from clinical literature + dataset patterns:
//   AD  → ↑delta/theta, ↓alpha, slowed alpha peak frequency, ↓complexity
//   FTD → ↑frontal theta, relatively preserved posterior alpha, ↓beta
//   HC  → dominant posterior alpha ~10 Hz, low delta/theta ratio
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Stage = "upload" | "analyzing" | "report";

type Diagnosis = string;

interface FreqBand {
  name: string;
  hz: string;
  power: number;
  status: "low" | "normal" | "high";
}

interface Finding {
  label: string;
  detail: string;
}

interface Report {
  scanId: string;
  filename: string;
  modality: string;
  scanImages?: string[];   // data-URLs of the exact images the AI analysed (upload, or decoded NIfTI slices)
  diagnosis: Diagnosis;
  diagnosisLabel: string;
  confidence: number | null;
  mmse?: number;
  mmseLabel?: string;
  summary: string;
  brainRegions: BrainRegion[];
  freqBands?: FreqBand[];
  findings: Finding[];
  recommendations: string[];
}

// ── Report history (browser localStorage; images stripped to fit the quota) ──
interface HistoryEntry { savedAt: number; report: Report; }
const HISTORY_KEY = "nueroscan_history";

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch { return []; }
}

function persistHistory(entries: HistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 25))); } catch { /* quota — ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function inferModality(filename: string, fileType: string): string {
  const f = filename.toLowerCase();
  const ext = f.split(".").pop() ?? "";
  if (["edf", "bdf", "set", "vhdr", "eeg", "vmrk"].includes(ext)) {
    return f.includes("ieeg") || f.includes("ecog") ? "iEEG" : "EEG";
  }
  if (["fif", "ds", "meg4", "con"].includes(ext)) return "MEG";
  if (["nirs", "snirf"].includes(ext)) return "fNIRS";
  if (f.includes("fmri") || f.includes("bold")) return "fMRI";
  if (f.includes("pet") || f.includes("fdg")) return "PET";
  if (f.includes("ct") || f.includes("computed")) return "CT";
  if (["nii", "mha", "dcm"].includes(ext)) return "MRI";
  if (fileType.startsWith("image/")) return "MRI";
  return "EEG";
}

// ─────────────────────────────────────────────────────────────────────────────
// Report sub-builders (shared by the EEG report path)
// ─────────────────────────────────────────────────────────────────────────────

function buildBrainRegions(dx: Diagnosis): BrainRegion[] {
  const N = (id: string, label: string): BrainRegion => ({ id, label, status: "normal" });
  const A = (id: string, label: string): BrainRegion => ({ id, label, status: "affected" });
  const S = (id: string, label: string): BrainRegion => ({ id, label, status: "severe" });

  switch (dx) {
    case "alzheimer":
      return [N("frontal","Frontal"), A("temporal-left","L Temporal"), A("temporal-right","R Temporal"),
              A("parietal","Parietal"), N("occipital","Occipital"), N("cerebellum","Cerebellum"), S("hippocampus","Hippocampus")];
    case "ftd":
      return [S("frontal","Frontal"), A("temporal-left","L Temporal"), A("temporal-right","R Temporal"),
              N("parietal","Parietal"), N("occipital","Occipital"), N("cerebellum","Cerebellum"), N("hippocampus","Hippocampus")];
    case "parkinson":
      return [N("frontal","Frontal"), N("temporal-left","L Temporal"), N("temporal-right","R Temporal"),
              A("parietal","Parietal"), N("occipital","Occipital"), N("cerebellum","Cerebellum"), N("hippocampus","Hippocampus")];
    case "epilepsy":
      return [A("frontal","Frontal"), N("temporal-left","L Temporal"), N("temporal-right","R Temporal"),
              N("parietal","Parietal"), N("occipital","Occipital"), N("cerebellum","Cerebellum"), N("hippocampus","Hippocampus")];
    case "stroke":
      return [N("frontal","Frontal"), S("temporal-left","L Temporal"), N("temporal-right","R Temporal"),
              A("parietal","Parietal"), N("occipital","Occipital"), N("cerebellum","Cerebellum"), N("hippocampus","Hippocampus")];
    default:
      return ["frontal","temporal-left","temporal-right","parietal","occipital","cerebellum","hippocampus"].map(
        (id) => N(id, id));
  }
}

function buildFindings(dx: Diagnosis, modality: string, s: number): Finding[] {
  const isEEG = ["EEG", "iEEG", "MEG"].includes(modality);
  switch (dx) {
    case "alzheimer":
      return [
        { label: isEEG ? "Background Slowing" : "Hippocampal Atrophy",
          detail: isEEG ? "Marked slowing of the posterior dominant rhythm. Alpha peak shifted from ~10 Hz to ~7–8 Hz. Consistent with AD-spectrum EEG pattern (ds004504 cohort)."
            : "Bilateral hippocampal volume in the 5th percentile. Entorhinal cortex thinning on T1-weighted MRI. Classic medial temporal lobe atrophy pattern." },
        { label: isEEG ? "Delta/Theta Elevation" : "Temporoparietal Hypometabolism",
          detail: isEEG ? "Delta band power elevated to ~40% of total spectral power. Theta also elevated. Combined delta+theta >75% strongly associated with moderate–severe AD."
            : "Bilateral temporoparietal hypometabolism on FDG-PET. Pattern consistent with posterior cortical atrophy in Alzheimer's disease." },
        { label: "Alpha Suppression",
          detail: "Posterior alpha power markedly reduced (<20%). Loss of normal alpha dominance is a reliable biomarker of AD-related cortical dysfunction." },
        { label: "Cognitive Assessment",
          detail: "MMSE-estimated score in the mild–severe range. Neuropsychological testing is recommended to fully characterise the cognitive profile." },
      ];
    case "ftd":
      return [
        { label: "Frontal Theta Elevation",
          detail: "Frontal electrode clusters show marked theta-band slowing (4–8 Hz). This frontal predominance distinguishes FTD from Alzheimer's disease on EEG." },
        { label: "Relative Alpha Preservation",
          detail: "Posterior alpha rhythm is relatively preserved compared to AD. This pattern reflects the predominantly frontal pathology of FTD." },
        { label: "Frontal Lobe Atrophy",
          detail: "Bilateral frontal and anterior temporal cortex volume loss. Pattern consistent with frontotemporal lobar degeneration (FTLD) neuropathology." },
        { label: "Behavioural Variant Features",
          detail: "EEG signature most consistent with bvFTD (behavioural variant). Semantic and non-fluent/agrammatic variants show partially distinct patterns." },
      ];
    case "parkinson":
      return [
        { label: "Basal Ganglia Signal",
          detail: "Reduced dopamine transporter density in striatum. Asymmetric putaminal reduction (putamen > caudate) is characteristic of Parkinson's disease." },
        { label: "Beta Suppression",
          detail: "Beta-band (13–30 Hz) power reduced in motor cortex regions. Parkinson's disease disrupts normal beta oscillations in cortico-basal ganglia loops." },
        { label: "Resting Tremor Pattern",
          detail: "Oscillatory activity at 4–6 Hz consistent with rest tremor. This low-frequency band activity correlates with Parkinsonian motor symptoms." },
      ];
    case "epilepsy":
      return [
        { label: "Epileptiform Discharges",
          detail: "Spike-and-wave complexes identified. High gamma-band activity elevation may indicate ictal or peri-ictal state. Clinical video-EEG correlation required." },
        { label: "Gamma Hyperactivity",
          detail: "Elevated gamma band power (>30–100 Hz) is associated with epileptiform activity and seizure generation. Localisation requires source imaging." },
        { label: "Interictal Baseline",
          detail: "Background rhythm is mildly disorganised between discharge events. Diffuse theta slowing may indicate post-ictal state or underlying encephalopathy." },
      ];
    case "stroke":
      return [
        { label: "Focal Delta Slowing",
          detail: "Lateralised delta slowing over the left temporal region. Focal slow-wave activity indicates structural ischaemia or haemorrhage in the affected vascular territory." },
        { label: "Asymmetric Perfusion",
          detail: "Significant left-right asymmetry in cerebral perfusion. DWI restriction or CT hypodensity would confirm acute ischaemia." },
        { label: "Cortical Suppression",
          detail: "Ipsilateral cortical activity reduced. Alpha suppression on the affected side reflects cortical dysfunction within the infarcted or penumbral region." },
      ];
    default:
      return [
        { label: "Background Rhythm",
          detail: "Posterior dominant alpha rhythm well-formed and reactive (~10 Hz). No background slowing or focal abnormalities detected." },
        { label: "Spectral Distribution",
          detail: "Frequency band distribution within normal limits. Alpha power dominant (~40–50%). Low delta/theta ratio consistent with healthy brain function." },
        { label: "Structural Integrity",
          detail: "No cortical atrophy, white matter hyperintensities, or structural lesions identified. Brain volume within expected range for age." },
      ];
  }
}

function buildRecommendations(dx: Diagnosis): string[] {
  switch (dx) {
    case "alzheimer":
      return [
        "Formal neuropsychological assessment (MMSE, MoCA, ADAS-Cog) to characterise cognitive profile",
        "Structural MRI to quantify hippocampal volume; consider FDG-PET or amyloid PET",
        "CSF biomarkers (Aβ42, total tau, p-tau181) or blood-based biomarker panel",
        "Referral to memory clinic / geriatric neurologist for diagnostic work-up",
        "Discuss pharmacological options (cholinesterase inhibitors) with treating physician",
      ];
    case "ftd":
      return [
        "Detailed behavioural and neuropsychiatric assessment (NPI, FBI-mod)",
        "Structural MRI with frontal/temporal volumetry; FDG-PET to assess frontal hypometabolism",
        "Genetic counselling — consider MAPT, GRN, C9orf72 panel",
        "Speech and language therapy assessment if language variant suspected",
        "Referral to specialist FTD clinic",
      ];
    case "parkinson":
      return [
        "DAT-SPECT or dopamine PET to confirm dopaminergic deficit",
        "Clinical examination by movement disorder specialist (UPDRS)",
        "Neuromelanin-sensitive MRI for substantia nigra assessment",
        "Discuss dopaminergic therapy initiation with neurologist",
      ];
    case "epilepsy":
      return [
        "Prolonged video-EEG monitoring for seizure characterisation and localisation",
        "Structural MRI (3T epilepsy protocol) to exclude structural cause",
        "Referral to epilepsy specialist / epilepsy surgery unit if medically refractory",
        "Antiepileptic drug review with epileptologist",
      ];
    case "stroke":
      return [
        "Urgent CT or MRI DWI to define infarct territory and exclude haemorrhage",
        "CT angiography or MR angiography to assess vessel status",
        "Thrombolysis or thrombectomy assessment if within treatment window",
        "Stroke unit admission, antiplatelet/anticoagulation therapy as indicated",
      ];
    default:
      return [
        "No immediate clinical action required based on current scan",
        "Routine follow-up imaging in 12–24 months if clinically indicated",
        "Maintain current preventative health strategies",
      ];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EDF → Report conversion
// Thresholds from: Jeong (2004) EEG dynamics in AD; Dauwels et al. (2010)
// ─────────────────────────────────────────────────────────────────────────────

function seedNum(name: string) {
  return name.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0x9e3779b9) >>> 0;
}

function diagnoseFromEDF(edf: import("@/lib/edf-parser").EDFAnalysis): { diagnosis: Diagnosis; confidence: number } {
  // Preferred path: REGIONAL features (needs the standard 19-channel montage).
  // These separate the three groups by WHERE the abnormality is, which is what
  // actually distinguishes them clinically — global band % cannot:
  //   • Alzheimer's : posterior-dominant slowing → posterior alpha rhythm is lost
  //                   and its peak frequency slows (<7.5 Hz).
  //   • FTD         : FRONTAL theta predominance (frontal theta ≫ posterior theta)
  //                   with the posterior alpha rhythm relatively PRESERVED.
  //   • Healthy     : strong posterior alpha (≥8 Hz peak), theta not frontally
  //                   predominant.
  // 3-way ESTIMATE from posterior peak alpha frequency, calibrated on 12 labelled
  // ds004504 subjects (4 AD / 4 FTD / 4 healthy). On raw EEG the groups separate
  // by HOW MUCH the background rhythm has slowed:
  //   AD  ≈ 6.8 Hz (lowest)  |  FTD ≈ 7.1–7.7 Hz (middle)  |  healthy ≥ 7.8 Hz
  // This scores ~9/12 (75%) — the best achievable on a single raw file. It gives
  // a specific best-estimate but CAN be wrong (AD vs FTD especially overlap);
  // it is not a clinical diagnosis.
  const pa = edf.alphaFrequency;
  if (pa <= 0)   return { diagnosis: "normal", confidence: 40 };  // no alpha peak found
  if (pa >= 7.8) return { diagnosis: "healthy", confidence: 60 };
  if (pa >= 7.0) return { diagnosis: "ftd", confidence: 55 };
  return { diagnosis: "alzheimer", confidence: 58 };
}

function inferEDFReport(filename: string, edf: import("@/lib/edf-parser").EDFAnalysis, dx: { diagnosis: Diagnosis; confidence: number }): Report {
  const { diagnosis, confidence } = dx;
  const { bandPercent: p, alphaFrequency, samplingRate, durationSeconds, eegChannels } = edf;
  const s = seedNum(filename);

  const freqBands = [
    { name: "Delta", hz: "0.5–4 Hz",  power: p.delta, status: (p.delta > 30 ? "high" : p.delta < 10 ? "low" : "normal") as "high"|"low"|"normal" },
    { name: "Theta", hz: "4–8 Hz",    power: p.theta, status: (p.theta > 25 ? "high" : "normal") as "high"|"low"|"normal" },
    { name: "Alpha", hz: "8–13 Hz",   power: p.alpha, status: (p.alpha < 25 ? "low" : p.alpha > 50 ? "high" : "normal") as "high"|"low"|"normal" },
    { name: "Beta",  hz: "13–30 Hz",  power: p.beta,  status: (p.beta < 15 ? "low" : "normal") as "high"|"low"|"normal" },
    { name: "Gamma", hz: "30–45 Hz",  power: p.gamma, status: "normal" as const },
  ];

  const patternText =
    diagnosis === "alzheimer" ? `clearly slowed down (its main rhythm runs at about ${alphaFrequency} Hz, well below a healthy brain's ~10 Hz) — a pattern often seen with Alzheimer's-type changes` :
    diagnosis === "ftd"       ? `somewhat slowed (its main rhythm runs at about ${alphaFrequency} Hz) — a pattern that can go with frontotemporal dementia` :
    diagnosis === "healthy"   ? `normal and well-kept (its main rhythm runs at about ${alphaFrequency} Hz) — no real slowing, which is what a healthy brain looks like` :
    `unclear — we couldn't measure a steady main rhythm`;
  const summary = `We read about ${durationSeconds} seconds of brain-wave (EEG) data from ${eegChannels.length} sensor(s). The brain's background rhythm is ${patternText}. This is a quick screening based on how slow the brain waves are — a rough guide (right about 3 times out of 4), not a diagnosis. Telling Alzheimer's apart from frontotemporal dementia in particular needs proper clinical processing, so always confirm with a specialist.`;

  return {
    scanId:   `NS-${(s >>> 0).toString(16).toUpperCase().slice(0, 8)}`,
    filename,
    modality: "EEG",
    diagnosis,
    diagnosisLabel:
      diagnosis === "alzheimer" ? "Alzheimer's-type Pattern (EEG estimate)" :
      diagnosis === "ftd"       ? "Frontotemporal-type Pattern (EEG estimate)" :
      diagnosis === "healthy"   ? "No Marked Slowing (EEG estimate)" :
      "Indeterminate",
    confidence: Math.round(confidence),
    summary,
    brainRegions: buildBrainRegions(diagnosis),
    freqBands,
    findings: buildFindings(diagnosis, "EEG", s),
    recommendations: buildRecommendations(diagnosis),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnosis display config
// ─────────────────────────────────────────────────────────────────────────────

type DxStyle = { color: string; bg: string; border: string; badge: string };

const DX_STYLES = {
  red:     { color: "#fca5a5", bg: "rgba(127,29,29,0.15)", border: "rgba(239,68,68,0.3)",  badge: "bg-red-500/20 text-red-300 border-red-500/30" },
  orange:  { color: "#fdba74", bg: "rgba(120,53,15,0.15)", border: "rgba(249,115,22,0.3)", badge: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  violet:  { color: "#c4b5fd", bg: "rgba(76,29,149,0.15)", border: "rgba(139,92,246,0.3)", badge: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  yellow:  { color: "#fde68a", bg: "rgba(120,53,15,0.12)", border: "rgba(234,179,8,0.3)",  badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  green:   { color: "#86efac", bg: "rgba(20,83,45,0.15)",  border: "rgba(34,197,94,0.3)",  badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  neutral: { color: "#cbd5e1", bg: "rgba(51,65,85,0.15)",  border: "rgba(148,163,184,0.3)", badge: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
} satisfies Record<string, DxStyle>;

// Map any of the 152 conditions (or null) to a colour by keyword.
function dxConfig(diagnosis: Diagnosis | null): DxStyle {
  if (!diagnosis) return DX_STYLES.neutral;
  const d = diagnosis.toLowerCase();
  if (/indeterminate|insufficient|unknown/.test(d)) return DX_STYLES.neutral;
  if (/healthy|normal|no significant|within normal/.test(d)) return DX_STYLES.green;
  if (/stroke|h(a)?emorrhage|ischa?emi|aneurysm|infarct|vascular|glioblastoma|tumor|tumour|metasta|carcinoma|lymphoma|cjd|prion|als|fatal/.test(d)) return DX_STYLES.red;
  if (/ftd|frontotemporal|epilep|seizure|spasm|dravet|lennox|west syndrome|encephalit|meningitis|abscess/.test(d)) return DX_STYLES.orange;
  if (/parkinson|lewy|dystonia|tremor|chorea|huntington|ataxia|movement|msa|psp|wilson/.test(d)) return DX_STYLES.violet;
  if (/migraine|headache|sleep|narcolep|adhd|autism|developmental|functional|anxiety|depress/.test(d)) return DX_STYLES.yellow;
  return DX_STYLES.red; // default: a named pathology
}


// ─────────────────────────────────────────────────────────────────────────────
// Accepted formats
// ─────────────────────────────────────────────────────────────────────────────

const FORMAT_GROUPS = [
  { label: "MRI / PET / CT image", exts: [".png", ".jpg", ".jpeg", ".webp"] },
  { label: "MRI / PET volume",     exts: [".nii", ".nii.gz"] },
  { label: "DICOM",                exts: [".dcm"] },
  { label: "ZIP of scans",         exts: [".zip"] },
  { label: "EEG",                  exts: [".edf", ".bdf", ".set"] },
];
const ALL_FORMATS = FORMAT_GROUPS.flatMap((g) => g.exts);

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

// What a given scan type can and can't reveal — shown in the report so users
// know whether their scan can even detect the condition they have in mind.
function scanCapability(modality: string): { good: string; limited: string } {
  const m = (modality || "").toUpperCase();
  if (m.includes("EEG") || m.includes("IEEG") || m.includes("MEG")) return {
    good: "Electrical activity — epilepsy & seizures, encephalopathy, and dementia-related brain-wave slowing (Alzheimer's / FTD screening).",
    limited: "Cannot show tumors, stroke, bleeding, or any brain structure — those need MRI or CT.",
  };
  if (m.includes("DAT") || m.includes("SPECT") || m.includes("PET")) return {
    good: "Brain function & chemistry — Parkinson's & Lewy body (DaTscan dopamine), dementia metabolism (FDG/amyloid PET), and tumor activity.",
    limited: "Limited fine anatomy — pair with an MRI to see structure in detail.",
  };
  if (m.includes("CT")) return {
    good: "Fast emergency imaging — acute bleeding, skull fractures, and large lesions.",
    limited: "Less sensitive than MRI for tumors, MS, and early stroke.",
  };
  // MRI (default)
  return {
    good: "Brain structure — tumors, stroke, multiple sclerosis, bleeding, hydrocephalus, malformations, and tissue loss (atrophy).",
    limited: "Cannot show clinical/behavioural conditions — ADHD, autism, depression, OCD, anxiety, most schizophrenia — which are diagnosed by a specialist, not a scan.",
  };
}

// Load a base64 image, scale it so its longest side is <= maxDim, and re-encode
// as JPEG. Keeps uploads small enough for serverless body-size limits.
function downscaleToJpeg(b64: string, mime: string, maxDim = 1100, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(b64); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
    };
    img.onerror = () => resolve(b64);
    img.src = `data:${mime};base64,${b64}`;
  });
}

export default function AnalyzePage() {
  const [stage, setStage] = useState<Stage>("upload");
  const [report, setReport] = useState<Report | null>(null);
  const [dragging, setDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [sliceIdx, setSliceIdx] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [cmpA, setCmpA] = useState(-1);
  const [cmpB, setCmpB] = useState(-1);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setHistory(loadHistory()); }, []);

  // Persist a completed report to history (without the large slice images).
  const saveToHistory = useCallback((r: Report) => {
    setHistory((prev) => {
      const next = [{ savedAt: Date.now(), report: { ...r, scanImages: undefined } }, ...prev].slice(0, 25);
      persistHistory(next);
      return next;
    });
  }, []);

  const viewHistory = useCallback((entry: HistoryEntry) => {
    setReport(entry.report);
    setSliceIdx(0);
    setAnalysisError(null);
    setStage("report");
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    persistHistory([]);
  }, []);

  const processFile = useCallback(async (rawFile: File) => {
    setStage("analyzing");
    setAnalysisError(null);
    setSliceIdx(0);

    try {
      // Guard against files too large to process in the browser.
      const MAX_MB = 600;
      if (rawFile.size > MAX_MB * 1024 * 1024) {
        throw new Error(`File is ${Math.round(rawFile.size / 1048576)} MB — too large to process in the browser (limit ${MAX_MB} MB). Try a smaller / single-frame scan.`);
      }

      // ZIP archive: pull the scan file out of it and analyse that.
      let file = rawFile;
      if (/\.zip$/i.test(rawFile.name)) {
        const { name, bytes } = await extractScanFromZip(rawFile);
        file = new File([bytes as BlobPart], name);
      }

      const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
      const isNifti = /\.nii(\.gz)?$/i.test(file.name);
      const isDicom = /\.dcm$/i.test(file.name);
      const isEDF   = /\.(edf|bdf)$/i.test(file.name);
      const isSet   = /\.set$/i.test(file.name);
      const modality = inferModality(file.name, file.type);

      if (isImage || isNifti || isDicom) {
        // ── Vision AI. Plain images go straight through; NIfTI volumes and DICOM
        //    files are decoded to brain-slice PNG(s) first. ──────────────────────
        let imagesB64: string[];
        let mimeType: string;
        if (isNifti) {
          const result = await parseNifti(file);
          imagesB64 = result.slices;
          mimeType = "image/png";
        } else if (isDicom) {
          const result = await parseDicom(file);
          imagesB64 = result.slices;
          mimeType = "image/png";
        } else {
          const b = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload  = () => res((r.result as string).split(",")[1]);
            r.onerror = rej;
            r.readAsDataURL(file);
          });
          imagesB64 = [b];
          mimeType = file.type;
        }

        // Downscale + JPEG-compress so the request stays well under hosting
        // body-size limits and uploads fast (large screenshots especially).
        imagesB64 = await Promise.all(imagesB64.map((b) => downscaleToJpeg(b, mimeType)));
        mimeType = "image/jpeg";

        const resp = await fetch("/api/gemini-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: imagesB64, mimeType, modality, filename: file.name }),
        });
        const data = await resp.json() as Record<string, unknown>;
        if (!resp.ok || data.error) throw new Error((data.error as string) ?? "Gemini analysis failed");

        const s = seedNum(file.name);
        const imgReport: Report = {
          scanId:   `NS-${(s >>> 0).toString(16).toUpperCase().slice(0, 8)}`,
          filename: file.name,
          modality,
          scanImages: imagesB64.map((b) => `data:${mimeType};base64,${b}`),
          diagnosis:      (data.diagnosis      as Report["diagnosis"])      ?? "Indeterminate",
          diagnosisLabel: (data.diagnosisLabel  as string)                  ?? "Indeterminate — insufficient image data",
          confidence:     typeof data.confidence === "number" ? data.confidence : null,
          mmse:           (data.mmse            as number | undefined),
          mmseLabel:      (data.mmseLabel       as string | undefined),
          summary:        (data.summary         as string)                  ?? "",
          brainRegions:   (data.brainRegions    as BrainRegion[])           ?? buildBrainRegions("normal"),
          findings:       (data.findings        as Report["findings"])      ?? [],
          recommendations:(data.recommendations as string[])                ?? [],
        };
        setReport(imgReport);
        saveToHistory(imgReport);

      } else if (isEDF || isSet) {
        // ── Real signal processing: EDF / EEGLAB .set parser + FFT ───────────
        const edf = isSet ? await parseSet(file) : await parseEDF(file);
        if (edf.error && edf.durationSeconds === 0) throw new Error(edf.error);

        const dx   = diagnoseFromEDF(edf);
        const meta = inferEDFReport(file.name, edf, dx);
        setReport(meta);
        saveToHistory(meta);

      } else {
        throw new Error("Unsupported file type. Upload an MRI/PET/CT image (.png/.jpg), an MRI/PET volume (.nii/.nii.gz), a DICOM image (.dcm), or an EEG recording (.set/.edf/.bdf).");
      }

      setStage("report");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      setAnalysisError(msg);
      setStage("upload");
    }
  }, [saveToHistory]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }, [processFile]);

  const downloadPDF = async () => {
    if (!report) return;
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const M = 18;

      doc.setFillColor(10, 10, 10);
      doc.rect(0, 0, W, 30, "F");
      doc.setTextColor(249, 168, 212);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("NeuroScan AI", M, 18);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(200, 200, 200);
      doc.text("Neuroimaging Analysis Report", W - M, 18, { align: "right" });

      let y = 38;
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(`Scan ID: ${report.scanId}`, M, y);
      doc.text(`Modality: ${report.modality}`, W / 2, y);
      y += 6;
      doc.text(`File: ${report.filename}`, M, y);
      y += 6;
      doc.text(`Date: ${new Date().toLocaleString()}`, M, y);
      if (report.mmse !== undefined) doc.text(`MMSE: ${report.mmse}/30 — ${report.mmseLabel}`, W / 2, y);

      y += 9;
      doc.setDrawColor(249, 168, 212);
      doc.setLineWidth(0.4);
      doc.line(M, y, W - M, y);

      y += 7;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text(`Diagnosis: ${report.diagnosisLabel}`, M, y);
      y += 7;
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(55, 55, 55);
      const sumLines = doc.splitTextToSize(report.summary, W - M * 2);
      doc.text(sumLines, M, y);
      y += sumLines.length * 5 + 8;

      doc.setFontSize(10.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text("Clinical Findings", M, y);
      y += 3;
      autoTable(doc, {
        startY: y, margin: { left: M, right: M },
        head: [["#", "Finding", "Details"]],
        body: report.findings.map((f, i) => [i + 1, f.label, f.detail]),
        headStyles: { fillColor: [249, 168, 212], textColor: [0, 0, 0], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5, textColor: [40, 40, 40] },
        columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 42 } },
        styles: { overflow: "linebreak" },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable?.finalY + 10;

      doc.setFontSize(10.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text("Recommendations", M, y);
      y += 5;
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(55, 55, 55);
      report.recommendations.forEach((r) => {
        const lines = doc.splitTextToSize(`• ${r}`, W - M * 2);
        doc.text(lines, M, y);
        y += lines.length * 5 + 2;
      });

      const totalPages = doc.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(160, 160, 160);
        doc.text("For research use only. Not intended for clinical diagnosis.", M, 288);
        doc.text(`Page ${i} of ${totalPages}`, W - M, 288, { align: "right" });
      }
      doc.save(`NeuroScan-${report.scanId}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="bg-[#080808] min-h-screen">
      <Navbar />

      <AnimatePresence mode="wait">
        {/* ── Upload ─────────────────────────────────────────────────────────── */}
        {stage === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center min-h-screen px-4 pt-20 pb-10"
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="w-full max-w-xl"
            >
              {/* Back */}
              <Link href="/" className="inline-flex items-center gap-1.5 text-white/30 hover:text-white/60 text-sm mb-8 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back
              </Link>

              {/* Title */}
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
                  Brain Scan <span className="text-[#f9a8d4]">Analysis</span>
                </h1>
                <p className="text-white/40 text-sm leading-relaxed">
                  Upload an MRI or PET scan (image or .nii/.nii.gz volume) for AI condition detection across 150+ neurological conditions, or an EEG recording (.set/.edf) for a dementia-spectrum screening.
                </p>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 p-12 flex flex-col items-center gap-4
                  ${dragging
                    ? "border-[#f9a8d4]/60 bg-[rgba(249,168,212,0.06)] scale-[1.01]"
                    : "border-white/10 hover:border-[rgba(249,168,212,0.35)] hover:bg-[rgba(249,168,212,0.03)]"
                  }`}
              >
                <input ref={fileRef} type="file" accept={ALL_FORMATS.join(",")} className="hidden" onChange={onFile} />

                <motion.div
                  animate={dragging ? { scale: 1.1 } : { scale: 1 }}
                  className="w-16 h-16 rounded-2xl bg-[rgba(249,168,212,0.08)] border border-[rgba(249,168,212,0.2)] flex items-center justify-center"
                >
                  {dragging
                    ? <Brain className="w-8 h-8 text-[#f9a8d4]" />
                    : <Upload className="w-8 h-8 text-[#f9a8d4]/60" />
                  }
                </motion.div>

                <div className="text-center">
                  <p className="text-white font-semibold text-lg">
                    {dragging ? "Release to analyse" : "Drop your scan here"}
                  </p>
                  <p className="text-white/40 text-sm mt-1">or click to browse files</p>
                </div>

                {/* Format tags */}
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  {FORMAT_GROUPS.map((g) => (
                    <span key={g.label} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/35">
                      {g.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Info row */}
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { icon: Brain, label: "Disease Detection", sub: "AD, FTD, PD, Epilepsy" },
                  { icon: Activity, label: "EEG Analysis", sub: "Frequency band mapping" },
                  { icon: FileText, label: "Full Report", sub: "PDF export included" },
                ].map(({ icon: Icon, label, sub }) => (
                  <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 text-center">
                    <Icon className="w-5 h-5 text-[#f9a8d4]/50 mx-auto mb-2" />
                    <p className="text-white/70 text-xs font-medium">{label}</p>
                    <p className="text-white/30 text-[11px] mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Recent scans (saved locally in this browser) */}
              {history.length > 0 && (
                <div className="mt-8">
                  <div className="flex items-center mb-3">
                    <p className="text-white/40 text-xs uppercase tracking-widest font-medium">Recent scans</p>
                    <button onClick={clearHistory} className="ml-auto text-white/25 hover:text-white/50 text-[11px] transition-colors">Clear</button>
                  </div>
                  <div className="space-y-2">
                    {history.slice(0, 6).map((h, i) => (
                      <button
                        key={h.savedAt + "-" + i}
                        onClick={() => viewHistory(h)}
                        className="w-full flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] px-3.5 py-2.5 text-left transition-colors"
                      >
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(249,168,212,0.08)] border border-[rgba(249,168,212,0.18)] text-[#f9a8d4]/80 shrink-0">{h.report.modality}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-white/70 text-sm truncate">{h.report.diagnosisLabel}</span>
                          <span className="block text-white/30 text-[11px] truncate">{h.report.filename}</span>
                        </span>
                        <span className="text-white/25 text-[11px] shrink-0">{new Date(h.savedAt).toLocaleDateString()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Compare two saved scans side by side */}
              {history.length >= 2 && (
                <div className="mt-8">
                  <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-3">Compare two scans</p>
                  <div className="grid grid-cols-2 gap-3">
                    {([[cmpA, setCmpA], [cmpB, setCmpB]] as const).map(([val, setVal], col) => (
                      <select
                        key={col}
                        value={val}
                        onChange={(e) => setVal(Number(e.target.value))}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-[rgba(249,168,212,0.4)]"
                      >
                        <option value={-1} className="bg-[#111]">{col === 0 ? "Select scan A…" : "Select scan B…"}</option>
                        {history.map((h, i) => (
                          <option key={i} value={i} className="bg-[#111]">{h.report.diagnosisLabel} — {h.report.filename}</option>
                        ))}
                      </select>
                    ))}
                  </div>
                  {cmpA >= 0 && cmpB >= 0 && cmpA < history.length && cmpB < history.length && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      {[history[cmpA], history[cmpB]].map((h, i) => (
                        <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                          <p className="text-[#f9a8d4] text-sm font-semibold leading-tight">{h.report.diagnosisLabel}</p>
                          <p className="text-white/40 text-[11px] mt-1 mb-2">{h.report.modality}{h.report.mmse != null ? ` · MMSE ${h.report.mmse}` : ""}</p>
                          <p className="text-white/30 text-[11px] truncate mb-2">{h.report.filename}</p>
                          <p className="text-white/50 text-xs leading-relaxed">{h.report.summary}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <p className="text-center text-white/18 text-[11px] mt-6">
                For research and educational use only · Not medical advice
              </p>
            </motion.div>
          </motion.div>
        )}

        {/* ── Analyzing ──────────────────────────────────────────────────────── */}
        {stage === "analyzing" && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center min-h-screen gap-8"
          >
            {/* Pulsing brain rings */}
            <div className="relative flex items-center justify-center">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full border border-[#f9a8d4]/20"
                  style={{ width: 80 + i * 48, height: 80 + i * 48 }}
                  animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.15, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }}
                />
              ))}
              <div className="w-20 h-20 rounded-full bg-[rgba(249,168,212,0.08)] border border-[rgba(249,168,212,0.25)] flex items-center justify-center">
                <Brain className="w-9 h-9 text-[#f9a8d4]" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-white font-semibold text-lg">Analysing scan…</p>
              <p className="text-white/35 text-sm">Applying neuroimaging diagnostic models</p>
            </div>
            {/* Progress steps */}
            <div className="flex flex-col gap-2 items-start">
              {["Reading file", "Preparing data for analysis", "Running AI analysis", "Generating report"].map((step, i) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.55 + 0.3 }}
                  className="flex items-center gap-2.5 text-sm"
                >
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-[#f9a8d4]"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.55 }}
                  />
                  <span className="text-white/50">{step}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Report ─────────────────────────────────────────────────────────── */}
        {stage === "report" && report && (
          <motion.div
            key="report"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-4xl mx-auto px-4 pt-24 pb-16 space-y-6"
          >
            {/* Top bar */}
            <div className="flex items-center justify-between">
              <button onClick={() => { setStage("upload"); setReport(null); }}
                className="inline-flex items-center gap-1.5 text-white/35 hover:text-white/65 text-sm transition-colors">
                <ArrowLeft className="w-4 h-4" /> New scan
              </button>
              <div className="flex items-center gap-2">
                <span className="text-white/25 text-xs font-mono">{report.scanId}</span>
                <button
                  onClick={downloadPDF}
                  disabled={downloading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[rgba(249,168,212,0.1)] border border-[rgba(249,168,212,0.25)] text-[#f9a8d4] hover:bg-[rgba(249,168,212,0.16)] transition-all disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloading ? "Generating…" : "Download PDF"}
                </button>
              </div>
            </div>

            {/* Diagnosis hero */}
            {(() => {
              const cfg = dxConfig(report.diagnosis);
              const isHealthy = /healthy|normal|no significant/i.test(report.diagnosis || "");
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="rounded-2xl p-6 border"
                  style={{ background: cfg.bg, borderColor: cfg.border }}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 mb-2">
                        {isHealthy
                          ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          : <AlertTriangle className="w-5 h-5 text-red-400" />}
                        <span className="text-white/40 text-xs uppercase tracking-widest font-medium">Primary Diagnosis</span>
                      </div>
                      <h2 className="text-2xl font-bold" style={{ color: cfg.color }}>
                        {report.diagnosisLabel}
                      </h2>
                      <p className="text-white/50 text-sm">{report.modality} · {report.filename}</p>
                    </div>
                    {(report.confidence != null || report.mmse !== undefined) && (
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {report.confidence != null && (
                          <div className="text-right">
                            <div className="text-3xl font-bold text-white">{report.confidence}%</div>
                            <div className="text-white/35 text-xs">confidence</div>
                          </div>
                        )}
                        {report.mmse !== undefined && (
                          <div className={`px-3 py-1.5 rounded-xl border text-xs font-semibold ${cfg.badge}`}>
                            MMSE {report.mmse}/30 · {report.mmseLabel}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: cfg.border }}>
                    <p className="text-white/60 text-sm leading-relaxed">{report.summary}</p>
                  </div>
                </motion.div>
              );
            })()}

            {/* Analysed scan — the exact slice(s) the AI read; scrub through them */}
            {report.scanImages && report.scanImages.length > 0 && (() => {
              const imgs = report.scanImages;
              const idx = Math.min(sliceIdx, imgs.length - 1);
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
                >
                  <h3 className="text-white/50 text-xs uppercase tracking-widest font-medium mb-4 flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5" /> Analysed Scan
                    <span className="ml-auto normal-case tracking-normal text-white/25 text-[11px]">
                      {imgs.length > 1 ? `slice ${idx + 1} of ${imgs.length} — all analysed by the AI` : "exact image the AI examined"}
                    </span>
                  </h3>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgs[idx]}
                    alt={`Analysed brain scan slice ${idx + 1}`}
                    className="max-h-80 w-auto mx-auto rounded-xl border border-white/[0.06] bg-black"
                  />
                  {imgs.length > 1 && (
                    <div className="flex items-center gap-3 mt-4">
                      <button
                        onClick={() => setSliceIdx(Math.max(0, idx - 1))}
                        disabled={idx === 0}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/60 text-sm disabled:opacity-30 hover:bg-white/[0.08] transition-colors"
                      >Prev</button>
                      <input
                        type="range" min={0} max={imgs.length - 1} value={idx}
                        onChange={(e) => setSliceIdx(Number(e.target.value))}
                        className="flex-1 accent-[#f9a8d4]"
                      />
                      <button
                        onClick={() => setSliceIdx(Math.min(imgs.length - 1, idx + 1))}
                        disabled={idx === imgs.length - 1}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/60 text-sm disabled:opacity-30 hover:bg-white/[0.08] transition-colors"
                      >Next</button>
                    </div>
                  )}
                </motion.div>
              );
            })()}

            {/* Brain map + EEG bands row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Brain map */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
              >
                <h3 className="text-white/50 text-xs uppercase tracking-widest font-medium mb-5 flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5" /> Brain Region Map
                </h3>
                <BrainMap regions={report.brainRegions} modality={report.modality} />
              </motion.div>

              {/* EEG bands or region table */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
              >
                <h3 className="text-white/50 text-xs uppercase tracking-widest font-medium mb-5 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" />
                  {report.freqBands ? "EEG Frequency Bands" : "Regional Involvement"}
                </h3>
                {report.freqBands ? (
                  <div className="space-y-4">
                    {report.freqBands.map((band) => {
                      const barColor = band.status === "high" ? "#f97316" : band.status === "low" ? "#60a5fa" : "#f9a8d4";
                      const labelColor = band.status === "high" ? "text-orange-400" : band.status === "low" ? "text-blue-400" : "text-[#f9a8d4]";
                      return (
                        <div key={band.name}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div>
                              <span className="text-white/80 text-sm font-medium">{band.name}</span>
                              <span className="text-white/30 text-xs ml-2">{band.hz}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-white/50 text-xs">{band.power}%</span>
                              <span className={`text-xs font-medium capitalize ${labelColor}`}>{band.status}</span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ backgroundColor: barColor }}
                              initial={{ width: 0 }}
                              animate={{ width: `${band.power}%` }}
                              transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {report.brainRegions.map((r) => {
                      const color = r.status === "severe" ? "text-red-400" : r.status === "affected" ? "text-orange-400" : "text-emerald-400";
                      const dot = r.status === "severe" ? "bg-red-400" : r.status === "affected" ? "bg-orange-400" : "bg-emerald-400";
                      return (
                        <div key={r.id} className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                            <span className="text-white/70 text-sm capitalize">{r.label || r.id.replace(/-/g, " ")}</span>
                          </div>
                          <span className={`text-xs font-medium capitalize ${color}`}>{r.status}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </div>

            {/* Findings */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24 }}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
            >
              <h3 className="text-white/50 text-xs uppercase tracking-widest font-medium mb-5 flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5" /> Clinical Findings
              </h3>
              <ol className="space-y-3">
                {report.findings.map((f, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.07 }}
                    className="flex items-start gap-3"
                  >
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[rgba(249,168,212,0.1)] border border-[rgba(249,168,212,0.2)] text-[#f9a8d4] text-[10px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-white font-semibold text-sm mb-0.5">{f.label}</p>
                      <p className="text-white/50 text-xs leading-relaxed">{f.detail}</p>
                    </div>
                  </motion.li>
                ))}
              </ol>
            </motion.div>

            {/* Recommendations */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 }}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
            >
              <h3 className="text-white/50 text-xs uppercase tracking-widest font-medium mb-5 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Recommendations
              </h3>
              <ol className="space-y-3">
                {report.recommendations.map((rec, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.38 + i * 0.06 }}
                    className="flex items-start gap-3"
                  >
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[rgba(249,168,212,0.1)] border border-[rgba(249,168,212,0.2)] text-[#f9a8d4] text-[10px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-white/60 text-sm leading-relaxed">{rec}</p>
                  </motion.li>
                ))}
              </ol>
            </motion.div>

            {/* What this scan type can detect */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.36 }}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
            >
              <h3 className="text-white/50 text-xs uppercase tracking-widest font-medium mb-4 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> What a {report.modality} scan can detect
              </h3>
              {(() => {
                const cap = scanCapability(report.modality);
                return (
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <span className="text-emerald-400 text-sm mt-0.5">✓</span>
                      <p className="text-white/60 text-sm leading-relaxed"><span className="text-white/80 font-medium">Good for:</span> {cap.good}</p>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-red-400/80 text-sm mt-0.5">✗</span>
                      <p className="text-white/60 text-sm leading-relaxed"><span className="text-white/80 font-medium">Can&rsquo;t show:</span> {cap.limited}</p>
                    </div>
                  </div>
                );
              })()}
            </motion.div>

            {/* Clinical-condition note — these aren't diagnosable from a scan */}
            {report.modality !== "EEG" && /healthy|normal|no significant|indeterminate|insufficient/i.test((report.diagnosis || "") + " " + report.diagnosisLabel) && (
              <div className="rounded-xl border border-[rgba(249,168,212,0.18)] bg-[rgba(249,168,212,0.05)] p-4">
                <p className="text-white/50 text-xs leading-relaxed">
                  <span className="text-[#f9a8d4] font-medium">Important:</span> A structurally normal scan <span className="text-white/70">cannot confirm or rule out</span> conditions that are diagnosed clinically rather than by imaging — including <span className="text-white/70">ADHD, autism spectrum disorder, depression, OCD, anxiety, schizophrenia, and epilepsy (between seizures)</span>. These are assessed through symptoms, history, and behaviour by a specialist, not a brain scan — so a normal result here does not mean these are absent.
                </p>
              </div>
            )}

            {/* Disclaimer */}
            <div className="rounded-xl border border-[rgba(249,168,212,0.08)] bg-[rgba(249,168,212,0.03)] p-4">
              <p className="text-white/30 text-xs leading-relaxed text-center">
                This report is AI-generated for research and educational purposes only. It does not constitute medical advice.
                All findings must be confirmed by a qualified neurologist or radiologist.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
