"use client";

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import type { Wallet } from "./wallet";

/**
 * A trading account is a disposable devnet keypair generated in the browser.
 * The main wallet signs ONE message to link it, and from then on every order is
 * signed by this key, so the extension does not pop up on every trade.
 *
 * This is deliberately not custody: the key never reaches a server, and the
 * funds are devnet SOL topped up by our faucet. On mainnet this pattern should
 * be replaced by an on-chain session key so the hot key can be revoked.
 */

const storageKey = (owner: string) => `pit:trading:${owner}`;

export type StoredTrading = {
  secret: string;
  owner: string;
  createdAt: number;
};

export function loadTrading(owner: string): Keypair | null {
  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredTrading;
    if (!data.secret || data.owner !== owner) return null;
    return Keypair.fromSecretKey(bs58.decode(data.secret));
  } catch {
    return null;
  }
}

export function saveTrading(owner: string, kp: Keypair) {
  const data: StoredTrading = {
    secret: bs58.encode(kp.secretKey),
    owner,
    createdAt: Date.now(),
  };
  window.localStorage.setItem(storageKey(owner), JSON.stringify(data));
}

export function clearTrading(owner: string) {
  window.localStorage.removeItem(storageKey(owner));
}

/** Exact text the main wallet signs. The faucet rebuilds and verifies it. */
export function linkMessage(owner: string, trading: string, issued: number) {
  return `PIT trading account\nowner:${owner}\ntrading:${trading}\nissued:${issued}`;
}

export function tradingWallet(kp: Keypair, owner: PublicKey): Wallet {
  return {
    id: "trading",
    label: "Trading account",
    publicKey: kp.publicKey,
    signTransaction: async (tx: Transaction) => {
      tx.partialSign(kp);
      return tx;
    },
    signMessage: async (msg: Uint8Array) => nacl.sign.detached(msg, kp.secretKey),
    disconnect: async () => {
      /* the trading account is not a session: disconnecting the main wallet keeps it */
    },
  };
}

/** One main-wallet signature, then the faucet funds the new account. */
export async function linkAndFund(
  owner: Wallet,
  kp: Keypair,
): Promise<{ signature: string; amount: number }> {
  const issued = Date.now();
  const message = linkMessage(owner.publicKey.toBase58(), kp.publicKey.toBase58(), issued);
  const sig = await owner.signMessage(new TextEncoder().encode(message));

  const res = await fetch("/api/faucet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      owner: owner.publicKey.toBase58(),
      trading: kp.publicKey.toBase58(),
      issued,
      signature: bs58.encode(sig),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "the faucet is not available");
  return body as { signature: string; amount: number };
}

/** Send everything left on the trading account back to the main wallet. */
export async function withdrawTrading(
  kp: Keypair,
  owner: PublicKey,
  connection: Connection,
): Promise<string> {
  const balance = await connection.getBalance(kp.publicKey);
  const fee = 5_000;
  if (balance <= fee) throw new Error("nothing to withdraw");

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: owner,
      lamports: balance - fee,
    }),
  );
  tx.feePayer = kp.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(kp);
  const sig = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}
