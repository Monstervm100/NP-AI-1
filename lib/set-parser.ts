// Real EEGLAB .set (MATLAB v5 MAT-file) parser with Cooley-Tukey FFT.
// EEGLAB saves EEG structs via `save(file, '-struct', 'EEG')`, so each field
// (srate, nbchan, pnts, data, ...) is a separate top-level MAT variable.
// Reference: MATLAB Level 5 MAT-File Format (uncompressed v6 files).
// Returns the same EDFAnalysis shape as lib/edf-parser.ts so the report
// pipeline (diagnoseFromEDF / inferEDFReport) is reused unchanged.

import type { EDFAnalysis } from "./edf-parser";

// ─── MATLAB v5 data types & classes ──────────────────────────────────────────
const miINT8 = 1, miUINT8 = 2, miINT16 = 3, miUINT16 = 4, miINT32 = 5,
      miUINT32 = 6, miSINGLE = 7, miDOUBLE = 9, miINT64 = 12, miUINT64 = 13,
      miMATRIX = 14, miCOMPRESSED = 15;
const mxCHAR = 4, mxSINGLE = 7, mxDOUBLE = 6;

interface Tag { type: number; nbytes: number; dataOff: number; next: number; }

function readTag(dv: DataView, off: number): Tag {
  const w0 = dv.getUint32(off, true);
  // Small-element (compact) format: upper 16 bits hold byte count.
  if ((w0 >>> 16) !== 0) {
    return { type: w0 & 0xffff, nbytes: (w0 >>> 16) & 0xffff, dataOff: off + 4, next: off + 8 };
  }
  const nbytes = dv.getUint32(off + 4, true);
  const padded = nbytes + ((8 - (nbytes % 8)) % 8);
  return { type: w0, nbytes, dataOff: off + 8, next: off + 8 + padded };
}

function readNumber(dv: DataView, off: number, type: number): number {
  switch (type) {
    case miDOUBLE: return dv.getFloat64(off, true);
    case miSINGLE: return dv.getFloat32(off, true);
    case miINT32:  return dv.getInt32(off, true);
    case miUINT32: return dv.getUint32(off, true);
    case miINT16:  return dv.getInt16(off, true);
    case miUINT16: return dv.getUint16(off, true);
    case miINT8:   return dv.getInt8(off);
    case miUINT8:  return dv.getUint8(off);
    case miINT64:  return Number(dv.getBigInt64(off, true));
    case miUINT64: return Number(dv.getBigUint64(off, true));
    default:       return dv.getFloat64(off, true);
  }
}

function byteSize(type: number): number {
  switch (type) {
    case miINT8: case miUINT8: return 1;
    case miINT16: case miUINT16: return 2;
    case miINT32: case miUINT32: case miSINGLE: return 4;
    case miDOUBLE: case miINT64: case miUINT64: return 8;
    default: return 8;
  }
}

interface MatVar {
  name: string;
  klass: number;
  dims: number[];
  dataType: number;   // mi* type of the real-part payload
  dataOff: number;    // byte offset of the real-part payload
  dataBytes: number;
}

// Parse one miMATRIX element into its metadata (does not copy bulk data).
function parseMatrix(dv: DataView, dataOff: number): MatVar | null {
  let p = dataOff;
  const flags = readTag(dv, p);
  const klass = dv.getUint32(flags.dataOff, true) & 0xff;
  p = flags.next;

  const dimsTag = readTag(dv, p);
  const ndim = dimsTag.nbytes / 4;
  const dims: number[] = [];
  for (let i = 0; i < ndim; i++) dims.push(dv.getInt32(dimsTag.dataOff + i * 4, true));
  p = dimsTag.next;

  const nameTag = readTag(dv, p);
  let name = "";
  for (let i = 0; i < nameTag.nbytes; i++) name += String.fromCharCode(dv.getUint8(nameTag.dataOff + i));
  p = nameTag.next;

  const realTag = readTag(dv, p);
  return { name, klass, dims, dataType: realTag.type, dataOff: realTag.dataOff, dataBytes: realTag.nbytes };
}

// ─── FFT (Cooley-Tukey radix-2) ──────────────────────────────────────────────
export function nextPow2(n: number) { let p = 1; while (p < n) p <<= 1; return p; }
function hann(n: number) { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1))); return w; }
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cRe = 1, cIm = 0;
      for (let k = 0; k < (len >> 1); k++) {
        const h = len >> 1;
        const tRe = re[i+k+h]*cRe - im[i+k+h]*cIm, tIm = re[i+k+h]*cIm + im[i+k+h]*cRe;
        re[i+k+h] = re[i+k] - tRe; im[i+k+h] = im[i+k] - tIm;
        re[i+k] += tRe; im[i+k] += tIm;
        const nc = cRe*wRe - cIm*wIm; cIm = cRe*wIm + cIm*wRe; cRe = nc;
      }
    }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function parseSet(file: File): Promise<EDFAnalysis> {
  const fail = (msg: string): EDFAnalysis => ({
    patientId: "Unknown", recordingId: "", startDate: "",
    samplingRate: 0, durationSeconds: 0, channelCount: 0, eegChannels: [],
    bandPower:   { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
    bandPercent: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
    alphaFrequency: 0, thetaBetaRatio: 0, slowWaveRatio: 0, error: msg,
  });

  try {
    const buf = await file.arrayBuffer();
    const dv = new DataView(buf);

    // Header check (first 4 bytes are "MATL")
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== "MATL") throw new Error("Not a MATLAB .set file");

    // Walk top-level elements (after the 128-byte header).
    let srate = 0, nbchan = 0, pnts = 0;
    let dataVar: MatVar | null = null;
    let off = 128;
    while (off + 8 <= buf.byteLength) {
      const tag = readTag(dv, off);
      if (tag.type === miCOMPRESSED) {
        throw new Error("This .set file is compressed (MAT v7). Re-export from EEGLAB as '-v6', or upload the matching .edf/.bdf file.");
      }
      if (tag.type === miMATRIX && tag.nbytes > 0) {
        const v = parseMatrix(dv, tag.dataOff);
        if (v) {
          if (v.name === "srate")  srate  = readNumber(dv, v.dataOff, v.dataType);
          if (v.name === "nbchan") nbchan = readNumber(dv, v.dataOff, v.dataType);
          if (v.name === "pnts")   pnts   = readNumber(dv, v.dataOff, v.dataType);
          if (v.name === "data")   dataVar = v;
        }
      }
      off = tag.next;
    }

    if (!dataVar) throw new Error("No EEG data found inside .set file");
    if (dataVar.klass === mxCHAR) {
      throw new Error("This .set stores its signal in a separate .fdt file — please upload the .fdt alongside, or use the .edf version.");
    }
    if (dataVar.klass !== mxSINGLE && dataVar.klass !== mxDOUBLE) {
      throw new Error("Unsupported EEG data encoding in .set file");
    }

    // dims = [nbchan, pnts] (column-major). Fall back to header scalars.
    if (dataVar.dims.length >= 2) { nbchan = nbchan || dataVar.dims[0]; pnts = pnts || dataVar.dims[1]; }
    if (!srate || srate < 1) srate = 500; // ds004504 default
    if (!nbchan || nbchan < 1) throw new Error("Could not determine channel count");

    const elemSize = byteSize(dataVar.dataType);
    const totalCols = Math.floor(dataVar.dataBytes / (elemSize * nbchan));
    pnts = pnts || totalCols;

    const read = dataVar.dataType === miSINGLE
      ? (o: number) => dv.getFloat32(o, true)
      : (o: number) => dv.getFloat64(o, true);

    // WELCH'S METHOD: split the recording into overlapping 4-second segments,
    // compute a windowed PSD for each, and average them. A single window is far
    // too noisy — alpha estimates swing wildly between subjects of the same group
    // — so we average ~60 segments across the recording for a stable spectrum
    // (the standard EEG approach). We also accumulate FRONTAL and POSTERIOR
    // regional spectra separately so we can separate FTD (frontal theta
    // predominance, preserved posterior alpha) from AD (posterior alpha loss).
    //
    // ds004504 uses the standard 19-channel 10-20 montage in this fixed order:
    //   0 Fp1  1 Fp2  2 F7  3 F3  4 Fz  5 F4  6 F8   ← FRONTAL
    //   7 T3   8 C3   9 Cz 10 C4 11 T4               (central)
    //  12 T5  13 P3  14 Pz 15 P4 16 T6 17 O1 18 O2   ← POSTERIOR
    const FRONTAL = new Set([0, 1, 2, 3, 4, 5, 6]);
    const POSTERIOR = new Set([12, 13, 14, 15, 16, 17, 18]);
    const hasMontage = nbchan >= 19;

    const seg = Math.min(Math.floor(srate * 4), totalCols); // 4 s segment
    if (seg < 64) throw new Error("Recording too short to analyse");
    const step = Math.max(1, Math.floor(seg / 2));          // 50% overlap
    const maxSamples = Math.min(totalCols, Math.floor(srate * 120)); // up to 120 s
    const nSeg = Math.max(1, Math.floor((maxSamples - seg) / step) + 1);

    const M = nextPow2(seg);
    const nUniq = Math.floor(M / 2) + 1;
    const psd = new Float64Array(nUniq);
    const psdF = new Float64Array(nUniq);
    const psdP = new Float64Array(nUniq);
    const win = hann(seg);
    let winSum = 0;
    for (let i = 0; i < seg; i++) winSum += win[i];
    const normf = 1 / (winSum * winSum);
    let nF = 0, nP = 0;
    const re = new Float64Array(M), im = new Float64Array(M);
    const x = new Float64Array(seg);

    for (let c = 0; c < nbchan; c++) {
      const isF = hasMontage && FRONTAL.has(c);
      const isP = hasMontage && POSTERIOR.has(c);
      if (isF) nF++;
      if (isP) nP++;

      for (let sgi = 0; sgi < nSeg; sgi++) {
        const start = sgi * step;
        for (let t = 0; t < seg; t++) x[t] = read(dataVar.dataOff + ((start + t) * nbchan + c) * elemSize);

        // Linear detrend — removes DC + slow drift before the FFT.
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (let i = 0; i < seg; i++) { sx += i; sy += x[i]; sxx += i * i; sxy += i * x[i]; }
        const denom = seg * sxx - sx * sx;
        if (denom !== 0) {
          const slope = (seg * sxy - sx * sy) / denom;
          const inter = (sy - slope * sx) / seg;
          for (let i = 0; i < seg; i++) x[i] -= slope * i + inter;
        }

        re.fill(0); im.fill(0);
        for (let i = 0; i < seg; i++) re[i] = x[i] * win[i];
        fft(re, im);
        for (let i = 0; i < nUniq; i++) {
          const power = (re[i] * re[i] + im[i] * im[i]) * normf * (i > 0 && i < nUniq - 1 ? 2 : 1);
          psd[i] += power;
          if (isF) psdF[i] += power;
          if (isP) psdP[i] += power;
        }
      }
    }
    // Normalise: each bin was summed over (channels × segments).
    const gN = nbchan * nSeg || 1;
    for (let i = 0; i < nUniq; i++) psd[i] /= gN;
    if (nF) { const dN = nF * nSeg; for (let i = 0; i < nUniq; i++) psdF[i] /= dN; }
    if (nP) { const dN = nP * nSeg; for (let i = 0; i < nUniq; i++) psdP[i] /= dN; }

    const freqRes = srate / M;
    // High-pass floor at 1.5 Hz: raw .set data carries large sub-1.5 Hz drift /
    // sweat artifacts that EEGLAB's ASR step removes but a parser cannot. We
    // exclude that band so it doesn't masquerade as pathological delta slowing.
    const HP_HZ = 1.5;
    const bpOf = (arr: Float64Array, lo: number, hi: number) => {
      let s = 0;
      const start = Math.max(Math.floor(Math.max(lo, HP_HZ) / freqRes), 1);
      for (let i = start; i <= Math.min(nUniq - 1, Math.ceil(hi / freqRes)); i++) s += arr[i];
      return s;
    };
    const peakAlphaOf = (arr: Float64Array) => {
      let hz = 10, pow = -Infinity;
      for (let i = Math.floor(7 / freqRes); i <= Math.min(Math.ceil(13 / freqRes), nUniq - 1); i++) {
        if (arr[i] > pow) { pow = arr[i]; hz = i * freqRes; }
      }
      return Math.round(hz * 10) / 10;
    };

    const delta = bpOf(psd, 0.5, 4), theta = bpOf(psd, 4, 8), alpha = bpOf(psd, 8, 13), beta = bpOf(psd, 13, 30), gamma = bpOf(psd, 30, 45);
    const total = delta + theta + alpha + beta + gamma;
    const pct = (v: number) => total > 0 ? Math.round((v / total) * 100) : 0;

    let regional: EDFAnalysis["regional"];
    if (nF > 0 && nP > 0) {
      const fTheta = bpOf(psdF, 4, 8), fTotal = bpOf(psdF, 0.5, 45);
      const pAlpha = bpOf(psdP, 8, 13), pTotal = bpOf(psdP, 0.5, 45), pTheta = bpOf(psdP, 4, 8);
      regional = {
        frontalThetaPct: fTotal > 0 ? Math.round((fTheta / fTotal) * 100) : 0,
        posteriorAlphaPct: pTotal > 0 ? Math.round((pAlpha / pTotal) * 100) : 0,
        posteriorPeakAlpha: peakAlphaOf(psdP),
        frontalPosteriorThetaRatio: pTheta > 0 ? Math.round((fTheta / pTheta) * 100) / 100 : 0,
      };
    }

    return {
      patientId: file.name.replace(/\.set$/i, ""),
      recordingId: "EEGLAB .set",
      startDate: "",
      samplingRate: Math.round(srate),
      durationSeconds: Math.round(pnts / srate),
      channelCount: nbchan,
      eegChannels: Array.from({ length: Math.min(nbchan, 19) }, (_, i) => `Ch${i + 1}`),
      bandPower:   { delta, theta, alpha, beta, gamma },
      bandPercent: { delta: pct(delta), theta: pct(theta), alpha: pct(alpha), beta: pct(beta), gamma: pct(gamma) },
      alphaFrequency: peakAlphaOf(psd),
      thetaBetaRatio: beta > 0 ? Math.round((theta / beta) * 100) / 100 : 0,
      slowWaveRatio:  (alpha + beta) > 0 ? Math.round(((delta + theta) / (alpha + beta)) * 100) / 100 : 0,
      regional,
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "SET parse failed");
  }
}
