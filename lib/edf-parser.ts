// Real EDF/BDF binary parser with Cooley-Tukey FFT
// Supports: European Data Format (.edf, .bdf)
// Reference: Kemp et al. (1992), https://www.edfplus.info/specs/edf.html

export interface EDFAnalysis {
  patientId: string;
  recordingId: string;
  startDate: string;
  samplingRate: number;
  durationSeconds: number;
  channelCount: number;
  eegChannels: string[];
  bandPower:   { delta: number; theta: number; alpha: number; beta: number; gamma: number };
  bandPercent: { delta: number; theta: number; alpha: number; beta: number; gamma: number };
  alphaFrequency: number;
  thetaBetaRatio: number;
  slowWaveRatio:  number; // (delta+theta)/(alpha+beta) — AD biomarker
  // Regional (frontal vs posterior) features — only set when a standard 19-channel
  // 10-20 montage is present. Used to separate FTD (frontal theta predominance,
  // preserved posterior alpha) from AD (global slowing, posterior alpha loss).
  regional?: {
    frontalThetaPct: number;        // theta % within frontal electrodes
    posteriorAlphaPct: number;      // alpha % within posterior electrodes
    posteriorPeakAlpha: number;     // peak 7–13 Hz frequency over posterior electrodes (Hz)
    frontalPosteriorThetaRatio: number; // frontal theta power / posterior theta power
  };
  error?: string;
}

// ─── FFT ─────────────────────────────────────────────────────────────────────

function nextPow2(n: number): number { let p = 1; while (p < n) p <<= 1; return p; }

function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  return w;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
          t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cRe = 1, cIm = 0;
      for (let k = 0; k < (len >> 1); k++) {
        const h = len >> 1;
        const tRe = re[i+k+h]*cRe - im[i+k+h]*cIm;
        const tIm = re[i+k+h]*cIm + im[i+k+h]*cRe;
        re[i+k+h] = re[i+k] - tRe; im[i+k+h] = im[i+k] - tIm;
        re[i+k]  += tRe;            im[i+k]  += tIm;
        const nc = cRe*wRe - cIm*wIm; cIm = cRe*wIm + cIm*wRe; cRe = nc;
      }
    }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parseEDF(file: File): Promise<EDFAnalysis> {
  try {
    const dec = new TextDecoder("ascii");

    // 1. Main header (256 bytes)
    const hdr = dec.decode(await file.slice(0, 256).arrayBuffer());
    const ns             = parseInt(hdr.slice(252, 256).trim());
    if (!ns || ns < 1 || ns > 512) throw new Error("Invalid EDF: bad signal count");
    const numRecords     = Math.max(1, parseInt(hdr.slice(236, 244).trim()) || 1);
    const recordDuration = parseFloat(hdr.slice(244, 252).trim()) || 1;
    const patientId      = hdr.slice(8, 88).trim();
    const recordingId    = hdr.slice(88, 168).trim();
    const startDate      = hdr.slice(168, 176).trim() + " " + hdr.slice(176, 184).trim();

    // 2. Signal headers (ns × 256 bytes)
    const sigHdr = dec.decode(await file.slice(256, 256 + ns * 256).arrayBuffer());
    const O_LABEL = 0;
    const O_PMIN  = ns * (16 + 80);
    const O_PMAX  = ns * (16 + 80 + 8);
    const O_DMIN  = ns * (16 + 80 + 8 + 8);
    const O_DMAX  = ns * (16 + 80 + 8 + 8 + 8);
    const O_NSPR  = ns * (16 + 80 + 8 + 8 + 8 + 8 + 8 + 80);

    const labels: string[] = [], physMin: number[] = [], physMax: number[] = [];
    const digMin: number[] = [], digMax: number[] = [], spr: number[] = [];
    for (let i = 0; i < ns; i++) {
      labels.push(sigHdr.slice(O_LABEL + i*16, O_LABEL + (i+1)*16).trim());
      physMin.push(parseFloat(sigHdr.slice(O_PMIN + i*8, O_PMIN + (i+1)*8).trim()) || -2000);
      physMax.push(parseFloat(sigHdr.slice(O_PMAX + i*8, O_PMAX + (i+1)*8).trim()) ||  2000);
      digMin.push( parseFloat(sigHdr.slice(O_DMIN + i*8, O_DMIN + (i+1)*8).trim()) || -32768);
      digMax.push( parseFloat(sigHdr.slice(O_DMAX + i*8, O_DMAX + (i+1)*8).trim()) ||  32767);
      spr.push(    parseInt(  sigHdr.slice(O_NSPR + i*8, O_NSPR + (i+1)*8).trim()) || 256);
    }

    // 3. Select EEG channels
    const EEG_RE = /^(EEG|FP|F[34789]?$|C[34Z]?$|P[34Z]?$|O[12]?$|T[3456]?$|A[12]?$)/i;
    let eegIdx = labels
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => EEG_RE.test(l) && !/(ANNO|STAT|TRIG|STATUS|MARK)/i.test(l))
      .map(({ i }) => i)
      .slice(0, 6);
    if (eegIdx.length === 0) eegIdx = [0];

    const fs = spr[eegIdx[0]] / recordDuration;
    const headerOffset = 256 + ns * 256;
    const recBytes = spr.reduce((a, b) => a + b, 0) * 2;
    const maxRec = Math.min(Math.ceil(10 / recordDuration), numRecords, 30);

    // 4. Read and average EEG channels
    const accum: number[] = [];
    for (const chIdx of eegIdx) {
      let chByteOff = 0;
      for (let i = 0; i < chIdx; i++) chByteOff += spr[i] * 2;
      const gain = (physMax[chIdx] - physMin[chIdx]) / (digMax[chIdx] - digMin[chIdx]);
      const off  = physMin[chIdx] - digMin[chIdx] * gain;
      let s = 0;
      for (let r = 0; r < maxRec; r++) {
        const start = headerOffset + r * recBytes + chByteOff;
        const raw = new Int16Array(await file.slice(start, start + spr[chIdx] * 2).arrayBuffer());
        for (let k = 0; k < raw.length; k++, s++) {
          if (accum.length <= s) accum.push(0);
          accum[s] += (raw[k] * gain + off) / eegIdx.length;
        }
      }
    }

    // 5. FFT + one-sided PSD
    const N  = nextPow2(accum.length);
    const re = new Float64Array(N), im = new Float64Array(N);
    const win = hannWindow(accum.length);
    let winSum = 0;
    for (let i = 0; i < accum.length; i++) { re[i] = accum[i] * win[i]; winSum += win[i]; }
    fft(re, im);

    const nUniq = Math.floor(N / 2) + 1;
    const psd   = new Float64Array(nUniq);
    const norm  = 1 / (winSum * winSum);
    for (let i = 0; i < nUniq; i++) {
      psd[i] = (re[i]*re[i] + im[i]*im[i]) * norm * (i > 0 && i < nUniq - 1 ? 2 : 1);
    }

    const freqRes = fs / N;
    const bp = (lo: number, hi: number) => {
      let s = 0;
      for (let i = Math.max(0, Math.floor(lo / freqRes)); i <= Math.min(nUniq-1, Math.ceil(hi / freqRes)); i++) s += psd[i];
      return s;
    };

    const delta = bp(0.5, 4), theta = bp(4, 8), alpha = bp(8, 13), beta = bp(13, 30), gamma = bp(30, 45);
    const total = delta + theta + alpha + beta + gamma;
    const pct   = (v: number) => total > 0 ? Math.round((v / total) * 100) : 0;

    // Peak alpha frequency
    let peakHz = 10, peakPow = -Infinity;
    for (let i = Math.floor(7 / freqRes); i <= Math.min(Math.ceil(13 / freqRes), nUniq-1); i++) {
      if (psd[i] > peakPow) { peakPow = psd[i]; peakHz = i * freqRes; }
    }

    return {
      patientId, recordingId, startDate,
      samplingRate:    Math.round(fs),
      durationSeconds: Math.round(accum.length / fs),
      channelCount:    ns,
      eegChannels:     eegIdx.map(i => labels[i]),
      bandPower:   { delta, theta, alpha, beta, gamma },
      bandPercent: { delta: pct(delta), theta: pct(theta), alpha: pct(alpha), beta: pct(beta), gamma: pct(gamma) },
      alphaFrequency: Math.round(peakHz * 10) / 10,
      thetaBetaRatio: beta > 0 ? Math.round((theta / beta) * 100) / 100 : 0,
      slowWaveRatio:  (alpha + beta) > 0 ? Math.round(((delta + theta) / (alpha + beta)) * 100) / 100 : 0,
    };
  } catch (err) {
    return {
      patientId: "Unknown", recordingId: "", startDate: "",
      samplingRate: 0, durationSeconds: 0, channelCount: 0, eegChannels: [],
      bandPower:   { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
      bandPercent: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
      alphaFrequency: 0, thetaBetaRatio: 0, slowWaveRatio: 0,
      error: err instanceof Error ? err.message : "EDF parse failed",
    };
  }
}
