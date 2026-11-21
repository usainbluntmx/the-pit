/**
 * PIT — solo run end-to-end on devnet.
 *
 * One seat against the market: create -> join -> lock -> delegate -> trade ->
 * end_round -> commit -> settle_solo (house PDA pays/keeps the difference).
 *
 * Usage: npx tsx scripts/e2e-solo.ts
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
import { readPrice } from "../web/lib/pit";

const BASE_RPC = process.env.BASE_RPC ?? "https://rpc.magicblock.app/devnet";
const ROUTER = process.env.ROUTER ?? "https://devnet-router.magicblock.app/";
const SOL_USD_FEED = new PublicKey("ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu");
const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
);

const ROUND_SECS = Number(process.env.ROUND_SECS ?? 60);
const LEV = Number(process.env.LEV ?? 3);
const HOLD = process.env.HOLD === "1";
const TARGET = Number(process.env.TARGET ?? 0);
const ENTRY_FEE = Math.round(0.01 * LAMPORTS_PER_SOL);
const NONCE = process.env.NONCE ?? `solo-${Date.now().toString(36)}`;

const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "target", "idl", "the_pit.json"), "utf8"),
);
const PROGRAM_ID = new PublicKey(idl.address);

function loadKeypair(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}

function readOnlyWallet(pubkey: PublicKey) {
  return {
    publicKey: pubkey,
    signTransaction: async <T,>(tx: T) => tx,
    signAllTransactions: async <T,>(txs: T[]) => txs,
  };
}

function programAt(url: string, pubkey: PublicKey) {
  const connection = new Connection(url, { commitment: "confirmed" });
  const provider = new anchor.AnchorProvider(connection, readOnlyWallet(pubkey) as never, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return { connection, program: new anchor.Program(idl, provider) };
}

type DelegationStatus = { isDelegated: boolean; fqdn?: string };

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

async function waitFor(label: string, fn: () => Promise<boolean>, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function main() {
  const payer = loadKeypair(
    process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json"),
  );
  const base = programAt(BASE_RPC, payer.publicKey);

  async function send(connection: Connection, builder: any, extras: Keypair[] = [], skip = false) {
    const tx: Transaction = await builder.transaction();
    tx.feePayer = payer.publicKey;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.sign(payer, ...extras);
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: skip,
      preflightCommitment: "confirmed",
    });
    const conf = await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    if (conf.value.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(conf.value.err)}`);
    return sig;
  }

  const [arena] = PublicKey.findProgramAddressSync(
    [Buffer.from("arena"), Buffer.from(NONCE)],
    PROGRAM_ID,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), arena.toBuffer()],
    PROGRAM_ID,
  );
  const [house] = PublicKey.findProgramAddressSync([Buffer.from("house")], PROGRAM_ID);

  console.log("payer ", payer.publicKey.toBase58());
  console.log("arena ", arena.toBase58());
  console.log("house ", house.toBase58());
  console.log("entry ", ENTRY_FEE / LAMPORTS_PER_SOL, "SOL · round", ROUND_SECS, "s\n");

  const houseBefore = await base.connection.getBalance(house);

  const sigCreate = await send(
    base.connection,
    base.program.methods
      .createArena(NONCE, new anchor.BN(ENTRY_FEE), new anchor.BN(ROUND_SECS), 1, 0, SOL_USD_FEED)
      .accounts({ creator: payer.publicKey, arena, vault, systemProgram: SystemProgram.programId }),
  );
  console.log("[base] create_arena ", sigCreate);

  const sigJoin = await send(
    base.connection,
    base.program.methods
      .joinArena(NONCE)
      .accounts({ player: payer.publicKey, arena, vault, systemProgram: SystemProgram.programId }),
  );
  console.log("[base] join_arena   ", sigJoin);

  const sigLock = await send(
    base.connection,
    base.program.methods.lockArena(NONCE).accounts({ creator: payer.publicKey, arena }),
  );
  console.log("[base] lock_arena   ", sigLock);

  const sigDel = await send(
    base.connection,
    base.program.methods.delegateArena(NONCE).accounts({ payer: payer.publicKey, arena }),
  );
  console.log("[base] delegate     ", sigDel);

  await waitFor("delegation", async () => {
    const st = await getDelegationStatus(arena);
    return st.isDelegated && !!st.fqdn;
  });
  const st = await getDelegationStatus(arena);
  const erUrl = (st.fqdn!.startsWith("http") ? st.fqdn! : `https://${st.fqdn}`).replace(/\/+$/, "");
  console.log("ER endpoint", erUrl);
  const er = programAt(erUrl, payer.publicKey);

  const sigOpen = await send(
    er.connection,
    er.program.methods
      .openPosition(NONCE, 1, LEV)
      .accounts({ trader: payer.publicKey, arena, feed: SOL_USD_FEED }),
    [],
    true,
  );
  console.log("[ER] open_position  ", sigOpen);

  if (!HOLD && !TARGET) {
    await new Promise((r) => setTimeout(r, 12_000));

    const sigClose = await send(
      er.connection,
      er.program.methods
        .closePosition(NONCE)
        .accounts({ trader: payer.publicKey, arena, feed: SOL_USD_FEED }),
      [],
      true,
    );
    console.log("[ER] close_position ", sigClose);
  } else if (HOLD) {
    console.log("[ER] holding to the bell (no close)");
  }

  // Optional: wait for a profit target, then close. Used to exercise the
  // house-pays branch of settle_solo deterministically.
  if (TARGET > 0) {
    const liveArena: any = await (er.program.account as any).arena.fetch(arena);
    const endAtTarget = Number(liveArena.endAt) - 12;
    const seat: any = liveArena.seats[0];
    const entry = Number(seat.entryPrice);
    const notional = Number(seat.notional);
    console.log(`[ER] waiting for equity >= ${TARGET} (entry ${(entry / 1e9).toFixed(3)})...`);
    while (Math.floor(Date.now() / 1000) < endAtTarget) {
      const p = await readPrice(er.connection, SOL_USD_FEED);
      if (p) {
        const eq = 1000 + (notional * (p * 1e9 - entry)) / entry / 1e9;
        if (eq >= TARGET) {
          console.log(`[ER] target hit: equity ${eq.toFixed(2)} at ${p.toFixed(3)}`);
          const sigClose = await send(
            er.connection,
            er.program.methods
              .closePosition(NONCE)
              .accounts({ trader: payer.publicKey, arena, feed: SOL_USD_FEED }),
            [],
            true,
          );
          console.log("[ER] close_position ", sigClose);
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }

  const live: any = await (er.program.account as any).arena.fetch(arena);
  const endAt = Number(live.endAt);
  const wait = endAt - Math.floor(Date.now() / 1000);
  if (wait > 0) {
    console.log(`waiting ${wait}s for the bell...`);
    await new Promise((r) => setTimeout(r, (wait + 3) * 1000));
  }

  const sigEnd = await send(
    er.connection,
    er.program.methods
      .endRound(NONCE)
      .accounts({ trader: payer.publicKey, arena, feed: SOL_USD_FEED }),
    [],
    true,
  );
  console.log("[ER] end_round      ", sigEnd);

  const settled: any = await (er.program.account as any).arena.fetch(arena);
  const equity = Number(settled.results[0].equity) / 1e9;
  const bps =
    equity < 1000 ? 0 : equity < 1050 ? 10000 : equity < 1100 ? 12500 : equity < 1200 ? 15000 : equity < 1300 ? 20000 : 30000;
  console.log(`[check] equity ${equity.toFixed(4)} · multiplier ${bps / 10000}x · payout ${(0.01 * bps) / 10000} SOL`);

  const sigCommit = await send(
    er.connection,
    er.program.methods.commitRound(NONCE).accounts({ payer: payer.publicKey, arena }),
    [],
    true,
  );
  console.log("[ER] commit_round   ", sigCommit);

  await waitFor("return to base", async () => {
    const info = await base.connection.getAccountInfo(arena);
    return !!info && !info.owner.equals(DELEGATION_PROGRAM_ID);
  });

  const playerBefore = await base.connection.getBalance(payer.publicKey);
  const houseBeforeSettle = await base.connection.getBalance(house);

  const sigSettle = await send(
    base.connection,
    base.program.methods
      .settleSolo(NONCE)
      .accounts({
        arena,
        vault,
        house,
        player: payer.publicKey,
        systemProgram: SystemProgram.programId,
      }),
  );
  console.log("[base] settle_solo  ", sigSettle);

  const playerAfter = await base.connection.getBalance(payer.publicKey);
  const houseAfter = await base.connection.getBalance(house);
  const final: any = await (base.program.account as any).arena.fetch(arena);

  console.log("\nfinal status:", Object.keys(final.status)[0]);
  console.log("player delta:", ((playerAfter - playerBefore) / LAMPORTS_PER_SOL).toFixed(4), "SOL");
  console.log("house  delta:", ((houseAfter - houseBeforeSettle) / LAMPORTS_PER_SOL).toFixed(4), "SOL");
  console.log("house  total:", (houseAfter / LAMPORTS_PER_SOL).toFixed(4), "SOL (was", (houseBefore / LAMPORTS_PER_SOL).toFixed(4) + ")");
  console.log("\nOK — solo lifecycle verified.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
