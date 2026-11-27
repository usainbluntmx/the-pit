"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
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
import { linkAndFund, loadTrading, saveTrading, tradingWallet, withdrawTrading } from "@/lib/trading";

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
  const [owner, setOwner] = useState<Wallet | null>(null);
  const [trading, setTrading] = useState<Keypair | null>(null);
  const [linking, setLinking] = useState(false);
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
  const [solo, setSolo] = useState(false);
  const [asset, setAsset] = useState("SOL");
  const [guideOpen, setGuideOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const { c } = useI18n();

  const guideSteps: GuideStep[] = [
    { target: '[data-guide="wallet"]', ...c.play.guide.wallet },
    { target: '[data-guide="arenas"]', ...c.play.guide.board },
    { target: '[data-guide="arena-card"]', ...c.play.guide.enter },
    { target: '[data-guide="host"]', ...c.play.guide.host },
  ];

  const base = useMemo(() => baseConnection(), []);

  /**
   * After the main wallet connects, prefer its trading account when one exists:
   * the rest of the app then signs everything with the disposable key.
   */
  const adoptWallet = useCallback((main: Wallet) => {
    setOwner(main);
    const kp = loadTrading(main.publicKey.toBase58());
    if (kp) {
      setTrading(kp);
      setWallet(tradingWallet(kp, main.publicKey));
    } else {
      setTrading(null);
      setWallet(main);
    }
  }, []);

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

    // The landing sells the solo run with its own link: /play?mode=solo
    if (new URLSearchParams(window.location.search).get("mode") === "solo") {
      setSolo(true);
      // The board arrives after the first RPC round-trip, so the panel moves down:
      // scroll once the layout has settled, and again after the arena list renders.
      const bring = () =>
        hostRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(bring, 900);
      window.setTimeout(bring, 2200);
    }
    // Extensions inject after hydration, so re-scan once the page is idle.
    const t = window.setTimeout(() => setWallets(detectWallets()), 900);
    reconnectWallet().then((w) => {
      if (w) adoptWallet(w);
    });
    // First visit: walk the user through the board once.
    if (!window.localStorage.getItem("pit:guide:lobby")) {
      window.setTimeout(() => setGuideOpen(true), 1100);
    }
    return () => window.clearTimeout(t);
  }, [adoptWallet]);

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
      adoptWallet(w);
      setPicking(false);
      setNotice(c.play.connectedWith(w.label));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await owner?.disconnect();
    setOwner(null);
    setTrading(null);
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

  const createTrading = async () => {
    if (!owner) {
      setPicking(true);
      return;
    }
    setLinking(true);
    setError(null);
    setNotice(null);
    try {
      const kp = Keypair.generate();
      const { amount } = await linkAndFund(owner, kp);
      saveTrading(owner.publicKey.toBase58(), kp);
      setTrading(kp);
      setWallet(tradingWallet(kp, owner.publicKey));
      setBalance((await base.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL);
      setNotice(`${c.play.tradingFunded.replace("{amount}", String(amount))} · ${shortKey(kp.publicKey)}`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLinking(false);
    }
  };

  const withdraw = async () => {
    if (!trading || !owner) return;
    setBusy("withdraw");
    setError(null);
    try {
      const sig = await withdrawTrading(trading, owner.publicKey, base);
      setNotice(`withdraw · ${sig.slice(0, 8)}…${sig.slice(-6)}`);
      setBalance((await base.getBalance(trading.publicKey)) / LAMPORTS_PER_SOL);
    } catch (e: any) {
      setError(e?.message ?? String(e));
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

  const startSolo = () => {
    setSolo(true);
    if (!wallet) setPicking(true);
    window.setTimeout(
      () => hostRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      350,
    );
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
        maxPlayers: solo ? 1 : maxPlayers,
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

  const onTrading = !!(wallet && trading && wallet.publicKey.equals(trading.publicKey));

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
            <Link className="pill" href="/profile">
              {c.nav.profile}
            </Link>
            <button className="help-btn" onClick={() => setGuideOpen(true)} title={c.common.replayTour}>
              {c.common.guide}
            </button>
            {onTrading && (
              <span className="pill" title={owner?.publicKey.toBase58()}>
                <span className="dot" /> trading
              </span>
            )}
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
            <Link className="pill" href="/profile">
              {c.nav.profile}
            </Link>
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
        <div className="play-cta">
          <button type="button" className="btn" onClick={startSolo}>
            {c.play.playSolo}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              document
                .querySelector('[data-guide="arenas"]')
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            {c.play.playArena}
          </button>
        </div>
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

      {owner && (
        <div className="panel" style={{ marginTop: 4 }}>
          <div className="panel-head">
            <span>{trading ? c.play.tradingActive : c.play.tradingTitle}</span>
            <span className="mono">{trading ? shortKey(trading.publicKey) : "devnet"}</span>
          </div>
          <div style={{ padding: 16, display: "grid", gap: 10 }}>
            {!trading ? (
              <>
                <p className="hint" style={{ margin: 0 }}>
                  {c.play.tradingBody}
                </p>
                <button className="btn" disabled={linking} onClick={createTrading}>
                  {linking ? c.play.tradingCreating : c.play.tradingCreate}
                </button>
              </>
            ) : (
              <>
                <p className="hint" style={{ margin: 0 }}>
                  {c.play.tradingNote}{" "}
                  <span className="mono" title={owner.publicKey.toBase58()}>
                    owner {shortKey(owner.publicKey)}
                  </span>
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="btn ghost"
                    style={{ flex: 1 }}
                    disabled={busy !== null}
                    onClick={withdraw}
                  >
                    {c.play.tradingWithdraw}
                  </button>
                  <button
                    className="btn ghost"
                    style={{ flex: 1 }}
                    onClick={() =>
                      setWallet(
                        onTrading && owner
                          ? owner
                          : trading && owner
                            ? tradingWallet(trading, owner.publicKey)
                            : null,
                      )
                    }
                  >
                    {onTrading ? c.play.tradingUseMain : c.play.tradingUseAccount}
                  </button>
                </div>
              </>
            )}
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
        {arenas.map((a, i) => {
          const st = statusOf(a);
          return (
            <div
              className="card"
              key={a.publicKey.toBase58()}
              style={{ "--i": i } as React.CSSProperties}
              data-guide="arena-card"
              onClick={() => openArena(a.publicKey)}
            >
              <div className="card-top">
                <span className={`tag ${st}`}>{c.status[st]}</span>
                <span className="mono card-key">{shortKey(a.publicKey)}</span>
              </div>
              <div className="card-pot">{fmtSol(sol(a.pot))} SOL</div>
              <div className="card-meta">
                {a.maxPlayers === 1 && <span>{c.play.soloBadge}</span>}
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

      <div className="panel" style={{ marginTop: 22 }} data-guide="host" ref={hostRef}>
        <div className="panel-head">
          <span>{c.play.hostTitle}</span>
          <span>{c.play.baseLayer}</span>
        </div>
        <div className="mode-pick" role="radiogroup" aria-label={c.play.modeLabel}>
          <button
            type="button"
            role="radio"
            aria-checked={!solo}
            className={`mode-card ${!solo ? "on" : ""}`}
            onClick={() => setSolo(false)}
          >
            <span className="mc-top">
              <span className="mc-title">{c.play.modeArena}</span>
              <span className="mc-radio" aria-hidden />
            </span>
            <span className="mc-desc">{c.play.modeArenaHint}</span>
            <span className="mc-meta">{c.play.modeArenaMeta}</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={solo}
            className={`mode-card ${solo ? "on" : ""}`}
            onClick={() => setSolo(true)}
          >
            <span className="mc-top">
              <span className="mc-title">{c.play.modeSolo}</span>
              <span className="mc-radio" aria-hidden />
            </span>
            <span className="mc-desc">{c.play.modeSoloHint}</span>
            <span className="mc-meta">{c.play.modeSoloMeta}</span>
          </button>
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
              min={solo ? 1 : 2}
              max={solo ? 1 : 8}
              value={solo ? 1 : maxPlayers}
              disabled={solo}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              style={{ ...inputStyle, opacity: solo ? 0.55 : 1 }}
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
            {busy === "create" ? c.play.creating : solo ? c.play.createSolo : c.play.create}
          </button>
          <p className="hint">
            {solo ? c.play.hostHintSolo : c.play.hostHint}
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
