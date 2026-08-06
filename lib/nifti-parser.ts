// NIfTI-1 (.nii / .nii.gz) decoder → renders a representative brain slice to a
// PNG so the vision AI can read it. This is how OpenNeuro MRI/PET volumes (3D
// number grids) become a 2D image the model can analyse.
// Reference: https://nifti.nimh.nih.gov/nifti-1

export interface NiftiResult {
  slices: string[];    // base64 PNGs (no data: prefix) of evenly-spaced brain slices
  width: number;
  height: number;
  depth: number;       // number of slices in the volume
}

const DT = { UINT8: 2, INT16: 4, INT32: 8, FLOAT32: 16, FLOAT64: 64, INT8: 256, UINT16: 512, UINT32: 768 };

async function maybeGunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] === 0x1f && head[1] === 0x8b) {
    // gzip — decompress with the platform DecompressionStream
    const ds = new DecompressionStream("gzip");
    const stream = new Blob([buf]).stream().pipeThrough(ds);
    return await new Response(stream).arrayBuffer();
  }
  return buf;
}

export async function parseNifti(file: File): Promise<NiftiResult> {
  const raw = await file.arrayBuffer();
  const buf = await maybeGunzip(raw);
  const dv = new DataView(buf);

  // Endianness: sizeof_hdr at offset 0 must read as 348.
  let le = true;
  let sizeof = dv.getInt32(0, true);
  if (sizeof !== 348) { le = false; sizeof = dv.getInt32(0, false); }
  if (sizeof !== 348) throw new Error("Not a NIfTI-1 file (bad header size)");

  const dim = (i: number) => dv.getInt16(40 + i * 2, le);
  const ndim = dim(0);
  const X = dim(1), Y = dim(2), Z = Math.max(1, ndim >= 3 ? dim(3) : 1);
  if (X < 2 || Y < 2) throw new Error("NIfTI has no 2D image data");

  const datatype = dv.getInt16(70, le);
  const voxOffset = Math.round(dv.getFloat32(108, le)) || 352;
  let sclSlope = dv.getFloat32(112, le); if (!isFinite(sclSlope) || sclSlope === 0) sclSlope = 1;
  const sclInter = dv.getFloat32(116, le) || 0;

  const sliceSize = X * Y;
  const readVox = (() => {
    switch (datatype) {
      case DT.UINT8:   return (o: number) => dv.getUint8(o);
      case DT.INT8:    return (o: number) => dv.getInt8(o);
      case DT.INT16:   return (o: number) => dv.getInt16(o, le);
      case DT.UINT16:  return (o: number) => dv.getUint16(o, le);
      case DT.INT32:   return (o: number) => dv.getInt32(o, le);
      case DT.UINT32:  return (o: number) => dv.getUint32(o, le);
      case DT.FLOAT32: return (o: number) => dv.getFloat32(o, le);
      case DT.FLOAT64: return (o: number) => dv.getFloat64(o, le);
      default: throw new Error(`Unsupported NIfTI datatype ${datatype}`);
    }
  })();
  const bytes = (() => {
    switch (datatype) {
      case DT.UINT8: case DT.INT8: return 1;
      case DT.INT16: case DT.UINT16: return 2;
      case DT.INT32: case DT.UINT32: case DT.FLOAT32: return 4;
      case DT.FLOAT64: return 8;
      default: return 2;
    }
  })();

  const voxAt = (x: number, y: number, z: number) => {
    const idx = x + y * X + z * sliceSize;
    return readVox(voxOffset + idx * bytes) * sclSlope + sclInter;
  };

  // Per-slice content score to locate the brain's z-extent (skip empty air slices).
  const scores = new Float64Array(Z);
  let maxScore = 0;
  for (let z = 0; z < Z; z++) {
    let sum = 0;
    for (let i = 0; i < sliceSize; i += 7) sum += Math.abs(readVox(voxOffset + (i + z * sliceSize) * bytes));
    scores[z] = sum;
    if (sum > maxScore) maxScore = sum;
  }
  // Brain z-range = contiguous slices carrying > 25% of peak content.
  const thresh = maxScore * 0.25;
  let zLo = 0, zHi = Z - 1;
  while (zLo < Z - 1 && scores[zLo] < thresh) zLo++;
  while (zHi > zLo && scores[zHi] < thresh) zHi--;
  if (zHi <= zLo) { zLo = Math.floor(Z * 0.2); zHi = Math.ceil(Z * 0.8); }

  // Render one z-slice to a base64 PNG (grayscale, robust 2nd–98th pct window).
  // NIfTI rows go bottom-up, so flip Y to display the brain upright.
  const renderSlice = (z: number): string => {
    const slice = new Float64Array(sliceSize);
    for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) slice[x + y * X] = voxAt(x, y, z);
    const sorted = Float64Array.from(slice).sort();
    const lo = sorted[Math.floor(sliceSize * 0.02)];
    const hi = sorted[Math.floor(sliceSize * 0.98)] || (lo + 1);
    const range = hi - lo || 1;
    const canvas = document.createElement("canvas");
    canvas.width = X; canvas.height = Y;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");
    const img = ctx.createImageData(X, Y);
    for (let y = 0; y < Y; y++) {
      const srcY = Y - 1 - y;
      for (let x = 0; x < X; x++) {
        let v = (slice[x + srcY * X] - lo) / range;
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        const g = Math.round(v * 255);
        const p = (x + y * X) * 4;
        img.data[p] = g; img.data[p + 1] = g; img.data[p + 2] = g; img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  };

  // Sample up to 6 evenly-spaced real slices across the brain extent.
  const COUNT = Math.min(6, zHi - zLo + 1);
  const slices: string[] = [];
  for (let i = 0; i < COUNT; i++) {
    const z = COUNT <= 1 ? Math.floor((zLo + zHi) / 2) : Math.round(zLo + (i * (zHi - zLo)) / (COUNT - 1));
    slices.push(renderSlice(z));
  }

  return { slices, width: X, height: Y, depth: Z };
}
