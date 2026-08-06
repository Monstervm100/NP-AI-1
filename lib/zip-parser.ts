// Minimal ZIP reader — finds and extracts the first neuroimaging file inside a
// .zip (so users can drop a zipped folder). Handles stored (0) and deflate (8)
// compression via the platform DecompressionStream. Reference: PKZIP APPNOTE.

const SCAN_RE = /\.(nii(\.gz)?|dcm|png|jpe?g|webp)$/i;

export interface ExtractedScan {
  name: string;        // inner file name (e.g. sub-01_T1w.nii.gz)
  bytes: Uint8Array;   // decompressed file bytes
}

export async function extractScanFromZip(file: File): Promise<ExtractedScan> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const dec = new TextDecoder();

  // 1. Locate End Of Central Directory (sig 0x06054b50), scanning from the end.
  let eocd = -1;
  const minStart = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= minStart; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid ZIP file.");
  const cdCount = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);

  // 2. Walk the central directory to list entries.
  type Entry = { name: string; method: number; compSize: number; localOffset: number };
  const entries: Entry[] = [];
  let p = cdOffset;
  for (let i = 0; i < cdCount && p + 46 <= buf.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  // 3. Pick the first real scan file (skip macOS metadata + directories).
  const target = entries.find(
    (e) => SCAN_RE.test(e.name) && !e.name.includes("__MACOSX") && !e.name.startsWith(".") && !e.name.endsWith("/")
  );
  if (!target) throw new Error("No scan file (.nii/.nii.gz/.dcm/image) found inside the ZIP.");

  // 4. Read the local header to find where the data starts (its name/extra
  //    lengths can differ from the central directory's).
  const lp = target.localOffset;
  if (dv.getUint32(lp, true) !== 0x04034b50) throw new Error("Corrupt ZIP entry.");
  const lNameLen = dv.getUint16(lp + 26, true);
  const lExtraLen = dv.getUint16(lp + 28, true);
  const dataStart = lp + 30 + lNameLen + lExtraLen;
  const compData = buf.subarray(dataStart, dataStart + target.compSize);

  // 5. Decompress: 0 = stored, 8 = deflate (raw).
  let bytes: Uint8Array;
  if (target.method === 0) {
    bytes = compData;
  } else if (target.method === 8) {
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([compData]).stream().pipeThrough(ds);
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else {
    throw new Error(`Unsupported ZIP compression (method ${target.method}). Use a standard zip.`);
  }

  return { name: target.name.split("/").pop() || target.name, bytes };
}
