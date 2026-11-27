import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAuthToken,
  EPHEMERAL_VAULT_ID,
  MAGIC_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  PERMISSION_SEED,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import idlJson from "./idl.json";

export const IDL = idlJson as anchor.Idl;
export const PROGRAM_ID = new PublicKey((idlJson as any).address);

export const BASE_RPC =
  process.env.NEXT_PUBLIC_BASE_RPC ?? "https://rpc.magicblock.app/devnet";
export const ROUTER =
  process.env.NEXT_PUBLIC_ROUTER ?? "https://devnet-router.magicblock.app/";

export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
);

/** MagicBlock price feed accounts on devnet (PDA ["price_feed","pyth-lazer",<id>]). */
export const FEEDS: Record<string, { name: string; address: PublicKey; decimals: number }> = {
  SOL: {
    name: "SOL / USD",
    address: new PublicKey("ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu"),
    decimals: 8,
  },
  BTC: {
    name: "BTC / USD",
    address: new PublicKey("71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr"),
    decimals: 8,
  },
  ETH: {
    name: "ETH / USD",
    address: new PublicKey("5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG"),
    decimals: 8,
  },
};

export const FEED_KEYS = Object.keys(FEEDS);

/** Human name of the market an arena trades, from the feed recorded on-chain. */
export function feedNameOf(feed: PublicKey | string): string {
  const address = typeof feed === "string" ? feed : feed.toBase58();
  for (const key of FEED_KEYS) {
    if (FEEDS[key].address.toBase58() === address) return FEEDS[key].name;
  }
  return "CUSTOM / USD";
}

export const FIXED = 1_000_000_000;
export const ARENA_ACCOUNT_SIZE = 982;

export const SERIES_SEED = Buffer.from("series");
export const SERIES_ACCOUNT_SIZE = 724;

export type Standing = {
  player: PublicKey;
  points: number;
  rounds: number;
  podiums: number;
  bites: number;
  survived: number;
};

export type SeriesAccount = {
  creator: PublicKey;
  nonce: string;
  bump: number;
  rounds: number;
  maxRounds: number;
  entryFee: anchor.BN;
  standings: Standing[];
};

export type ArenaStatus = "open" | "live" | "settled" | "closed";

export type Seat = {
  player: PublicKey;
  bankroll: anchor.BN;
  realized: anchor.BN;
  notional: anchor.BN;
  /** USD, already divided by FIXED: the program stores the oracle price in 1e9 units. */
  entryPrice: number;
  trades: number;
  side: number;
  bites: number;
  streak: number;
  pressure: number;
  madUntil: anchor.BN;
};

export type PitResult = { player: PublicKey; equity: anchor.BN };

export type ArenaSeries = {
  series: PublicKey;
  roundNo: number;
  lstWinner: PublicKey;
  lstBonus: anchor.BN;
  seriesRecorded: boolean;
};

export type Arena = {
  publicKey: PublicKey;
  creator: PublicKey;
  feed: PublicKey;
  entryFee: anchor.BN;
  pot: anchor.BN;
  startAt: anchor.BN;
  endAt: anchor.BN;
  duration: anchor.BN;
  rakeBps: number;
  maxPlayers: number;
  playerCount: number;
  winnerCount: number;
  status: any;
  vaultBump: number;
  nonce: number[];
  nonceLen: number;
  isPrivate: boolean;
  shockSeat: number;
  shockCount: number;
  lastShockTs: anchor.BN;
  series: PublicKey;
  roundNo: number;
  lstWinner: PublicKey;
  lstBonus: anchor.BN;
  seriesRecorded: boolean;
  seats: Seat[];
  results: PitResult[];
};

/** Rebuild the arena seed string from the bytes stored on-chain. */
export function nonceOf(arena: Arena): string {
  const bytes = arena.nonce;
  const len = arena.nonceLen ?? 0;
  if (!bytes || !len) return "";
  return Buffer.from(bytes.slice(0, len)).toString("utf8");
}

/** Anchor returns enums as `{ open: {} }`; normalise to a lowercase string. */
export function statusOf(arena: Arena): ArenaStatus {
  const raw = arena.status as unknown;
  if (typeof raw === "string") return raw.toLowerCase() as ArenaStatus;
  const key = Object.keys(raw as Record<string, unknown>)[0] ?? "open";
  return key.toLowerCase() as ArenaStatus;
}

/* ------------------------------ connections ----------------------------- */

export function baseConnection(): Connection {
  return new Connection(BASE_RPC, { commitment: "confirmed" });
}

function readOnlyWallet(pubkey: PublicKey) {
  return {
    publicKey: pubkey,
    signTransaction: async <T,>(tx: T) => tx,
    signAllTransactions: async <T,>(txs: T[]) => txs,
  };
}

export function programAt(connection: Connection, pubkey: PublicKey) {
  const provider = new anchor.AnchorProvider(connection, readOnlyWallet(pubkey) as never, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return new anchor.Program(IDL, provider);
}

const DUMMY = Keypair.generate().publicKey;

/* --------------------------------- reads -------------------------------- */

/** Rollups we scan for arenas that are currently delegated (they leave the base account map). */
const ER_SCAN = [
  "https://devnet-as.magicblock.app",
  "https://devnet-eu.magicblock.app",
  "https://devnet-us.magicblock.app",
];

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

/**
 * List every arena, including the ones delegated to a rollup.
 *
 * A delegated account stops appearing in the base layer's program accounts (its owner is the
 * Delegation Program), so the base scan alone hides every live round. We merge the base scan
 * with the three devnet rollups, and let the rollup copy win because it holds the live state.
 */
export async function listArenas(connection: Connection): Promise<Arena[]> {
  const program = programAt(connection, DUMMY);
  const sources = [connection, ...ER_SCAN.map((url) => new Connection(url, { commitment: "confirmed" }))];

  const scans = await Promise.allSettled(
    sources.map((c) =>
      withTimeout(
        c.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: ARENA_ACCOUNT_SIZE }] }),
        8_000,
      ),
    ),
  );

  const byKey = new Map<string, Arena>();
  for (const scan of scans) {
    if (scan.status !== "fulfilled") continue;
    for (const { pubkey, account } of scan.value) {
      try {
        const decoded = program.coder.accounts.decode("arena", account.data) as any;
        byKey.set(pubkey.toBase58(), { publicKey: pubkey, ...decoded } as Arena);
      } catch {
        /* not an arena we can decode — ignore */
      }
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const rank = (s: string) => (s === "live" ? 0 : s === "open" ? 1 : 2);
    const d = rank(statusOf(a)) - rank(statusOf(b));
    return d !== 0 ? d : Number(b.startAt) - Number(a.startAt);
  });
}

export async function fetchArena(
  connection: Connection,
  arena: PublicKey,
): Promise<Arena> {
  const program = programAt(connection, DUMMY);
  const decoded: any = await (program.account as any).arena.fetch(arena);
  // The program keeps prices in 1e9 units (FIXED). The feed reader already returns USD,
  // so the seat is normalised here once instead of in every consumer: an unscaled entry
  // price makes the chart axis explode and marks a winning seat as losing.
  decoded.seats = (decoded.seats ?? []).map((seat: any) => ({
    ...seat,
    entryPrice: Number(seat.entryPrice) / FIXED,
  }));
  return { publicKey: arena, ...decoded } as Arena;
}

export type DelegationStatus = {
  isDelegated: boolean;
  fqdn?: string;
  delegationRecord?: { authority: string; owner: string; delegationSlot: number };
};

export async function getDelegationStatus(account: PublicKey): Promise<DelegationStatus> {
  const res = await fetch(ROUTER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getDelegationStatus",
      params: [account.toBase58()],
    }),
  });
  const body = (await res.json()) as { result?: DelegationStatus; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result ?? { isDelegated: false };
}

export function normaliseFqdn(fqdn: string): string {
  const withScheme = fqdn.startsWith("http") ? fqdn : `https://${fqdn}`;
  return withScheme.replace(/\/+$/, "");
}

/** Connection to the rollup that currently owns the account, or null if it lives on base. */
export async function erConnection(
  arena: PublicKey,
): Promise<{ connection: Connection; url: string; status: DelegationStatus } | null> {
  const status = await getDelegationStatus(arena);
  if (!status.isDelegated || !status.fqdn) return null;
  const url = normaliseFqdn(status.fqdn);
  return { connection: new Connection(url, { commitment: "confirmed" }), url, status };
}

/* -------------------------------- pricing ------------------------------- */

const PRICE_OFFSET = 73;
const EXPONENT_OFFSET = 89;

/** Newest price across the devnet rollups, falling back to the base layer. */
export async function readPriceLive(feed: PublicKey = FEEDS.SOL.address): Promise<number | null> {
  for (const url of ER_SCAN) {
    try {
      const price = await readPrice(new Connection(url, { commitment: "confirmed" }), feed);
      if (price && price > 0) return price;
    } catch {
      /* try the next rollup */
    }
  }
  return readPrice(baseConnection(), feed);
}

export async function readPrice(
  connection: Connection,
  feed: PublicKey,
): Promise<number | null> {
  const info = await connection.getAccountInfo(feed);
  if (!info || info.data.length < 101) return null;
  const data = info.data;
  const raw = data.readBigInt64LE(PRICE_OFFSET);
  const exp = data.readInt32LE(EXPONENT_OFFSET);
  const mag = Math.abs(exp);
  const value = mag <= 9 ? Number(raw) * Math.pow(10, 9 - mag) : Number(raw) / Math.pow(10, mag - 9);
  return value / FIXED;
}

/* --------------------------------- writes ------------------------------- */

/** Anything that can pay for and sign a transaction: a connected wallet. */
export type Signer = {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
};

export async function sendTx(
  connection: Connection,
  tx: Transaction,
  signer: Signer,
  opts: { skipPreflight?: boolean } = {},
): Promise<string> {
  tx.feePayer = signer.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  const signed = await signer.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: opts.skipPreflight ?? false,
    preflightCommitment: "confirmed",
  });
  const conf = await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (conf.value.err) throw new Error(`tx failed: ${JSON.stringify(conf.value.err)}`);
  return sig;
}

export async function waitFor<T>(
  fn: () => Promise<T | null>,
  timeoutMs = 45_000,
  intervalMs = 1_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value !== null) return value;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("timeout");
}

/* -------------------------------- builders ------------------------------ */

export function buildCreateArena(
  program: anchor.Program,
  args: {
    nonce: string;
    entryFeeSol: number;
    durationSecs: number;
    maxPlayers: number;
    rakeBps: number;
    feed: PublicKey;
    creator: PublicKey;
  },
) {
  const [arena] = PublicKey.findProgramAddressSync(
    [Buffer.from("arena"), Buffer.from(args.nonce)],
    PROGRAM_ID,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), arena.toBuffer()],
    PROGRAM_ID,
  );
  const builder = program.methods
    .createArena(
      args.nonce,
      new anchor.BN(Math.round(args.entryFeeSol * LAMPORTS_PER_SOL)),
      new anchor.BN(args.durationSecs),
      args.maxPlayers,
      args.rakeBps,
      args.feed,
    )
    .accounts({
      creator: args.creator,
      arena,
      vault,
      systemProgram: anchor.web3.SystemProgram.programId,
    });
  return { builder, arena, vault };
}

export function seriesPda(nonce: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SERIES_SEED, Buffer.from(nonce)], PROGRAM_ID);
}

export async function fetchSeries(
  connection: Connection,
  key: PublicKey,
): Promise<SeriesAccount | null> {
  const info = await connection.getAccountInfo(key);
  if (!info) return null;
  return decodeSeries(info.data);
}

export type SeriesWithKey = { publicKey: PublicKey; series: SeriesAccount };

function decodeSeries(data: Buffer): SeriesAccount | null {
  try {
    const coder = new anchor.BorshAccountsCoder(IDL);
    const raw: any = coder.decode("Series", data);
    // BorshAccountsCoder decodifica con los nombres del IDL, que van en snake_case.
    const nonceBytes: number[] = Array.from(raw.nonce as number[]).slice(0, Number(raw.nonce_len));
    return {
      creator: raw.creator,
      nonce: Buffer.from(nonceBytes).toString("utf8"),
      bump: raw.bump,
      rounds: raw.rounds,
      maxRounds: raw.max_rounds,
      entryFee: raw.entry_fee,
      standings: raw.standings
        .map((r: any) => ({
          player: r.player,
          points: Number(r.points),
          rounds: Number(r.rounds),
          podiums: Number(r.podiums),
          bites: Number(r.bites),
          survived: Number(r.survived),
        }))
        .filter((r: Standing) => !r.player.equals(PublicKey.default)),
    };
  } catch {
    return null;
  }
}

/**
 * Every series that exists, base layer plus the rollups. Series are created and scored on
 * the base layer, but the scan mirrors `listArenas` so a series bound to a delegated arena is
 * still found if a rollup ever answers for it.
 */
export async function listSeries(connection: Connection): Promise<SeriesWithKey[]> {
  const sources = [connection, ...ER_SCAN.map((url) => new Connection(url, { commitment: "confirmed" }))];
  const scans = await Promise.allSettled(
    sources.map((c) =>
      withTimeout(
        c.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: SERIES_ACCOUNT_SIZE }] }),
        8_000,
      ),
    ),
  );

  const byKey = new Map<string, SeriesWithKey>();
  for (const scan of scans) {
    if (scan.status !== "fulfilled") continue;
    for (const { pubkey, account } of scan.value) {
      const series = decodeSeries(account.data);
      if (series) byKey.set(pubkey.toBase58(), { publicKey: pubkey, series });
    }
  }
  return [...byKey.values()];
}

export function rememberSeries(key: string) {
  const all = knownSeries();
  if (!all.includes(key)) localStorage.setItem("pit:series", JSON.stringify([key, ...all]));
}

export function knownSeries(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("pit:series") ?? "[]");
  } catch {
    return [];
  }
}

export function arenaPdas(nonce: string) {
  const [arena] = PublicKey.findProgramAddressSync(
    [Buffer.from("arena"), Buffer.from(nonce)],
    PROGRAM_ID,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), arena.toBuffer()],
    PROGRAM_ID,
  );
  return { arena, vault };
}

/* ---------------------------------- PER --------------------------------- */

export const TEE_URL = process.env.NEXT_PUBLIC_TEE_URL ?? "https://devnet-tee.magicblock.app";
  /** Delegated oracle queue, for VRF requests made from inside the rollup. */
  export const EPHEMERAL_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");

/** TEE Ephemeral Rollup validator on devnet. Arenas are delegated here, not to a public ER. */
export const TEE_VALIDATOR = new PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");

/**
 * Ask the TEE for a challenge, sign it with the connected wallet and exchange it for a
 * bearer token. The token is scoped to the wallet, so every player needs their own.
 */
export async function teeToken(wallet: {
  publicKey: PublicKey;
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>;
}): Promise<string> {
  const { token } = await getAuthToken(TEE_URL, wallet.publicKey, (message) =>
    wallet.signMessage(message),
  );
  return token;
}

export function teeConnection(token: string): Connection {
  return new Connection(`${TEE_URL}?token=${token}`, { commitment: "confirmed" });
}

export function permissionPda(arena: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [PERMISSION_SEED as Buffer, arena.toBuffer()],
    PERMISSION_PROGRAM_ID,
  )[0];
}

export function permissionAccounts(arena: PublicKey, payer: PublicKey) {
  return {
    payer,
    arena,
    permission: permissionPda(arena),
    permissionProgram: PERMISSION_PROGRAM_ID,
    ephemeralVault: EPHEMERAL_VAULT_ID,
    magicProgram: MAGIC_PROGRAM_ID,
  };
}

/* -------------------------------- helpers ------------------------------- */

export const sol = (n: anchor.BN | number | bigint) => Number(n.toString()) / LAMPORTS_PER_SOL;

export const fmtSol = (n: number, digits = 3) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const shortKey = (k: PublicKey | string) => {
  const s = typeof k === "string" ? k : k.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
};

/* ------------------------------ solo mode -------------------------------- */

/** Program-owned PDA that acts as the counterparty of every solo run. */
export function housePda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("house")], PROGRAM_ID)[0];
}

/**
 * Multiplier (bps of the entry) for a final equity in credits. Mirrors
 * `solo_multiplier_bps` in the program; the on-chain result is authoritative.
 */
export function soloMultiplierBps(equity: number): number {
  if (equity < 1000) return 0;
  if (equity < 1050) return 10_000;
  if (equity < 1100) return 12_500;
  if (equity < 1200) return 15_000;
  if (equity < 1300) return 20_000;
  return 30_000;
}

export const soloPayoutSol = (entrySol: number, equity: number) =>
  (entrySol * soloMultiplierBps(equity)) / 10_000;

export const equityOf = (seat: Seat) => (Number(seat.bankroll) + Number(seat.realized)) / FIXED;
