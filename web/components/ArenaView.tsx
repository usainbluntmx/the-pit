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
  soloPayoutSol,
  soloMultiplierBps,
  housePda,
  teeConnection,
  teeToken,
  waitFor,
} from "@/lib/pit";
import Link from "next/link";
import { CountdownRing, EquityBar, handleOf, madLine, thump } from "@/components/Bits";
import { PriceChart, fmtPrice, type FeedMark, type FeedPoint } from "@/components/PriceChart";
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
  const [samples, setSamples] = useState<FeedPoint[]>([]);
  const [entries, setEntries] = useState<
    { seat: number; side: 1 | -1; price: number; t: number; approx: boolean }[]
  >([]);
  const [events, setEvents] = useState<string[]>([]);
  const [kill, setKill] = useState<{ label: string; n: number; mine: boolean } | null>(null);
  const [series, setSeries] = useState<SeriesAccount | null>(null);
  const lastShockRef = useRef(-1);
  const crankRef = useRef(false);
  const roundRef = useRef("");
  const seatSnapRef = useRef<Map<number, { side: number; entry: number }>>(new Map());
  /** Live feed handle: a dedicated 1 s ticker keeps the line moving between reloads. */
  const liveRef = useRef<{ conn: Connection; feed: PublicKey; live: boolean } | null>(null);

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

  /**
   * One round = one chart. When the round key changes the line, the entry markers and
   * the seat snapshot start over; a reload restores them from sessionStorage.
   */
  const restoreRound = useCallback(
    (a: Arena) => {
      const rk = `${a.roundNo}:${Number(a.startAt)}`;
      if (roundRef.current === rk) return rk;
      roundRef.current = rk;
      seatSnapRef.current = new Map();
      setEntries([]);
      setSamples([]);
      try {
        const raw = window.sessionStorage.getItem(`pit:feed:${arenaPubkey.toBase58()}:${rk}`);
        const parsed = raw ? JSON.parse(raw) : null;
        const pts = Array.isArray(parsed) ? parsed : parsed?.pts;
        const marks = Array.isArray(parsed) ? [] : parsed?.mk;
        if (Array.isArray(pts)) {
          // Anything outside a sane dollar range is a leftover from a build that stored
          // raw 1e9 prices; drawing it would flatten the whole line.
          setSamples(
            pts
              .filter(
                (pt: any) =>
                  Number.isFinite(pt?.t) &&
                  Number.isFinite(pt?.p) &&
                  pt.p > 0 &&
                  pt.p < 1_000_000,
              )
              .slice(-1800),
          );
        }
        if (Array.isArray(marks)) {
          setEntries(
            marks.filter((m: any) => Number.isFinite(m?.price) && m.price > 0 && m.price < 1_000_000).slice(-24),
          );
        }
      } catch {
        /* a broken cache never blocks the round */
      }
      // Seed the snapshot with what the chain already holds: otherwise the first poll
      // after a reload would look like a brand-new entry and duplicate the marker.
      a.seats.slice(0, a.playerCount).forEach((seat, i) => {
        seatSnapRef.current.set(i, {
          side: Number((seat as any).side),
          entry: Number((seat as any).entryPrice),
        });
      });
      return rk;
    },
    [arenaPubkey],
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

          // A round owns its price history: when the round changes, the chart starts over.
          restoreRound(a);

          liveRef.current = { conn, feed: a.feed, live: statusOf(a) === "live" };
          const live = await readPrice(conn, a.feed).catch(() => null);
          setPrice(live);
          const ts = Math.floor(Date.now() / 1000);
          if (live) {
            setSamples((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.t >= ts) return prev;
              return [...prev, { t: ts, p: live }].slice(-1800);
            });
          }

          // Entry markers: the program keeps the price of the open position, not its
          // timestamp, so the exact moment is taken from the first poll that sees it.
          const mine = a.seats
            .slice(0, a.playerCount)
            .findIndex((s) => s.player.equals(wallet.publicKey));
          a.seats.slice(0, a.playerCount).forEach((seat, i) => {
            const raw = seat as any;
            const side = Number(raw.side);
            const entry = Number(raw.entryPrice);
            const before = seatSnapRef.current.get(i);
            const holdingNow = statusOf(a) === "live" && side !== 0 && entry > 0;
            const changed = !before || before.side !== side || before.entry !== entry;
            if (i === mine && holdingNow && changed) {
              setEntries((prev) =>
                [
                  ...prev,
                  {
                    seat: i,
                    side: side > 0 ? (1 as const) : (-1 as const),
                    price: entry,
                    t: ts,
                    approx: !before,
                  },
                ].slice(-24),
              );
            }
            seatSnapRef.current.set(i, { side, entry });
          });

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
      restoreRound(a);
      await loadSeries(a.series);
      setErUrl(null);
      liveRef.current = null;
      // The feed only publishes inside the rollup: on the base layer the account is
      // delegated and stale, so reading it here would show an old price as if it were live.
      setPrice(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [arenaPubkey, base, wallet, tee, t, restoreRound]);

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

  // The line has to move like a market, not like a page refresh: a light ticker reads the
  // feed once a second and appends to the same buffer the 4 s reload uses.
  useEffect(() => {
    let alive = true;
    const id = setInterval(async () => {
      const feed = liveRef.current;
      if (!feed || !feed.live) return;
      const p = await readPrice(feed.conn, feed.feed).catch(() => null);
      if (!alive || p === null || !Number.isFinite(p) || p <= 0) return;
      setPrice(p);
      const ts = Math.floor(Date.now() / 1000);
      setSamples((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.t >= ts) return prev;
        return [...prev, { t: ts, p }].slice(-1800);
      });
    }, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // A reload in the middle of a round must not erase the line the player already saw.
  useEffect(() => {
    if (!arena || (samples.length === 0 && entries.length === 0)) return;
    const rk = `${arena.roundNo}:${Number(arena.startAt)}`;
    try {
      window.sessionStorage.setItem(
        `pit:feed:${arenaPubkey.toBase58()}:${rk}`,
        JSON.stringify({ pts: samples.slice(-1800), mk: entries.slice(-24) }),
      );
    } catch {
      /* private mode or a full quota: the chart still works in memory */
    }
  }, [samples, entries, arena, arenaPubkey]);

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
  const isSolo = arena ? arena.maxPlayers === 1 : false;
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/play?arena=${arenaPubkey.toBase58()}`
      : "";
  const needMore = arena ? (isSolo ? 0 : Math.max(0, 2 - arena.playerCount)) : 0;
  const entrySol = arena ? sol(arena.entryFee) : 0;

  // Only the player's own entries are drawn while the round runs: the book is sealed
  // for everyone else until the bell, and the chart should not leak it.
  const myMarks: FeedMark[] = useMemo(
    () =>
      myIndex < 0
        ? []
        : entries
            .filter((e) => e.seat === myIndex)
            .map((e) => ({ side: e.side, price: e.price, t: e.t, approx: e.approx })),
    [entries, myIndex],
  );
  const feedDelta =
    samples.length > 1 && samples[0].p
      ? ((samples[samples.length - 1].p - samples[0].p) / samples[0].p) * 100
      : null;

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
      body: t("Every seat paid the same entry ({entry} SOL) and it all sits in one shared pot. The podium splits it 60 / 25 / 15.", {
        entry: fmtSol(entrySol, 3),
      }),
      why: t("The pot belongs to the program, not to the host. Nobody can move it by hand — the payout is executed by the contract."),
    },
    {
      target: '[data-guide="nextstep"]',
      title: t("What to do right now"),
      body:
        status === "open"
          ? t("This panel always tells you the next step: join, invite the second player, lock. It changes with every state of the round.")
          : status === "live"
            ? t("This panel tells you what the round expects from you: trade, watch the bite, close before the bell.")
            : t("This panel walks the payout: save the state back to Solana, then pay the podium."),
      why: t("A round has four states — open, live, paid out, closed — and each one allows different moves. Guessing is how people lose money."),
    },
    {
      target: '[data-guide="board"]',
      title: t("The leaderboard"),
      body: t("Your own profit and loss follow live prices. Everybody else shows “hidden” until the bell — that is the sealed book, not a bug."),
      why: t("Inside the private environment, a wallet outside the table gets nothing back for the whole account, token or not. Your positions stay private on Solana."),
    },
    {
      target: '[data-guide="ticket"]',
      title: t("The ticket"),
      body: t("Pick LONG or SHORT, choose 1–5× and open. The order runs inside the fast layer: about 10 ms and no fees."),
      why: t("Trades stay on the fast layer while the round runs, so there is no fee and no block wait. The price comes from Pyth inside that layer."),
    },
    ...(status === "live"
      ? [
          {
            target: '[data-guide="bite"]',
            title: t("The bite is coming"),
            body: t("Every {secs}s the pit force-closes one random player who is holding a position. This bar is the countdown.", { secs: biteCooldown }),
            why: t("The player is drawn by a randomness oracle and the result is checked by the program. Staying flat is a real defence: the pit only bites players with risk open."),
          },
        ]
      : []),
    {
      target: '[data-guide="actions"]',
      title: t("Round controls"),
      body: t("Join → lock → move to the fast layer → trade → end round → save → pay. Each button is one real transaction, and anyone can push the ones that need no permission."),
      why: t("Moving to the fast layer happens on Solana, everything that touches the table happens there, and the payout goes back to Solana. That split is what makes it cheap and still final."),
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
    if (!erUrl) throw new Error(t("this table hasn't moved to the fast layer yet"));
    return new Connection(erUrl, { commitment: "confirmed" });
  };

  const seal = () =>
    run("seal", async () => {
      if (!tee) throw new Error(t("private session not ready yet"));
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
      if (!tee) throw new Error(t("private session not ready yet"));
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

      // Solo run: the house PDA is the counterparty, the entry is the stake.
      if (arena!.playerCount === 1) {
        const tx = await program.methods
          .settleSolo(nonce)
          .accounts({
            arena: arenaPubkey,
            vault: vaultOf(arenaPubkey),
            house: housePda(),
            player: arena!.results[0].player,
            systemProgram: SystemProgram.programId,
          })
          .transaction();
        return sendTx(base, tx, wallet);
      }

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
              ? t("on Solana")
              : sealed
                ? t("private · sealed")
                : tee
                  ? t("private · open")
                  : `ER · ${erUrl?.replace("https://", "") ?? ""}`}
          </span>
          {series && (
            <span className="pill">
              {t("round {n}/{max}", { n: arena.roundNo, max: series.maxRounds })}
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
            {t("{count}/{max} seats · {entry} SOL to enter", {
              count: arena.playerCount,
              max: arena.maxPlayers,
              entry: fmtSol(sol(arena.entryFee), 2),
            })}
          </div>
          <div className="split">
            {isSolo ? (
              <span style={{ color: "var(--muted)" }}>
                {t("solo payout · 1.00× / 1.25× / 1.50× / 2.00× / 3.00×")}
              </span>
            ) : (
              <>
                <span>
                  <b>60%</b> {t("1st")}
                </span>
                <span>
                  <b>25%</b> {t("2nd")}
                </span>
                <span>
                  <b>15%</b> {t("3rd")}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="stat">
          {status === "live" ? (
            <CountdownRing remaining={remaining} total={Number(arena.duration)} label={t("time left")} />
          ) : (
            <>
              <div className="stat-label">
                {status === "open" ? t("starts when it's locked") : t("round")}
              </div>
              <div className="stat-value">{c.status[status].toUpperCase()}</div>
            </>
          )}
          <div className="stat-sub" style={{ textAlign: "center" }}>
            {t("{secs}s rounds · {rake}% fee", {
              secs: arena.duration.toString(),
              rake: arena.rakeBps / 100,
            })}
          </div>
        </div>
      </div>

      <div className="panel feed-panel" data-guide="feed">
        <div className="panel-head">
          <span>
            {t("The feed")} · {feedNameOf(arena.feed)}
          </span>
          <span className="feed-head-meta">
            {sealed && <span className="pill">{t("sealed")}</span>}
            {status === "live" ? (
              <span className="live-chip">
                <span className="dot" /> {t("live")}
              </span>
            ) : (
              <span>{c.status[status]}</span>
            )}
          </span>
        </div>

        <div className="feed-top">
          <div>
            {price !== null && (
              <span className="feed-price mono">${fmtPrice(price)}</span>
            )}
            {feedDelta !== null && (
              <span className={`feed-delta ${feedDelta >= 0 ? "up" : "down"}`}>
                {feedDelta >= 0 ? "+" : ""}
                {feedDelta.toFixed(2)}%
                <small>{t("this round")}</small>
              </span>
            )}
          </div>
          <div className="feed-chips">
            {mySeat && Number(mySeat.side) !== 0 && (
              <span className={`feed-pos ${Number(mySeat.side) > 0 ? "long" : "short"}`}>
                {Number(mySeat.side) > 0 ? t("LONG") : t("SHORT")} {leverageOf(mySeat)}× ·{" "}
                {t("entry")} ${fmtPrice(Number(mySeat.entryPrice))}
              </span>
            )}
            {status === "live" && (
              <span className="feed-clock mono">{fmtClock(remaining)}</span>
            )}
          </div>
        </div>

        <PriceChart
          points={samples}
          marks={myMarks}
          startAt={Number(arena.startAt)}
          endAt={Number(arena.endAt)}
          now={now}
          price={price}
          title={feedNameOf(arena.feed)}
          waiting={t("waiting for prices")}
          waitingSub={t("prices start once the table moves to the fast layer")}
          entryLabel={(sideNow, value, approx) =>
            t("{side} entry @ {price}{approx}", {
              side: sideNow === "long" ? t("LONG") : t("SHORT"),
              price: value,
              approx: approx ? " ~" : "",
            })
          }
          sealedNote={
            !price
              ? ""
              : revealed
                ? t("positions revealed at the bell")
                : isSolo
                  ? t("one seat, no rival book to hide")
                  : t("your entry is drawn · rivals stay sealed until the bell")
          }
        />
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
              ? isSolo
                ? t("Join for {amount} SOL and run against the market", { amount: fmtSol(entrySol, 3) })
                : t("Join for {amount} SOL and start with 1,000 credits", { amount: fmtSol(entrySol, 3) })
              : needMore > 0
                ? t("You're in — a round needs a second player")
                : isSolo
                  ? t("You are in — lock the arena to start the clock")
                  : isCreator
                    ? t("Everyone's in: lock the table to start the clock")
                    : t("Everyone's in: waiting for the host to lock")}
          </div>
          <ul className="nextstep-steps">
            <li>
              <span className="nextstep-num">1</span>
              <span>
                {myIndex < 0
                  ? t("Joining puts your entry into the shared pot and opens your seat.")
                  : t("You are seated and paid. Nothing else to deposit.")}
              </span>
            </li>
            <li>
              <span className="nextstep-num">2</span>
              <span>
                {isSolo ? (
                  t("This is a solo run: one seat, no invite. Lock it to start the clock.")
                ) : (
                  <Rich text={t("A round needs **2 players**. Copy the invite link and send it — **no bots join by themselves**.")} />
                )}
              </span>
            </li>
            <li>
              <span className="nextstep-num">3</span>
              <span>
                {isCreator ? t("You lock it: ") : t("The host locks it: ")}
                {t("the table moves to the fast layer, the clock starts and your moves go private.")}
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
            <button className="btn ghost" onClick={copyInvite} style={{ display: isSolo ? "none" : undefined }}>
              {copiedLink ? t("link copied ✓") : t("Copy invite link")}
            </button>
          </div>
          <p className="nextstep-note" style={{ display: isSolo ? "none" : undefined }}>
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
          <div className="nextstep-what">{t("Trade from the ticket and survive the bite")}</div>
          <ul className="nextstep-steps">
            <li>
              <span className="nextstep-num">1</span>
              <span>{t("Pick LONG or SHORT, choose 1–5× and open. It lands instantly and costs nothing.")}</span>
            </li>
            <li>
              <span className="nextstep-num">2</span>
              <span>
                {t("Every {secs}s the pit closes one random player who is holding. Staying out is a real defence.", { secs: biteCooldown })}
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
          <div className="nextstep-what">{t("Save the round back to Solana, then pay the podium")}</div>
          <ul className="nextstep-steps">
            <li>
              <span className="nextstep-num">1</span>
              <span>
                {delegated
                  ? t("Save & return: the final state goes from the fast layer back to Solana.")
                  : t("The table is already back on Solana.")}
              </span>
            </li>
            <li>
              <span className="nextstep-num">2</span>
              <span>
                {isSolo
                  ? t("Pay out: the house pays your multiplier from the entry and its own balance.")
                  : t("Pay out: the pot pays 60/25/15 to the top three, plus the last-one-standing bonus.")}
              </span>
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
          <div className="nextstep-what">
            {isSolo
              ? t("Solo run paid out — start the next one")
              : t("The podium took the pot — start the next one")}
          </div>
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
          <span className="mad-sub">{t("{n}s · your orders run backwards", { n: madLeft })}</span>
        </div>
      )}

      {kill && (
        <div className={`kill ${kill.mine ? "mine" : ""}`}>
          <span className="kill-n mono">{t("BITE #{n}", { n: kill.n })}</span>
          <span className="kill-who">{kill.label}</span>
          <span className="kill-sub">{t("closed at market · draw verified")}</span>
        </div>
      )}

      {error && <div className="err">{error}</div>}
      {notice && <div className="ok">{notice}</div>}


      {events.length > 0 && (
        <div className="ticker">
          <span className="ticker-label">{t("log")}</span>
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
                  ? t("sealed · unreadable")
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
                    title={showPnl ? t("equity at current prices") : t("hidden until the bell")}
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
            <span>{status === "live" ? t("no fees") : ""}</span>
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
                  {t("The table is open. When the host locks it, the table moves to the fast layer and every trade runs free at 10 ms.")}
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
                    <span>{t("Multiplier")}</span>
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
                  {t("Position size {lev}× your equity. Profit and loss follow the live price and settle on Solana when the round ends.", { lev: leverage })}
                </p>
                {isSolo && (
                  <p className="hint hint-bite">
                    {t("Solo has no draw: while you hold a position, the bite comes for you every time.")}
                  </p>
                )}
              </>
            )}

            {(status === "settled" || status === "closed") && (
              <>
                <p className="hint" style={{ marginTop: 0 }}>
                  {isSolo
                    ? Number(arena.results[0]?.equity ?? 0) / FIXED >= 1_000
                      ? t("Round closed. The house paid your multiplier.")
                      : t("Round closed. You finished below 1,000 credits: the house keeps the entry.")
                    : t("Round closed. The pot paid the podium.")}
                </p>
                {arena.results.slice(0, arena.winnerCount).map((r, i) => {
                  const equity = Number(r.equity) / FIXED;
                  const delta = equity - 1_000;
                  return (
                    <div className="row" key={r.player.toBase58()} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                      <span className="rank mono">#{i + 1}</span>
                      <span className="who mono">{r.player.equals(wallet.publicKey) ? t("you") : shortKey(r.player)}</span>
                      <span className={`pnl ${delta >= 0 ? "up" : "down"}`}>
                        {delta >= 0 ? "+" : ""}
                        {delta.toFixed(4)}
                        <span className="pnl-ref"> · {equity.toFixed(4)}</span>
                      </span>
                    </div>
                  );
                })}
                {isSolo &&
                  arena.results[0] &&
                  (() => {
                    const equity = Number(arena.results[0].equity) / FIXED;
                    const payout = soloPayoutSol(entrySol, equity);
                    const multiplier = soloMultiplierBps(equity) / 10_000;
                    return (
                      <div className="row" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                        <span className="who">{t("Solo payout")}</span>
                        <span className={`pnl ${payout > 0 ? "up" : "down"}`}>
                          {multiplier.toFixed(2)}× · {fmtSol(payout, 4)} SOL
                        </span>
                      </div>
                    );
                  })()}
                <div style={{ marginTop: 14 }}>
                  <a
                    className="btn ghost"
                    style={{ display: "block", textAlign: "center", padding: 14 }}
                    href={`https://explorer.solana.com/address/${arenaPubkey.toBase58()}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("View on Solana explorer")}
                  </a>
                </div>
              </>
            )}
          </div>

          {/* Points were only visible in the lobby: inside the arena the player could not see
              where they stand in the series. */}
          {series && (
            <div className="panel" style={{ marginTop: 14 }} data-guide="series">
              <div className="panel-head">
                <span>{t("Series standings")}</span>
                <span className="mono">
                  {t("round {n}/{max}", { n: arena.roundNo, max: series.maxRounds })}
                </span>
              </div>
              <div style={{ padding: "4px 16px 14px" }}>
                {[...series.standings]
                  .sort((a, b) => b.points - a.points)
                  .slice(0, 6)
                  .map((r, i) => (
                    <div className="row" key={r.player.toBase58()}>
                      <span className="rank mono">{String(i + 1).padStart(2, "0")}</span>
                      <span className="who">
                        {r.player.equals(wallet.publicKey) ? t("you") : handleOf(r.player.toBase58())}
                        <small>{t("{p} podiums · {s} survived · {b} bites", { p: r.podiums, s: r.survived, b: r.bites })}</small>
                      </span>
                      <span className="pnl">{t("{n} pts", { n: r.points })}</span>
                    </div>
                  ))}
                {series.standings.length === 0 && (
                  <p className="hint" style={{ marginTop: 4 }}>
                    {t("Points appear once the first round is recorded in the series.")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Host / lifecycle controls */}
          <div className="actions" data-guide="actions">
            {status === "open" && isCreator && (
              <button
                className="btn ghost"
                disabled={busy !== null || arena.playerCount < (isSolo ? 1 : 2)}
                onClick={lock}
              >
                {busy === "lock"
                  ? t("locking…")
                  : arena.playerCount < (isSolo ? 1 : 2)
                    ? isSolo
                      ? t("need 1 player")
                      : t("need 2+ players")
                    : t("Lock & start round")}
              </button>
            )}
            {status === "live" && !delegated && (
              <button className="btn" disabled={busy !== null} onClick={delegate}>
                {busy === "delegate" ? t("moving…") : t("Move to fast layer")}
              </button>
            )}
            {status === "live" && delegated && remaining <= 0 && (
              <button className="btn ghost" disabled={busy !== null} onClick={endRound}>
                {busy === "end_round" ? t("ranking…") : t("End round")}
              </button>
            )}
            {status === "live" && delegated && Number((arena as any).shockSeat) === 255 && (
              <button className="btn ghost" disabled={busy !== null} onClick={shock}>
                {busy === "shock" ? t("calling the draw…") : t("Trigger the bite")}
              </button>
            )}
            {Number((arena as any).shockSeat) !== 255 && (
              <div className="hint">
                {t("The pit bit seat #{n} — random draw, closed at market.", {
                  n: Number((arena as any).shockSeat) + 1,
                })}
              </div>
            )}
            {status === "live" && delegated && tee && !sealed && (
              <button className="btn" disabled={busy !== null} onClick={seal}>
                {busy === "seal" ? t("sealing…") : t("Make positions private")}
              </button>
            )}
            {delegated && sealed && (
              <button className="btn ghost" disabled={busy !== null} onClick={reveal}>
                {busy === "reveal" ? t("revealing…") : t("Reveal positions")}
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
                {busy === "commit" ? t("saving…") : t("Save & return to Solana")}
              </button>
            )}
            {status === "settled" && !delegated && (
              <button className="btn" disabled={busy !== null} onClick={settle}>
                {busy === "settle" ? t("paying…") : t("Pay the podium")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="foot-note">
        {t("devnet · table {key} · every change of state is a real transaction.", {
          key: shortKey(arenaPubkey),
        })}
        {sealed
          ? ` ${t("Positions are sealed in a private environment: anyone outside the table asks for the account and gets nothing back, with or without a token.")}`
          : ` ${t("Positions are hidden on this screen while the round runs; make them private to hide them on Solana too.")}`}
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
