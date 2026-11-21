/**
 * Crea una arena de devnet con un feed concreto, para probar el selector de
 * mercado sin pasar por la UI.
 *
 *   npx tsx scripts/create-arena.ts BTC
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";

const FEEDS: Record<string, string> = {
  SOL: "ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu",
  BTC: "71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr",
  ETH: "5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG",
};

async function main() {
  const market = (process.argv[2] ?? "SOL").toUpperCase();
  const feed = FEEDS[market];
  if (!feed) throw new Error(`mercado desconocido: ${market}`);

  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../web/lib/idl.json"), "utf8"));
  const keyPath = path.join(os.homedir(), ".config/solana/id.json");
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, "utf8"))));

  const connection = new Connection(
    process.env.RPC ?? "https://rpc.magicblock.app/devnet",
    "confirmed",
  );
  const wallet = {
    publicKey: kp.publicKey,
    signTransaction: async (tx: any) => {
      tx.sign(kp);
      return tx;
    },
    signAllTransactions: async (txs: any[]) => {
      txs.forEach((tx) => tx.sign(kp));
      return txs;
    },
  };
  const provider = new anchor.AnchorProvider(connection, wallet as never, {
    commitment: "confirmed",
  });
  const program = new anchor.Program(idl as anchor.Idl, provider);

  const nonce = `${market.toLowerCase()}-${Date.now().toString(36)}`;
  const [arena] = PublicKey.findProgramAddressSync(
    [Buffer.from("arena"), Buffer.from(nonce)],
    program.programId,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), arena.toBuffer()],
    program.programId,
  );

  const tx = await program.methods
    .createArena(nonce, new anchor.BN(10_000_000), new anchor.BN(300), 8, 0, new PublicKey(feed))
    .accounts({ creator: kp.publicKey, arena, vault, systemProgram: SystemProgram.programId })
    .transaction();
  tx.feePayer = kp.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(kp);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(sig, "confirmed");
  console.log(`arena ${arena.toBase58()} · ${market} · nonce ${nonce} · tx ${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
