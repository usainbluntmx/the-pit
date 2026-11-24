"use client";

/**
 * Screen-level effects for the two moments that make PIT feel like a place and
 * not a dashboard: the bite (jaws closing over the whole viewport) and fever
 * (the screen goes dark, whispers show up, the first click gets eaten).
 *
 * Both render through a portal so `position: fixed` is always the viewport and
 * never the animated page wrapper. Both are pointer-events: none: they are
 * theatre, not a modal, and a round never stops because of them.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { feverWhisper } from "@/components/Bits";

/* --------------------------------- teeth --------------------------------- */

const VB_W = 1000;
const VB_H = 300;

/** One jaw: a gum band with interlocking triangular teeth pointing down. */
function jawPath(seed: number, teeth = 18): string {
  const step = VB_W / teeth;
  const gum = 92;
  let d = `M0,0 H${VB_W} V${gum}`;
  for (let i = teeth - 1; i >= 0; i--) {
    const x1 = i * step;
    const x2 = (i + 1) * step;
    const cx = (x1 + x2) / 2;
    // Deterministic jitter: the same bite always draws the same mouth.
    const jitter = ((seed * 31 + i * 17) % 23) - 11;
    const tip = (i % 2 === 0 ? 286 : 214) + jitter;
    d += ` L${cx.toFixed(1)},${tip} L${x1.toFixed(1)},${gum}`;
  }
  return `${d} Z`;
}

function Jaw({ seed, flip }: { seed: number; flip: boolean }) {
  const d = useMemo(() => jawPath(seed), [seed]);
  return (
    <svg
      className={`jaw-svg ${flip ? "flip" : ""}`}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`gum-${seed}-${flip ? "b" : "t"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#12060a" />
          <stop offset="0.55" stopColor="#3d0a10" />
          <stop offset="1" stopColor="#7d1620" />
        </linearGradient>
        <linearGradient id={`tooth-${seed}-${flip ? "b" : "t"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a28" />
          <stop offset="0.28" stopColor="#b7a48d" />
          <stop offset="0.62" stopColor="#f2e7d4" />
          <stop offset="1" stopColor="#a9947c" />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#tooth-${seed}-${flip ? "b" : "t"})`} stroke="rgba(0,0,0,0.55)" strokeWidth="2" />
      <rect x="0" y="0" width={VB_W} height="92" fill={`url(#gum-${seed}-${flip ? "b" : "t"})`} />
      <rect x="0" y="88" width={VB_W} height="5" fill="rgba(255,77,94,0.35)" />
    </svg>
  );
}

/* ---------------------------------- bite --------------------------------- */

export type BiteCue = { id: number; mine: boolean };

export function BiteFX({ cue }: { cue: BiteCue | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !cue) return null;

  const tilt = (((cue.id * 37) % 100) / 100) * 2.6 - 1.3;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (reduced) {
    return createPortal(
      <div className={`bitefx lite ${cue.mine ? "mine" : ""}`} aria-hidden>
        <div className="bitefx-shade" />
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className={`bitefx ${cue.mine ? "mine" : ""}`}
      aria-hidden
      style={{ ["--tilt" as string]: `${tilt}deg` } as React.CSSProperties}
    >
      <div className="bitefx-maw" />
      <div className="bitefx-shade" />
      <div className="jaw-rig rig-top">
        <Jaw seed={cue.id} flip={false} />
      </div>
      <div className="jaw-rig rig-bottom">
        <Jaw seed={cue.id} flip />
      </div>
      <div className="bitefx-ring" />
    </div>,
    document.body,
  );
}

/* --------------------------------- fever --------------------------------- */

type Whisper = { id: number; text: string; x: number; y: number; rot: number; scale: number };

export function FeverFX({
  active,
  left,
  lang,
}: {
  active: boolean;
  left: number;
  lang: "en" | "es";
}) {
  const [mounted, setMounted] = useState(false);
  const [whispers, setWhispers] = useState<Whisper[]>([]);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!active || !mounted) {
      setWhispers([]);
      return;
    }
    let alive = true;
    let spawnTimer: number;

    const drop = (id: number) =>
      setWhispers((list) => list.filter((w) => w.id !== id));

    const spawn = () => {
      if (!alive) return;
      const id = ++seq.current;
      const text = feverWhisper(id, lang);
      const w: Whisper = {
        id,
        text,
        x: 6 + Math.random() * 52,
        y: 12 + Math.random() * 66,
        rot: Math.random() * 10 - 5,
        scale: 0.85 + Math.random() * 0.55,
      };
      setWhispers((list) => [...list.slice(-3), w]);
      timers.current.push(window.setTimeout(() => drop(id), 3200));
      spawnTimer = window.setTimeout(spawn, 1700 + Math.random() * 2100);
      timers.current.push(spawnTimer);
    };

    spawn();
    return () => {
      alive = false;
      window.clearTimeout(spawnTimer);
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, [active, mounted, lang]);

  if (!mounted || !active) return null;

  return createPortal(
    <div className="feverfx" aria-hidden>
      <div className="feverfx-dark" />
      <div className="feverfx-scan" />
      <div className="feverfx-edge" />
      <div className="feverfx-count mono">{left}s</div>
      {whispers.map((w) => (
        <span
          key={w.id}
          className="whisper"
          style={{
            left: `${w.x}%`,
            top: `${w.y}%`,
            transform: `rotate(${w.rot}deg) scale(${w.scale})`,
          }}
        >
          {w.text}
        </span>
      ))}
    </div>,
    document.body,
  );
}
