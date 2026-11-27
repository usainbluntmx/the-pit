/**
 * English copy. This file is the source of truth for the shape: `Copy` is derived
 * from it, so a missing key in another language is a type error, not a runtime
 * `undefined` in the middle of the UI.
 *
 * House style: talk to the player, short sentences, benefit first and mechanism
 * second. A term is allowed only if the sentence right after it explains it in
 * plain words. Never claim more than the program does: credits are virtual, the
 * SOL is devnet, and the bite is random but verifiable.
 */
export const en = {
  common: {
    devnet: "solana devnet",
    play: "Play on devnet",
    close: "Close",
    copied: "copied",
    copyAddress: "copy address",
    disconnect: "disconnect",
    guide: "? guide",
    backToLanding: "back to the landing",
    replayTour: "Replay the guided tour",
    startTour: "Start the guided tour",
    airdropFailed: (message: string) => `${message} — you can also use https://faucet.solana.com`,
  },
  nav: {
    how: "How it plays",
    bite: "The bite",
    stack: "Why it feels fast",
    play: "Play on devnet",
    profile: "Your profile",
  },
  hero: {
    kicker: "Entertainment finance · trading games",
    titleA: "The market",
    titleEm: "bites back.",
    lede:
      "Eight players, the same 1,000 credits and one shared clock. Orders land the moment you tap them, cost nothing, and stay hidden until the round ends. Every few seconds the pit pulls one player out of the market — chosen at random, checkable by anyone. The top three split the pot.",
    ctaPrimary: "Enter an arena",
    ctaSolo: "Play solo",
    ctaGhost: "See how it plays",
    stats: [
      { v: "Instant", l: "orders land the moment you tap" },
      { v: "No fees", l: "trading costs nothing during the round" },
      { v: "Private", l: "nobody sees your moves until the end" },
      { v: "Fair", l: "the player who gets bitten is drawn at random" },
    ],
  },
  how: {
    kicker: "the loop",
    title: "One bankroll, one market, one winner.",
    steps: [
      {
        n: "01",
        t: "Take a seat",
        d: "Everyone pays the same entry and starts with 1,000 credits. Nothing else to deposit, and no real leverage: the only money on the table is the seat you bought.",
      },
      {
        n: "02",
        t: "The clock starts",
        d: "The table moves to a faster layer built by MagicBlock. Orders land in about ten milliseconds and cost nothing, at the real market price.",
      },
      {
        n: "03",
        t: "The pit bites",
        d: "Every few seconds the pit closes one player who is holding a position. Picked at random, with a draw anyone can check. Staying out of the market is a real defence.",
      },
      {
        n: "04",
        t: "The podium",
        d: "At the bell everything is written back to Solana, the positions are revealed and the pot pays the top three: 60, 25 and 15 percent.",
      },
    ],
  },
  bite: {
    kicker: "the twist nobody else has",
    title: "When pressure builds, you lose control.",
    sub:
      "Getting bitten, closing at a loss and holding too long raise your **pressure**. At 100 you enter **fever** for 20 seconds: your orders run backwards. You ask for long and get short. The program really flips them — it is not a visual effect.",
    pressure: "pressure",
    fever: "fever",
    feverLine: "“▞▚▞ RED DOES NOT EXIST ▞▚▞”",
    feverSub: "15s · your orders run backwards",
    hint:
      "The delirium line comes from the game's own seed, not from a model: the same fever always writes the same sentence.",
    rules: [
      { b: "+40", t: "the pit takes you out of a trade" },
      { b: "+25", t: "you close a trade down by more than 20 credits" },
      { b: "−30", t: "you close in profit" },
      { b: "100", t: "fever: 20 seconds of backwards orders, then back to normal" },
    ],
  },
  stack: {
    kicker: "why it feels instant",
    title: "Four pieces of MagicBlock, each doing a real job.",
    cards: [
      {
        k: "Fast layer",
        d: "While the round is live, the table runs on a MagicBlock rollup: about 10 ms per order and no fees. When the bell rings it all goes back to Solana.",
        tag: "10 ms · no fees",
      },
      {
        k: "Private mode",
        d: "Your positions are sealed inside a private environment. Anyone outside the table asks for them and gets nothing back — checked on devnet, with and without a valid access token.",
        tag: "sealed for real",
      },
      {
        k: "Verifiable draw",
        d: "The player who gets bitten is chosen by a randomness oracle, and anyone can check the draw afterwards. A forged result is rejected by the program.",
        tag: "nobody can rig it",
      },
      {
        k: "Real prices",
        d: "Prices come from Pyth and are read inside the fast layer, so you trade what the market is actually doing — not a number the house made up.",
        tag: "live market prices",
      },
    ],
  },
  series: {
    kicker: "beyond one round",
    title: "Series: three rounds, points written by the program.",
    rounds: "3/3 rounds",
    podiums: "3 podiums",
    sub:
      "Nobody keeps these points on a server: the program writes them. Podium 10/6/3, one more for every bite you survive while holding, and two for being the last one standing.",
    rules: [
      { b: "10 / 6 / 3", t: "for finishing on the podium" },
      { b: "+1", t: "per bite you survive with a position open" },
      { b: "+2", t: "for holding alone into the bell" },
      { b: "10%", t: "of the pot goes to whoever holds into the bell alone" },
    ],
  },
  final: {
    title: "Same bankroll. Real prices. Your nerves.",
    text:
      "Runs on Solana devnet. Connect Phantom, Solflare or Backpack, grab free devnet SOL with one button and bring a friend: a table needs two players to start.",
    program: "See the contract",
  },
  footer: {
    built: "built with MagicBlock · entertainment finance",
  },
  status: {
    open: "open",
    live: "live",
    settled: "paid out",
    closed: "closed",
  },
  guideUi: {
    stepOf: (current: number, total: number) => `step ${current} / ${total}`,
    skip: "skip tour",
    why: "Why:",
    back: "back",
    gotIt: "got it",
    next: "next →",
    aria: "Guided tour",
  },
  play: {
    titleA: "Same bankroll.",
    titleB: "Real prices.",
    titleEm: "One pot.",
    lede:
      "Everyone starts with 1,000 credits and the same clock. Orders land instantly, cost nothing and stay hidden until the round ends; the top three split the pot. You can also play alone against the market.",
    connectTitle: "Connect your wallet",
    noWallet: "No Solana wallet found in this browser. Install one and reload:",
    connecting: "connecting…",
    connectWith: (label: string) => `Connect ${label}`,
    getWallet: (label: string) => `Get ${label}`,
    connectHint:
      "Your keys never leave your wallet: the app only asks it to sign. You need a little devnet SOL for the entry, and there is a free faucet button here once you connect.",
    tradingTitle: "Trading account",
    tradingBody:
      "A wallet created here in your browser and funded by us, so you approve once instead of signing every order. Your main wallet authorises it with a single signature. Devnet only: withdraw the balance before clearing site data.",
    tradingCreate: "Create & fund trading account",
    tradingCreating: "creating…",
    tradingActive: "Trading account active",
    tradingWithdraw: "Withdraw to my wallet",
    tradingUseMain: "Use my main wallet",
    tradingUseAccount: "Use trading account",
    tradingFunded: "Funded with {amount} SOL",
    tradingNote:
      "Devnet only: the key lives in this browser. Withdraw the balance before clearing site data.",
    lowBalance: "Low devnet balance",
    requesting: "requesting…",
    requestOne: "Request 1 devnet SOL",
    airdropRequested: "1 SOL requested from the devnet faucet",
    connectedWith: (label: string) => `${label} connected`,
    connectToEnter: "Connect a wallet to enter an arena",
    emptyBoard:
      "No public tables right now. Tables you host show up here as soon as they are created.",
    players: (n: number, max: number) => `${n}/${max} players`,
    entry: (amount: string) => `entry ${amount} SOL`,
    results: "results →",
    open: "open →",
    yourArenas: "Your tables",
    thisBrowser: "this browser",
    series: "Series",
    pointsOnChain: "points written by the program",
    rounds: (n: number, max: number) => `${n}/${max} rounds`,
    noRounds: "no rounds recorded yet",
    standings: (podiums: number, survived: number, bites: number) =>
      `${podiums} podiums · ${survived} survived · ${bites} bitten`,
    pts: (n: number) => `${n} pts`,
    hostTitle: "Host a table",
    baseLayer: "on Solana",
    entryFee: "Entry fee (SOL)",
    roundSeconds: "Round (seconds)",
    seatsLabel: "Seats",
    marketLabel: "Market",
    modeLabel: "Mode",
    modeArena: "Arena · 2–8 players",
    modeSolo: "Solo · against the market",
    modeArenaHint:
      "Two to eight wallets, one shared pot, three paid seats. The podium takes 60, 25 and 15 percent.",
    modeArenaMeta: "2–8 players · invite a rival",
    modeSoloHint:
      "One seat against the market. Finish above 1,000 credits and the house pays you up to 3× your entry; finish below and it keeps it. No draw here: while you hold a position, the bite comes for you every time.",
    modeSoloMeta: "1 seat · no invite needed · up to 3×",
    playSolo: "Play solo · against the market",
    playArena: "Browse open tables",
    soloBadge: "solo",
    hostHintSolo:
      "A solo run has one seat: you against the market. The house is the other side of the trade — it pays up to 3× your entry if you finish above 1,000 credits and keeps it if you don't. Lock the table to start the clock — and remember there is no draw here: while you hold a position, the bite comes for you every single time.",
    seriesToggle: "Series · 3 rounds, points add up",
    singleToggle: "Single round",
    create: "Create table",
    createSolo: "Create solo run",
    creating: "creating…",
    hostHint:
      "Your table lives on Solana. Joining pays the entry into a shared pot that only the program can move. Lock it and the table moves to the fast layer, where trades are free. Tables fill with real players — no bots — so invite someone before you lock.",
    footerConnected: (label: string) =>
      `Connected with ${label} on devnet. Every move — joining, trading, paying out — is a transaction your wallet signs. Contract: `,
    footerDisconnected:
      "Connect a Solana wallet to play. Nothing is custodial: the app never sees your keys. Contract: ",
    guide: {
      wallet: {
        title: "This is your wallet",
        body: "Connect Phantom, Solflare or Backpack. The address and balance on the right are yours. You can also create a trading account here so you don't sign every order.",
        why: "The app never holds your keys: your wallet signs, and it stays in the extension. If you are low on devnet SOL, the free faucet button appears right here.",
      },
      board: {
        title: "The board",
        body: "OPEN means there are seats left, LIVE means the round is already running, CLOSED means the pot has been paid out.",
        why: "The board reads Solana and the fast layers at the same time. A table that is running does not appear on Solana, so one source alone would hide every live round.",
      },
      enter: {
        title: "Enter a table",
        body: "Tap a card to open that table. The URL becomes /play?arena=… so you can send the exact table to another player.",
        why: "A round cannot start alone: it needs two players. The invite link is how the second wallet gets in.",
      },
      host: {
        title: "Host your own table",
        body: "Choose the entry, how long the round lasts and how many seats, then create it. As the host you start the clock once at least two players are seated.",
        why: "The entry goes into a shared pot that belongs to the program, not to you. The host can start the clock but can never touch the pot.",
      },
    },
  },
};

export type Copy = typeof en;
