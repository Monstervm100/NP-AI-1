import { describe, it, expect } from "vitest";
import { fft, nextPow2 } from "../set-parser";

describe("nextPow2", () => {
  it("rounds up to the next power of two", () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(100)).toBe(128);
    expect(nextPow2(256)).toBe(256);
    expect(nextPow2(257)).toBe(512);
  });
});

describe("fft", () => {
  it("locates a pure sine wave at the correct frequency bin", () => {
    const N = 256;   // power of two
    const fs = 256;  // Hz
    const f0 = 10;   // Hz — lands exactly on bin 10 (f0 * N / fs)
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let n = 0; n < N; n++) re[n] = Math.sin(2 * Math.PI * f0 * n / fs);

    fft(re, im);

    // Peak of the one-sided magnitude spectrum (skip DC).
    let peakBin = 0, peakMag = -Infinity;
    for (let k = 1; k < N / 2; k++) {
      const mag = Math.hypot(re[k], im[k]);
      if (mag > peakMag) { peakMag = mag; peakBin = k; }
    }
    const peakHz = peakBin * fs / N;
    expect(peakHz).toBeCloseTo(f0, 1);
  });

  it("puts a constant (DC) signal almost entirely in bin 0", () => {
    const N = 64;
    const re = new Float64Array(N).fill(3);
    const im = new Float64Array(N);

    fft(re, im);

    const dcMag = Math.hypot(re[0], im[0]);
    let otherMax = 0;
    for (let k = 1; k < N; k++) otherMax = Math.max(otherMax, Math.hypot(re[k], im[k]));
    expect(dcMag).toBeGreaterThan(otherMax * 100);
  });

  it("is linear: FFT(a+b) == FFT(a) + FFT(b)", () => {
    const N = 32;
    const mk = (f: number) => { const r = new Float64Array(N); for (let n = 0; n < N; n++) r[n] = Math.cos(2 * Math.PI * f * n / N); return r; };
    const a = mk(3), b = mk(7);
    const sum = new Float64Array(N); for (let i = 0; i < N; i++) sum[i] = a[i] + b[i];

    const aRe = Float64Array.from(a), aIm = new Float64Array(N); fft(aRe, aIm);
    const bRe = Float64Array.from(b), bIm = new Float64Array(N); fft(bRe, bIm);
    const sRe = Float64Array.from(sum), sIm = new Float64Array(N); fft(sRe, sIm);

    for (let k = 0; k < N; k++) {
      expect(sRe[k]).toBeCloseTo(aRe[k] + bRe[k], 6);
      expect(sIm[k]).toBeCloseTo(aIm[k] + bIm[k], 6);
    }
  });
});
