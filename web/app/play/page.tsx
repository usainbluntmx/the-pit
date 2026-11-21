"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as anchor from "@anchor-lang/core";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import Link from "next/link";
import ArenaView from "@/components/ArenaView";
import { handleOf } from "@/components/Bits";
import {
  Arena,
  type SeriesAccount,
  fetchSeries,
  knownSeries,
  FEEDS,
  baseConnection,
  buildCreateArena,
  fmtSol,
  listArenas,
  programAt,
  rememberSeries,
  sendTx,
  seriesPda,
  shortKey,
  sol,
  statusOf,
} from "@/lib/pit";

const STORAGE_KEY = "pit:secret";
const ARENAS_KEY = "pit:arenas";

function rememberArena(pubkey: string) {
  try {
    const raw = window.localStorage.getItem(ARENAS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(pubkey)) {
      list.unshift(pubkey);
      window.localStorage.setItem(ARENAS_KEY, JSON.stringify(list.slice(0, 20)));
    }
  } catch {
    /* ignore */
  }
}

function knownArenas(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(ARENAS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function loadOrCreateWallet(): Keypair | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored)));
    } catch {
      /* fall through and regenerate */
    }
  }
  const kp = Keypair.generate();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

export default function Home() {
  const [payer, setPayer] = useState<Keypair | null>(null);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [selected, setSelected] = useState<PublicKey | null>(null);
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [known, setKnown] = useState<string[]>([]);

  const [entryFee, setEntryFee] = useState(0.01);
  const [duration, setDuration] = useState(300);
  const [seriesMode, setSeriesMode] = useState(false);
  const [seriesList, setSeriesList] = useState<SeriesAccount[]>([]);
  const [maxPlayers, setMaxPlayers] = useState(8);

  const base = useMemo(() => baseConnection(), []);

  useEffect(() => {
    setPayer(loadOrCreateWallet());
    setKnown(knownArenas());
  }, []);

  const refreshSeries = useCallback(async () => {
    const rows = await Promise.all(
      knownSeries().map((k) => fetchSeries(base, new PublicKey(k)).catch(() => null)),
    );
    setSeriesList(rows.filter(Boolean) as SeriesAccount[]);
  }, [base]);

  const refresh = useCallback(async () => {
    try {
      const list = await listArenas(base);
      setArenas(list);
      if (payer) setBalance((await base.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [base, payer]);

  useEffect(() => {
    if (!payer) return;
    refresh();
    refreshSeries();
    const id = setInterval(() => {
      refresh();
      refreshSeries();
    }, 6000);
    return () => clearInterval(id);
  }, [payer, refresh, refreshSeries]);

  const createArena = async () => {
    if (!payer) return;
    setBusy("create");
    setError(null);
    setNotice(null);
    try {
      const nonce = `s1-${Date.now().toString(36)}`;
      const program = programAt(base, payer.publicKey);
      const { builder, arena } = buildCreateArena(program, {
        nonce,
        entryFeeSol: entryFee,
        durationSecs: duration,
        maxPlayers,
        rakeBps: 0,
        feed: FEEDS.SOL.address,
        creator: payer.publicKey,
      });
      let seriesKey: PublicKey | null = null;
      if (seriesMode) {
        const seriesNonce = `${nonce}-s`;
        const [sk] = seriesPda(seriesNonce);
        const sTx = await program.methods
          .createSeries(seriesNonce, 3)
          .accounts({ creator: payer.publicKey, series: sk, systemProgram: SystemProgram.programId })
          .transaction();
        await sendTx(base, sTx, payer);
        seriesKey = sk;
        rememberSeries(sk.toBase58());
      }

      const tx = await builder.transaction();
      const sig = await sendTx(base, tx, payer);

      if (seriesKey) {
        const bTx = await program.methods
          .bindSeries(nonce, seriesKey)
          .accounts({ arena, series: seriesKey })
          .transaction();
        await sendTx(base, bTx, payer);
      }

      setNotice(`arena ${arena.toBase58()} · ${sig}`);
      rememberArena(arena.toBase58());
      setKnown(knownArenas());
      await refresh();
      await refreshSeries();
      setSelected(arena);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  if (selected && payer) {
    return <ArenaView arenaPubkey={selected} payer={payer} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="shell">
      <div className="grid-bg" />
      <div className="topbar">
        <Link className="brand" href="/" title="back to the landing">
          <div className="brand-mark">P</div>
          <div>
            <div className="brand-name">THE PIT</div>
            <div className="brand-sub">private instant trading · solana devnet</div>
          </div>
        </Link>
        <div className="wallet-box">
          <span className="pill mono">{balance.toFixed(3)} SOL</span>
          <span className="pill mono">{payer ? shortKey(payer.publicKey) : "…"}</span>
          <button
            className="copy"
            onClick={() => {
              if (!payer) return;
              navigator.clipboard?.writeText(payer.publicKey.toBase58());
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "copied" : "copy address"}
          </button>
        </div>
      </div>

      <div className="hero">
        <div className="kicker">Entertainment finance · Blitz v10</div>
        <h1>
          Same bankroll.
          <br />
          Real prices. <em>One pot.</em>
        </h1>
        <p className="lede">
          A trading arena where everyone starts with 1,000 credits and ten minutes on the clock.
          Trades execute inside a MagicBlock rollup — gasless, 10ms — and the podium splits the
          escrow. Your book stays sealed until the bell.
        </p>
      </div>

      {error && <div className="err">{error}</div>}
      {notice && <div className="ok">{notice}</div>}

      <div className="grid">
        {arenas.length === 0 && (
          <div className="empty" style={{ gridColumn: "1 / -1" }}>
            no public arenas on the board right now. Hosted arenas appear here once they settle on base.
          </div>
        )}
        {arenas.map((a) => {
          const st = statusOf(a);
          return (
            <div className="card" key={a.publicKey.toBase58()} onClick={() => setSelected(a.publicKey)}>
              <div className="card-top">
                <span className={`tag ${st}`}>{st}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>
                  {shortKey(a.publicKey)}
                </span>
              </div>
              <div className="card-pot">{fmtSol(sol(a.pot))} SOL</div>
              <div className="card-meta">
                <span>
                  {a.playerCount}/{a.maxPlayers} players
                </span>
                <span>{a.duration.toString()}s</span>
                <span>winners {a.winnerCount || 3}</span>
              </div>
              <div className="card-foot">
                <span>entry {fmtSol(sol(a.entryFee), 3)} SOL</span>
                <span>{st === "closed" || st === "settled" ? "results →" : "open →"}</span>
              </div>
            </div>
          );
        })}
      </div>

      {known.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <span>Your arenas</span>
            <span>this browser</span>
          </div>
          {known.map((k) => (
            <div
              className="row"
              key={k}
              style={{ cursor: "pointer" }}
              onClick={() => setSelected(new PublicKey(k))}
            >
              <span className="who mono" style={{ fontSize: 12 }}>
                {k}
              </span>
              <span className="pnl">open →</span>
            </div>
          ))}
        </div>
      )}

      {seriesList.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <span>Series</span>
            <span>points on-chain</span>
          </div>
          {seriesList.map((sr) => {
            const rows = [...sr.standings].sort((a, b) => b.points - a.points).slice(0, 4);
            return (
              <div key={sr.nonce} className="series-block">
                <div className="series-head">
                  <span className="mono">{sr.nonce}</span>
                  <span className={`pill ${sr.rounds >= sr.maxRounds ? "" : "live"}`}>
                    {sr.rounds}/{sr.maxRounds} rounds
                  </span>
                </div>
                {rows.length === 0 && <div className="hint">no rounds recorded yet</div>}
                {rows.map((r, i) => (
                  <div className="row" key={r.player.toBase58()}>
                    <span className="rank mono">{String(i + 1).padStart(2, "0")}</span>
                    <span className="who">
                      {handleOf(r.player.toBase58())}
                      <small>
                        {r.podiums} podiums · {r.survived} survived · {r.bites} bitten
                      </small>
                    </span>
                    <span className="pnl up">{r.points} pts</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="panel" style={{ marginTop: 22 }}>
        <div className="panel-head">
          <span>Host an arena</span>
          <span>base layer</span>
        </div>
        <div style={{ padding: 16, display: "grid", gap: 14, gridTemplateColumns: "repeat(3, 1fr)" }}>
          <label className="field" style={{ margin: 0 }}>
            <div className="field-label">
              <span>Entry fee (SOL)</span>
            </div>
            <input
              type="number"
              step="0.005"
              min="0.01"
              value={entryFee}
              onChange={(e) => setEntryFee(Number(e.target.value))}
              style={inputStyle}
            />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <div className="field-label">
              <span>Round (seconds)</span>
            </div>
            <input
              type="number"
              step="30"
              min="60"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              style={inputStyle}
            />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <div className="field-label">
              <span>Seats</span>
            </div>
            <input
              type="number"
              min="2"
              max="16"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              style={inputStyle}
            />
          </label>
        </div>
        <div style={{ padding: "0 0 14px" }}>
          <button
            type="button"
            className={`toggle ${seriesMode ? "on" : ""}`}
            onClick={() => setSeriesMode((v) => !v)}
          >
            <span className="toggle-dot" />
            {seriesMode ? "Series · 3 rounds, cumulative points" : "Single round"}
          </button>
        </div>
        <div style={{ padding: "0 16px 16px" }}>
          <button className="btn" disabled={busy !== null} onClick={createArena}>
            {busy === "create" ? "creating…" : "Create arena"}
          </button>
          <p className="hint">
            The arena is a PDA on Solana. Joining pays the entry fee into a vault; locking delegates
            the account to a MagicBlock rollup where trades cost nothing.
          </p>
        </div>
      </div>

      <div className="foot-note">
        Wallet: a local keypair is generated in your browser and kept in localStorage — no Phantom
        connection yet. To play you need devnet SOL at that address (copy address). Program:{" "}
        <span className="mono">4iVtfWTrVo4iUAeTBVhhjkDr9kGK4dTD95vKM8c6dbar</span>.
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--panel-2)",
  border: "1px solid var(--line)",
  borderRadius: 9,
  padding: "11px 12px",
  color: "var(--text)",
  fontSize: 14,
  fontFamily: "inherit",
};
