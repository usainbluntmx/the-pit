/**
 * Serie completa: 3 rondas encadenadas, puntos on-chain y bono last-one-standing.
 *
 *   npx tsx scripts/series.ts
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";

const BASE_RPC = "https://rpc.magicblock.app/devnet";
const TEE = "https://devnet-tee.magicblock.app";
const TEE_VALIDATOR = new PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");
const SOL_USD_FEED = new PublicKey("ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu");
const ROUND_SECS = Number(process.env.ROUND_SECS ?? 60);

const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "target", "idl", "the_pit.json"), "utf8"));
const PROGRAM_ID = new PublicKey(idl.address);
const SERIES_NONCE = process.env.SERIES ?? `season-${Date.now().toString(36)}`;

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
async function send(connection: Connection, tx: Transaction, feePayer: Keypair, extra: Keypair[] = [], skipPreflight = false) {
  tx.feePayer = feePayer.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(feePayer, ...extra);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight, preflightCommitment: "confirmed" });
  const conf = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (conf.value.err) throw new Error(`${sig} failed: ${JSON.stringify(conf.value.err)}`);
  return sig;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const payer = loadKeypair(process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json"));
  const base = programAt(BASE_RPC, payer.publicKey);
  const [series] = PublicKey.findProgramAddressSync([Buffer.from("series"), Buffer.from(SERIES_NONCE)], PROGRAM_ID);

  log("series", series.toBase58(), "| nonce", SERIES_NONCE);
  await send(
    base.connection,
    await base.program.methods
      .createSeries(SERIES_NONCE, 3)
      .accounts({ creator: payer.publicKey, series, systemProgram: SystemProgram.programId })
      .transaction(),
    payer,
  );
  log("[1/3] series created");

  const players = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  for (const p of players) {
    await send(
      base.connection,
      new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: p.publicKey, lamports: 0.08 * LAMPORTS_PER_SOL })),
      payer,
    );
  }

  for (let round = 1; round <= 3; round++) {
    const nonce = `${SERIES_NONCE}-r${round}`;
    const [arena] = PublicKey.findProgramAddressSync([Buffer.from("arena"), Buffer.from(nonce)], PROGRAM_ID);
    const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), arena.toBuffer()], PROGRAM_ID);

    await send(
      base.connection,
      await base.program.methods
        .createArena(nonce, new anchor.BN(0.01 * LAMPORTS_PER_SOL), new anchor.BN(ROUND_SECS), 8, 0, SOL_USD_FEED)
        .accounts({ creator: payer.publicKey, arena, vault, systemProgram: SystemProgram.programId })
        .transaction(),
      payer,
    );
    await send(
      base.connection,
      await base.program.methods
        .bindSeries(nonce, series)
        .accounts({ creator: payer.publicKey, arena, series })
        .transaction(),
      payer,
    );

    for (const p of players) {
      await send(
        base.connection,
        await base.program.methods
          .joinArena(nonce)
          .accounts({ player: p.publicKey, arena, vault, systemProgram: SystemProgram.programId })
          .transaction(),
        payer,
        [p],
      );
    }
    await send(base.connection, await base.program.methods.lockArena(nonce).accounts({ creator: payer.publicKey, arena }).transaction(), payer);
    await send(
      base.connection,
      await base.program.methods
        .delegateArena(nonce)
        .accounts({ payer: payer.publicKey, arena })
        .remainingAccounts([{ pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }])
        .transaction(),
      payer,
    );

    // Ronda 1: solo UNO entra al mercado -> se lleva el bono last-one-standing.
    // Rondas 2 y 3: dos entran -> sin bono, y el que queda fuera sobrevive gratis.
    const inMarket = round === 1 ? 1 : 2;
    const token = await tokenFor(payer);
    const tee = programAt(`${TEE}?token=${token}`, payer.publicKey);
    for (let i = 0; i < inMarket; i++) {
      const p = players[i];
      const pProgram = programAt(`${TEE}?token=${await tokenFor(p)}`, p.publicKey).program;
      await send(
        tee.connection,
        await pProgram.methods
          .openPosition(nonce, i % 2 === 0 ? 1 : -1, 3)
          .accounts({ trader: p.publicKey, arena, feed: SOL_USD_FEED })
          .transaction(),
        payer,
        [p],
        true,
      );
    }
    log(`[round ${round}] ${inMarket} position(s) open · waiting ${ROUND_SECS}s`);

    await sleep((ROUND_SECS + 3) * 1000);

    await send(
      tee.connection,
      await tee.program.methods.endRound(nonce).accounts({ payer: payer.publicKey, arena, feed: SOL_USD_FEED }).transaction(),
      payer,
      [],
      true,
    );
    await send(
      tee.connection,
      await tee.program.methods
        .commitRound(nonce)
        .accounts({ payer: payer.publicKey, arena })
        .transaction(),
      payer,
      [],
      true,
    );
    await sleep(4000);

    const after: any = await (base.program.account as any).arena.fetch(arena);
    const winners = Number(after.winnerCount);
    const recipients = [];
    for (let i = 0; i < winners; i++) recipients.push(after.results[i].player);
    if (!after.lstWinner.equals(PublicKey.default)) recipients.push(after.lstWinner);

    await send(
      base.connection,
      await base.program.methods
        .settle(nonce)
        .accounts({ payer: payer.publicKey, arena, creator: payer.publicKey, vault })
        .remainingAccounts(recipients.map((p: PublicKey) => ({ pubkey: p, isSigner: false, isWritable: true })))
        .transaction(),
      payer,
    );

    await send(
      base.connection,
      await base.program.methods
        .recordRound(nonce, series)
        .accounts({ arena, series })
        .transaction(),
      payer,
    );

    const s: any = await (base.program.account as any).series.fetch(series);
    const lst = after.lstWinner.equals(PublicKey.default) ? "—" : `${after.lstWinner.toBase58().slice(0, 6)} (+${(Number(after.lstBonus) / 1e9).toFixed(4)} SOL)`;
    log(`[round ${round}] settled · podium ${winners} · lst ${lst} · series rounds ${s.rounds}/${s.maxRounds}`);
    log(`          standings: ${s.standings
      .filter((r: any) => !r.player.equals(PublicKey.default))
      .map((r: any) => `${r.player.toBase58().slice(0, 6)}:${r.points}pts/${r.podiums}pod/${r.survived}sv`)
      .join("  ")}`);
  }

  const s: any = await (base.program.account as any).series.fetch(series);
  log("\n=== SERIES FINAL ===");
  log("series", series.toBase58(), "rounds", s.rounds);
  for (const r of s.standings) {
    if (r.player.equals(PublicKey.default)) continue;
    log(` ${r.player.toBase58()}  ${r.points} pts  podiums ${r.podiums}  rounds ${r.rounds}  bites ${r.bites}  survived ${r.survived}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  if (e?.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});
