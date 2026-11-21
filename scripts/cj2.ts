import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs"; import os from "os"; import path from "path";
const idl = JSON.parse(fs.readFileSync(path.join(process.cwd(), "target/idl/the_pit.json"), "utf8"));
const P = new PublicKey(idl.address);
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8"))));
const conn = new Connection("https://api.devnet.solana.com", { commitment: "confirmed" });
const program = new anchor.Program(idl, new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" }));
const FEED = new PublicKey("ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu");
(async () => {
  const n = "zz" + Date.now().toString(36).slice(-6);
  const [arena] = PublicKey.findProgramAddressSync([Buffer.from("arena"), Buffer.from(n)], P);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), arena.toBuffer()], P);
  await program.methods.createArena(n, new anchor.BN(0.01 * LAMPORTS_PER_SOL), new anchor.BN(300), 8, 0, FEED)
    .accounts({ creator: payer.publicKey, arena, vault, systemProgram: SystemProgram.programId }).rpc();
  console.log("created", arena.toBase58(), "nonce", n);
  try {
    await program.methods.joinArena(n).accounts({ player: payer.publicKey, arena, vault, systemProgram: SystemProgram.programId }).rpc();
    console.log("JOIN OK");
  } catch (e: any) {
    console.log("JOIN FAILED", (e.logs ?? []).slice(-3).join(" | ").slice(-160));
  }
})();
