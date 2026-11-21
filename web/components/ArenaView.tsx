"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as anchor from "@anchor-lang/core";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  Arena,
  DELEGATION_PROGRAM_ID,
  EPHEMERAL_QUEUE,
  FIXED,
  fetchSeries,
  type SeriesAccount,
  feedNameOf,
  TEE_VALIDATOR,
  baseConnection,
  erConnection,
  fetchArena,
  fmtSol,
  getDelegationStatus,
  nonceOf,
  normaliseFqdn,
  permissionAccounts,
  programAt,
  readPrice,
  sendTx,
  shortKey,
  sol,
  statusOf,
  teeConnection,
  teeToken,
  waitFor,
} from "@/lib/pit";
import Link from "next/link";
import { CountdownRing, EquityBar, Sparkline, handleOf, madLine, thump } from "@/components/Bits";
import Guide, { type GuideStep } from "@/components/Guide";
import { LangSwitch } from "@/components/LangSwitch";
import type { Wallet } from "@/lib/wallet";
import { requestAirdrop } from "@/lib/wallet";
import { Rich, useI18n, useT } from "@/lib/i18n";

type Props = {
  arenaPubkey: PublicKey;
  wallet: Wallet;
  onBack: () => void;
};

const fmtClock = (secs: number) => {
  if (secs <= 0) return "00:00";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export default function ArenaView({ arenaPubkey, wallet, onBack }: Props) {
  const [arena, setArena] = useState<Arena | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [delegated, setDelegated] = useState(false);
  const [erUrl, setErUrl] = useState<string | null>(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [side, setSide] = useState<1 | -1>(1);
  const [leverage, setLeverage] = useState(3);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const { c, lang } = useI18n();
  const t = useT();

  // The notice is an acknowledgement, not a banner: it dismisses itself.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [balance, setBalance] = useState<number>(0);
  const [tee, setTee] = useState<{ token: string; conn: Connection } | null>(null);
  const [sealed, setSealed] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [kill, setKill] = useState<{ label: string; n: number; mine: boolean } | null>(null);
  const [series, setSeries] = useState<SeriesAccount | null>(null);
  const lastShockRef = useRef(-1);
  const crankRef = useRef(false);

  const base = useMemo(() => baseConnection(), []);

  const loadSeries = useCallback(
    async (key: PublicKey) => {
      if (!key || key.equals(PublicKey.default)) {
        setSeries(null);
        return;
      }
      try {
        setSeries(await fetchSeries(base, key));
      } catch {
        setSeries(null);
      }
    },
    [base],
  );

  const load = useCallback(async () => {
    try {
      const info = await base.getAccountInfo(arenaPubkey);
      if (!info) {
        setError(t("arena not found"));
        return;
      }
      const isDelegated = info.owner.equals(DELEGATION_PROGRAM_ID);
      setDelegated(isDelegated);

      if (isDelegated) {
        const er = await erConnection(arenaPubkey);
        if (er) {
          setErUrl(er.url);
          const isTee = /tee/i.test(er.url);
          let conn = er.connection;
          let current = tee;
          if (isTee && !current) {
            const token = await teeToken(wallet);
            current = { token, conn: teeConnection(token) };
            setTee(current);
          }
          if (isTee && current) conn = current.conn;

          const a = await fetchArena(conn, arenaPubkey);
          setArena(a);
          const live = await readPrice(conn, a.feed).catch(() => null);
          setPrice(live);
          if (live) setHistory((h) => [...h.slice(-79), live]);

          setSealed(!!(a as any).isPrivate);
          await loadSeries(a.series);

          // ---- the bite: the pit attacks on its own, nobody has to press anything ----
          const sc = Number((a as any).shockCount ?? 0);
          if (sc > lastShockRef.current) {
            if (lastShockRef.current >= 0) {
              const seatIdx = Number((a as any).shockSeat);
              const victim = a.seats[seatIdx]?.player as any;
              const mine = victim ? victim.equals(wallet.publicKey) : false;
              const victimName = victim ? handleOf(victim.toBase58()) : "";
              const label = mine
                ? t("THE PIT BIT YOU")
                : t("THE PIT BIT {name}", { name: victimName || "?" });
              setKill({ label, n: sc, mine });
              thump(mine);
              setEvents((ev) =>
                [
                  t("bite #{n} · {who}", { n: sc, who: mine ? t("you") : victimName || "?" }),
                  ...ev,
                ].slice(0, 6),
              );
              window.setTimeout(() => setKill(null), 5200);
            }
            lastShockRef.current = sc;
          }

          const nowTs = Math.floor(Date.now() / 1000);
          const cooldown = Math.max(15, Math.floor(Number(a.duration) / 8));
          const holdingNow = a.seats.slice(0, a.playerCount).filter((x: any) => x.side !== 0).length;
          if (
            statusOf(a) === "live" &&
            holdingNow > 0 &&
            nowTs >= Number((a as any).lastShockTs) + cooldown &&
            !crankRef.current
          ) {
            crankRef.current = true;
            const program = programAt(conn, wallet.publicKey);
            program.methods
              .requestShock(nonceOf(a))
              .accounts({ payer: wallet.publicKey, arena: arenaPubkey, oracleQueue: EPHEMERAL_QUEUE })
              .transaction()
              .then((tx: any) => sendTx(conn, tx, wallet, { skipPreflight: true }))
              .catch(() => {})
              .finally(() => {
                window.setTimeout(() => {
                  crankRef.current = false;
                }, 4000);
              });
          }
          return;
        }
      }

      const a = await fetchArena(base, arenaPubkey);
      setArena(a);
      await loadSeries(a.series);
      setErUrl(null);
      // The feed only publishes inside the rollup: on the base layer the account is
      // delegated and stale, so reading it here would show an old price as if it were live.
      setPrice(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [arenaPubkey, base, wallet, tee, t]);

  useEffect(() => {
    load();
    base
      .getBalance(wallet.publicKey)
      .then((l) => setBalance(l / LAMPORTS_PER_SOL))
      .catch(() => {});
    const id = setInterval(load, 4000);
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(id);
      clearInterval(tick);
    };
  }, [load, base, wallet]);

  const status = arena ? statusOf(arena) : "open";
  const nonce = arena ? nonceOf(arena) : "";
  const myIndex = arena ? arena.seats.slice(0, arena.playerCount).findIndex((s) => s.player.equals(wallet.publicKey)) : -1;
  const mySeat = myIndex >= 0 ? arena!.seats[myIndex] : null;
  const endAt = arena ? Number(arena.endAt) : 0;
  const remaining = endAt > 0 ? endAt - now : 0;
  const isCreator = arena ? arena.creator.equals(wallet.publicKey) : false;
  const biteCooldown = arena ? Math.max(15, Math.floor(Number(arena.duration) / 8)) : 0;
  const nextBiteIn = arena
    ? Math.max(0, Number((arena as any).lastShockTs ?? 0) + biteCooldown - now)
    : 0;
  const bitePct = biteCooldown
    ? Math.min(100, Math.max(0, ((biteCooldown - nextBiteIn) / biteCooldown) * 100))
    : 0;
  const holding = arena
    ? arena.seats.slice(0, arena.playerCount).filter((s) => s.side !== 0).length
    : 0;
  const iAmMad = !!mySeat && Number((mySeat as any).madUntil ?? 0) > now;
  const madLeft = iAmMad ? Number((mySeat as any).madUntil) - now : 0;
  const pressure = mySeat ? Number((mySeat as any).pressure ?? 0) : 0;
  const revealed = status === "settled" || status === "closed";
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/play?arena=${arenaPubkey.toBase58()}`
      : "";
  const needMore = arena ? Math.max(0, 2 - arena.playerCount) : 0;
  const entrySol = arena ? sol(arena.entryFee) : 0;

  const copyInvite = async () => {
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setError(t("copy failed — the invite link is {link}", { link: shareUrl }));
    }
  };

  const guideSteps: GuideStep[] = [
    {
      target: '[data-guide="pot"]',
      title: t("The pot"),
      body: t("Every seat paid the same entry ({entry} SOL) and it all sits in one escrow vault. The podium splits it 60 / 25 / 15.", {
        entry: fmtSol(entrySol, 3),
      }),
      why: t("The vault is a program-owned PDA. Settlement is a CPI from that account, so neither the host nor the winner can move the pot by hand."),
    },
    {
      target: '[data-guide="nextstep"]',
      title: t("What to do right now"),
      body:
        status === "open"
          ? t("This panel always tells you the next move: join, invite the second player, lock. It changes with every state of the round.")
          : status === "live"
            ? t("This panel tells you what the round expects from you: trade, watch the bite, close before the bell.")
            : t("This panel walks the payout: commit the state back to Solana, then settle the podium."),
      why: t("A round has four states on-chain — open, live, settled, closed — and each one allows different instructions. Guessing is how people lose money."),
    },
    {
      target: '[data-guide="board"]',
      title: t("The leaderboard"),
      body: t("Your own PnL is marked to market. Everybody else shows “hidden” until the bell — that is the sealed book, not a bug."),
      why: t("With the arena sealed inside the enclave, a wallet outside the permission gets null for the whole account, token or not. Your positions are private on-chain."),
    },
    {
      target: '[data-guide="ticket"]',
      title: t("The ticket"),
      body: t("Pick LONG or SHORT, choose 1–5× leverage and open. The order executes inside the MagicBlock rollup: ~10ms and no gas."),
      why: t("Trades never touch the base layer while the round runs, so there is no fee and no block wait. The price comes from the oracle read inside the rollup."),
    },
    ...(status === "live"
      ? [
          {
            target: '[data-guide="bite"]',
            title: t("The bite is coming"),
            body: t("Every {secs}s the pit force-closes one random player who is holding a position. This bar is the countdown.", { secs: biteCooldown }),
            why: t("The victim is drawn by the VRF oracle and the callback is identity-checked on-chain. Staying flat is a real defense: the pit only bites players with risk open."),
          },
        ]
      : []),
    {
      target: '[data-guide="actions"]',
      title: t("Lifecycle controls"),
      body: t("Join → lock → delegate → trade → end round → commit → settle. Each button is one real transaction, and anyone can push the permissionless ones."),
      why: t("Delegate goes to the base layer, everything that touches the delegated arena goes to the rollup, and settle goes back to base. That layer rule is what makes it cheap and still final."),
    },
  ].filter((s) => s.target !== '[data-guide="actions"]' || isCreator || status !== "open");

  // First visit: open the arena tour once the table has rendered.
  useEffect(() => {
    if (!arena) return;
    if (window.localStorage.getItem("pit:guide:arena")) return;
    const timer = window.setTimeout(() => setGuideOpen(true), 1500);
    return () => window.clearTimeout(timer);
  }, [arena?.publicKey.toBase58()]);


  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const sig = await fn();
      setNotice(`${label} · ${sig.slice(0, 8)}…${sig.slice(-6)}`);
      setEvents((e) => [`${label} · ${sig.slice(0, 6)}`, ...e].slice(0, 6));
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  const airdrop = () =>
    run("airdrop", async () => {
      const sig = await requestAirdrop(wallet.publicKey, 1);
      setBalance((await base.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL);
      return sig;
    });

  /** The rollup connection: the TEE one when the arena lives behind the enclave. */
  const erConn = (): Connection => {
    if (tee) return tee.conn;
    if (!erUrl) throw new Error(t("the arena is not delegated to a rollup"));
    return new Connection(erUrl, { commitment: "confirmed" });
  };

  const seal = () =>
    run("seal", async () => {
      if (!tee) throw new Error(t("TEE session not ready"));
      const program = programAt(tee.conn, wallet.publicKey);
      const accs = permissionAccounts(arenaPubkey, wallet.publicKey);
      const initTx = await program.methods.initPermission(nonce).accounts(accs).transaction();
      await sendTx(tee.conn, initTx, wallet, { skipPreflight: true });
      const sealTx = await program.methods.setPrivacy(nonce, true).accounts(accs).transaction();
      return sendTx(tee.conn, sealTx, wallet, { skipPreflight: true });
    });

  const shock = () =>
    run("shock", async () => {
      const er = erConn();
      const program = programAt(er, wallet.publicKey);
      const tx = await program.methods
        .requestShock(nonce)
        .accounts({ payer: wallet.publicKey, arena: arenaPubkey, oracleQueue: EPHEMERAL_QUEUE })
        .transaction();
      return sendTx(er, tx, wallet, { skipPreflight: true });
    });

  const record = () =>
    run("record", async () => {
      const program = programAt(base, wallet.publicKey);
      const tx = await program.methods
        .recordRound(nonce, arena!.series)
        .accounts({ arena: arenaPubkey, series: arena!.series })
        .transaction();
      return sendTx(base, tx, wallet);
    });

  const reveal = () =>
    run("reveal", async () => {
      if (!tee) throw new Error(t("TEE session not ready"));
      const program = programAt(tee.conn, wallet.publicKey);
      const accs = permissionAccounts(arenaPubkey, wallet.publicKey);
      const tx = await program.methods.setPrivacy(nonce, false).accounts(accs).transaction();
      return sendTx(tee.conn, tx, wallet, { skipPreflight: true });
    });

  /* ------------------------------- actions ------------------------------- */

  const join = () =>
    run("join", async () => {
      const program = programAt(base, wallet.publicKey);
      const tx = await program.methods
        .joinArena(nonce)
        .accounts({ player: wallet.publicKey, arena: arenaPubkey, vault: vaultOf(arenaPubkey), systemProgram: SystemProgram.programId })
        .transaction();
      return sendTx(base, tx, wallet);
    });

  const lock = () =>
    run("lock", async () => {
      const program = programAt(base, wallet.publicKey);
      const tx = await program.methods
        .lockArena(nonce)
        .accounts({ creator: wallet.publicKey, arena: arenaPubkey })
        .transaction();
      return sendTx(base, tx, wallet);
    });

  const delegate = () =>
    run("delegate", async () => {
      const program = programAt(base, wallet.publicKey);
      const tx = await program.methods
        .delegateArena(nonce)
        .accounts({ payer: wallet.publicKey, arena: arenaPubkey })
        .remainingAccounts([{ pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }])
        .transaction();
      const sig = await sendTx(base, tx, wallet);
      await waitFor(async () => {
        const info = await base.getAccountInfo(arenaPubkey);
        return info && info.owner.equals(DELEGATION_PROGRAM_ID) ? true : null;
      });
      return sig;
    });

  const trade = (kind: "open" | "close") =>
    run(kind === "open" ? "open" : "close", async () => {
      const er = erConn();
      const program = programAt(er, wallet.publicKey);
      const builder =
        kind === "open"
          ? program.methods
              .openPosition(nonce, side, leverage)
              .accounts({ trader: wallet.publicKey, arena: arenaPubkey, feed: arena!.feed })
          : program.methods
              .closePosition(nonce)
              .accounts({ trader: wallet.publicKey, arena: arenaPubkey, feed: arena!.feed });
      const tx = await builder.transaction();
      return sendTx(er, tx, wallet, { skipPreflight: true });
    });

  const endRound = () =>
    run("end_round", async () => {
      const er = erConn();
      const program = programAt(er, wallet.publicKey);
      const tx = await program.methods
        .endRound(nonce)
        .accounts({ trader: wallet.publicKey, arena: arenaPubkey, feed: arena!.feed })
        .transaction();
      return sendTx(er, tx, wallet, { skipPreflight: true });
    });

  const commit = () =>
    run("commit", async () => {
      const er = erConn();
      const program = programAt(er, wallet.publicKey);
      const tx = await program.methods
        .commitRound(nonce)
        .accounts({ payer: wallet.publicKey, arena: arenaPubkey })
        .transaction();
      const sig = await sendTx(er, tx, wallet, { skipPreflight: true });
      await waitFor(async () => {
        const info = await base.getAccountInfo(arenaPubkey);
        return info && !info.owner.equals(DELEGATION_PROGRAM_ID) ? true : null;
      });
      return sig;
    });

  const settle = () =>
    run("settle", async () => {
      const program = programAt(base, wallet.publicKey);
      const podium = arena!.results
        .slice(0, arena!.winnerCount)
        .map((r) => ({ pubkey: r.player, isSigner: false, isWritable: true }));
      // The last-one-standing bonus travels AFTER the podium: the program reads it from
      // `remaining_accounts[winners]`.
      const lst =
        arena!.lstWinner && !arena!.lstWinner.equals(PublicKey.default)
          ? [{ pubkey: arena!.lstWinner, isSigner: false, isWritable: true }]
          : [];
      const tx = await program.methods
        .settle(nonce)
        .accounts({
          arena: arenaPubkey,
          vault: vaultOf(arenaPubkey),
          creator: arena!.creator,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([...podium, ...lst])
        .transaction();
      return sendTx(base, tx, wallet);
    });

  /* -------------------------------- render ------------------------------- */

  if (!arena) {
    return (
      <div className="shell">
        <div className="topbar">
          <button className="backlink" onClick={onBack}>
            {t("← Back to lobby")}
          </button>
        </div>
        <div className="empty" style={{ marginTop: 24 }}>
          {t("loading arena…")}
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    );
  }

  const potSol = sol(arena.pot);
  const seatList = arena.seats.slice(0, arena.playerCount);
  // After the reveal the table must read as a ranking; during the round the order is irrelevant.
  // After settle `realized` is zeroed, so the only source of truth is `results`.
  const settledEquity = new Map<string, number>();
  if (revealed) {
    for (const r of arena.results.slice(0, arena.playerCount)) {
      settledEquity.set(r.player.toBase58(), Number(r.equity) / FIXED);
    }
  }
  const equityOf = (s: (typeof seatList)[number], marked = false) => {
    const key = s.player.toBase58();
    const final = settledEquity.get(key);
    if (final !== undefined) return final;
    let eq = (Number(s.bankroll) + Number(s.realized)) / FIXED;
    // Live, my seat is marked to market: otherwise my PnL would not move until close.
    if (marked && s.side !== 0 && price && Number(s.entryPrice) > 0) {
      const entry = Number(s.entryPrice);
      const pnl = (Number(s.notional) * (price - entry)) / entry;
      eq += (Number(s.side) > 0 ? pnl : -pnl) / FIXED;
    }
    return eq;
  };

  const seats = revealed
    ? [...seatList].sort((a, b) => {
        const ka = settledEquity.get(a.player.toBase58());
        const kb = settledEquity.get(b.player.toBase58());
        if (ka === undefined && kb === undefined) return 0;
        if (ka === undefined) return 1;
        if (kb === undefined) return -1;
        return kb - ka;
      })
    : seatList;

  // Normalize the equity bars against the field, not against 1000, so small edges still read.
  const eqs = seats.map((s) => equityOf(s));
  const eqMin = eqs.length ? Math.min(...eqs) : 999;
  const eqMax = eqs.length ? Math.max(...eqs) : 1001;

  return (
    <div className={`shell ${kill?.mine ? "shake" : ""}`}>
      <div className="grid-bg" />
      <div className="topbar">
        <div className="brand">
          <button className="backlink" onClick={onBack}>
            {t("← Lobby")}
          </button>
          <Link href="/" className="brand-text" title={c.common.backToLanding}>
            <div className="brand-name">THE PIT</div>
            <div className="brand-sub mono">{shortKey(arenaPubkey)}</div>
          </Link>
        </div>
        <div className="wallet-box">
          <LangSwitch />
          <button className="help-btn" onClick={() => setGuideOpen(true)} title={c.common.replayTour}>
            {c.common.guide}
          </button>
          <span className="pill">
            <span className={`dot ${delegated ? "" : "warn"}`} />
            {!delegated
              ? t("base layer")
              : sealed
                ? t("PER · sealed")
                : tee
                  ? t("PER · open")
                  : `ER · ${erUrl?.replace("https://", "") ?? ""}`}
          </span>
          {series && (
            <span className="pill">
              {t("series · R{n}/{max}", { n: arena.roundNo, max: series.maxRounds })}
            </span>
          )}
          <span className="pill mono">{balance.toFixed(3)} SOL</span>
        </div>
      </div>

      <div className="arena-head">
        <div className="stat" data-guide="pot">
          <div className="stat-label">{t("Pot")}</div>
          <div className="stat-value">{fmtSol(potSol)} SOL</div>
          <div className="stat-sub">
            {t("{count}/{max} seats · entry {entry} SOL", {
              count: arena.playerCount,
              max: arena.maxPlayers,
              entry: fmtSol(sol(arena.entryFee), 2),
            })}
          </div>
          <div className="split">
            <span>
              <b>60%</b> {t("1st")}
            </span>
            <span>
              <b>25%</b> {t("2nd")}
            </span>
            <span>
              <b>15%</b> {t("3rd")}
            </span>
          </div>
        </div>
        <div className="stat">
          {status === "live" ? (
            <CountdownRing remaining={remaining} total={Number(arena.duration)} label={t("time left")} />
          ) : (
            <>
              <div className="stat-label">
                {status === "open" ? t("starts on lock") : t("round")}
              </div>
              <div className="stat-value">{c.status[status].toUpperCase()}</div>
            </>
          )}
          <div className="stat-sub" style={{ textAlign: "center" }}>
            {t("{secs}s rounds · rake {rake}%", {
              secs: arena.duration.toString(),
              rake: arena.rakeBps / 100,
            })}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">{feedNameOf(arena.feed)}</div>
          <div className="stat-value">
            {price ? (
              `$${price.toFixed(3)}`
            ) : (
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--muted)" }}>
                {t("waiting for the feed")}
              </span>
            )}
            {status === "live" && (
              <span className="live-chip" style={{ marginLeft: 9, verticalAlign: "middle" }}>
                <span className="dot" /> {t("live")}
              </span>
            )}
          </div>
          <div className="spark">
            <Sparkline
              data={history}
              positive={history.length < 2 || history[history.length - 1] >= history[0]}
            />
          </div>
          <div className="stat-sub">
            {price
              ? t("MagicBlock price feed · 10ms")
              : t("the feed publishes once the arena is on the rollup")}
          </div>
        </div>
      </div>

      {status === "open" && (
        <div className="nextstep" data-guide="nextstep">
          <div className="nextstep-head">
            <span className="nextstep-title">{t("Your next move")}</span>
            <span className="pill mono">
              {needMore > 0
                ? needMore > 1
                  ? t("{n} more players to start", { n: needMore })
                  : t("1 more player to start")
                : t("ready to start")}
            </span>
          </div>
          <div className="nextstep-what">
            {myIndex < 0
              ? t("Join for {amount} SOL and start with 1,000 credits", { amount: fmtSol(entrySol, 3) })
              : needMore > 0
                ? t("You are in — the round cannot start alone")
                : isCreator
                  ? t("Everyone is in: lock the arena to start the clock")
                  : t("Everyone is in: waiting for the host to lock")}
          </div>
          <ul className="nextstep-steps">
            <li>
              <span className="nextstep-num">1</span>
              <span>
                {myIndex < 0
                  ? t("Join: your entry goes into an escrow vault and the program opens your seat.")
                  : t("You are seated and paid. Nothing else to deposit.")}
              </span>
            </li>
            <li>
              <span className="nextstep-num">2</span>
              <span>
                <Rich text={t("A round needs **2 players**. Copy the invite link and send it — **no bots join by themselves**.")} />
              </span>
            </li>
            <li>
              <span className="nextstep-num">3</span>
              <span>
                {isCreator ? t("You lock it: ") : t("The host locks it: ")}
                {t("the arena delegates to MagicBlock, the clock starts and the book is sealed.")}
              </span>
            </li>
          </ul>
          <div className="nextstep-actions">
            {myIndex < 0 && (
              <button className="btn" disabled={busy !== null} onClick={join}>
                {busy === "join"
                  ? t("joining…")
                  : t("Join for {amount} SOL", { amount: fmtSol(entrySol, 2) })}
              </button>
            )}
            {myIndex >= 0 && needMore === 0 && isCreator && (
              <button className="btn" disabled={busy !== null} onClick={lock}>
                {busy === "lock" ? t("locking…") : t("Lock & start round")}
              </button>
            )}
            <button className="btn ghost" onClick={copyInvite}>
              {copiedLink ? t("link copied ✓") : t("Copy invite link")}
            </button>
          </div>
          <p className="nextstep-note">
            {t("Nobody joins automatically — this arena only fills with wallets you invite. The link opens it directly, so the other player lands on this same table.")}
          </p>
          {myIndex < 0 && balance < entrySol && (
            <div className="alert-inline" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>
                {t("You need {need} SOL to join and the wallet holds {have}.", {
                  need: fmtSol(entrySol, 3),
                  have: balance.toFixed(3),
                })}
              </span>
              <button className="btn ghost" disabled={busy !== null} onClick={airdrop}>
                {busy === "airdrop" ? t("requesting…") : t("Request 1 devnet SOL")}
              </button>
            </div>
          )}
        </div>
      )}

      {status === "live" && (
        <div className="nextstep" data-guide="nextstep">
          <div className="nextstep-head">
            <span className="nextstep-title">{t("The clock is running")}</span>
            <span className="pill mono">{t("{clock} left", { clock: fmtClock(remaining) })}</span>
          </div>
          <div className="nextstep-what">{t("Trade from the ticket, then survive the bite")}</div>
          <ul className="nextstep-steps">
            <li>
              <span className="nextstep-num">1</span>
              <span>{t("Pick LONG or SHORT, choose leverage and open a position — it settles in ~10ms, no fees.")}</span>
            </li>
            <li>
              <span className="nextstep-num">2</span>
              <span>
                {t("Every {secs}s the pit force-closes one random player who is holding. Staying flat is a real defense.", { secs: biteCooldown })}
              </span>
            </li>
            <li>
              <span className="nextstep-num">3</span>
              <span>{t("Close before the bell: the top three split the pot 60/25/15.")}</span>
            </li>
          </ul>
        </div>
      )}

      {status === "settled" && (
        <div className="nextstep" data-guide="nextstep">
          <div className="nextstep-head">
            <span className="nextstep-title">{t("Round closed")}</span>
            <span className="pill mono">{t("payout pending")}</span>
          </div>
          <div className="nextstep-what">{t("Commit the round back to Solana, then settle the podium")}</div>
          <ul className="nextstep-steps">
            <li>
              <span className="nextstep-num">1</span>
              <span>
                {delegated
                  ? t("Commit & undelegate: the final state travels back from the rollup to the base layer.")
                  : t("The arena is already back on the base layer.")}
              </span>
            </li>
            <li>
              <span className="nextstep-num">2</span>
              <span>{t("Settle: the escrow vault pays 60/25/15 to the top three, plus the last-one-standing bonus.")}</span>
            </li>
          </ul>
        </div>
      )}

      {status === "closed" && (
        <div className="nextstep" data-guide="nextstep">
          <div className="nextstep-head">
            <span className="nextstep-title">{t("Round paid")}</span>
            <span className="pill mono">{t("{n} seats", { n: arena.playerCount })}</span>
          </div>
          <div className="nextstep-what">{t("The podium took the pot — start the next one")}</div>
          <div className="nextstep-actions">
            <button className="btn ghost" onClick={onBack}>
              {t("Back to the lobby")}
            </button>
          </div>
        </div>
      )}

      {status === "live" && delegated && (
        <div className={`danger ${nextBiteIn <= 0 ? "ready" : nextBiteIn <= 5 ? "soon" : ""}`} data-guide="bite">
          <span className="danger-label">{t("next bite")}</span>
          <span className="danger-count mono">{nextBiteIn > 0 ? fmtClock(nextBiteIn) : t("READY")}</span>
          <span className="danger-note">
            {holding > 0
              ? t("{n} holding risk · the pit takes one at random", { n: holding })
              : t("nobody is holding · the pit has nothing to bite")}
          </span>
          <span className="danger-track">
            <span className="danger-fill" style={{ width: `${bitePct}%` }} />
          </span>
        </div>
      )}

      {revealed && arena.lstWinner && !arena.lstWinner.equals(PublicKey.default) && (
        <div className="lst">
          <span className="lst-badge">{t("last one standing")}</span>
          <span className="lst-who">
            {arena.lstWinner.equals(wallet.publicKey) ? t("you") : handleOf(arena.lstWinner.toBase58())}
          </span>
          <span className="lst-sub">
            {t("held into the bell · +{amount} SOL off the top", {
              amount: sol(arena.lstBonus).toFixed(4),
            })}
          </span>
        </div>
      )}

      {iAmMad && (
        <div className="mad-banner">
          <span className="mad-badge">{t("fever")}</span>
          <span className="mad-line">“{madLine(wallet.publicKey.toBase58(), Math.floor(madLeft / 20), lang)}”</span>
          <span className="mad-sub">{t("{n}s · your orders execute inverted", { n: madLeft })}</span>
        </div>
      )}

      {kill && (
        <div className={`kill ${kill.mine ? "mine" : ""}`}>
          <span className="kill-n mono">{t("BITE #{n}", { n: kill.n })}</span>
          <span className="kill-who">{kill.label}</span>
          <span className="kill-sub">{t("forced flat at market · VRF proof on-chain")}</span>
        </div>
      )}

      {error && <div className="err">{error}</div>}
      {notice && <div className="ok">{notice}</div>}


      {events.length > 0 && (
        <div className="ticker">
          <span className="ticker-label">{t("tape")}</span>
          {events.map((e, i) => (
            <span className="ticker-item" key={`${e}-${i}`}>
              <span className="pip" />
              {e}
            </span>
          ))}
        </div>
      )}

      <div className="cols">
        <div className={`panel ${sealed ? "sealed" : ""}`} data-guide="board">
          <div className="panel-head">
            <span>{t("Leaderboard")}</span>
            <span>
              {revealed
                ? t("revealed")
                : sealed
                  ? t("sealed by the enclave")
                  : status === "live"
                    ? t("positions hidden")
                    : t("waiting")}
            </span>
          </div>
          <div className="panel-body">
            {seats.length === 0 && <div className="row">{t("nobody yet — be the first")}</div>}
            {seats.map((seat, i) => {
              const mine = seat.player.equals(wallet.publicKey);
              const inResults = settledEquity.has(seat.player.toBase58());
              const eq = equityOf(seat, mine && !revealed);
              const delta = eq - 1000;
              // With the round closed, anyone off the podium has no final equity stored:
              // showing "±0.00" would be inventing it.
              const showPnl = revealed ? inResults : mine;
              const key = seat.player.toBase58();
              return (
                <div
                  className={`row ${mine ? "me" : ""} ${
                    Number((seat as any).madUntil ?? 0) > now ? "mad" : ""
                  }`}
                  key={key}
                >
                  <EquityBar value={eq} min={eqMin} max={eqMax} />
                  <span className="rank mono">{String(i + 1).padStart(2, "0")}</span>
                  <span className="who">
                    <span className="who-line">
                      {mine ? t("you") : handleOf(key)}
                      {seat.side !== 0 && (revealed || mine) && (
                        <span className={`side-chip ${seat.side > 0 ? "long" : "short"}`}>
                          {seat.side > 0 ? "LONG" : "SHORT"} {leverageOf(seat)}
                        </span>
                      )}
                      {(seat as any).streak > 0 && (
                        <span className="streak">{t("{n} survived", { n: (seat as any).streak })}</span>
                      )}
                    </span>
                    {Number((seat as any).madUntil ?? 0) > now && (
                      <span className="mad-thought">
                        {madLine(key, Math.floor(Number((seat as any).madUntil) / 20), lang)}
                      </span>
                    )}
                    <small>
                      {seat.trades} {t(seat.trades === 1 ? "trade" : "trades")}
                    </small>
                  </span>
                  <span
                    className={`pnl ${showPnl ? (Math.abs(delta) < 0.005 ? "flat" : delta > 0 ? "up" : "down") : "sealed"}`}
                    title={showPnl ? t("mark-to-market equity") : t("hidden until the bell")}
                  >
                    {showPnl ? (Math.abs(delta) < 0.005 ? "±0.00" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`) : revealed ? "—" : t("hidden")}
                  </span>
                </div>
              );
            })}
            {sealed && (
              <>
                <div className="frost" />
                <span className="veil-chip">
                  <span className="lock-dot" /> {t("sealed")}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="panel" data-guide="ticket">
          <div className="panel-head">
            <span>{status === "live" ? t("Trade ticket") : t("Status")}</span>
            <span>{status === "live" ? t("gasless") : ""}</span>
          </div>
          <div className="ticket">
            {mySeat && (
              <div className="pressure">
                <span className="pressure-label">{t("pressure")}</span>
                <span className="pressure-track">
                  <span
                    className={`pressure-fill ${iAmMad ? "mad" : ""}`}
                    style={{ width: `${iAmMad ? 100 : pressure}%` }}
                  />
                </span>
                <span className="pressure-num mono">{iAmMad ? "MAD" : pressure}</span>
              </div>
            )}
            {status === "open" && (
              <>
                <p className="hint" style={{ marginTop: 0 }}>
                  {t("Entry is open. When the host locks the arena it gets delegated to the rollup and every trade runs for free at 10ms.")}
                </p>
                <p className="hint" style={{ marginTop: 10 }}>
                  {myIndex >= 0
                    ? t("Seat #{n} is yours. Waiting for the clock to start.", { n: myIndex + 1 })
                    : t("Your seat is still open — join from the panel above.")}
                </p>
              </>
            )}

            {status === "live" && (
              <>
                <div className="side-toggle">
                  <button className={`side-btn long ${side === 1 ? "active long" : ""}`} onClick={() => setSide(1)}>
                    LONG
                  </button>
                  <button className={`side-btn short ${side === -1 ? "active short" : ""}`} onClick={() => setSide(-1)}>
                    SHORT
                  </button>
                </div>
                <div className="field">
                  <div className="field-label">
                    <span>{t("Leverage")}</span>
                    <span className="leverage">{leverage}×</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={leverage}
                    onChange={(e) => setLeverage(Number(e.target.value))}
                  />
                </div>
                {mySeat && mySeat.side !== 0 ? (
                  <button className="btn ghost" disabled={busy !== null} onClick={() => trade("close")}>
                    {busy === "close"
                      ? t("closing…")
                      : t("Close {side}", { side: mySeat.side > 0 ? "LONG" : "SHORT" })}
                  </button>
                ) : (
                  <button
                    className={`btn ${side === 1 ? "long" : "short"}`}
                    disabled={busy !== null || myIndex < 0}
                    onClick={() => trade("open")}
                  >
                    {myIndex < 0
                      ? t("not seated")
                      : busy === "open"
                        ? t("sending…")
                        : t("Open {side}", { side: side === 1 ? "LONG" : "SHORT" })}
                  </button>
                )}
                <p className="hint">
                  {t("Notional {lev}× your equity. PnL is marked against the MagicBlock price feed and settles on Solana when the round closes.", { lev: leverage })}
                </p>
              </>
            )}

            {(status === "settled" || status === "closed") && (
              <>
                <p className="hint" style={{ marginTop: 0 }}>
                  {t("Round closed. Podium settled from the escrow vault.")}
                </p>
                {arena.results.slice(0, arena.winnerCount).map((r, i) => (
                  <div className="row" key={r.player.toBase58()} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <span className="rank mono">#{i + 1}</span>
                    <span className="who mono">{r.player.equals(wallet.publicKey) ? t("you") : shortKey(r.player)}</span>
                    <span className="pnl up">{(Number(r.equity) / FIXED).toFixed(4)}</span>
                  </div>
                ))}
                <div style={{ marginTop: 14 }}>
                  <a
                    className="btn ghost"
                    style={{ display: "block", textAlign: "center", padding: 14 }}
                    href={`https://explorer.solana.com/address/${arenaPubkey.toBase58()}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("View on explorer")}
                  </a>
                </div>
              </>
            )}
          </div>

          {/* Host / lifecycle controls */}
          <div className="actions" data-guide="actions">
            {status === "open" && isCreator && (
              <button className="btn ghost" disabled={busy !== null || arena.playerCount < 2} onClick={lock}>
                {busy === "lock"
                  ? t("locking…")
                  : arena.playerCount < 2
                    ? t("need 2+ players")
                    : t("Lock & start round")}
              </button>
            )}
            {status === "live" && !delegated && (
              <button className="btn" disabled={busy !== null} onClick={delegate}>
                {busy === "delegate" ? t("delegating…") : t("Delegate to rollup")}
              </button>
            )}
            {status === "live" && delegated && remaining <= 0 && (
              <button className="btn ghost" disabled={busy !== null} onClick={endRound}>
                {busy === "end_round" ? t("ranking…") : t("End round")}
              </button>
            )}
            {status === "live" && delegated && Number((arena as any).shockSeat) === 255 && (
              <button className="btn ghost" disabled={busy !== null} onClick={shock}>
                {busy === "shock" ? t("calling the oracle…") : t("Call the shock (VRF)")}
              </button>
            )}
            {Number((arena as any).shockSeat) !== 255 && (
              <div className="hint">
                {t("The pit bit seat #{n} — VRF drawn, flat at market.", {
                  n: Number((arena as any).shockSeat) + 1,
                })}
              </div>
            )}
            {status === "live" && delegated && tee && !sealed && (
              <button className="btn" disabled={busy !== null} onClick={seal}>
                {busy === "seal" ? t("sealing…") : t("Seal the pit (PER)")}
              </button>
            )}
            {delegated && sealed && (
              <button className="btn ghost" disabled={busy !== null} onClick={reveal}>
                {busy === "reveal" ? t("revealing…") : t("Reveal the book")}
              </button>
            )}
            {status === "closed" && series && !arena.seriesRecorded && (
              <button className="btn" disabled={busy !== null} onClick={record}>
                {busy === "record" ? t("recording…") : t("Record round in series")}
              </button>
            )}
            {status === "closed" && arena.seriesRecorded && (
              <div className="hint" style={{ color: "var(--long)" }}>
                {t("Round already counted in the series standings.")}
              </div>
            )}

            {status === "settled" && delegated && !sealed && (
              <button className="btn" disabled={busy !== null} onClick={commit}>
                {busy === "commit" ? t("committing…") : t("Commit & undelegate")}
              </button>
            )}
            {status === "settled" && !delegated && (
              <button className="btn" disabled={busy !== null} onClick={settle}>
                {busy === "settle" ? t("paying…") : t("Settle podium")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="foot-note">
        {t("devnet · arena {key} · every state transition is a real transaction.", {
          key: shortKey(arenaPubkey),
        })}
        {sealed
          ? ` ${t("The book is sealed inside the enclave (PER): a wallet outside the permission gets null for this account, token or not.")}`
          : ` ${t("Positions are hidden in this UI while the round runs; seal the pit to make them unreadable on-chain too.")}`}
      </div>

      <Guide
        steps={guideSteps}
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        storageKey="pit:guide:arena"
      />
    </div>
  );
}

function vaultOf(arena: PublicKey): PublicKey {
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), arena.toBuffer()],
    new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID ?? "4iVtfWTrVo4iUAeTBVhhjkDr9kGK4dTD95vKM8c6dbar"),
  );
  return vault;
}

function leverageOf(seat: { notional: anchor.BN; bankroll: anchor.BN }): string {
  const lev = Number(seat.notional) / Math.max(1, Number(seat.bankroll));
  return `${Math.max(1, Math.round(lev))}×`;
}
