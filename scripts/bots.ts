/**
 * Bots for the PIT demo.
 *
 *   ARENA=<pubkey> BOTS=3 npx tsx scripts/bots.ts join     # fill seats
 *   ARENA=<pubkey> npx tsx scripts/bots.ts trade           # every bot opens a random side
 *   ARENA=<pubkey> BOTS=3 SEED=<n> npx tsx scripts/bots.ts fund
 *
 * Bots are deterministic: the same SEED produces the same keypairs, so a join run and a
 * later trade run operate on the same seats. Store the seed you used for the demo.
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
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";

const BASE_RPC = process.env.BASE_RPC ?? "https://rpc.magicblock.app/devnet";
const ROUTER = process.env.ROUTER ?? "https://devnet-router.magicblock.app/";
const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "target", "idl", "the_pit.json"), "utf8"),
);
const PROGRAM_ID = new PublicKey(idl.address);

const ARENA = process.env.ARENA;
const BOTS = Number(process.env.BOTS ?? 3);
const SEED = Number(process.env.SEED ?? 7);
const MODE = process.argv[2] ?? "join";

if (!ARENA) throw new Error("ARENA env var is required");

/** Deterministic bot keypairs from a seed, so runs can be split. */
function botKeys(seed: number, n: number): Keypair[] {
  const out: Keypair[] = [];
  for (let i = 0; i < n; i++) {
    const bytes = new Uint8Array(32);
    let x = seed * 1_000_003 + i * 7_919 + 1;
    for (let b = 0; b < 32; b++) {
      x = (x * 1_103_515_245 + 12_345) % 2_147_483_647;
      bytes[b] = x % 256;
    }
    out.push(Keypair.fromSeed(bytes));
  }
  return out;
}

function loadPayer() {
  const file = process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}

function readOnly(pubkey: PublicKey) {
  return {
    publicKey: pubkey,
    signTransaction: async <T,>(tx: T) => tx,
    signAllTransactions: async <T,>(txs: T[]) => txs,
  };
}

function programAt(connection: Connection, pubkey: PublicKey) {
  const provider = new anchor.AnchorProvider(connection, readOnly(pubkey) as never, {
    commitment: "confirmed",
  });
  return new anchor.Program(idl, provider);
}

async function send(
  connection: Connection,
  tx: Transaction,
  payer: Keypair,
  extras: Keypair[] = [],
  skipPreflight = false,
) {
  tx.feePayer = payer.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(payer, ...extras);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight,
    preflightCommitment: "confirmed",
  });
  const conf = await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (conf.value.err) throw new Error(`${sig} failed: ${JSON.stringify(conf.value.err)}`);
  return sig;
}

async function main() {
  const payer = loadPayer();
  const base = new Connection(BASE_RPC, { commitment: "confirmed" });
  const arenaKey = new PublicKey(ARENA!);
  const program = programAt(base, payer.publicKey);
  const arena: any = await (program.account as any).arena.fetch(arenaKey);
  const nonce = Buffer.from(arena.nonce.slice(0, arena.nonceLen)).toString("utf8");
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), arenaKey.toBuffer()],
    PROGRAM_ID,
  );

  console.log("arena", arenaKey.toBase58(), "| nonce", nonce, "| mode", MODE);

  const bots = botKeys(SEED, BOTS);

  if (MODE === "fund") {
    for (const bot of bots) {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: bot.publicKey,
          lamports: Math.round(0.05 * LAMPORTS_PER_SOL),
        }),
      );
      const sig = await send(base, tx, payer);
      console.log("fund", bot.publicKey.toBase58(), sig);
    }
    return;
  }

  if (MODE === "join") {
    for (const bot of bots) {
      const bal = await base.getBalance(bot.publicKey);
      if (bal < Number(arena.entryFee) + 500_000) {
        const fundTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: bot.publicKey,
            lamports: Math.round(0.05 * LAMPORTS_PER_SOL),
          }),
        );
        await send(base, fundTx, payer);
      }
      const tx = await program.methods
        .joinArena(nonce)
        .accounts({
          player: bot.publicKey,
          arena: arenaKey,
          vault,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      const sig = await send(base, tx, payer, [bot]);
      console.log("join", bot.publicKey.toBase58(), sig);
    }
    return;
  }

  if (MODE === "trade") {
    // Trading only works once the arena lives in the rollup.
    const status = await (
      await fetch(ROUTER, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getDelegationStatus",
          params: [arenaKey.toBase58()],
        }),
      })
    ).json();
    const fqdn = (status as any)?.result?.fqdn;
    if (!fqdn) throw new Error("arena is not delegated yet");
    const url = (fqdn.startsWith("http") ? fqdn : `https://${fqdn}`).replace(/\/+$/, "");
    console.log("ER", url);
    const isTee = /tee/i.test(url);
    const er = new Connection(url, { commitment: "confirmed" });

    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i];
      const side = i % 2 === 0 ? 1 : -1;
      const leverage = 2 + (i % 4);
      let conn = er;
      let feePayer = payer;
      if (isTee) {
        const sig = (m: Uint8Array) =>
          crypto.sign(null, Buffer.from(m), crypto.createPrivateKey({
            key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(bot.secretKey.slice(0, 32))]),
            format: "der", type: "pkcs8",
          }));
        const { token } = await getAuthToken(url, bot.publicKey, async (m) => new Uint8Array(sig(m)));
        conn = new Connection(`${url}?token=${token}`, { commitment: "confirmed" });
        feePayer = bot;
      }
      const program = new anchor.Program(
        idl,
        new anchor.AnchorProvider(
          conn,
          {
            publicKey: bot.publicKey,
            signTransaction: async (t: any) => t,
            signAllTransactions: async (t: any) => t,
          } as never,
          { commitment: "confirmed" },
        ),
      );
      const tx = await program.methods
        .openPosition(nonce, side, leverage)
        .accounts({ trader: bot.publicKey, arena: arenaKey, feed: arena.feed })
        .transaction();
      const sig = await send(conn, tx, feePayer, feePayer === payer ? [bot] : [], true);
      console.log("trade", bot.publicKey.toBase58().slice(0, 8), side > 0 ? "LONG" : "SHORT", leverage + "x", sig);
    }
    return;
  }

  throw new Error(`unknown mode ${MODE}`);
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  if (e?.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});
