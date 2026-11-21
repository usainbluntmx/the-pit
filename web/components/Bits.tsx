"use client";

import { useMemo } from "react";

/* ------------------------------- identity -------------------------------- */

const FIRST = [
  "SHARK", "VIPER", "GHOST", "BULL", "RAVEN", "COBRA", "WOLF", "JACKAL",
  "MANTIS", "HAWK", "HYENA", "ORCA", "LYNX", "VIPER", "FALCON", "PIRANHA",
];
const LAST = [
  "PRIME", "ZERO", "NINE", "DARK", "FAST", "COLD", "HIGH", "DEEP",
  "RED", "BLUE", "IRON", "STEEL", "SILENT", "LATE", "EARLY", "WIDE",
];

/** Deterministic handle from a pubkey, so players feel like characters, not base58. */
export function handleOf(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = FIRST[Math.abs(h) % FIRST.length];
  const b = LAST[Math.abs(h >> 8) % LAST.length];
  // Sufijo corto: 256 combinaciones de nombre no alcanzan para 16 asientos sin choques.
  const tag = (Math.abs(h >> 16) % 1296).toString(36).toUpperCase().padStart(2, "0");
  return `${a}-${b}·${tag}`;
}

/* ------------------------------- sparkline ------------------------------- */

export function Sparkline({
  data,
  width = 320,
  height = 64,
  positive,
}: {
  data: number[];
  width?: number;
  height?: number;
  positive: boolean;
}) {
  const { path, area, min, max } = useMemo(() => {
    if (data.length < 3) return { path: "", area: "", min: 0, max: 0 };
    const lo = Math.min(...data);
    const hi = Math.max(...data);
    const pad = (hi - lo) * 0.15 || 0.01;
    const min = lo - pad;
    const max = hi + pad;
    const step = width / (data.length - 1);
    const y = (v: number) => height - ((v - min) / (max - min)) * height;
    const pts = data.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
    return {
      path: pts.join(" "),
      area: `${pts.join(" ")} L${width},${height} L0,${height} Z`,
      min,
      max,
    };
  }, [data, width, height]);

  const stroke = positive ? "var(--long)" : "var(--short)";
  const id = positive ? "spark-up" : "spark-down";

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${id})`} />}
      {path && (
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/* -------------------------------- ring ---------------------------------- */

export function CountdownRing({
  remaining,
  total,
  label,
}: {
  remaining: number;
  total: number;
  label: string;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const r = 46;
  const c = 2 * Math.PI * r;
  const urgent = remaining <= 15;
  const mins = Math.floor(Math.max(0, remaining) / 60);
  const secs = Math.max(0, remaining) % 60;

  return (
    <div className={`ring-wrap ${urgent ? "urgent" : ""}`}>
      <svg viewBox="0 0 110 110" className="ring">
        <circle cx="55" cy="55" r={r} className="ring-track" />
        <circle
          cx="55"
          cy="55"
          r={r}
          className="ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-time mono">
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </span>
        <span className="ring-label">{label}</span>
      </div>
    </div>
  );
}

/* -------------------------------- equity --------------------------------- */

export function EquityBar({ value, max, min }: { value: number; max: number; min: number }) {
  const span = Math.max(1e-6, max - min);
  const pct = Math.max(0.02, Math.min(1, (value - min) / span));
  const up = value >= 1000;
  return (
    <span className="eq-bar">
      <span
        className={`eq-fill ${up ? "up" : "down"}`}
        style={{ width: `${pct * 100}%` }}
        aria-hidden
      />
    </span>
  );
}

/** Un golpe seco de WebAudio: no hace falta asset ni permiso. */
export function thump(mine: boolean) {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(mine ? 120 : 72, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(36, ctx.currentTime + 0.35);
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.44);
  } catch {
    /* el audio es un extra, nunca rompe la partida */
  }
}

/** La incoherencia la genera el juego, no el modelo: misma semilla, mismo delirio. */
const MAD_LINES = [
  "EL PRECIO SOY YO",
  "VENDO TODO, COMPRO NADA",
  "NO HAY ARRIBA",
  "ESTOY PERFECTO",
  "▚▞ EL POZO ME HABLA ▞▚",
  "COMPRO EL POZO",
  "MI STOP ES UNA SUGERENCIA",
  "TODOS GANAN MENOS YO",
  "▞▚▞ NO EXISTE EL ROJO ▞▚▞",
  "VUELVO EN CINCO MINUTOS",
];

export function madLine(key: string, epoch: number): string {
  let h = 2166136261;
  const seed = `${key}:${epoch}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return MAD_LINES[Math.abs(h) % MAD_LINES.length];
}
