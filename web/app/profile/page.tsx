"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PitAvatar } from "@/components/PitAvatar";
import { handleOf } from "@/components/Bits";
import { LangSwitch } from "@/components/LangSwitch";
import { useI18n, useT } from "@/lib/i18n";
import {
  type Arena,
  type SeriesWithKey,
  baseConnection,
  fmtSol,
  listArenas,
  listSeries,
  shortKey,
} from "@/lib/pit";
import { type LeaderRow, type Profile, buildTable, profileOf, rankTable } from "@/lib/profile";
import {
  type DetectedWallet,
  type Wallet,
  connectWallet,
  detectWallets,
  installUrl,
  reconnectWallet,
} from "@/lib/wallet";

type Snapshot = { points: number; net: number; rounds: number; ts: number };

const snapshotKey = (address: string) => `pit:profile:${address}`;

function readSnapshot(address: string): Snapshot | null {
  try {
    const raw = window.localStorage.getItem(snapshotKey(address));
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(address: string, snap: Snapshot) {
  try {
    window.localStorage.setItem(snapshotKey(address), JSON.stringify(snap));
  } catch {
    /* private mode */
  }
}

const signed = (n: number, digits = 4) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtSol(Math.abs(n), digits)}`;
const day = (ts: number) =>
  ts > 0 ? new Date(ts * 1000).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "—";

export default function ProfilePage() {
  const { c } = useI18n();
  const t = useT();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [detected, setDetected] = useState<DetectedWallet[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [arenas, setArenas] = useState<Arena[] | null>(null);
  const [series, setSeries] = useState<SeriesWithKey[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<"points" | "net">("points");
  const [copied, setCopied] = useState(false);

  const base = useMemo(() => baseConnection(), []);

  useEffect(() => {
    setDetected(detectWallets());
    reconnectWallet().then((w) => w && setWallet(w));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [listed, seriesList] = await Promise.all([listArenas(base), listSeries(base)]);
      setArenas(listed);
      setSeries(seriesList);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  const table: LeaderRow[] = useMemo(
    () => (arenas ? buildTable(arenas, series) : []),
    [arenas, series],
  );

  useEffect(() => {
    if (!arenas || !wallet) {
      setProfile(null);
      setSnap(null);
      return;
    }
    const address = wallet.publicKey.toBase58();
    const next = profileOf(address, arenas, series);
    setProfile(next);
    setSnap(readSnapshot(address));
    writeSnapshot(address, {
      points: next.row.points,
      net: next.row.net,
      rounds: next.row.rounds,
      ts: Date.now(),
    });
  }, [arenas, series, wallet]);

  const connect = async (id: string) => {
    setConnecting(id);
    setError(null);
    try {
      const w = await connectWallet(id);
      setWallet(w);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setConnecting(null);
    }
  };

  const disconnect = async () => {
    await wallet?.disconnect();
    setWallet(null);
    setProfile(null);
  };

  const copy = () => {
    if (!wallet) return;
    navigator.clipboard?.writeText(wallet.publicKey.toBase58());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const board = useMemo(() => rankTable(table, tab).slice(0, 10), [table, tab]);
  const delta = profile && snap ? profile.row.points - snap.points : null;
  const loading = !arenas;

  return (
    <div className="shell profile">
      <div className="grid-bg" />

      <div className="topbar">
        <Link className="brand" href="/" title={c.common.backToLanding}>
          <div className="brand-mark">P</div>
          <div>
            <div className="brand-name">THE PIT</div>
            <div className="brand-sub">private instant trading · {c.common.devnet}</div>
          </div>
        </Link>
        <div className="wallet-box">
          <LangSwitch />
          <Link className="pill" href="/play">
            {t("← Lobby")}
          </Link>
          {wallet ? (
            <>
              <span className="pill mono">{shortKey(wallet.publicKey)}</span>
              <button className="copy" onClick={copy}>
                {copied ? c.common.copied : c.common.copyAddress}
              </button>
              <button className="copy" onClick={disconnect}>
                {c.common.disconnect}
              </button>
            </>
          ) : (
            <button
              className="btn"
              onClick={() =>
                document.querySelector(".pf-connect")?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
            >
              {t("Connect wallet")}
            </button>
          )}
        </div>
      </div>

      {!wallet && (
        <section className="pf-connect">
          <div className="kicker">{t("your record")}</div>
          <h1>{t("Your runs, on the record.")}</h1>
          <p className="lede">
            {t(
              "Connect the wallet you play with. Points, PnL, rounds, bites and your place on the board are rebuilt from Solana — no account, no server, nothing to sign.",
            )}
          </p>
          <div className="pf-wallets">
            {detected.length === 0 && (
              <p className="hint">
                {t("No wallet found in this browser.")}{" "}
                <a className="backlink" href={installUrl("phantom")} target="_blank" rel="noreferrer">
                  {t("Install Phantom")}
                </a>
              </p>
            )}
            {detected.map((w) => (
              <button
                key={w.id}
                className="btn"
                disabled={connecting === w.id}
                onClick={() => connect(w.id)}
              >
                {connecting === w.id ? t("connecting…") : `${t("Connect")} ${w.label}`}
              </button>
            ))}
          </div>
          {error && <div className="err">{error}</div>}
        </section>
      )}

      {wallet && (
        <>
          {loading && (
            <section className="pf-loading">
              <div className="ring-track">
                <div className="ring-fill" style={{ width: "35%" }} />
              </div>
              <p className="hint">{t("reading your rounds from Solana and the rollups…")}</p>
            </section>
          )}

          {!loading && profile && (
            <>
              <section className="pf-hero panel">
                <div className="pf-id">
                  <div className="pf-avatar">
                    <PitAvatar seed={profile.address} size={104} muted={profile.row.rounds === 0} />
                  </div>
                  <div>
                    <div className="pf-handle mono">{handleOf(profile.address)}</div>
                    <div className="pf-addr mono">{profile.address}</div>
                    <div className="pf-tags">
                      {profile.rankPoints === null ? (
                        <span className="tag ghost">{t("unranked")}</span>
                      ) : (
                        <>
                          <span className="tag">
                            {t("rank #{n} of {total} · points", {
                              n: profile.rankPoints,
                              total: profile.totalPlayers,
                            })}
                          </span>
                          <span className="tag ghost">{t("rank #{n} · PnL", { n: profile.rankNet ?? 0 })}</span>
                        </>
                      )}
                      {profile.firstSeen > 0 && (
                        <span className="tag ghost">{t("playing since {date}", { date: day(profile.firstSeen) })}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="pf-hero-note">
                  <span className="mono">{t("derived from on-chain accounts")}</span>
                  <button className="copy" onClick={load}>
                    {t("refresh")}
                  </button>
                </div>
              </section>

              <section className="pf-stats">
                <article className="pf-card">
                  <div className="stat-label">{t("points")}</div>
                  <div className="pf-value mono">
                    {profile.row.points}
                    {delta !== null && delta !== 0 && (
                      <span className={`pf-delta ${delta > 0 ? "up" : "down"}`}>
                        {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
                      </span>
                    )}
                  </div>
                  <div className="stat-sub">
                    {delta === null
                      ? t("first visit — the next one shows the change")
                      : delta === 0
                        ? t("no change since your last visit")
                        : delta > 0
                          ? t("up since your last visit")
                          : t("down since your last visit")}
                  </div>
                </article>

                <article className="pf-card">
                  <div className="stat-label">{t("PnL")}</div>
                  <div className={`pf-value mono ${profile.row.net > 0 ? "up" : profile.row.net < 0 ? "down" : ""}`}>
                    {profile.row.rounds === 0 ? "—" : signed(profile.row.net)}
                    {profile.row.rounds > 0 && <span className="pf-unit">SOL</span>}
                  </div>
                  <div className="stat-sub">
                    {profile.row.rounds === 0
                      ? t("no closed rounds yet")
                      : profile.row.net > 0
                      ? t("in {invested} · out {earned} · won {profit}", {
                          invested: fmtSol(profile.row.invested, 3),
                          earned: fmtSol(profile.row.earned, 3),
                          profit: fmtSol(profile.row.net, 3),
                        })
                      : t("in {invested} · out {earned} · lost {loss}", {
                          invested: fmtSol(profile.row.invested, 3),
                          earned: fmtSol(profile.row.earned, 3),
                          loss: fmtSol(Math.abs(profile.row.net), 3),
                        })}
                  </div>
                </article>

                <article className="pf-card">
                  <div className="stat-label">{t("rounds played")}</div>
                  <div className="pf-value mono">
                    {profile.row.rounds}
                    {profile.liveRounds > 0 && <span className="pf-unit">{t("+{n} live", { n: profile.liveRounds })}</span>}
                  </div>
                  <div className="stat-sub">
                    {t("record")}{" "}
                    {t("{wins}W · {losses}L · {flats}F", {
                      wins: profile.row.wins,
                      losses: profile.row.losses,
                      flats: profile.row.rounds - profile.row.wins - profile.row.losses,
                    })}
                  </div>
                </article>

                <article className="pf-card">
                  <div className="stat-label">{t("bites taken")}</div>
                  <div className="pf-value mono">
                    {profile.row.bites}
                    <span className="pf-unit">{t("from the pit")}</span>
                  </div>
                  <div className="stat-sub">
                    {t("{wins} podiums · {trades} orders", {
                      wins: profile.row.podiums,
                      trades: profile.row.trades,
                    })}
                  </div>
                </article>
              </section>

              <section className="pf-mini">
                <div>
                  <span>{t("best round")}</span>
                  <b className={profile.best && profile.best.net > 0 ? "up" : ""}>
                    {profile.best && profile.best.net > 0 ? `${signed(profile.best.net)} SOL` : "—"}
                  </b>
                </div>
                <div>
                  <span>{t("worst round")}</span>
                  <b className={profile.worst && profile.worst.net < 0 ? "down" : ""}>
                    {profile.worst && profile.worst.net < 0 ? `${signed(profile.worst.net)} SOL` : "—"}
                  </b>
                </div>
                <div>
                  <span>{t("series played")}</span>
                  <b className="mono">{profile.series.length}</b>
                </div>
                <div>
                  <span>{t("orders placed")}</span>
                  <b className="mono">{profile.row.trades}</b>
                </div>
              </section>

              <div className="pf-cols">
                <section className="panel pf-rounds">
                  <div className="panel-head">
                    <h2>{t("your rounds")}</h2>
                    <Link className="backlink" href="/play">
                      {t("find a table →")}
                    </Link>
                  </div>
                  {profile.recent.length === 0 ? (
                    <p className="hint">
                      {t("No rounds yet. Your first table writes the first line here.")}{" "}
                      <Link className="backlink" href="/play">
                        {t("enter an arena")}
                      </Link>
                    </p>
                  ) : (
                    <div className="pf-table">
                      <div className="pf-tr pf-th mono">
                        <span>{t("date")}</span>
                        <span>{t("table")}</span>
                        <span>{t("entry")}</span>
                        <span>{t("result")}</span>
                        <span>{t("place")}</span>
                      </div>
                      {profile.recent.map((r) => (
                        <Link className="pf-tr" key={r.key} href={`/play?arena=${r.key}`}>
                          <span className="mono">{day(r.endAt || r.startAt)}</span>
                          <span className="mono">
                            {r.solo ? t("solo") : `${r.players} ${t("seats")}`}
                            {r.series ? ` · ${t("r{n}", { n: r.roundNo })}` : ""}
                            {r.outcome === "live" && <i className="live-chip">{t("live")}</i>}
                            {r.outcome === "pending" && <i className="live-chip">{t("payout pending")}</i>}
                          </span>
                          <span className="mono">{fmtSol(r.entry, 3)}</span>
                          <span className={`mono ${r.net > 0 ? "up" : r.net < 0 ? "down" : ""}`}>
                            {r.outcome === "live" || r.outcome === "pending" ? "—" : `${signed(r.net)} SOL`}
                          </span>
                          <span className="mono">
                            {r.place && !r.solo ? `${r.place}º` : "—"}
                            {r.outcome === "lost" && r.bites > 0 ? ` · ${r.bites}🦷` : ""}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </section>

                <section className="panel pf-board">
                  <div className="panel-head">
                    <h2>{t("leaderboard")}</h2>
                    <div className="pf-tabs">
                      <button className={tab === "points" ? "on" : ""} onClick={() => setTab("points")}>
                        {t("points")}
                      </button>
                      <button className={tab === "net" ? "on" : ""} onClick={() => setTab("net")}>
                        {t("PnL")}
                      </button>
                    </div>
                  </div>
                  <div className="pf-board-list">
                    {board.length === 0 && <p className="hint">{t("no players yet")}</p>}
                    {board.map((row, i) => {
                      const you = row.address === profile.address;
                      return (
                        <div className={`pf-board-row ${you ? "you" : ""}`} key={row.address}>
                          <span className="pf-pos mono">{i + 1}</span>
                          <PitAvatar seed={row.address} size={26} muted={!you && i > 2} />
                          <span className="pf-board-name mono">{handleOf(row.address)}</span>
                          <span className="pf-board-value mono">
                            {tab === "points" ? row.points : `${signed(row.net, 3)}`}
                            {you && <i className="pf-you">{t("you")}</i>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="foot-note">
                    {t(
                      "Points come from series rounds on-chain (podium 10/6/3, +1 per bite survived, +2 last standing). PnL is paid minus entry on closed rounds.",
                    )}
                  </p>
                </section>
              </div>

              {profile.series.length > 0 && (
                <section className="panel pf-series">
                  <div className="panel-head">
                    <h2>{t("your series")}</h2>
                  </div>
                  {profile.series.map((s) => (
                    <div className="pf-series-row" key={s.key}>
                      <span className="mono">{shortKey(s.key)}</span>
                      <span>
                        {t("rounds")} {s.rounds} · {t("podiums")} {s.podiums}
                      </span>
                      <b className="mono">{s.points} pts</b>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}

          {error && <div className="err">{error}</div>}
        </>
      )}
    </div>
  );
}
