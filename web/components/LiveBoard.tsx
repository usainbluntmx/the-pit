"use client";

/**
 * The product, on the landing page.
 *
 * Not a screenshot and not a mock: it reads the same program the app reads — devnet arenas
 * plus the SOL/USD feed — so the numbers move when the chain moves. If nothing is open, it
 * says so instead of inventing a table.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Arena } from "@/lib/pit";
import { useT } from "@/lib/i18n";

const PROGRAM = "4iVtfWTrVo4iUAeTBVhhjkDr9kGK4dTD95vKM8c6dbar";
const short = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

export function LiveBoard() {
  const t = useT();
  const [arenas, setArenas] = useState<Arena[] | null>(null);
  const [price, setPrice] = useState<number | null>(null);

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
    lib
      .readPriceLive()
      .then((p) => alive && setPrice(p))
      .catch(() => undefined);
    return () => {
      alive = false;
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
        <b className="mono">{price === null ? "—" : `$${price.toFixed(2)}`}</b>
        <span className="lb-feed">Pyth Lazer · {t("in the rollup")}</span>
      </div>

      <div className="lb-rows">
        <div className="lb-row lb-th">
          <span>{t("table")}</span>
          <span>{t("seats")}</span>
          <span>{t("pot")}</span>
        </div>
        {arenas === null && <div className="lb-empty">{t("reading the board…")}</div>}
        {arenas !== null && rows.length === 0 && <div className="lb-empty">{t("no tables right now")}</div>}
        {rows.map((arena) => {
          const status = lib ? lib.statusOf(arena) : "open";
          return (
            <Link className="lb-row" key={arena.publicKey.toBase58()} href={`/play?arena=${arena.publicKey.toBase58()}`}>
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
