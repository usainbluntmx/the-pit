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
import type { Wallet } from "@/lib/wallet";
import { requestAirdrop } from "@/lib/wallet";

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

  // The notice is an acknowledgement, not a banner: it dismisses itself.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
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
        setError("arena not found");
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
              const label = mine
                ? "THE PIT BIT YOU"
                : `THE PIT BIT ${victim ? handleOf(victim.toBase58()) : "SOMEONE"}`;
              setKill({ label, n: sc, mine });
              thump(mine);
              setEvents((ev) =>
                [`bite #${sc} · ${mine ? "you" : victim ? handleOf(victim.toBase58()) : "?"}`, ...ev].slice(0, 6),
              );
              window.setTimeout(() => setKill(null), 5200);
            }
            lastShockRef.current = sc;
          }

          const nowTs = Math.floor(Date.now() / 1000);
          const cooldown = Math.max(15, Math.floor(Number(a.duration) / 8));
          const holding = a.seats.slice(0, a.playerCount).filter((x: any) => x.side !== 0).length;
          if (
            statusOf(a) === "live" &&
            holding > 0 &&
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
      const p = await readPrice(base, a.feed).catch(() => null);
      setPrice(p);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [arenaPubkey, base, wallet, tee]);

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
      setError(`copy failed — the invite link is ${shareUrl}`);
    }
  };


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
    if (!erUrl) throw new Error("the arena is not delegated to a rollup");
    return new Connection(erUrl, { commitment: "confirmed" });
  };

  const seal = () =>
    run("seal", async () => {
      if (!tee) throw new Error("TEE session not ready");
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
      if (!tee) throw new Error("TEE session not ready");
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
            ← Back to lobby
          </button>
        </div>
        <div className="empty" style={{ marginTop: 24 }}>
          loading arena…
        </div>
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
            ← Lobby
          </button>
          <Link href="/" className="brand-text" title="back to the landing">
            <div className="brand-name">THE PIT</div>
            <div className="brand-sub mono">{shortKey(arenaPubkey)}</div>
          </Link>
        </div>
        <div className="wallet-box">
          <span className="pill">
            <span className={`dot ${delegated ? "" : "warn"}`} />
            {!delegated
              ? "base layer"
              : sealed
                ? "PER · sealed"
                : tee
                  ? "PER · open"
                  : `ER · ${erUrl?.replace("https://", "") ?? ""}`}
          </span>
          {series && (
            <span className="pill">
              series · R{arena.roundNo}/{series.maxRounds}
            </span>
          )}
          <span className="pill mono">{balance.toFixed(3)} SOL</span>
        </div>
      </div>

      <div className="arena-head">
        <div className="stat">
          <div className="stat-label">Pot</div>
          <div className="stat-value">{fmtSol(potSol)} SOL</div>
          <div className="stat-sub">
            {arena.playerCount}/{arena.maxPlayers} seats · entry {fmtSol(sol(arena.entryFee), 2)} SOL
          </div>
          <div className="split">
            <span>
              <b>60%</b> 1st
            </span>
            <span>
              <b>25%</b> 2nd
            </span>
            <span>
              <b>15%</b> 3rd
            </span>
          </div>
        </div>
        <div className="stat">
          {status === "live" ? (
            <CountdownRing remaining={remaining} total={Number(arena.duration)} label="time left" />
          ) : (
            <>
              <div className="stat-label">
                {status === "open" ? "starts on lock" : "round"}
              </div>
              <div className="stat-value">{status.toUpperCase()}</div>
            </>
          )}
          <div className="stat-sub" style={{ textAlign: "center" }}>
            {arena.duration.toString()}s rounds · rake {arena.rakeBps / 100}%
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">SOL / USD</div>
          <div className="stat-value">
            {price ? (
              `$${price.toFixed(3)}`
            ) : (
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--muted)" }}>
                waiting for the feed
              </span>
            )}
            {status === "live" && (
              <span className="live-chip" style={{ marginLeft: 9, verticalAlign: "middle" }}>
                <span className="dot" /> live
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
            {price ? "MagicBlock price feed · 10ms" : "the feed publishes once the arena is on the rollup"}
          </div>
        </div>
      </div>

      {status === "open" && (
        <div className="nextstep">
          <div className="nextstep-head">
            <span className="nextstep-title">Your next move</span>
            <span className="pill mono">
              {needMore > 0 ? `${needMore} more player${needMore > 1 ? "s" : ""} to start` : "ready to start"}
            </span>
          </div>
          <div className="nextstep-what">
            {myIndex < 0
              ? `Join for ${fmtSol(entrySol, 3)} SOL and start with 1,000 credits`
              : needMore > 0
                ? "You are in — the round cannot start alone"
                : isCreator
                  ? "Everyone is in: lock the arena to start the clock"
                  : "Everyone is in: waiting for the host to lock"}
          </div>
          <ul className="nextstep-steps">
            <li>
              <span className="nextstep-num">1</span>
              <span>
                {myIndex < 0
                  ? "Join: your entry goes into an escrow vault and the program opens your seat."
                  : "You are seated and paid. Nothing else to deposit."}
              </span>
            </li>
            <li>
              <span className="nextstep-num">2</span>
              <span>
                A round needs <b>2 players</b>. Copy the invite link and send it —{" "}
                <b>no bots join by themselves</b>.
              </span>
            </li>
            <li>
              <span className="nextstep-num">3</span>
              <span>
                {isCreator ? "You lock it: " : "The host locks it: "}
                the arena delegates to MagicBlock, the clock starts and the book is sealed.
              </span>
            </li>
          </ul>
          <div className="nextstep-actions">
            {myIndex < 0 && (
              <button className="btn" disabled={busy !== null} onClick={join}>
                {busy === "join" ? "joining…" : `Join for ${fmtSol(entrySol, 2)} SOL`}
              </button>
            )}
            {myIndex >= 0 && needMore === 0 && isCreator && (
              <button className="btn" disabled={busy !== null} onClick={lock}>
                {busy === "lock" ? "locking…" : "Lock & start round"}
              </button>
            )}
            <button className="btn ghost" onClick={copyInvite}>
              {copiedLink ? "link copied ✓" : "Copy invite link"}
            </button>
          </div>
          <p className="nextstep-note">
            Nobody joins automatically — this arena only fills with wallets you invite. The link
            opens it directly, so the other player lands on this same table.
          </p>
          {myIndex < 0 && balance < entrySol && (
            <div className="alert-inline" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>
                You need {fmtSol(entrySol, 3)} SOL to join and the wallet holds {balance.toFixed(3)}.
              </span>
              <button className="btn ghost" disabled={busy !== null} onClick={airdrop}>
                {busy === "airdrop" ? "requesting…" : "Request 1 devnet SOL"}
              </button>
            </div>
          )}
        </div>
      )}

      {status === "live" && (
        <div className="nextstep">
          <div className="nextstep-head">
            <span className="nextstep-title">The clock is running</span>
            <span className="pill mono">{fmtClock(remaining)} left</span>
          </div>
          <div className="nextstep-what">Trade from the ticket, then survive the bite</div>
          <ul className="nextstep-steps">
            <li>
              <span className="nextstep-num">1</span>
              <span>Pick LONG or SHORT, choose leverage and open a position — it settles in ~10ms, no fees.</span>
            </li>
            <li>
              <span className="nextstep-num">2</span>
              <span>
                Every {biteCooldown}s the pit force-closes one random player who is holding. Staying
                flat is a real defense.
              </span>
            </li>
            <li>
              <span className="nextstep-num">3</span>
              <span>Close before the bell: the top three split the pot 60/25/15.</span>
            </li>
          </ul>
        </div>
      )}

      {status === "settled" && (
        <div className="nextstep">
          <div className="nextstep-head">
            <span className="nextstep-title">Round closed</span>
            <span className="pill mono">payout pending</span>
          </div>
          <div className="nextstep-what">Commit the round back to Solana, then settle the podium</div>
          <ul className="nextstep-steps">
            <li>
              <span className="nextstep-num">1</span>
              <span>
                {delegated
                  ? "Commit & undelegate: the final state travels back from the rollup to the base layer."
                  : "The arena is already back on the base layer."}
              </span>
            </li>
            <li>
              <span className="nextstep-num">2</span>
              <span>Settle: the escrow vault pays 60/25/15 to the top three, plus the last-one-standing bonus.</span>
            </li>
          </ul>
        </div>
      )}

      {status === "closed" && (
        <div className="nextstep">
          <div className="nextstep-head">
            <span className="nextstep-title">Round paid</span>
            <span className="pill mono">{arena.playerCount} seats</span>
          </div>
          <div className="nextstep-what">The podium took the pot — start the next one</div>
          <div className="nextstep-actions">
            <button className="btn ghost" onClick={onBack}>
              Back to the lobby
            </button>
          </div>
        </div>
      )}

      {status === "live" && delegated && (
        <div className={`danger ${nextBiteIn <= 0 ? "ready" : nextBiteIn <= 5 ? "soon" : ""}`}>
          <span className="danger-label">next bite</span>
          <span className="danger-count mono">{nextBiteIn > 0 ? fmtClock(nextBiteIn) : "READY"}</span>
          <span className="danger-note">
            {holding > 0
              ? `${holding} holding risk · the pit takes one at random`
              : "nobody is holding · the pit has nothing to bite"}
          </span>
          <span className="danger-track">
            <span className="danger-fill" style={{ width: `${bitePct}%` }} />
          </span>
        </div>
      )}

      {revealed && arena.lstWinner && !arena.lstWinner.equals(PublicKey.default) && (
        <div className="lst">
          <span className="lst-badge">last one standing</span>
          <span className="lst-who">
            {arena.lstWinner.equals(wallet.publicKey) ? "you" : handleOf(arena.lstWinner.toBase58())}
          </span>
          <span className="lst-sub">
            held into the bell · +{sol(arena.lstBonus).toFixed(4)} SOL off the top
          </span>
        </div>
      )}

      {iAmMad && (
        <div className="mad-banner">
          <span className="mad-badge">fever</span>
          <span className="mad-line">“{madLine(wallet.publicKey.toBase58(), Math.floor(madLeft / 20))}”</span>
          <span className="mad-sub">{madLeft}s · your orders execute inverted</span>
        </div>
      )}

      {kill && (
        <div className={`kill ${kill.mine ? "mine" : ""}`}>
          <span className="kill-n mono">BITE #{kill.n}</span>
          <span className="kill-who">{kill.label}</span>
          <span className="kill-sub">forced flat at market · VRF proof on-chain</span>
        </div>
      )}

      {error && <div className="err">{error}</div>}
      {notice && <div className="ok">{notice}</div>}


      {events.length > 0 && (
        <div className="ticker">
          <span className="ticker-label">tape</span>
          {events.map((e, i) => (
            <span className="ticker-item" key={`${e}-${i}`}>
              <span className="pip" />
              {e}
            </span>
          ))}
        </div>
      )}

      <div className="cols">
        <div className={`panel ${sealed ? "sealed" : ""}`}>
          <div className="panel-head">
            <span>Leaderboard</span>
            <span>
              {revealed ? "revealed" : sealed ? "sealed by the enclave" : status === "live" ? "positions hidden" : "waiting"}
            </span>
          </div>
          <div className="panel-body">
            {seats.length === 0 && <div className="row">nobody yet — be the first</div>}
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
                      {mine ? "you" : handleOf(key)}
                      {seat.side !== 0 && (revealed || mine) && (
                        <span className={`side-chip ${seat.side > 0 ? "long" : "short"}`}>
                          {seat.side > 0 ? "LONG" : "SHORT"} {leverageOf(seat)}
                        </span>
                      )}
                      {(seat as any).streak > 0 && (
                        <span className="streak">{(seat as any).streak} survived</span>
                      )}
                    </span>
                    {Number((seat as any).madUntil ?? 0) > now && (
                      <span className="mad-thought">
                        {madLine(key, Math.floor(Number((seat as any).madUntil) / 20))}
                      </span>
                    )}
                    <small>{seat.trades} {seat.trades === 1 ? "trade" : "trades"}</small>
                  </span>
                  <span
                    className={`pnl ${showPnl ? (Math.abs(delta) < 0.005 ? "flat" : delta > 0 ? "up" : "down") : "sealed"}`}
                    title={showPnl ? "mark-to-market equity" : "hidden until the bell"}
                  >
                    {showPnl ? (Math.abs(delta) < 0.005 ? "±0.00" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`) : revealed ? "—" : "hidden"}
                  </span>
                </div>
              );
            })}
            {sealed && (
              <>
                <div className="frost" />
                <span className="veil-chip">
                  <span className="lock-dot" /> sealed
                </span>
              </>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span>{status === "live" ? "Trade ticket" : "Status"}</span>
            <span>{status === "live" ? "gasless" : ""}</span>
          </div>
          <div className="ticket">
            {mySeat && (
              <div className="pressure">
                <span className="pressure-label">pressure</span>
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
                  Entry is open. When the host locks the arena it gets delegated to the rollup and
                  every trade runs for free at 10ms.
                </p>
                <p className="hint" style={{ marginTop: 10 }}>
                  {myIndex >= 0
                    ? `Seat #${myIndex + 1} is yours. Waiting for the clock to start.`
                    : "Your seat is still open — join from the panel above."}
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
                    <span>Leverage</span>
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
                    {busy === "close" ? "closing…" : `Close ${mySeat.side > 0 ? "LONG" : "SHORT"}`}
                  </button>
                ) : (
                  <button
                    className={`btn ${side === 1 ? "long" : "short"}`}
                    disabled={busy !== null || myIndex < 0}
                    onClick={() => trade("open")}
                  >
                    {myIndex < 0 ? "not seated" : busy === "open" ? "sending…" : `Open ${side === 1 ? "LONG" : "SHORT"}`}
                  </button>
                )}
                <p className="hint">
                  Notional {leverage}× your equity. PnL is marked against the MagicBlock price feed and
                  settles on Solana when the round closes.
                </p>
              </>
            )}

            {(status === "settled" || status === "closed") && (
              <>
                <p className="hint" style={{ marginTop: 0 }}>
                  Round closed. Podium settled from the escrow vault.
                </p>
                {arena.results.slice(0, arena.winnerCount).map((r, i) => (
                  <div className="row" key={r.player.toBase58()} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <span className="rank mono">#{i + 1}</span>
                    <span className="who mono">{r.player.equals(wallet.publicKey) ? "you" : shortKey(r.player)}</span>
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
                    View on explorer
                  </a>
                </div>
              </>
            )}
          </div>

          {/* Host / lifecycle controls */}
          <div className="actions">
            {status === "open" && isCreator && (
              <button className="btn ghost" disabled={busy !== null || arena.playerCount < 2} onClick={lock}>
                {busy === "lock" ? "locking…" : arena.playerCount < 2 ? "need 2+ players" : "Lock & start round"}
              </button>
            )}
            {status === "live" && !delegated && (
              <button className="btn" disabled={busy !== null} onClick={delegate}>
                {busy === "delegate" ? "delegating…" : "Delegate to rollup"}
              </button>
            )}
            {status === "live" && delegated && remaining <= 0 && (
              <button className="btn ghost" disabled={busy !== null} onClick={endRound}>
                {busy === "end_round" ? "ranking…" : "End round"}
              </button>
            )}
            {status === "live" && delegated && Number((arena as any).shockSeat) === 255 && (
              <button className="btn ghost" disabled={busy !== null} onClick={shock}>
                {busy === "shock" ? "calling the oracle…" : "Call the shock (VRF)"}
              </button>
            )}
            {Number((arena as any).shockSeat) !== 255 && (
              <div className="hint">
                The pit bit seat #{Number((arena as any).shockSeat) + 1} — VRF drawn, flat at market.
              </div>
            )}
            {status === "live" && delegated && tee && !sealed && (
              <button className="btn" disabled={busy !== null} onClick={seal}>
                {busy === "seal" ? "sealing…" : "Seal the pit (PER)"}
              </button>
            )}
            {delegated && sealed && (
              <button className="btn ghost" disabled={busy !== null} onClick={reveal}>
                {busy === "reveal" ? "revealing…" : "Reveal the book"}
              </button>
            )}
            {status === "closed" && series && !arena.seriesRecorded && (
              <button className="btn" disabled={busy !== null} onClick={record}>
                {busy === "record" ? "recording…" : "Record round in series"}
              </button>
            )}
            {status === "closed" && arena.seriesRecorded && (
              <div className="hint" style={{ color: "var(--long)" }}>
                Round already counted in the series standings.
              </div>
            )}

            {status === "settled" && delegated && !sealed && (
              <button className="btn" disabled={busy !== null} onClick={commit}>
                {busy === "commit" ? "committing…" : "Commit & undelegate"}
              </button>
            )}
            {status === "settled" && !delegated && (
              <button className="btn" disabled={busy !== null} onClick={settle}>
                {busy === "settle" ? "paying…" : "Settle podium"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="foot-note">
        devnet · arena {shortKey(arenaPubkey)} · every state transition is a real transaction.
        {sealed
          ? " The book is sealed inside the enclave (PER): a wallet outside the permission gets null for this account, token or not."
          : " Positions are hidden in this UI while the round runs; seal the pit to make them unreadable on-chain too."}
      </div>
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
