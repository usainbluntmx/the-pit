import { NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

export const runtime = "nodejs";

/**
 * Devnet faucet for trading accounts.
 *
 * The main wallet signs `linkMessage(owner, trading, issued)`; this route
 * rebuilds that exact string, verifies the ed25519 signature, and funds the new
 * account. Rate limits are in-memory: they reset on deploy, which is fine for a
 * devnet demo. The secret never leaves the server.
 */

const RPC = process.env.FAUCET_RPC ?? "https://rpc.magicblock.app/devnet";
const AMOUNT = 0.05; // SOL per account
const MAX_AGE_MS = 10 * 60 * 1000;
const OWNER_WINDOW_MS = 6 * 60 * 60 * 1000;
const IP_WINDOW_MS = 6 * 60 * 60 * 1000;
const IP_LIMIT = 6;

const perOwner = new Map<string, number>();
const perIp = new Map<string, number[]>();

function faucetKeypair(): Keypair | null {
  const raw = process.env.FAUCET_SECRET_KEY;
  if (!raw) return null;
  try {
    const bytes = raw.trim().startsWith("[")
      ? Uint8Array.from(JSON.parse(raw))
      : bs58.decode(raw.trim());
    return Keypair.fromSecretKey(bytes);
  } catch {
    return null;
  }
}

function rateLimited(req: Request, owner: string): string | null {
  const now = Date.now();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const last = perOwner.get(owner);
  if (last && now - last < OWNER_WINDOW_MS) {
    return "this wallet already received its trading account funds";
  }

  const hits = (perIp.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_LIMIT) {
    return "too many trading accounts from this network, try later";
  }
  return null;
}

function remember(req: Request, owner: string) {
  const now = Date.now();
  perOwner.set(owner, now);
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  perIp.set(ip, [...(perIp.get(ip) ?? []), now]);
}

export async function POST(req: Request) {
  const faucet = faucetKeypair();
  if (!faucet) {
    return NextResponse.json({ error: "faucet not configured" }, { status: 503 });
  }

  let body: {
    owner?: string;
    trading?: string;
    issued?: number;
    signature?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { owner, trading, issued, signature } = body;
  if (!owner || !trading || !issued || !signature) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (Math.abs(Date.now() - issued) > MAX_AGE_MS) {
    return NextResponse.json({ error: "expired signature" }, { status: 400 });
  }

  let ownerKey: PublicKey;
  let tradingKey: PublicKey;
  try {
    ownerKey = new PublicKey(owner);
    tradingKey = new PublicKey(trading);
  } catch {
    return NextResponse.json({ error: "invalid public key" }, { status: 400 });
  }
  if (ownerKey.equals(tradingKey)) {
    return NextResponse.json({ error: "owner and trading account must differ" }, { status: 400 });
  }

  const message = `PIT trading account\nowner:${owner}\ntrading:${trading}\nissued:${issued}`;
  let ok = false;
  try {
    ok = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      bs58.decode(signature),
      ownerKey.toBytes(),
    );
  } catch {
    ok = false;
  }
  if (!ok) {
    return NextResponse.json({ error: "signature does not match the wallet" }, { status: 401 });
  }

  const limited = rateLimited(req, owner);
  if (limited) {
    return NextResponse.json({ error: limited }, { status: 429 });
  }

  const connection = new Connection(RPC, "confirmed");
  const lamports = Math.round(AMOUNT * LAMPORTS_PER_SOL);

  try {
    const balance = await connection.getBalance(faucet.publicKey);
    if (balance < lamports + 10_000) {
      return NextResponse.json({ error: "faucet is empty" }, { status: 503 });
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: faucet.publicKey,
        toPubkey: tradingKey,
        lamports,
      }),
    );
    tx.feePayer = faucet.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
    tx.sign(faucet);
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      preflightCommitment: "confirmed",
    });
    const conf = await connection.confirmTransaction(sig, "confirmed");
    if (conf.value.err) throw new Error(JSON.stringify(conf.value.err));

    remember(req, owner);
    return NextResponse.json({ signature: sig, amount: AMOUNT });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "funding failed" },
      { status: 500 },
    );
  }
}
