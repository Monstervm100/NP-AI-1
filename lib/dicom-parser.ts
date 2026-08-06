// Minimal DICOM (.dcm) reader for UNCOMPRESSED images → renders the slice to a
// PNG the vision AI can read. Handles Explicit/Implicit VR Little-Endian (the
// common uncompressed transfer syntaxes); rejects compressed (JPEG/RLE) with a
// clear message. Reference: DICOM PS3.5 (data structures & encoding).

export interface DicomResult {
  slices: string[];   // base64 PNG (no data: prefix) — one slice
  width: number;
  height: number;
}

const LONG_VR = new Set(["OB", "OW", "OF", "SQ", "UT", "UN"]);

export async function parseDicom(file: File): Promise<DicomResult> {
  const buf = await file.arrayBuffer();
  const dv = new DataView(buf);
  const ascii = (off: number, len: number) => {
    let s = ""; for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i)); return s;
  };

  // Preamble (128 bytes) + "DICM" magic. Some files omit it.
  let pos = 0;
  if (buf.byteLength > 132 && ascii(128, 4) === "DICM") pos = 132;

  let implicit = false;          // VR encoding for the main dataset
  let bigEndian = false;
  let transferSyntax = "";

  let rows = 0, cols = 0, bitsAllocated = 16, pixelRep = 0;
  let photometric = "MONOCHROME2";
  let slope = 1, intercept = 0;
  let winCenter = NaN, winWidth = NaN;
  let pixOff = -1;

  while (pos + 8 <= buf.byteLength) {
    const inMeta = dv.getUint16(pos, true) === 0x0002; // meta group 0002 is always explicit LE
    const le = inMeta ? true : !bigEndian;
    const group = dv.getUint16(pos, le);
    const element = dv.getUint16(pos + 2, le);

    const explicit = inMeta ? true : !implicit;
    let length: number, valuePos: number, vr = "";
    if (explicit) {
      vr = ascii(pos + 4, 2);
      if (LONG_VR.has(vr)) { length = dv.getUint32(pos + 8, le); valuePos = pos + 12; }
      else { length = dv.getUint16(pos + 6, le); valuePos = pos + 8; }
    } else {
      length = dv.getUint32(pos + 4, le); valuePos = pos + 8;
    }

    if (length === 0xffffffff) throw new Error("Encapsulated/compressed DICOM not supported — export as uncompressed.");
    if (valuePos + length > buf.byteLength) length = buf.byteLength - valuePos;

    const txt = () => ascii(valuePos, length).replace(/\0+$/, "").trim();
    if (group === 0x0002 && element === 0x0010) {
      transferSyntax = txt();
      if (transferSyntax === "1.2.840.10008.1.2") implicit = true;
      else if (transferSyntax === "1.2.840.10008.1.2.2") bigEndian = true;
    } else if (group === 0x0028 && element === 0x0010) rows = dv.getUint16(valuePos, le);
    else if (group === 0x0028 && element === 0x0011) cols = dv.getUint16(valuePos, le);
    else if (group === 0x0028 && element === 0x0100) bitsAllocated = dv.getUint16(valuePos, le);
    else if (group === 0x0028 && element === 0x0103) pixelRep = dv.getUint16(valuePos, le);
    else if (group === 0x0028 && element === 0x0004) photometric = txt();
    else if (group === 0x0028 && element === 0x1052) intercept = parseFloat(txt()) || 0;
    else if (group === 0x0028 && element === 0x1053) slope = parseFloat(txt()) || 1;
    else if (group === 0x0028 && element === 0x1050) winCenter = parseFloat(txt().split("\\")[0]);
    else if (group === 0x0028 && element === 0x1051) winWidth = parseFloat(txt().split("\\")[0]);
    else if (group === 0x7fe0 && element === 0x0010) { pixOff = valuePos; break; }

    pos = valuePos + length + (length % 2); // elements are even-length padded
  }

  if (transferSyntax.startsWith("1.2.840.10008.1.2.4") || transferSyntax.startsWith("1.2.840.10008.1.2.5")) {
    throw new Error("Compressed DICOM (JPEG/JPEG2000/RLE) not supported — export as uncompressed.");
  }
  if (pixOff < 0 || !rows || !cols) throw new Error("No readable image data found in DICOM file.");

  const le = !bigEndian;
  const n = rows * cols;
  const px = new Float64Array(n);
  if (bitsAllocated === 8) {
    for (let i = 0; i < n; i++) px[i] = (pixelRep ? dv.getInt8(pixOff + i) : dv.getUint8(pixOff + i)) * slope + intercept;
  } else {
    for (let i = 0; i < n; i++) px[i] = (pixelRep ? dv.getInt16(pixOff + i * 2, le) : dv.getUint16(pixOff + i * 2, le)) * slope + intercept;
  }

  // Display window: DICOM window if present, else robust 2nd–98th percentile.
  let lo: number, hi: number;
  if (isFinite(winCenter) && isFinite(winWidth) && winWidth > 0) {
    lo = winCenter - winWidth / 2; hi = winCenter + winWidth / 2;
  } else {
    const sorted = Float64Array.from(px).sort();
    lo = sorted[Math.floor(n * 0.02)]; hi = sorted[Math.floor(n * 0.98)] || (lo + 1);
  }
  const range = hi - lo || 1;
  const invert = photometric === "MONOCHROME1";

  const canvas = document.createElement("canvas");
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");
  const img = ctx.createImageData(cols, rows);
  for (let i = 0; i < n; i++) {
    let v = (px[i] - lo) / range;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    if (invert) v = 1 - v;
    const g = Math.round(v * 255);
    const p = i * 4;
    img.data[p] = g; img.data[p + 1] = g; img.data[p + 2] = g; img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const pngBase64 = canvas.toDataURL("image/png").split(",")[1];

  return { slices: [pngBase64], width: cols, height: rows };
}
