"use client";

/**
 * The product, on the landing page.
 *
 * Not a screenshot and not a mock: it reads the same program the app reads — devnet arenas
 * plus the SOL/USD feed — so the numbers move when the chain moves. If nothing is open, it
 * says so instead of inventing a table.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Arena } from "@/lib/pit";
import { useT } from "@/lib/i18n";

const PROGRAM = "4iVtfWTrVo4iUAeTBVhhjkDr9kGK4dTD95vKM8c6dbar";
const short = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

export function LiveBoard() {
  const t = useT();
  const [arenas, setArenas] = useState<Arena[] | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [tick, setTick] = useState<"up" | "down" | null>(null);
  const lastPrice = useRef<number | null>(null);

  const [lib, setLib] = useState<typeof import("@/lib/pit") | null>(null);

  // The chain client (web3 + anchor) is a big chunk; the landing only needs it once the
  // hero is on screen, so it loads after hydration and the page stays light.
  useEffect(() => {
    let alive = true;
    import("@/lib/pit").then((m) => alive && setLib(m));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!lib) return;
    let alive = true;
    const base = lib.baseConnection();
    lib
      .listArenas(base)
      .then((list) => alive && setArenas(list))
      .catch(() => alive && setArenas([]));
    const pull = () =>
      lib
        .readPriceLive()
        .then((p) => {
          if (!alive || p === null) return;
          const prev = lastPrice.current;
          lastPrice.current = p;
          setPrice(p);
          if (prev !== null && Math.round(p * 100) !== Math.round(prev * 100)) {
            setTick(p > prev ? "up" : "down");
            window.setTimeout(() => alive && setTick(null), 760);
          }
        })
        .catch(() => undefined);

    pull();
    // Un cambio de precio es un cambio de estado: se marca, no se anima porque sí.
    const id = window.setInterval(pull, 15_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [lib]);

  const rows = useMemo(() => {
    if (!arenas || !lib) return [];
    const rank = (a: Arena) => (lib.statusOf(a) === "live" ? 0 : lib.statusOf(a) === "open" ? 1 : 2);
    const sorted = [...arenas].sort((a, b) => rank(a) - rank(b) || b.playerCount - a.playerCount);
    // A marketing board wants real tables: multiplayer first, solo only when nothing else exists.
    const multi = sorted.filter((a) => a.maxPlayers > 1);
    return (multi.length ? multi : sorted).slice(0, 3);
  }, [arenas, lib]);

  return (
    <aside className="live-board" aria-label={t("live on devnet")}>
      <div className="lb-head">
        <span className="lb-live">
          <span className="dot" /> {t("on devnet now")}
        </span>
        <span className="mono lb-prog" title={PROGRAM}>
          {short(PROGRAM)}
        </span>
      </div>

      <div className="lb-price">
        <span className="lb-market">{t("SOL / USD")}</span>
        <b key={price ?? "none"} className={`mono ${tick ? `tick-${tick}` : ""}`}>
          {price === null ? "—" : `$${price.toFixed(2)}`}
        </b>
        <span className="lb-feed">Pyth Lazer · {t("in the rollup")}</span>
      </div>

      <div className="lb-rows">
        <div className="lb-row lb-th">
          <span>{t("table")}</span>
          <span>{t("seats")}</span>
          <span>{t("pot")}</span>
        </div>
        {arenas === null &&
          [0, 1, 2].map((i) => (
            <div className="lb-row" key={`skel-${i}`} aria-hidden="true">
              <span className="lb-skel" style={{ width: `${58 - i * 8}%` }} />
              <span className="lb-skel" style={{ width: 26 }} />
              <span className="lb-skel" style={{ width: 38 }} />
            </div>
          ))}
        {arenas !== null && rows.length === 0 && <div className="lb-empty">{t("no tables right now")}</div>}
        {rows.map((arena, i) => {
          const status = lib ? lib.statusOf(arena) : "open";
          return (
            <Link
              className="lb-row enter"
              key={arena.publicKey.toBase58()}
              style={{ "--i": i } as React.CSSProperties}
              href={`/play?arena=${arena.publicKey.toBase58()}`}
            >
              <span className="lb-name">
                {lib ? lib.feedNameOf(arena.feed) : "—"}
                <i className={`lb-status ${status}`}>{t(status === "live" ? "live" : status === "open" ? "open" : "done")}</i>
              </span>
              <span className="mono">
                {arena.playerCount}/{arena.maxPlayers}
              </span>
              <span className="mono">{lib ? lib.fmtSol(lib.sol(arena.pot), 2) : "—"}</span>
            </Link>
          );
        })}
      </div>

      <Link className="lb-foot" href="/play">
        {t("open the lobby →")}
      </Link>
    </aside>
  );
}
