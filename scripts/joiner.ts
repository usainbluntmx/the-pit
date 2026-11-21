/**
 * Une un bot a una arena abierta. Deriva el nonce de la cuenta, no del entorno.
 *   ARENA=<pubkey> npx tsx scripts/joiner.ts
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";

const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "target", "idl", "the_pit.json"), "utf8"));
const PROGRAM_ID = new PublicKey(idl.address);
const KEYFILE = path.join(__dirname, "..", ".bot.json");

async function main() {
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config", "solana", "id.json"), "utf8"))),
  );
  const conn = new Connection("https://rpc.magicblock.app/devnet", { commitment: "confirmed" });
  const program = new anchor.Program(idl, new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" }));
  const arena = new PublicKey(process.env.ARENA!);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), arena.toBuffer()], PROGRAM_ID);

  const bot = fs.existsSync(KEYFILE)
    ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEYFILE, "utf8"))))
    : Keypair.generate();
  fs.writeFileSync(KEYFILE, JSON.stringify(Array.from(bot.secretKey)), { mode: 0o600 });

  const a: any = await program.account.arena.fetch(arena);
  const nonce = Buffer.from(a.nonce.slice(0, a.nonceLen)).toString("utf8");
  console.log("arena", arena.toBase58(), "nonce", nonce, "status", JSON.stringify(a.status));

  const bal = await conn.getBalance(bot.publicKey);
  if (bal < 0.03 * LAMPORTS_PER_SOL) {
    await anchor.web3.sendAndConfirmTransaction(
      conn,
      new Transaction().add(
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: bot.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }),
      ),
      [payer],
    );
  }

  await program.methods
    .joinArena(nonce)
    .accounts({ player: bot.publicKey, arena, vault, systemProgram: SystemProgram.programId })
    .signers([bot])
    .rpc();

  const after: any = await program.account.arena.fetch(arena);
  console.log("joined", bot.publicKey.toBase58(), "| players", after.playerCount);
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  if (e?.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});
