/**
 * PIT — end-to-end runbook on devnet.
 *
 * Exercises the whole lifecycle and asserts every layer transition:
 *   base create/join/lock -> delegate -> ER trade -> end_round -> commit+undelegate -> base settle
 *
 * Usage: npx tsx scripts/e2e.ts
 *
 * Signing is explicit: Anchor 1.x's provider does not apply `.signers([...])` with a custom
 * wallet (the extra signer never reaches the transaction), so every tx is built, signed with
 * `tx.sign(payer, ...extras)`, serialized and sent here.
 */
import * as anchor from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";

/* ------------------------------- config -------------------------------- */

const BASE_RPC = process.env.BASE_RPC ?? "https://rpc.magicblock.app/devnet";
const ROUTER = process.env.ROUTER ?? "https://devnet-router.magicblock.app/";
// Optional pin. If unset the account lands on whatever validator the router picks.
const ER_VALIDATOR = process.env.ER_VALIDATOR
  ? new PublicKey(process.env.ER_VALIDATOR)
  : undefined;

// SOLUSD on devnet: PDA(["price_feed","pyth-lazer","6"]) under the oracle program.
const SOL_USD_FEED = new PublicKey("ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu");
const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
);

const ROUND_SECS = Number(process.env.ROUND_SECS ?? 60);
const ENTRY_FEE = Math.round(0.01 * LAMPORTS_PER_SOL);
const NONCE = process.env.NONCE ?? `pit-${Date.now().toString(36)}`;

const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "target", "idl", "the_pit.json"), "utf8"),
);
const PROGRAM_ID = new PublicKey(idl.address);

/* ------------------------------- helpers -------------------------------- */

function loadKeypair(file: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))),
  );
}

/** Read-only wallet: we never let Anchor sign, only build instructions. */
function readOnlyWallet(pubkey: PublicKey) {
  return {
    publicKey: pubkey,
    signTransaction: async <T,>(tx: T) => tx,
    signAllTransactions: async <T,>(txs: T[]) => txs,
  };
}

function programAt(url: string, pubkey: PublicKey) {
  const connection = new Connection(url, { commitment: "confirmed" });
  const provider = new anchor.AnchorProvider(
    connection,
    readOnlyWallet(pubkey) as never,
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  return { connection, program: new anchor.Program(idl, provider) };
}

type DelegationStatus = {
  isDelegated: boolean;
  fqdn?: string;
  delegationRecord?: { authority: string; owner: string; delegationSlot: number };
};

async function getDelegationStatus(account: PublicKey): Promise<DelegationStatus> {
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
  if (body.error) throw new Error(`router: ${body.error.message}`);
  return body.result!;
}

async function waitFor(
  label: string,
  fn: () => Promise<boolean>,
  timeoutMs = 45_000,
  intervalMs = 1_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`timeout waiting for ${label}`);
}

const log = (...args: unknown[]) => console.log(...args);

/* --------------------------------- main --------------------------------- */

async function main() {
  const payerFile =
    process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json");
  const payer = loadKeypair(payerFile);
  const base = programAt(BASE_RPC, payer.publicKey);

  /** Build -> sign(payer, ...extras) -> send -> confirm. Works on base and on the ER. */
  async function send(
    connection: Connection,
    builder: any,
    extras: Keypair[] = [],
    opts: { skipPreflight?: boolean } = {},
  ): Promise<string> {
    const tx: Transaction = await builder.transaction();
    tx.feePayer = payer.publicKey;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.sign(payer, ...extras);
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: opts.skipPreflight ?? false,
      preflightCommitment: "confirmed",
    });
    const conf = await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    if (conf.value.err) {
      throw new Error(`tx ${sig} failed on chain: ${JSON.stringify(conf.value.err)}`);
    }
    return sig;
  }

  log("payer     ", payer.publicKey.toBase58());
  log("program   ", PROGRAM_ID.toBase58());
  log("nonce     ", NONCE);
  const balance = await base.connection.getBalance(payer.publicKey);
  log("balance   ", balance / LAMPORTS_PER_SOL, "SOL");
  if (balance < 0.15 * LAMPORTS_PER_SOL) {
    throw new Error("payer needs at least 0.15 devnet SOL");
  }

  const [arena] = PublicKey.findProgramAddressSync(
    [Buffer.from("arena"), Buffer.from(NONCE)],
    PROGRAM_ID,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), arena.toBuffer()],
    PROGRAM_ID,
  );
  log("arena     ", arena.toBase58());
  log("vault     ", vault.toBase58());

  /* 1. create_arena (base) */
  const sigCreate = await send(
    base.connection,
    base.program.methods
      .createArena(NONCE, new anchor.BN(ENTRY_FEE), new anchor.BN(ROUND_SECS), 8, 0, SOL_USD_FEED)
      .accounts({ creator: payer.publicKey, arena, vault, systemProgram: SystemProgram.programId }),
  );
  log("\n[base] create_arena   ", sigCreate);

  /* 2. three players join (base) */
  const players = [0, 1, 2].map(() => Keypair.generate());
  // Devnet faucet is closed, so fund the test players from the payer.
  for (const p of players) {
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: p.publicKey,
        lamports: Math.round(0.05 * LAMPORTS_PER_SOL),
      }),
    );
    fundTx.feePayer = payer.publicKey;
    fundTx.recentBlockhash = (await base.connection.getLatestBlockhash("confirmed")).blockhash;
    fundTx.sign(payer);
    const fundSig = await base.connection.sendRawTransaction(fundTx.serialize());
    await base.connection.confirmTransaction(fundSig, "confirmed");
  }
  for (const p of players) {
    const sig = await send(
      base.connection,
      base.program.methods
        .joinArena(NONCE)
        .accounts({ player: p.publicKey, arena, vault, systemProgram: SystemProgram.programId }),
      [p],
    );
    log("[base] join_arena     ", p.publicKey.toBase58().slice(0, 8), sig);
  }

  /* 3. lock (base) */
  const sigLock = await send(
    base.connection,
    base.program.methods.lockArena(NONCE).accounts({ creator: payer.publicKey, arena }),
  );
  log("[base] lock_arena     ", sigLock);

  /* 4. delegate (base) */
  const delBuilder = base.program.methods.delegateArena(NONCE).accounts({
    payer: payer.publicKey,
    arena,
  });
  if (ER_VALIDATOR) {
    delBuilder.remainingAccounts([
      { pubkey: ER_VALIDATOR, isSigner: false, isWritable: false },
    ]);
  }
  const sigDel = await send(base.connection, delBuilder);
  log("[base] delegate_arena ", sigDel);

  await waitFor("router to report delegation", async () => {
    const st = await getDelegationStatus(arena);
    return st.isDelegated === true && !!st.fqdn;
  });
  const status = await getDelegationStatus(arena);
  const baseInfo = await base.connection.getAccountInfo(arena);
  log("[check] base owner is Delegation Program:", baseInfo!.owner.equals(DELEGATION_PROGRAM_ID));
  log("[check] router fqdn:", status.fqdn);

  /* 5. trade on the ER */
  // The router returns the fqdn already carrying a scheme, e.g. "https://devnet-as.magicblock.app/".
  const rawFqdn = status.fqdn!;
  const erUrl = (rawFqdn.startsWith("http") ? rawFqdn : `https://${rawFqdn}`).replace(/\/+$/, "");
  log("\nER endpoint", erUrl);
  const er = programAt(erUrl, payer.publicKey);

  const erInfo = await er.connection.getAccountInfo(arena);
  log("[check] ER owner is our program:", erInfo!.owner.equals(PROGRAM_ID));

  const sides = [1, -1, 1];
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const sig = await send(
      er.connection,
      er.program.methods
        .openPosition(NONCE, sides[i], 3)
        .accounts({ trader: p.publicKey, arena, feed: SOL_USD_FEED }),
      [p],
      { skipPreflight: true },
    );
    log("[ER] open_position   ", p.publicKey.toBase58().slice(0, 8), "side", sides[i], sig);
  }

  // let the price move a little, then close the first two
  await new Promise((r) => setTimeout(r, 12_000));
  for (let i = 0; i < 2; i++) {
    const p = players[i];
    const sig = await send(
      er.connection,
      er.program.methods
        .closePosition(NONCE)
        .accounts({ trader: p.publicKey, arena, feed: SOL_USD_FEED }),
      [p],
      { skipPreflight: true },
    );
    log("[ER] close_position  ", p.publicKey.toBase58().slice(0, 8), sig);
  }

  /* 6. wait for the round to end, then rank + commit */
  const arenaState = await (er.program.account as any).arena.fetch(arena);
  const endAt = Number((arenaState as any).endAt);
  const now = Math.floor(Date.now() / 1000);
  if (now < endAt) {
    log(`\nwaiting ${endAt - now}s for the round to close...`);
    await new Promise((r) => setTimeout(r, (endAt - now + 3) * 1000));
  }

  const sigEnd = await send(
    er.connection,
    er.program.methods
      .endRound(NONCE)
      .accounts({ trader: payer.publicKey, arena, feed: SOL_USD_FEED }),
    [],
    { skipPreflight: true },
  );
  log("[ER] end_round        ", sigEnd);

  const settled = await (er.program.account as any).arena.fetch(arena);
  log(
    "[check] podium:",
    (settled as any).results
      .slice(0, (settled as any).winnerCount)
      .map((r: any) => `${r.player.toBase58().slice(0, 8)}=${Number(r.equity) / 1e9}`)
      .join(" "),
  );

  const sigCommit = await send(
    er.connection,
    er.program.methods.commitRound(NONCE).accounts({ payer: payer.publicKey, arena }),
    [],
    { skipPreflight: true },
  );
  log("[ER] commit_round     ", sigCommit);

  await waitFor("account to return to the base layer", async () => {
    const info = await base.connection.getAccountInfo(arena);
    return !!info && !info.owner.equals(DELEGATION_PROGRAM_ID);
  });
  log("[check] ownership back on base:", (await base.connection.getAccountInfo(arena))!.owner.toBase58());

  /* 7. settle on base */
  const before = await Promise.all(players.map((p) => base.connection.getBalance(p.publicKey)));
  const preSettle: any = await (base.program.account as any).arena.fetch(arena);
  const podium = (preSettle.results as any[])
    .slice(0, Number(preSettle.winnerCount))
    .map((r) => ({ pubkey: r.player as PublicKey, isSigner: false, isWritable: true }));
  const settleBuilder = base.program.methods
    .settle(NONCE)
    .accounts({
      arena,
      vault,
      creator: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(podium);
  const sigSettle = await send(base.connection, settleBuilder);
  log("[base] settle         ", sigSettle);

  const after = await Promise.all(players.map((p) => base.connection.getBalance(p.publicKey)));
  players.forEach((p, i) => {
    log(
      "  payout",
      p.publicKey.toBase58().slice(0, 8),
      ((after[i] - before[i]) / LAMPORTS_PER_SOL).toFixed(4),
      "SOL",
    );
  });

  const finalState = await (base.program.account as any).arena.fetch(arena);
  log("\nfinal status:", Object.keys((finalState as any).status)[0]);
  log("pot:", Number((finalState as any).pot) / LAMPORTS_PER_SOL, "SOL");
  log("winner_count:", (finalState as any).winnerCount);
  log("\nOK — full lifecycle verified.");
}

main().catch((err) => {
  console.error("\nFAILED:", err?.message ?? err);
  if (err?.logs) console.error(err.logs.join("\n"));
  process.exit(1);
});
