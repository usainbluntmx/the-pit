import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";

const BASE = "https://rpc.magicblock.app/devnet";
const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "target", "idl", "the_pit.json"), "utf8"));
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8"))),
);
const wallet = {
  publicKey: payer.publicKey,
  signTransaction: async (tx: any) => { tx.sign(payer); return tx; },
  signAllTransactions: async (txs: any[]) => { txs.forEach((t) => t.sign(payer)); return txs; },
  payer,
};
const connection = new Connection(BASE, "confirmed");
const provider = new anchor.AnchorProvider(connection, wallet as never, { commitment: "confirmed" });
const program = new anchor.Program(idl, provider);

(async () => {
  const nonce = `dbg-${Date.now().toString(36)}`;
  const [arena] = PublicKey.findProgramAddressSync([Buffer.from("arena"), Buffer.from(nonce)], program.programId);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), arena.toBuffer()], program.programId);
  const feed = new PublicKey("ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu");

  console.log("nonce", nonce, "arena", arena.toBase58());

  const sig = await program.methods
    .createArena(nonce, new anchor.BN(0.01 * LAMPORTS_PER_SOL), new anchor.BN(60), 8, 0, feed)
    .accounts({ creator: payer.publicKey, arena, vault, systemProgram: SystemProgram.programId })
    .rpc();
  console.log("create ok", sig);

  const p = Keypair.generate();
  const fund = new anchor.web3.Transaction().add(
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: p.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }),
  );
  const fundSig = await connection.sendTransaction(fund, [payer]);
  await connection.confirmTransaction(fundSig, "confirmed");
  console.log("funded", p.publicKey.toBase58(), fundSig);

  const inner = program.methods.joinArena(nonce).accounts({
    player: p.publicKey,
    arena,
    vault,
    systemProgram: SystemProgram.programId,
  });
  const tx = await inner.transaction();
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(payer, p);
  console.log("--- firmas ---", tx.signatures.map((s) => `${s.publicKey.toBase58().slice(0, 8)}:${s.signature ? "ok" : "EMPTY"}`));
  const raw = tx.serialize();
  const joinSig = await connection.sendRawTransaction(raw, { skipPreflight: false });
  await connection.confirmTransaction(joinSig, "confirmed");
  console.log("join ok (manual)", joinSig);
})().catch((e) => {
  console.error("ERR", e.message);
  if (e.logs) console.error(e.logs.join("\n"));
});
