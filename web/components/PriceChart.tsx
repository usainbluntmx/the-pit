"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type FeedPoint = { t: number; p: number };

export type FeedMark = {
  /** unix seconds */
  t: number;
  price: number;
  side: 1 | -1;
  /** the exact moment is unknown (the page was opened with a position already open) */
  approx?: boolean;
};

type Props = {
  points: FeedPoint[];
  marks: FeedMark[];
  startAt: number;
  endAt: number;
  now: number;
  /** price right now, even when the last sample is a few seconds old */
  price: number | null;
  title: string;
  waiting: string;
  waitingSub: string;
  entryLabel: (side: "long" | "short", price: string, approx: boolean) => string;
  sealedNote: string;
};

export const fmtPrice = (v: number) =>
  v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toFixed(4);

/** Axis ticks stay short: a tiny move no longer prints twelve digits in the gutter. */
const fmtAxis = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (a >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
  return fmtPrice(v);
};

type Chart = {
  empty: boolean;
  innerW: number;
  innerH: number;
  t0: number;
  t1: number;
  span: number;
  x: (t: number) => number;
  y: (v: number) => number;
  pts: FeedPoint[];
  visibleMarks: FeedMark[];
  nowX: number;
  tailPrice: number | null;
  line: string;
  area: string;
  band: string;
  bandGood: boolean;
  mark: FeedMark | null;
  grid: { v: number; y: number; top: boolean; bottom: boolean }[];
  trendUp: boolean;
  lo: number;
  hi: number;
};

export function PriceChart({
  points,
  marks,
  startAt,
  endAt,
  now,
  price,
  title,
  waiting,
  waitingSub,
  entryLabel,
  sealedNote,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(880);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const next = Math.round(entries[0].contentRect.width);
      if (next > 0) setW(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = w < 620;
  // Before the arena is delegated there is no price to draw: a compact panel says so
  // instead of leaving 320px of empty grid.
  const hasData = points.length >= 2 || price !== null;
  const h = !hasData ? (narrow ? 170 : 200) : narrow ? 236 : 320;
  const padL = 10;
  const padR = narrow ? 54 : 72;
  const padT = 18;
  const padB = 26;

  const chart = useMemo<Chart>(() => {
    const innerW = Math.max(40, w - padL - padR);
    const innerH = h - padT - padB;
    const flat: Chart = {
      empty: true,
      innerW,
      innerH,
      t0: 0,
      t1: 0,
      span: 1,
      x: () => padL,
      y: () => padT + innerH / 2,
      pts: [],
      visibleMarks: [],
      nowX: padL,
      tailPrice: null,
      line: "",
      area: "",
      band: "",
      bandGood: true,
      mark: null,
      grid: [],
      trendUp: true,
      lo: 0,
      hi: 1,
    };

    const t0 = startAt > 0 ? startAt : points[0]?.t ?? now - 60;
    const t1 = endAt > t0 ? endAt : Math.max(now, t0 + 60);
    const span = Math.max(1, t1 - t0);

    const pts = points
      .filter((pt) => Number.isFinite(pt.p) && pt.t >= t0 - 1 && pt.t <= Math.min(now, t1) + 1)
      .sort((a, b) => a.t - b.t);

    const visibleMarks = marks.filter((m) => m.t >= t0 - 1 && m.t <= Math.min(now, t1) + 1);

    const values = [...pts.map((pt) => pt.p), ...visibleMarks.map((m) => m.price)];
    if (price) values.push(price);
    if (values.length === 0) return { ...flat, t0, t1, span };
    const lo0 = Math.min(...values);
    const hi0 = Math.max(...values);
    const pad = (hi0 - lo0) * 0.1 || Math.max(hi0 * 0.001, 0.01);
    const lo = lo0 - pad;
    const hi = hi0 + pad;

    const x = (t: number) => padL + ((t - t0) / span) * innerW;
    const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * innerH;

    const last = pts[pts.length - 1] ?? null;
    const nowX = x(Math.min(Math.max(now, t0), t1));
    const tailPrice = price ?? last?.p ?? null;

    let line = "";
    pts.forEach((pt, i) => {
      line += `${i === 0 ? "M" : "L"}${x(pt.t).toFixed(1)},${y(pt.p).toFixed(1)} `;
    });
    if (last && tailPrice && nowX > x(last.t)) {
      line += `L${nowX.toFixed(1)},${y(tailPrice).toFixed(1)}`;
    }
    const area = line ? `${line} L${nowX.toFixed(1)},${padT + innerH} L${x(pts[0].t).toFixed(1)},${padT + innerH} Z` : "";

    // The band between the entry price and the price path: green when the seat is right,
    // red when it is wrong. Only for the most recent entry, so it reads as one position.
    const mark = visibleMarks[visibleMarks.length - 1] ?? null;
    let band = "";
    if (mark && last && tailPrice) {
      const stopX = nowX;
      const stops = pts.filter((pt) => pt.t >= mark.t);
      band = `M${x(mark.t).toFixed(1)},${y(mark.price).toFixed(1)} `;
      if (stops.length > 0) {
        band += stops.map((pt) => `L${x(pt.t).toFixed(1)},${y(pt.p).toFixed(1)}`).join(" ");
      }
      band += ` L${stopX.toFixed(1)},${y(tailPrice).toFixed(1)} L${stopX.toFixed(1)},${y(mark.price).toFixed(1)} Z`;
    }
    const bandGood =
      mark && tailPrice ? (mark.side === 1 ? tailPrice >= mark.price : tailPrice <= mark.price) : true;

    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const v = hi - (hi - lo) * f;
      return { v, y: y(v), top: f === 0, bottom: f === 1 };
    });

    const first = pts[0]?.p ?? null;
    const trendUp = !first || !tailPrice || tailPrice >= first;

    return {
      empty: false,
      innerW,
      innerH,
      t0,
      t1,
      span,
      x,
      y,
      pts,
      visibleMarks,
      nowX,
      tailPrice,
      line,
      area,
      band,
      bandGood,
      mark,
      grid,
      trendUp,
      lo,
      hi,
    };
  }, [points, marks, startAt, endAt, now, price, w, h, padL, padR, padT, padB]);

  const stroke = chart.empty ? "var(--dim)" : chart.trendUp ? "var(--long)" : "var(--short)";
  const gradId = chart.empty ? "feed-flat" : chart.trendUp ? "feed-up" : "feed-down";

  return (
    <div className="feed" ref={box}>
      <div className="feed-frame">
        <svg width={w} height={h} role="img" aria-label={title}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>

          {chart.grid?.map((g) => (
            <g key={g.v}>
              <line
                x1={padL}
                x2={w - padR}
                y1={g.y}
                y2={g.y}
                stroke="var(--line)"
                strokeDasharray={g.top || g.bottom ? undefined : "3 6"}
                strokeOpacity={g.top || g.bottom ? 0.9 : 0.55}
              />
              <text x={w - 8} y={g.y + 4} textAnchor="end" className="feed-axis">
                {fmtAxis(g.v)}
              </text>
            </g>
          ))}

          {chart.empty ? (
            <g>
              <line
                x1={padL}
                x2={w - padR}
                y1={padT + chart.innerH / 2}
                y2={padT + chart.innerH / 2}
                stroke="var(--line)"
                strokeDasharray="4 6"
              />
              <text
                x={padL + chart.innerW / 2}
                y={padT + chart.innerH / 2 - 12}
                textAnchor="middle"
                className="feed-empty-title"
              >
                {waiting}
              </text>
              <text
                x={padL + chart.innerW / 2}
                y={padT + chart.innerH / 2 + 22}
                textAnchor="middle"
                className="feed-empty-sub"
              >
                {waitingSub}
              </text>
            </g>
          ) : (
            <>
              {chart.nowX < w - padR && (
                <rect
                  x={chart.nowX}
                  y={padT}
                  width={w - padR - chart.nowX}
                  height={chart.innerH}
                  fill="var(--text)"
                  opacity="0.025"
                />
              )}
              {chart.band && (
                <path
                  d={chart.band}
                  fill={chart.bandGood ? "var(--long)" : "var(--short)"}
                  fillOpacity="0.12"
                />
              )}
              {chart.area && <path d={chart.area} fill={`url(#${gradId})`} />}
              <path
                d={chart.line}
                fill="none"
                stroke={stroke}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              <line
                x1={chart.nowX}
                x2={chart.nowX}
                y1={padT}
                y2={padT + chart.innerH}
                stroke="var(--text)"
                strokeOpacity="0.09"
              />

              {chart.visibleMarks.map((m, i) => {
                const mx = chart.x(m.t);
                const my = chart.y(m.price);
                const color = m.side === 1 ? "var(--long)" : "var(--short)";
                const lastOne = i === chart.visibleMarks.length - 1;
                return (
                  <g key={`${m.t}-${i}`}>
                    <line
                      x1={mx}
                      x2={mx}
                      y1={padT}
                      y2={padT + chart.innerH}
                      stroke={color}
                      strokeOpacity={lastOne ? 0.3 : 0.16}
                      strokeDasharray={m.approx ? "3 5" : undefined}
                    />
                    <line
                      x1={mx}
                      x2={lastOne ? chart.nowX : mx + 14}
                      y1={my}
                      y2={my}
                      stroke={color}
                      strokeOpacity={lastOne ? 0.65 : 0.32}
                      strokeWidth="1.2"
                      strokeDasharray={lastOne ? "5 5" : "2 4"}
                    />
                    <path
                      d={
                        m.side === 1
                          ? `M${mx},${my - 13} l5,9 l-10,0 z`
                          : `M${mx},${my + 13} l5,-9 l-10,0 z`
                      }
                      fill={color}
                    />
                    <circle cx={mx} cy={my} r="3.2" fill={color} />
                  </g>
                );
              })}

              {/* The entry is a reference line, not a dot: one look tells the player whether
                  the price is on the winning side of their seat. */}
              {chart.mark &&
                (() => {
                  const color = chart.mark!.side === 1 ? "var(--long)" : "var(--short)";
                  const ey = chart.y(chart.mark!.price);
                  const ly = chart.tailPrice !== null ? chart.y(chart.tailPrice) : null;
                  const shift = ly !== null && Math.abs(ly - ey) < 24 ? (ey > h / 2 ? -24 : 24) : 0;
                  const text = `$${fmtPrice(chart.mark!.price)}`;
                  const pw = text.length * 6.3 + 14;
                  return (
                    <g>
                      <line
                        x1={padL}
                        x2={w - padR}
                        y1={ey}
                        y2={ey}
                        stroke={color}
                        strokeOpacity="0.5"
                        strokeDasharray="5 6"
                      >
                        <title>
                          {entryLabel(
                            chart.mark!.side === 1 ? "long" : "short",
                            fmtPrice(chart.mark!.price),
                            !!chart.mark!.approx,
                          )}
                        </title>
                      </line>
                      <rect
                        x={w - padR - pw - 4}
                        y={ey - 9 + shift}
                        width={pw}
                        height="18"
                        rx="9"
                        fill="var(--panel)"
                        stroke={color}
                        strokeOpacity="0.85"
                      />
                      <text
                        x={w - padR - 4 - pw / 2}
                        y={ey + 3.4 + shift}
                        textAnchor="middle"
                        className="feed-mark"
                        fill={color}
                      >
                        {text}
                      </text>
                    </g>
                  );
                })()}

              {chart.tailPrice !== null && (
                <g>
                  <circle cx={chart.nowX} cy={chart.y(chart.tailPrice)} r="9" className="feed-halo" fill={stroke} />
                  <circle cx={chart.nowX} cy={chart.y(chart.tailPrice)} r="3.6" fill={stroke} />
                </g>
              )}
            </>
          )}

          <text x={padL} y={h - 7} className="feed-axis">
            00:00
          </text>
          <text x={w - padR} y={h - 7} textAnchor="end" className="feed-axis">
            {clockOf(Math.round(chart.t1 - chart.t0))}
          </text>
        </svg>
      </div>

      <div className="feed-legend">
        <span className="feed-note">{sealedNote}</span>
      </div>
    </div>
  );
}

const clockOf = (secs: number) => {
  const s = Math.max(0, Math.round(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
