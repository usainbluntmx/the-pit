"use client";

import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";

/**
 * Wallet connection without a provider library.
 *
 * The app only needs four things from a wallet: the public key, transaction signing,
 * message signing (for the TEE bearer token) and the disconnect hook. Every Solana
 * extension exposes those on an injected object, so we talk to them directly and keep
 * the bundle free of wallet-adapter (which still pins React 18).
 */

type Injected = {
  publicKey?: PublicKey | null;
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey } | void>;
  disconnect?: () => Promise<void> | void;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signMessage?: (msg: Uint8Array, display?: "utf8" | "hex") => Promise<{ signature: Uint8Array }>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type Wallet = {
  /** Provider id, e.g. "phantom". */
  id: string;
  /** Human label shown in the UI. */
  label: string;
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>;
  disconnect: () => Promise<void>;
};

export type DetectedWallet = { id: string; label: string; provider: Injected };

const STORAGE_KEY = "pit:wallet";

const INSTALL_URLS: Record<string, string> = {
  phantom: "https://phantom.app/download",
  solflare: "https://solflare.com/download",
  backpack: "https://backpack.app/download",
};

function injected(): Injected[] {
  if (typeof window === "undefined") return [];
  const w = window as unknown as Record<string, any>;
  const list: Injected[] = [
    w.phantom?.solana,
    w.solflare,
    w.backpack,
    w.glow,
    w.solana,
  ].filter(Boolean);
  // Some extensions register the same provider twice (e.g. Phantom on both slots).
  return list.filter((p, i) => list.indexOf(p) === i);
}

function labelOf(provider: Injected): string {
  if (provider.isPhantom) return "Phantom";
  if (provider.isSolflare) return "Solflare";
  if (provider.isBackpack) return "Backpack";
  return "Browser wallet";
}

function idOf(provider: Injected): string {
  if (provider.isPhantom) return "phantom";
  if (provider.isSolflare) return "solflare";
  if (provider.isBackpack) return "backpack";
  return "injected";
}

/** Wallets installed in this browser, in a stable order. */
export function detectWallets(): DetectedWallet[] {
  const seen = new Set<string>();
  const out: DetectedWallet[] = [];
  for (const provider of injected()) {
    const id = idOf(provider);
    if (seen.has(id) || typeof provider.connect !== "function") continue;
    seen.add(id);
    out.push({ id, label: labelOf(provider), provider });
  }
  return out;
}

export function installUrl(id: string): string {
  return INSTALL_URLS[id] ?? "https://solana.com/ecosystem/wallets";
}

function wrap(id: string, label: string, provider: Injected, publicKey: PublicKey): Wallet {
  return {
    id,
    label,
    publicKey,
    signTransaction: async (tx: Transaction) => {
      if (typeof provider.signTransaction !== "function") {
        throw new Error(`${label} does not expose signTransaction`);
      }
      return provider.signTransaction(tx);
    },
    signMessage: async (msg: Uint8Array) => {
      if (typeof provider.signMessage !== "function") {
        throw new Error(`${label} does not support message signing, which the enclave requires`);
      }
      const res = await provider.signMessage(msg, "utf8");
      return res.signature;
    },
    disconnect: async () => {
      try {
        await provider.disconnect?.();
      } catch {
        /* the user may have already disconnected from the extension */
      }
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* private mode */
      }
    },
  };
}

/** Open the extension prompt and return a signing wallet. */
export async function connectWallet(id: string): Promise<Wallet> {
  const found = detectWallets().find((w) => w.id === id);
  if (!found) throw new Error("wallet not installed in this browser");
  const res = await found.provider.connect();
  const publicKey = (res && "publicKey" in res ? res.publicKey : undefined) ?? found.provider.publicKey;
  if (!publicKey) throw new Error("wallet returned no public key");
  rememberWallet(id);
  return wrap(id, found.label, found.provider, publicKey);
}

/**
 * Silent reconnect after a reload. `onlyIfTrusted` never opens a popup: it resolves only
 * when this origin is already approved, which is exactly what we want on page load.
 */
export async function reconnectWallet(): Promise<Wallet | null> {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  const found = detectWallets().find((w) => w.id === saved);
  if (!found) return null;
  try {
    const res = await found.provider.connect({ onlyIfTrusted: true });
    const publicKey = (res && "publicKey" in res ? res.publicKey : undefined) ?? found.provider.publicKey;
    if (!publicKey) return null;
    return wrap(found.id, found.label, found.provider, publicKey);
  } catch {
    return null;
  }
}

export function rememberWallet(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode */
  }
}

/** Devnet faucet, straight from the browser. The MagicBlock proxy does not serve airdrops. */
export async function requestAirdrop(address: PublicKey, sol = 1): Promise<string> {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = await conn.requestAirdrop(address, sol * LAMPORTS_PER_SOL);
  const latest = await conn.getLatestBlockhash("confirmed");
  const conf = await conn.confirmTransaction(
    { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
  if (conf.value.err) throw new Error("airdrop failed — try https://faucet.solana.com");
  return sig;
}
