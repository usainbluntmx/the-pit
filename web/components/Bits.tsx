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
  // Short suffix: 256 name combinations are not enough for 16 seats without collisions.
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

/** A dry WebAudio thump: no asset, no permission. */
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
    /* audio is a bonus, it never breaks the round */
  }
}

/**
 * The bite, heard: a filtered noise crunch plus a sub thump. Same trick as
 * `thump` — synthesised on the spot, so there is no asset to fetch and the
 * game works with audio blocked.
 */
export function crunch(mine: boolean) {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    ctx.resume?.().catch(() => {});
    const now = ctx.currentTime;
    const dur = mine ? 0.62 : 0.46;

    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const progress = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - progress, 2.4);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(mine ? 2200 : 1600, now);
    lowpass.frequency.exponentialRampToValueAtTime(220, now + dur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(mine ? 0.42 : 0.28, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(lowpass).connect(ng).connect(ctx.destination);
    noise.start(now);

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(mine ? 104 : 74, now);
    o.frequency.exponentialRampToValueAtTime(28, now + 0.5);
    g.gain.setValueAtTime(mine ? 0.46 : 0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    o.connect(g).connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.56);
  } catch {
    /* audio is a bonus, it never breaks the round */
  }
}

/** The incoherence is generated by the game, not by a model: same seed, same delirium. */
const MAD_LINES = [
  "I AM THE PRICE",
  "SELL EVERYTHING, BUY NOTHING",
  "THERE IS NO UP",
  "I AM PERFECTLY FINE",
  "▚▞ THE PIT SPEAKS TO ME ▞▚",
  "I BUY THE PIT",
  "MY STOP IS A SUGGESTION",
  "EVERYONE WINS BUT ME",
  "▞▚▞ RED DOES NOT EXIST ▞▚▞",
  "BACK IN FIVE MINUTES",
];

const MAD_LINES_ES = [
  "YO SOY EL PRECIO",
  "VENDE TODO, NO COMPRES NADA",
  "ARRIBA NO EXISTE",
  "ESTOY PERFECTAMENTE BIEN",
  "▚▞ EL POZO ME HABLA ▞▚",
  "YO COMPRO EL POZO",
  "MI STOP ES UNA SUGERENCIA",
  "TODOS GANAN MENOS YO",
  "▞▚▞ EL ROJO NO EXISTE ▞▚▞",
  "REGRESO EN CINCO MINUTOS",
];

export function madLine(key: string, epoch: number, lang: "en" | "es" = "en"): string {
  let h = 2166136261;
  const seed = `${key}:${epoch}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const lines = lang === "es" ? MAD_LINES_ES : MAD_LINES;
  return lines[Math.abs(h) % lines.length];
}

/**
 * Whispers for the full-screen fever: shorter, meaner and more frequent than
 * the banner line, so the screen feels crowded without repeating one sentence.
 */
const WHISPERS = [
  "I AM THE PRICE",
  "SELL EVERYTHING",
  "THERE IS NO UP",
  "I AM PERFECTLY FINE",
  "THE PIT SPEAKS TO ME",
  "I BUY THE PIT",
  "MY STOP IS A SUGGESTION",
  "EVERYONE WINS BUT ME",
  "RED DOES NOT EXIST",
  "ONE MORE TRADE",
  "THE CHART IS LYING",
  "I CAN HEAR THE CANDLES",
  "MY LIQUIDATION IS A FRIEND",
  "DO NOT TRUST THE BELL",
  "IT BITES THE ONES WHO HOLD",
  "BACK IN FIVE MINUTES",
  "▚▞ GO LONGER ▞▚",
  "THE BUTTON MOVED ON PURPOSE",
];

const WHISPERS_ES = [
  "YO SOY EL PRECIO",
  "VENDE TODO",
  "ARRIBA NO EXISTE",
  "ESTOY PERFECTAMENTE BIEN",
  "EL POZO ME HABLA",
  "YO COMPRO EL POZO",
  "MI STOP ES UNA SUGERENCIA",
  "TODOS GANAN MENOS YO",
  "EL ROJO NO EXISTE",
  "UNA OPERACIÓN MÁS",
  "LA GRÁFICA MIENTE",
  "OIGO LAS VELAS",
  "MI LIQUIDACIÓN ES MI AMIGA",
  "NO CONFÍES EN LA CAMPANA",
  "MUERDE A QUIEN AGUANTA",
  "REGRESO EN CINCO MINUTOS",
  "▚▞ AGUANTA MÁS ▞▚",
  "EL BOTÓN SE MOVIÓ A PROPÓSITO",
];

/** Deterministic pick, so the whispers feel authored and not random noise. */
export function feverWhisper(index: number, lang: "en" | "es" = "en"): string {
  const lines = lang === "es" ? WHISPERS_ES : WHISPERS;
  return lines[Math.abs(index * 7 + 3) % lines.length];
}
