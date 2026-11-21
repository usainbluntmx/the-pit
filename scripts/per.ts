/**
 * PER end-to-end: delegate to the TEE validator, create the ephemeral permission,
 * seal the arena, trade as a member, and prove a non-member cannot read it.
 *
 *   npx tsx scripts/per.ts
 *
 * Signing is explicit (Anchor 1.x provider does not apply .signers() with a custom wallet)
 * and the auth token is signed with Node's ed25519, so the script has no extra deps.
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
import {
  getAuthToken,
  verifyTeeRpcIntegrity,
  EPHEMERAL_VAULT_ID,
  MAGIC_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  PERMISSION_SEED,
} from "@magicblock-labs/ephemeral-rollups-sdk";

const BASE_RPC = "https://rpc.magicblock.app/devnet";
const ROUTER = "https://devnet-router.magicblock.app/";
const TEE = "https://devnet-tee.magicblock.app";
/** TEE ER validator on devnet. */
const TEE_VALIDATOR = new PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");
const SOL_USD_FEED = new PublicKey("ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu");

const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "target", "idl", "the_pit.json"), "utf8"),
);
const PROGRAM_ID = new PublicKey(idl.address);
const NONCE = process.env.NONCE ?? `per-${Date.now().toString(36)}`;
const ROUND_SECS = 120;
const ENTRY_FEE = Math.round(0.01 * LAMPORTS_PER_SOL);

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
  const provider = new anchor.AnchorProvider(connection, readOnly(pubkey) as never, {
    commitment: "confirmed",
  });
  return { connection, program: new anchor.Program(idl, provider) };
}

/** ed25519 detached signature over raw bytes, for the TEE challenge. */
function signDetached(kp: Keypair, message: Uint8Array): Uint8Array {
  const seed = Buffer.from(kp.secretKey.slice(0, 32));
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const key = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  return new Uint8Array(crypto.sign(null, Buffer.from(message), key));
}

async function tokenFor(kp: Keypair): Promise<string> {
  const { token } = await getAuthToken(TEE, kp.publicKey, async (msg) => signDetached(kp, msg));
  return token;
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

async function delegationStatus(account: PublicKey) {
  const res = await fetch(ROUTER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getDelegationStatus", params: [account.toBase58()] }),
  });
  return (await res.json()) as any;
}

const log = (...a: unknown[]) => console.log(...a);

async function main() {
  const payer = loadKeypair(process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json"));
  const base = programAt(BASE_RPC, payer.publicKey);

  const [arena] = PublicKey.findProgramAddressSync([Buffer.from("arena"), Buffer.from(NONCE)], PROGRAM_ID);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), arena.toBuffer()], PROGRAM_ID);
  log("nonce", NONCE);
  log("arena", arena.toBase58());

  /* 1. base: create + 2 players + lock */
  await send(
    base.connection,
    await base.program.methods
      .createArena(NONCE, new anchor.BN(ENTRY_FEE), new anchor.BN(ROUND_SECS), 8, 0, SOL_USD_FEED)
      .accounts({ creator: payer.publicKey, arena, vault, systemProgram: SystemProgram.programId })
      .transaction(),
    payer,
  );
  log("[base] create_arena ✓");

  const players = [Keypair.generate(), Keypair.generate()];
  for (const p of players) {
    const fund = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: p.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }),
    );
    await send(base.connection, fund, payer);
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
  log("[base] 2 players joined ✓");

  await send(
    base.connection,
    await base.program.methods.lockArena(NONCE).accounts({ creator: payer.publicKey, arena }).transaction(),
    payer,
  );
  log("[base] lock_arena ✓");

  /* 2. delegate to the TEE validator */
  const delTx = await base.program.methods
    .delegateArena(NONCE)
    .accounts({ payer: payer.publicKey, arena })
    .remainingAccounts([{ pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }])
    .transaction();
  log("[base] delegate_arena →", (await send(base.connection, delTx, payer)));

  let fqdn = "";
  for (let i = 0; i < 30; i++) {
    const st = await delegationStatus(arena);
    if (st?.result?.isDelegated && st.result.fqdn) {
      fqdn = st.result.fqdn;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!fqdn) throw new Error("delegation never propagated");
  log("[router] fqdn:", fqdn);

  /* 3. attest the TEE, get a token, connect */
  log("[tee] verifying RPC integrity…");
  // Returns void and throws when the quote is invalid: no exception means the TDX
  // quote verified against the Phala PCCS and matched the challenge.
  await verifyTeeRpcIntegrity(TEE);
  log("[tee] attestation passed (quote verified, no exception)");

  const creatorToken = await tokenFor(payer);
  log("[tee] creator token ok, len", creatorToken.length);

  const teeUrl = `${TEE}?token=${creatorToken}`;
  const tee = programAt(teeUrl, payer.publicKey);
  log("[tee] arena owner seen from TEE:", (await tee.connection.getAccountInfo(arena))?.owner.toBase58());

  /* 4. permission + seal */
  const [permission] = PublicKey.findProgramAddressSync(
    [PERMISSION_SEED as Buffer, arena.toBuffer()],
    PERMISSION_PROGRAM_ID,
  );
  const permAccounts = {
    payer: payer.publicKey,
    arena,
    permission,
    permissionProgram: PERMISSION_PROGRAM_ID,
    ephemeralVault: EPHEMERAL_VAULT_ID,
    magicProgram: MAGIC_PROGRAM_ID,
  };

  try {
    const sig = await send(
      tee.connection,
      await tee.program.methods.initPermission(NONCE).accounts(permAccounts).transaction(),
      payer,
      [],
      true,
    );
    log("[tee] init_permission ✓", sig);
  } catch (e: any) {
    log("[tee] init_permission FAILED:", e.message?.slice(0, 200));
    if (e.logs) log(e.logs.join("\n"));
    throw e;
  }

  const sigSeal = await send(
    tee.connection,
    await tee.program.methods.setPrivacy(NONCE, true).accounts(permAccounts).transaction(),
    payer,
    [],
    true,
  );
  log("[tee] set_privacy(true) ✓", sigSeal);

  /* 5. a member trades */
  const trader = players[0];
  const traderToken = await tokenFor(trader);
  const traderTee = programAt(`${TEE}?token=${traderToken}`, trader.publicKey).program;
  const sigTrade = await send(
    tee.connection,
    await traderTee.methods
      .openPosition(NONCE, 1, 3)
      .accounts({ trader: trader.publicKey, arena, feed: SOL_USD_FEED })
      .transaction(),
    payer,
    [trader],
    true,
  );
  log("[tee] member open_position ✓", sigTrade);

  /* 6. negative test: a wallet outside the member list */
  const outsider = Keypair.generate();
  const outsiderToken = await tokenFor(outsider);
  log("[tee] outsider token ok, len", outsiderToken.length);
  const outsiderConn = new Connection(`${TEE}?token=${outsiderToken}`, { commitment: "confirmed" });
  const seen = await outsiderConn.getAccountInfo(arena).catch((e) => ({ error: e.message }) as any);
  log("[check] outsider reading the sealed arena →", seen === null ? "null (blocked)" : "LEAKED: " + JSON.stringify(seen).slice(0, 120));

  /* 7. reveal: unseal so anyone can read, then confirm */
  const sigOpen = await send(
    tee.connection,
    await tee.program.methods.setPrivacy(NONCE, false).accounts(permAccounts).transaction(),
    payer,
    [],
    true,
  );
  log("[tee] set_privacy(false) ✓", sigOpen);
  const reopened = await outsiderConn.getAccountInfo(arena).catch(() => null);
  log("[check] outsider after reveal →", reopened ? "can read (expected)" : "still blocked");
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  if (e?.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});
