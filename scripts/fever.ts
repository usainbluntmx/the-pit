/**
 * Fiebre: jugadores que aguantan hasta desquiciarse.
 * Crea una arena de 2 asientos, mete a los dos al mercado y crankea mordidas hasta que
 * alguien llegue a presión 100. Luego comprueba que su orden sale invertida.
 *
 *   npx tsx scripts/fever.ts
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
const EPHEMERAL_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
const ROUND_SECS = Number(process.env.ROUND_SECS ?? 180);

const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "target", "idl", "the_pit.json"), "utf8"));
const PROGRAM_ID = new PublicKey(idl.address);
const NONCE = `fever-${Date.now().toString(36)}`;

const log = (...a: unknown[]) => console.log(...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function main() {
  const payer = loadKeypair(process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json"));
  const base = programAt(BASE_RPC, payer.publicKey);
  const [arena] = PublicKey.findProgramAddressSync([Buffer.from("arena"), Buffer.from(NONCE)], PROGRAM_ID);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), arena.toBuffer()], PROGRAM_ID);
  log("arena", arena.toBase58(), "| round", ROUND_SECS, "s");

  await send(
    base.connection,
    await base.program.methods
      .createArena(NONCE, new anchor.BN(0.01 * LAMPORTS_PER_SOL), new anchor.BN(ROUND_SECS), 8, 0, SOL_USD_FEED)
      .accounts({ creator: payer.publicKey, arena, vault, systemProgram: SystemProgram.programId })
      .transaction(),
    payer,
  );

  const bot = Keypair.generate();
  await send(
    base.connection,
    new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: bot.publicKey, lamports: 0.08 * LAMPORTS_PER_SOL })),
    payer,
  );
  for (const p of [payer, bot]) {
    await send(
      base.connection,
      await base.program.methods
        .joinArena(NONCE)
        .accounts({ player: p.publicKey, arena, vault, systemProgram: SystemProgram.programId })
        .transaction(),
      payer,
      p === payer ? [] : [p],
    );
  }
  await send(base.connection, await base.program.methods.lockArena(NONCE).accounts({ creator: payer.publicKey, arena }).transaction(), payer);
  await send(
    base.connection,
    await base.program.methods
      .delegateArena(NONCE)
      .accounts({ payer: payer.publicKey, arena })
      .remainingAccounts([{ pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }])
      .transaction(),
    payer,
  );

  const tee = programAt(`${TEE}?token=${await tokenFor(payer)}`, payer.publicKey);
  const botProgram = programAt(`${TEE}?token=${await tokenFor(bot)}`, bot.publicKey).program;

  // Los dos al mercado: cada mordida tiene que caer en uno de los dos.
  await send(
    tee.connection,
    await tee.program.methods.openPosition(NONCE, 1, 3).accounts({ trader: payer.publicKey, arena, feed: SOL_USD_FEED }).transaction(),
    payer,
    [],
    true,
  );
  await send(
    tee.connection,
    await botProgram.methods.openPosition(NONCE, -1, 3).accounts({ trader: bot.publicKey, arena, feed: SOL_USD_FEED }).transaction(),
    payer,
    [bot],
    true,
  );
  log("both seats in the market");

  const openIfFlat = async () => {
    const cur: any = await (tee.program.account as any).arena.fetch(arena);
    const seat0 = cur.seats[0];
    const seat1 = cur.seats[1];
    if (seat0.side === 0) {
      await send(
        tee.connection,
        await tee.program.methods.openPosition(NONCE, 1, 3).accounts({ trader: payer.publicKey, arena, feed: SOL_USD_FEED }).transaction(),
        payer, [], true,
      );
    }
    if (seat1.side === 0) {
      await send(
        tee.connection,
        await botProgram.methods.openPosition(NONCE, -1, 3).accounts({ trader: bot.publicKey, arena, feed: SOL_USD_FEED }).transaction(),
        payer, [bot], true,
      );
    }
  };

  for (let i = 0; i < 10; i++) {
    const before: any = await (tee.program.account as any).arena.fetch(arena);
    const nowTs = Math.floor(Date.now() / 1000);
    if (before.seats.slice(0, 2).some((s: any) => Number(s.madUntil) > nowTs)) break;

    await openIfFlat();

    const cooldown = Math.max(15, Math.floor(Number(before.duration) / 8));
    const readyAt = Number(before.lastShockTs) + cooldown;
    const wait = readyAt - Math.floor(Date.now() / 1000);
    if (wait > 0) {
      log(`   waiting ${wait}s for the pit to breathe`);
      await sleep(wait * 1000);
    }

    try {
      await send(
        tee.connection,
        await tee.program.methods
          .requestShock(NONCE)
          .accounts({ payer: payer.publicKey, arena, oracleQueue: EPHEMERAL_QUEUE })
          .transaction(),
        payer, [], true,
      );
      log(`[crank ${i + 1}] requested`);
    } catch (e: any) {
      log(`[crank ${i + 1}] skipped:`, (e.message ?? "").split("\n")[0].slice(-60));
    }

    for (let w = 0; w < 15; w++) {
      await sleep(2000);
      const a: any = await (tee.program.account as any).arena.fetch(arena);
      if (Number(a.shockCount) > Number(before.shockCount)) break;
    }
    const a: any = await (tee.program.account as any).arena.fetch(arena);
    log(
      `   shock #${Number(a.shockCount)} · pressures`,
      a.seats.slice(0, 2).map((s: any) => `${s.player.toBase58().slice(0, 4)}:${s.pressure}`).join(" "),
    );
  }

  const a: any = await (tee.program.account as any).arena.fetch(arena);
  const nowTs = Math.floor(Date.now() / 1000);
  const madSeat = a.seats.slice(0, 2).findIndex((s: any) => Number(s.madUntil) > nowTs);
  log("\nshocks", Number(a.shockCount), "| mad seat", madSeat);
  a.seats.slice(0, 2).forEach((s: any, i: number) => {
    log(` ${i} ${s.player.toBase58().slice(0, 6)} side=${s.side} press=${s.pressure} bites=${s.bites} streak=${s.streak} mad=${Number(s.madUntil) > nowTs}`);
  });

  if (madSeat >= 0) {
    const victim = madSeat === 0 ? payer : bot;
    const victimProgram = madSeat === 0 ? tee.program : botProgram;
    const seat = a.seats[madSeat];
    log(`\n[test] seat ${madSeat} is mad. Asking for a LONG with 2x...`);
    // Si quedó plano (lo normal: la mordida lo sacó), solo hay que pedir una entrada.
    if (seat.side !== 0) {
      await send(
        tee.connection,
        await victimProgram.methods
          .closePosition(NONCE)
          .accounts({ trader: victim.publicKey, arena, feed: SOL_USD_FEED })
          .transaction(),
        payer,
        victim === payer ? [] : [victim],
        true,
      );
    }
    const wanted = 1;
    await send(
      tee.connection,
      await victimProgram.methods
        .openPosition(NONCE, wanted, 2)
        .accounts({ trader: victim.publicKey, arena, feed: SOL_USD_FEED })
        .transaction(),
      payer,
      victim === payer ? [] : [victim],
      true,
    );
    const after: any = await (tee.program.account as any).arena.fetch(arena);
    const executed = after.seats[madSeat].side;
    log(`[test] wanted ${wanted}, executed ${executed} → ${executed === -wanted ? "INVERTED ✓" : "not inverted"}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  if (e?.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});
