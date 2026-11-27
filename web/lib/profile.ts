/**
 * Player profile, derived — not stored.
 *
 * There is no profile account on-chain and no backend: every number on the profile page is
 * rebuilt from the accounts the program already writes. An arena carries the seat (bites,
 * trades, final equity) and the payout order; a series carries the points. The aggregation
 * mirrors the program's own payout math (`SHARES` and `solo_multiplier_bps`), so the numbers
 * match what the vault actually paid.
 *
 * Consequence, and it is deliberate: a round only counts as won or lost once it is `closed`
 * (the base layer moved the lamports). `settled` means the result is written but unpaid.
 */

import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import type { Arena, ArenaStatus, Seat, SeriesWithKey } from "./pit";
import { FIXED, soloMultiplierBps, statusOf } from "./pit";

/** Mirrors `SHARES` in programs/the-pit/src/constants.rs. */
const SHARES: number[][] = [
  [0, 0, 0],
  [10_000, 0, 0],
  [6_500, 3_500, 0],
  [6_000, 2_500, 1_500],
];

const lamports = (n: { toString(): string } | number) => Number(n.toString()) / LAMPORTS_PER_SOL;

export type RoundOutcome = "won" | "lost" | "flat" | "live" | "pending";

export type ProfileRound = {
  key: string;
  entry: number;
  payout: number;
  net: number;
  place: number | null;
  placeTotal: number;
  bites: number;
  trades: number;
  players: number;
  status: ArenaStatus;
  outcome: RoundOutcome;
  series: string | null;
  roundNo: number;
  startAt: number;
  endAt: number;
  pot: number;
  solo: boolean;
};

/** Podium place of a player in a finished round, 1-based, or null. */
function placeOf(arena: Arena, player: PublicKey): number | null {
  const winners = Math.min(arena.winnerCount || 0, 3);
  for (let i = 0; i < winners; i++) {
    const result = arena.results?.[i];
    if (result && result.player.equals(player)) return i + 1;
  }
  return null;
}

/**
 * What the vault paid this seat, in SOL. `null` while the round is not paid yet.
 *
 * Solo runs pay `entry × solo_multiplier_bps(final equity)`; the house covers anything above
 * the entry. Multiplayer rounds split `pot − rake − last-standing bonus` with `SHARES`, plus
 * the bonus itself for the last player standing.
 */
function payoutOf(arena: Arena, seat: Seat): number | null {
  const entry = lamports(arena.entryFee);
  const closed = statusOf(arena) === "closed";
  if (!closed) return null;

  if (arena.playerCount === 1) {
    const equity = Number(arena.results?.[0]?.equity ?? 0) / FIXED;
    return (entry * soloMultiplierBps(equity)) / 10_000;
  }

  const winners = Math.min(arena.winnerCount || 0, 3);
  if (winners === 0) return 0;
  const pot = lamports(arena.pot);
  const rake = (pot * arena.rakeBps) / 10_000;
  const lst = lamports(arena.lstBonus);
  const net = Math.max(0, pot - rake - lst);

  let payout = 0;
  for (let i = 0; i < winners; i++) {
    const result = arena.results?.[i];
    if (result && result.player.equals(seat.player)) {
      payout = (net * SHARES[winners][i]) / 10_000;
    }
  }
  if (!arena.lstWinner.equals(PublicKey.default) && arena.lstWinner.equals(seat.player)) {
    payout += lst;
  }
  return payout;
}

export function roundOf(arena: Arena, seat: Seat): ProfileRound {
  const entry = lamports(arena.entryFee);
  const status = statusOf(arena);
  const payout = payoutOf(arena, seat);
  const net = payout === null ? 0 : payout - entry;
  const outcome: RoundOutcome =
    payout === null ? (status === "settled" ? "pending" : "live") : net > 0 ? "won" : net < 0 ? "lost" : "flat";

  return {
    key: arena.publicKey.toBase58(),
    entry,
    payout: payout ?? 0,
    net,
    place: placeOf(arena, seat.player),
    placeTotal: arena.playerCount,
    bites: Number(seat.bites ?? 0),
    trades: Number(seat.trades ?? 0),
    players: arena.playerCount,
    status,
    outcome,
    series: arena.series.equals(PublicKey.default) ? null : arena.series.toBase58(),
    roundNo: arena.roundNo,
    startAt: Number(arena.startAt ?? 0),
    endAt: Number(arena.endAt ?? 0),
    pot: lamports(arena.pot),
    solo: arena.playerCount === 1,
  };
}

export type LeaderRow = {
  address: string;
  points: number;
  net: number;
  invested: number;
  earned: number;
  rounds: number;
  wins: number;
  losses: number;
  podiums: number;
  bites: number;
  trades: number;
  seriesRounds: number;
};

/**
 * One row per wallet seen in any arena, plus wallets that only appear in series standings.
 * Points come from the series (the only place the program writes them); net comes from the
 * closed rounds. Both boards use the same table, so a player never shows two different totals.
 */
export function buildTable(arenas: Arena[], series: SeriesWithKey[]): LeaderRow[] {
  const rows = new Map<string, LeaderRow>();
  const row = (address: string): LeaderRow => {
    let found = rows.get(address);
    if (!found) {
      found = {
        address,
        points: 0,
        net: 0,
        invested: 0,
        earned: 0,
        rounds: 0,
        wins: 0,
        losses: 0,
        podiums: 0,
        bites: 0,
        trades: 0,
        seriesRounds: 0,
      };
      rows.set(address, found);
    }
    return found;
  };

  for (const arena of arenas) {
    const seats = (arena.seats ?? []).slice(0, arena.playerCount);
    for (const seat of seats) {
      if (seat.player.equals(PublicKey.default)) continue;
      const r = row(seat.player.toBase58());
      const round = roundOf(arena, seat);
      r.bites += round.bites;
      r.trades += round.trades;
      if (round.outcome === "won" || round.outcome === "lost" || round.outcome === "flat") {
        r.rounds += 1;
        r.invested += round.entry;
        r.earned += round.payout;
        r.net += round.net;
        if (round.outcome === "won") r.wins += 1;
        if (round.outcome === "lost") r.losses += 1;
        if (round.place && round.place <= 3 && round.players > 1) r.podiums += 1;
      }
    }
  }

  for (const { series: s } of series) {
    for (const standing of s.standings) {
      if (standing.player.equals(PublicKey.default)) continue;
      const r = row(standing.player.toBase58());
      r.points += standing.points;
      r.seriesRounds += standing.rounds;
    }
  }

  return [...rows.values()];
}

/** Rank by points (tie: net SOL, then fewer rounds), or by net SOL (tie: points). */
export function rankTable(table: LeaderRow[], metric: "points" | "net"): LeaderRow[] {
  const sorted = [...table].sort((a, b) => {
    if (metric === "points") {
      if (b.points !== a.points) return b.points - a.points;
      if (b.net !== a.net) return b.net - a.net;
    } else {
      // A player whose rounds are not visible yet has no PnL to compare: keep them out of
      // the money ranking instead of pretending they are flat at zero.
      if ((a.rounds === 0) !== (b.rounds === 0)) return a.rounds === 0 ? 1 : -1;
      if (b.net !== a.net) return b.net - a.net;
      if (b.points !== a.points) return b.points - a.points;
    }
    return a.address.localeCompare(b.address);
  });
  return sorted;
}

export type Profile = {
  address: string;
  row: LeaderRow;
  recent: ProfileRound[];
  best: ProfileRound | null;
  worst: ProfileRound | null;
  series: { key: string; points: number; rounds: number; podiums: number; bites: number; survived: number; roundNo: number }[];
  rankPoints: number | null;
  rankNet: number | null;
  totalPlayers: number;
  liveRounds: number;
  firstSeen: number;
};

const rankIn = (board: LeaderRow[], address: string) => {
  const index = board.findIndex((r) => r.address === address);
  return index === -1 ? null : index + 1;
};

export function profileOf(address: string, arenas: Arena[], series: SeriesWithKey[]): Profile {
  const table = buildTable(arenas, series);
  const row =
    table.find((r) => r.address === address) ??
    ({
      address,
      points: 0,
      net: 0,
      invested: 0,
      earned: 0,
      rounds: 0,
      wins: 0,
      losses: 0,
      podiums: 0,
      bites: 0,
      trades: 0,
      seriesRounds: 0,
    } satisfies LeaderRow);

  const mine: ProfileRound[] = [];
  for (const arena of arenas) {
    const seat = (arena.seats ?? []).slice(0, arena.playerCount).find((s) => s.player.toBase58() === address);
    if (seat) mine.push(roundOf(arena, seat));
  }

  const resolved = mine.filter((r) => r.outcome === "won" || r.outcome === "lost" || r.outcome === "flat");
  const byNet = [...resolved].sort((a, b) => b.net - a.net);

  const seriesRows = series
    .map(({ publicKey, series: s }) => {
      const standing = s.standings.find((st) => st.player.toBase58() === address);
      if (!standing) return null;
      const round = mine.find((r) => r.series === publicKey.toBase58());
      return {
        key: publicKey.toBase58(),
        points: standing.points,
        rounds: standing.rounds,
        podiums: standing.podiums,
        bites: standing.bites,
        survived: standing.survived,
        roundNo: round?.roundNo ?? 0,
      };
    })
    .filter((s): s is NonNullable<typeof s> => !!s);

  const pointsBoard = rankTable(table, "points");
  const netBoard = rankTable(table, "net");

  return {
    address,
    row,
    recent: [...mine].sort((a, b) => b.endAt - a.endAt || b.startAt - a.startAt).slice(0, 12),
    best: byNet[0] ?? null,
    worst: byNet.length > 1 ? byNet[byNet.length - 1] : null,
    series: seriesRows,
    rankPoints: rankIn(pointsBoard, address),
    rankNet: rankIn(netBoard, address),
    totalPlayers: table.length,
    liveRounds: mine.filter((r) => r.outcome === "live" || r.outcome === "pending").length,
    firstSeen: mine.length ? Math.min(...mine.map((r) => r.startAt).filter((t) => t > 0)) : 0,
  };
}
