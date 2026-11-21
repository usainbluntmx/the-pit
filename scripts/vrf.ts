/**
 * VRF end-to-end: request a random seat on the rollup, wait for the oracle callback,
 * and prove a forged callback is rejected.
 *
 *   npx tsx scripts/vrf.ts
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";

const BASE_RPC = "https://rpc.magicblock.app/devnet";
const ROUTER = "https://devnet-router.magicblock.app/";
const TEE = "https://devnet-tee.magicblock.app";
const TEE_VALIDATOR = new PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");
const SOL_USD_FEED = new PublicKey("ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu");
/** Delegated oracle queue (ER). */
const EPHEMERAL_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
const NO_SHOCK = 255;

const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "target", "idl", "the_pit.json"), "utf8"));
const PROGRAM_ID = new PublicKey(idl.address);
const NONCE = process.env.NONCE ?? `vrf-${Date.now().toString(36)}`;

const log = (...a: unknown[]) => console.log(...a);

function loadKeypair(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}
function readOnly(pubkey: PublicKey) {
  return {
    publicKey: pubkey,
    signTransaction: async <T,>(tx: T) => tx,
    signAllTransactions: async <T,>(txs: T[]) => txs,
  };
}
function programAt(url: string, pubkey: PublicKey) {
  const connection = new Connection(url, { commitment: "confirmed" });
  const provider = new anchor.AnchorProvider(connection, readOnly(pubkey) as never, { commitment: "confirmed" });
  return { connection, program: new anchor.Program(idl, provider) };
}
function signDetached(kp: Keypair, message: Uint8Array) {
  const seed = Buffer.from(kp.secretKey.slice(0, 32));
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  return new Uint8Array(crypto.sign(null, Buffer.from(message), crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" })));
}
async function tokenFor(kp: Keypair) {
  const { token } = await getAuthToken(TEE, kp.publicKey, async (m) => signDetached(kp, m));
  return token;
}
async function send(connection: Connection, tx: Transaction, payer: Keypair, extras: Keypair[] = [], skipPreflight = false) {
  tx.feePayer = payer.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(payer, ...extras);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight, preflightCommitment: "confirmed" });
  const conf = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (conf.value.err) throw new Error(`${sig} failed: ${JSON.stringify(conf.value.err)}`);
  return sig;
}
async function fqdnFor(account: PublicKey) {
  const res = await fetch(ROUTER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getDelegationStatus", params: [account.toBase58()] }),
  });
  return ((await res.json()) as any)?.result?.fqdn as string | undefined;
}

async function main() {
  const payer = loadKeypair(process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json"));
  const base = programAt(BASE_RPC, payer.publicKey);
  const [arena] = PublicKey.findProgramAddressSync([Buffer.from("arena"), Buffer.from(NONCE)], PROGRAM_ID);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), arena.toBuffer()], PROGRAM_ID);
  log("arena", arena.toBase58());

  await send(
    base.connection,
    await base.program.methods
      .createArena(NONCE, new anchor.BN(0.01 * LAMPORTS_PER_SOL), new anchor.BN(180), 8, 0, SOL_USD_FEED)
      .accounts({ creator: payer.publicKey, arena, vault, systemProgram: SystemProgram.programId })
      .transaction(),
    payer,
  );

  const players = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  for (const p of players) {
    await send(
      base.connection,
      new Transaction().add(
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: p.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }),
      ),
      payer,
    );
    await send(
      base.connection,
      await base.program.methods
        .joinArena(NONCE)
        .accounts({ player: p.publicKey, arena, vault, systemProgram: SystemProgram.programId })
        .transaction(),
      payer,
      [p],
    );
  }
  await send(base.connection, await base.program.methods.lockArena(NONCE).accounts({ creator: payer.publicKey, arena }).transaction(), payer);
  log("[base] arena locked with", players.length, "players");

  await send(
    base.connection,
    await base.program.methods
      .delegateArena(NONCE)
      .accounts({ payer: payer.publicKey, arena })
      .remainingAccounts([{ pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }])
      .transaction(),
    payer,
  );
  let fqdn = "";
  for (let i = 0; i < 30 && !fqdn; i++) {
    fqdn = (await fqdnFor(arena)) ?? "";
    if (!fqdn) await new Promise((r) => setTimeout(r, 1000));
  }
  log("[router] fqdn:", fqdn);

  const token = await tokenFor(payer);
  const tee = programAt(`${TEE}?token=${token}`, payer.publicKey);
  log("[tee] connected");

  // Every player opens a position so there is something to liquidate.
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const pToken = await tokenFor(p);
    const pProgram = programAt(`${TEE}?token=${pToken}`, p.publicKey).program;
    await send(
      tee.connection,
      await pProgram.methods
        .openPosition(NONCE, i % 2 === 0 ? 1 : -1, 3)
        .accounts({ trader: p.publicKey, arena, feed: SOL_USD_FEED })
        .transaction(),
      payer,
      [p],
      true,
    );
  }
  log("[tee] 3 positions open");

  const before: any = await (tee.program.account as any).arena.fetch(arena);
  log("shock before:", before.shockSeat);

  const sig = await send(
    tee.connection,
    await tee.program.methods
      .requestShock(NONCE)
      .accounts({ payer: payer.publicKey, arena, oracleQueue: EPHEMERAL_QUEUE })
      .transaction(),
    payer,
    [],
    true,
  );
  log("[tee] request_shock ✓", sig);

  let after: any = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    after = await (tee.program.account as any).arena.fetch(arena);
    if (Number(after.shockSeat) !== NO_SHOCK) break;
  }
  if (Number(after.shockSeat) === NO_SHOCK) throw new Error("callback never landed (timeout)");

  log("[vrf] shock seat:", Number(after.shockSeat));
  const seat = after.seats[Number(after.shockSeat)];
  log("[vrf] that seat is now flat:", seat.side === 0, "| realized:", Number(seat.realized) / 1e9);

  // Forged callback: a plain wallet calling the callback directly must be rejected.
  const forged = await tee.program.methods
    .shockCallback(Array(32).fill(7))
    .accounts({ arena, feed: SOL_USD_FEED })
    .transaction();
  try {
    await send(tee.connection, forged, payer, [], true);
    log("[check] FORGED CALLBACK ACCEPTED — critical");
  } catch (e: any) {
    log("[check] forged callback rejected ✓", (e.message ?? "").slice(0, 90));
  }
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  if (e?.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});
