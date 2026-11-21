"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import Link from "next/link";
import ArenaView from "@/components/ArenaView";
import Guide, { type GuideStep } from "@/components/Guide";
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
import {
  type DetectedWallet,
  type Wallet,
  connectWallet,
  detectWallets,
  installUrl,
  reconnectWallet,
  requestAirdrop,
} from "@/lib/wallet";

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

export default function Home() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [picking, setPicking] = useState(false);
  const [connecting, setConnecting] = useState(false);
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
  const [guideOpen, setGuideOpen] = useState(false);

  const guideSteps: GuideStep[] = [
    {
      target: '[data-guide="wallet"]',
      title: "This is your wallet",
      body:
        "Connect Phantom, Solflare or Backpack. The address and the SOL balance on the right are yours — the app never creates one for you.",
      why:
        "Nothing is custodial: every transaction is signed inside your extension and the enclave token is signed the same way. If the balance is low, the airdrop button appears right here.",
    },
    {
      target: '[data-guide="arenas"]',
      title: "The board",
      body:
        "OPEN means seats are available, LIVE means the round is already running on the rollup, CLOSED means the pot was paid out.",
      why:
        "The list merges the Solana base layer with the three devnet rollups: a delegated arena disappears from the base scan, so a single source would hide every live round.",
    },
    {
      target: '[data-guide="arena-card"]',
      title: "Enter a table",
      body:
        "Click a card to open that arena. The URL turns into /play?arena=… so you can send the exact table to another player.",
      why:
        "A round cannot start alone: it needs two seats. The invite link is how the second wallet gets in.",
    },
    {
      target: '[data-guide="host"]',
      title: "Host your own arena",
      body:
        "Choose entry fee, round length and seats, then create. As the host you lock the arena once at least two players are seated.",
      why:
        "The entry fee goes into an escrow vault owned by the program, not by you. The host can start the clock but can never touch the pot.",
    },
  ];

  const base = useMemo(() => baseConnection(), []);

  useEffect(() => {
    setKnown(knownArenas());
    setWallets(detectWallets());
    // A shared link opens the arena directly: /play?arena=<pubkey>
    const target = new URLSearchParams(window.location.search).get("arena");
    if (target) {
      try {
        setSelected(new PublicKey(target));
      } catch {
        /* not a valid key — ignore the query string */
      }
    }
    // Extensions inject after hydration, so re-scan once the page is idle.
    const t = window.setTimeout(() => setWallets(detectWallets()), 900);
    reconnectWallet().then((w) => {
      if (w) setWallet(w);
    });
    // First visit: walk the user through the board once.
    if (!window.localStorage.getItem("pit:guide:lobby")) {
      window.setTimeout(() => setGuideOpen(true), 1100);
    }
    return () => window.clearTimeout(t);
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
      if (wallet) setBalance((await base.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [base, wallet]);

  useEffect(() => {
    refresh();
    refreshSeries();
    const id = setInterval(() => {
      refresh();
      refreshSeries();
    }, 6000);
    return () => clearInterval(id);
  }, [refresh, refreshSeries]);

  const connect = async (id: string) => {
    setConnecting(true);
    setError(null);
    try {
      const w = await connectWallet(id);
      setWallet(w);
      setPicking(false);
      setNotice(`${w.label} connected`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await wallet?.disconnect();
    setWallet(null);
    setBalance(0);
    setNotice(null);
  };

  const airdrop = async () => {
    if (!wallet) return;
    setBusy("airdrop");
    setError(null);
    try {
      await requestAirdrop(wallet.publicKey, 1);
      setNotice("1 SOL requested from the devnet faucet");
      setBalance((await base.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL);
    } catch (e: any) {
      setError(`${e?.message ?? String(e)} — you can also use https://faucet.solana.com`);
    } finally {
      setBusy(null);
    }
  };

  const openArena = (key: PublicKey) => {
    if (!wallet) {
      setError("Connect a wallet to enter an arena");
      setPicking(true);
      return;
    }
    // Keep the URL shareable: a friend opening it lands on the same table.
    window.history.replaceState(null, "", `/play?arena=${key.toBase58()}`);
    setSelected(key);
  };

  const closeArena = () => {
    window.history.replaceState(null, "", "/play");
    setSelected(null);
  };

  const createArena = async () => {
    if (!wallet) {
      setPicking(true);
      return;
    }
    setBusy("create");
    setError(null);
    setNotice(null);
    try {
      const nonce = `s1-${Date.now().toString(36)}`;
      const program = programAt(base, wallet.publicKey);
      const { builder, arena } = buildCreateArena(program, {
        nonce,
        entryFeeSol: entryFee,
        durationSecs: duration,
        maxPlayers,
        rakeBps: 0,
        feed: FEEDS.SOL.address,
        creator: wallet.publicKey,
      });
      let seriesKey: PublicKey | null = null;
      if (seriesMode) {
        const seriesNonce = `${nonce}-s`;
        const [sk] = seriesPda(seriesNonce);
        const sTx = await program.methods
          .createSeries(seriesNonce, 3)
          .accounts({ creator: wallet.publicKey, series: sk, systemProgram: SystemProgram.programId })
          .transaction();
        await sendTx(base, sTx, wallet);
        seriesKey = sk;
        rememberSeries(sk.toBase58());
      }

      const tx = await builder.transaction();
      const sig = await sendTx(base, tx, wallet);

      if (seriesKey) {
        const bTx = await program.methods
          .bindSeries(nonce, seriesKey)
          .accounts({ arena, series: seriesKey })
          .transaction();
        await sendTx(base, bTx, wallet);
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

  if (selected && wallet) {
    return <ArenaView arenaPubkey={selected} wallet={wallet} onBack={closeArena} />;
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
        {wallet ? (
          <div className="wallet-box" data-guide="wallet">
            <button className="help-btn" onClick={() => setGuideOpen(true)} title="Replay the guided tour">
              ? guide
            </button>
            <span className="pill mono">{balance.toFixed(3)} SOL</span>
            <span className="pill mono">{shortKey(wallet.publicKey)}</span>
            <button
              className="copy"
              onClick={() => {
                navigator.clipboard?.writeText(wallet.publicKey.toBase58());
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "copied" : "copy address"}
            </button>
            <button className="copy" onClick={disconnect}>
              disconnect
            </button>
          </div>
        ) : (
          <div className="wallet-box" data-guide="wallet">
            <button className="help-btn" onClick={() => setGuideOpen(true)} title="Start the guided tour">
              ? guide
            </button>
            <button className="btn" onClick={() => setPicking(true)}>
              Connect wallet
            </button>
          </div>
        )}
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

      {picking && !wallet && (
        <div className="panel" style={{ marginTop: 4 }}>
          <div className="panel-head">
            <span>Connect a wallet</span>
            <span>devnet</span>
          </div>
          <div style={{ padding: 16, display: "grid", gap: 10 }}>
            {wallets.length === 0 && (
              <p className="hint" style={{ margin: 0 }}>
                No Solana wallet detected in this browser. Install one and reload:
              </p>
            )}
            {wallets.map((w) => (
              <button
                key={w.id}
                className="btn"
                disabled={connecting}
                onClick={() => connect(w.id)}
              >
                {connecting ? "connecting…" : `Connect ${w.label}`}
              </button>
            ))}
            {["phantom", "solflare", "backpack"].map((id) => (
              <a
                key={id}
                className="btn ghost"
                style={{ display: "block", textAlign: "center", padding: 14 }}
                href={installUrl(id)}
                target="_blank"
                rel="noreferrer"
              >
                Get {id.charAt(0).toUpperCase() + id.slice(1)}
              </a>
            ))}
            <p className="hint" style={{ margin: 0 }}>
              Your keys never leave the extension: the app only asks it to sign transactions and the
              enclave challenge. You need devnet SOL to pay the entry fee — there is an airdrop
              button under the wallet once connected.
            </p>
          </div>
        </div>
      )}

      {wallet && balance < 0.05 && (
        <div className="panel" style={{ marginTop: 4 }}>
          <div className="panel-head">
            <span>Low devnet balance</span>
            <span>{balance.toFixed(3)} SOL</span>
          </div>
          <div style={{ padding: 16 }}>
            <button className="btn ghost" disabled={busy !== null} onClick={airdrop}>
              {busy === "airdrop" ? "requesting…" : "Request 1 devnet SOL"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="err">{error}</div>}
      {notice && <div className="ok">{notice}</div>}

      <div className="grid" data-guide="arenas">
        {arenas.length === 0 && (
          <div className="empty" style={{ gridColumn: "1 / -1" }}>
            no public arenas on the board right now. Hosted arenas appear here once they settle on base.
          </div>
        )}
        {arenas.map((a) => {
          const st = statusOf(a);
          return (
            <div
              className="card"
              key={a.publicKey.toBase58()}
              data-guide="arena-card"
              onClick={() => openArena(a.publicKey)}
            >
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
              onClick={() => openArena(new PublicKey(k))}
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

      <div className="panel" style={{ marginTop: 22 }} data-guide="host">
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
              max="8"
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
            the account to a MagicBlock rollup where trades cost nothing. Arenas fill with real
            wallets only — no bots join on their own, so invite a second player before locking.
          </p>
        </div>
      </div>

      <div className="foot-note">
        {wallet
          ? `Connected with ${wallet.label} on devnet. Every action — join, trade, settle — is a transaction signed by your wallet. Program: `
          : "Connect a Solana wallet to play. Nothing is custodial: the app never sees your keys. Program: "}
        <span className="mono">4iVtfWTrVo4iUAeTBVhhjkDr9kGK4dTD95vKM8c6dbar</span>.
      </div>

      <Guide
        steps={guideSteps}
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        storageKey="pit:guide:lobby"
      />
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
