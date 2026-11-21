"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import Link from "next/link";
import ArenaView from "@/components/ArenaView";
import Guide, { type GuideStep } from "@/components/Guide";
import { LangSwitch } from "@/components/LangSwitch";
import { handleOf } from "@/components/Bits";
import { useI18n } from "@/lib/i18n";
import {
  Arena,
  type SeriesAccount,
  fetchSeries,
  knownSeries,
  FEEDS,
  FEED_KEYS,
  feedNameOf,
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
/** Empty on a normal deploy; "/the-pit" on GitHub Pages. */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

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
  const [asset, setAsset] = useState("SOL");
  const [guideOpen, setGuideOpen] = useState(false);
  const { c } = useI18n();

  const guideSteps: GuideStep[] = [
    { target: '[data-guide="wallet"]', ...c.play.guide.wallet },
    { target: '[data-guide="arenas"]', ...c.play.guide.board },
    { target: '[data-guide="arena-card"]', ...c.play.guide.enter },
    { target: '[data-guide="host"]', ...c.play.guide.host },
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
      setNotice(c.play.connectedWith(w.label));
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
      setNotice(c.play.airdropRequested);
      setBalance((await base.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL);
    } catch (e: any) {
      setError(c.common.airdropFailed(e?.message ?? String(e)));
    } finally {
      setBusy(null);
    }
  };

  const openArena = (key: PublicKey) => {
    if (!wallet) {
      setError(c.play.connectToEnter);
      setPicking(true);
      return;
    }
    // Keep the URL shareable: a friend opening it lands on the same table.
    window.history.replaceState(null, "", `${BASE_PATH}/play?arena=${key.toBase58()}`);
    setSelected(key);
  };

  const closeArena = () => {
    window.history.replaceState(null, "", `${BASE_PATH}/play`);
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
        feed: FEEDS[asset].address,
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
        <Link className="brand" href="/" title={c.common.backToLanding}>
          <div className="brand-mark">P</div>
          <div>
            <div className="brand-name">THE PIT</div>
            <div className="brand-sub">private instant trading · {c.common.devnet}</div>
          </div>
        </Link>
        {wallet ? (
          <div className="wallet-box" data-guide="wallet">
            <LangSwitch />
            <button className="help-btn" onClick={() => setGuideOpen(true)} title={c.common.replayTour}>
              {c.common.guide}
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
              {copied ? c.common.copied : c.common.copyAddress}
            </button>
            <button className="copy" onClick={disconnect}>
              {c.common.disconnect}
            </button>
          </div>
        ) : (
          <div className="wallet-box" data-guide="wallet">
            <LangSwitch />
            <button className="help-btn" onClick={() => setGuideOpen(true)} title={c.common.startTour}>
              {c.common.guide}
            </button>
            <button className="btn" onClick={() => setPicking(true)}>
              {c.play.connectTitle}
            </button>
          </div>
        )}
      </div>

      <div className="hero">
        <div className="kicker">{c.hero.kicker}</div>
        <h1>
          {c.play.titleA}
          <br />
          {c.play.titleB} <em>{c.play.titleEm}</em>
        </h1>
        <p className="lede">{c.play.lede}</p>
      </div>

      {picking && !wallet && (
        <div className="panel" style={{ marginTop: 4 }}>
          <div className="panel-head">
            <span>{c.play.connectTitle}</span>
            <span>devnet</span>
          </div>
          <div style={{ padding: 16, display: "grid", gap: 10 }}>
            {wallets.length === 0 && (
              <p className="hint" style={{ margin: 0 }}>
                {c.play.noWallet}
              </p>
            )}
            {wallets.map((w) => (
              <button
                key={w.id}
                className="btn"
                disabled={connecting}
                onClick={() => connect(w.id)}
              >
                {connecting ? c.play.connecting : c.play.connectWith(w.label)}
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
                {c.play.getWallet(id.charAt(0).toUpperCase() + id.slice(1))}
              </a>
            ))}
            <p className="hint" style={{ margin: 0 }}>
              {c.play.connectHint}
            </p>
          </div>
        </div>
      )}

      {wallet && balance < 0.05 && (
        <div className="panel" style={{ marginTop: 4 }}>
          <div className="panel-head">
            <span>{c.play.lowBalance}</span>
            <span>{balance.toFixed(3)} SOL</span>
          </div>
          <div style={{ padding: 16 }}>
            <button className="btn ghost" disabled={busy !== null} onClick={airdrop}>
              {busy === "airdrop" ? c.play.requesting : c.play.requestOne}
            </button>
          </div>
        </div>
      )}

      {error && <div className="err">{error}</div>}
      {notice && <div className="ok">{notice}</div>}

      <div className="grid" data-guide="arenas">
        {arenas.length === 0 && (
          <div className="empty" style={{ gridColumn: "1 / -1" }}>
            {c.play.emptyBoard}
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
                <span className={`tag ${st}`}>{c.status[st]}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>
                  {shortKey(a.publicKey)}
                </span>
              </div>
              <div className="card-pot">{fmtSol(sol(a.pot))} SOL</div>
              <div className="card-meta">
                <span>{c.play.players(a.playerCount, a.maxPlayers)}</span>
                <span>{a.duration.toString()}s</span>
                <span>{feedNameOf(a.feed)}</span>
              </div>
              <div className="card-foot">
                <span>{c.play.entry(fmtSol(sol(a.entryFee), 3))}</span>
                <span>{st === "closed" || st === "settled" ? c.play.results : c.play.open}</span>
              </div>
            </div>
          );
        })}
      </div>

      {known.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <span>{c.play.yourArenas}</span>
            <span>{c.play.thisBrowser}</span>
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
              <span className="pnl">{c.play.open}</span>
            </div>
          ))}
        </div>
      )}

      {seriesList.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <span>{c.play.series}</span>
            <span>{c.play.pointsOnChain}</span>
          </div>
          {seriesList.map((sr) => {
            const rows = [...sr.standings].sort((a, b) => b.points - a.points).slice(0, 4);
            return (
              <div key={sr.nonce} className="series-block">
                <div className="series-head">
                  <span className="mono">{sr.nonce}</span>
                  <span className={`pill ${sr.rounds >= sr.maxRounds ? "" : "live"}`}>
                    {c.play.rounds(sr.rounds, sr.maxRounds)}
                  </span>
                </div>
                {rows.length === 0 && <div className="hint">{c.play.noRounds}</div>}
                {rows.map((r, i) => (
                  <div className="row" key={r.player.toBase58()}>
                    <span className="rank mono">{String(i + 1).padStart(2, "0")}</span>
                    <span className="who">
                      {handleOf(r.player.toBase58())}
                      <small>{c.play.standings(r.podiums, r.survived, r.bites)}</small>
                    </span>
                    <span className="pnl up">{c.play.pts(r.points)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="panel" style={{ marginTop: 22 }} data-guide="host">
        <div className="panel-head">
          <span>{c.play.hostTitle}</span>
          <span>{c.play.baseLayer}</span>
        </div>
        <div
          style={{
            padding: 16,
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          }}
        >
          <label className="field" style={{ margin: 0 }}>
            <div className="field-label">
              <span>{c.play.entryFee}</span>
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
              <span>{c.play.roundSeconds}</span>
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
              <span>{c.play.seatsLabel}</span>
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
          <label className="field" style={{ margin: 0 }}>
            <div className="field-label">
              <span>{c.play.marketLabel}</span>
            </div>
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {FEED_KEYS.map((key) => (
                <option key={key} value={key} style={{ background: "var(--panel-2)" }}>
                  {FEEDS[key].name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ padding: "0 0 14px" }}>
          <button
            type="button"
            className={`toggle ${seriesMode ? "on" : ""}`}
            onClick={() => setSeriesMode((v) => !v)}
          >
            <span className="toggle-dot" />
            {seriesMode ? c.play.seriesToggle : c.play.singleToggle}
          </button>
        </div>
        <div style={{ padding: "0 16px 16px" }}>
          <button className="btn" disabled={busy !== null} onClick={createArena}>
            {busy === "create" ? c.play.creating : c.play.create}
          </button>
          <p className="hint">
            {c.play.hostHint}
          </p>
        </div>
      </div>

      <div className="foot-note">
        {wallet ? c.play.footerConnected(wallet.label) : c.play.footerDisconnected}
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
