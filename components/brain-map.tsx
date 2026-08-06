"use client";
import { motion } from "framer-motion";

export type BrainRegionStatus = "normal" | "affected" | "severe";

export interface BrainRegion {
  id: string;
  label: string;
  status: BrainRegionStatus;
}

const COLORS: Record<BrainRegionStatus, { fill: string; stroke: string; text: string }> = {
  normal:   { fill: "#1a1b2e", stroke: "#2e3058", text: "#4b5280" },
  affected: { fill: "#431407", stroke: "#f97316", text: "#fb923c" },
  severe:   { fill: "#4c0519", stroke: "#f43f5e", text: "#fb7185" },
};

interface Props {
  regions: BrainRegion[];
  modality?: string;
}

export default function BrainMap({ regions, modality }: Props) {
  const get = (id: string): BrainRegion =>
    regions.find((r) => r.id === id) ?? { id, label: id, status: "normal" };

  function Lobe({ id, d, tx, ty, label }: { id: string; d: string; tx: number; ty: number; label: string }) {
    const r = get(id);
    const c = COLORS[r.status];
    return (
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <motion.path
          d={d}
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth="1.5"
          animate={r.status !== "normal" ? { fill: [c.fill, "#5c1a0a", c.fill] } : {}}
          transition={r.status !== "normal" ? { repeat: Infinity, duration: 2.5, ease: "easeInOut" } : {}}
        />
        <text x={tx} y={ty} fill={c.text} fontSize="7" textAnchor="middle"
          fontFamily="system-ui,sans-serif" fontWeight="700" style={{ userSelect: "none" }}>
          {label}
        </text>
      </motion.g>
    );
  }

  const hippo = get("hippocampus");
  const hc = COLORS[hippo.status];

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 280 300" className="w-full max-w-[280px]" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="140" cy="148" rx="118" ry="130" fill="#0e0e18" stroke="#1e1e30" strokeWidth="1" />

        <Lobe id="frontal"
          d="M140,24 C100,22 60,38 45,72 C35,90 38,110 50,122 C80,108 110,100 140,98 C170,100 200,108 230,122 C242,110 245,90 235,72 C220,38 180,22 140,24Z"
          tx={140} ty={70} label="FRONTAL" />

        <Lobe id="temporal-left"
          d="M26,145 C22,165 24,185 30,202 C40,218 55,228 68,232 C72,210 68,188 58,168 C48,152 38,146 26,145Z"
          tx={48} ty={192} label="TEMP-L" />

        <Lobe id="temporal-right"
          d="M254,145 C258,165 256,185 250,202 C240,218 225,228 212,232 C208,210 212,188 222,168 C232,152 242,146 254,145Z"
          tx={232} ty={192} label="TEMP-R" />

        <Lobe id="parietal"
          d="M50,124 C80,110 110,102 140,100 C170,102 200,110 230,124 C238,148 236,172 226,192 C198,178 170,170 140,168 C110,170 82,178 54,192 C44,172 42,148 50,124Z"
          tx={140} ty={144} label="PARIETAL" />

        <Lobe id="occipital"
          d="M54,194 C82,180 110,172 140,170 C170,172 198,180 226,194 C232,212 228,230 218,244 C196,256 168,262 140,262 C112,262 84,256 62,244 C52,230 48,212 54,194Z"
          tx={140} ty={218} label="OCCIPITAL" />

        <Lobe id="cerebellum"
          d="M90,258 C108,264 124,268 140,268 C156,268 172,264 190,258 C198,272 196,288 184,294 C168,299 152,301 140,301 C128,301 112,299 96,294 C84,288 82,272 90,258Z"
          tx={140} ty={282} label="CEREBELLUM" />

        {/* Hippocampus */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <ellipse cx="108" cy="152" rx="15" ry="8" fill={hc.fill} stroke={hc.stroke} strokeWidth="1.2" />
          <ellipse cx="172" cy="152" rx="15" ry="8" fill={hc.fill} stroke={hc.stroke} strokeWidth="1.2" />
          <text x="108" y="155" fill={hc.text} fontSize="5" textAnchor="middle" fontFamily="system-ui,sans-serif" fontWeight="700">HIPPO-L</text>
          <text x="172" y="155" fill={hc.text} fontSize="5" textAnchor="middle" fontFamily="system-ui,sans-serif" fontWeight="700">HIPPO-R</text>
        </motion.g>

        {/* Midline + central sulcus */}
        <line x1="140" y1="26" x2="140" y2="266" stroke="#1e1e30" strokeWidth="0.8" strokeDasharray="3,3" />
        <path d="M50,124 Q95,114 140,117 Q185,114 230,124" fill="none" stroke="#1e1e30" strokeWidth="0.8" />
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-5 text-[11px]">
        {(["normal", "affected", "severe"] as const).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-[3px]"
              style={{ background: COLORS[s].fill, border: `1px solid ${COLORS[s].stroke}` }} />
            <span style={{ color: COLORS[s].text }} className="capitalize font-medium">{s}</span>
          </div>
        ))}
      </div>
      {modality && <p className="text-white/20 text-[10px] tracking-widest uppercase">{modality}</p>}
    </div>
  );
}
