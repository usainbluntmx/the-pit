# Demo script — English (3–5 min, solo run)

Target: **4:15**. One continuous take, English UI, devnet only. Solo mode: one seat, the house is the
counterparty — no second wallet needed.

---

## Before you record (10 min)

1. **Wallet with history** (the one that narrates) holding devnet SOL. Solo rounds count toward its
   rounds and PnL; series points come from shared tables, so the profile should already have some.
2. **One rehearsal run** so the bite and the multiplier are not a surprise on camera.
3. **Browser**: 1920×1080, zoom 100 %, bookmarks bar hidden, notifications off, UI in EN.
4. **Audio**: mic a hand's width away, quiet room. Record 10 s of silence for cleanup.
5. **Timer** on your phone, off screen.

---

## Script

### 0:00 – 0:20 · Cold open
**Screen:** landing. Cursor still. The live board ticks the SOL price while you talk.
**Lower third:** THE PIT · trading with teeth
**Voice:**
> This is not another exchange. This is The Pit: one table, everyone starts with the same thousand
> credits, your positions stay sealed, and every twenty seconds the market takes a bite out of
> someone.

### 0:20 – 0:55 · What it is
**Screen:** click "Play". Lobby with real tables; hover one card (entry, pot, seats, status). Then
point at "Play solo · against the market".
**Lower third:** one seat · the house is the other side
**Voice:**
> This is the lobby, and every card is a real round on devnet. There are two ways in: a shared table
> where up to eight wallets fight over one pot, or a solo run, which is what I'm doing today. One
> seat, no invite, and the house takes the other side of every trade. Finish above a thousand credits
> and it pays you up to three times your entry. Finish below and it keeps it.

### 0:55 – 1:25 · Get in
**Screen:** "Connect wallet" (disconnect and reconnect on camera). "Request 1 devnet SOL".
"Create & fund trading account" → one signature.
**Lower third:** one signature, no popups after
**Voice:**
> I connect my wallet. The app hands me devnet SOL if I'm short, and creates a disposable trading
> account in the browser: I sign once with my main wallet, and from then on orders never open a
> popup. This is devnet, so there's no real money here, but the flow is the same one you'd ship.

### 1:25 – 2:00 · Open the run
**Screen:** "Create solo run" (entry 0.01, 60-second rounds). Confirm. Then "Lock & start round".
**Lower third:** the table moves to the fast layer
**Voice:**
> I open a solo run: one seat, a one-hundredth of a SOL on the line, sixty-second rounds. Now I lock
> it. Locking moves the table onto a MagicBlock rollup, starts the clock, and from that moment every
> order happens inside that rollup instead of waiting on Solana.

### 2:00 – 2:55 · Trade and take the bite
**Screen:** ticket → LONG, 3×, "Open LONG". The entry pins to the chart. Let the bite land
("THE PIT BIT YOU"). If fever hits, show the button dodging.
**Lower third:** ~10 ms · no fee · the bite always comes for you here
**Voice:**
> Here's what changes the game. I pick LONG, three times, and open. The order lands in about ten
> milliseconds and costs nothing, because it runs inside the rollup. The chart moves with the round
> clock and pins my entry at its exact price. And every twenty seconds, the pit bites: it closes one
> player at market. In a shared table that victim comes from a verifiable random draw. In solo there
> is no draw — if I'm holding when the timer fires, it's me, every single time. Staying flat is a real
> defence. And pressure builds: when fever hits, my orders run backwards for twenty seconds. I ask for
> long and I get short.

### 2:55 – 3:30 · Close and get paid
**Screen:** "End round" → "Save & return to Solana" → "Pay out". Show the multiplier (1.00×–3.00×)
and the payout in SOL. Open the transaction in the explorer and come back.
**Lower third:** every button is a real transaction
**Voice:**
> At the bell I close the round, save the final state back to Solana, and pay out. The contract reads
> my equity and applies the multiplier: a thousand to ten-fifty pays one times the entry, and every
> band above that pays more, up to three times at thirteen hundred. Here's the transaction on the
> explorer — the house account paid me, not the app.

### 3:30 – 4:00 · The profile
**Screen:** `/profile`. Scroll slowly: points and change since yesterday, PnL, rounds, bites, round
history, leaderboard.
**Lower third:** no backend · no account
**Voice:**
> Everything I just did shows up here without me saving anything. No backend, no account. Points come
> from the series, PnL is what I got paid minus what I put in, plus rounds won and lost, bites taken,
> the full history and my place on the board. All of it is rebuilt from the program's own accounts
> every time I connect, even from another machine.

### 4:00 – 4:25 · Why MagicBlock, honestly
**Screen:** back to the landing, scroll to the pieces block, or open the program in the explorer.
**Lower third:** rollup · oracle · private environment · VRF
**Voice:**
> Four pieces make this possible. The rollup is why orders are instant and free. The price oracle
> inside it is why I trade on fresh prices instead of a stale feed. The private environment is what
> seals the book in a shared table — in solo there's nobody to hide from, so what you're watching is
> the speed. And the VRF is what makes the bite unriggable when there are other players at the table.

### 4:25 – 4:40 · Close
**Screen:** landing with links visible.
**Lower third:** the-pit.zerotwolabs.xyz · devnet
**Voice:**
> That's The Pit, by Zero Two Labs. Program, repo and app are open, all on devnet. Connect a wallet,
> open a solo run, or bring a friend to a shared table and see who the pit bites first.

---

## What not to say

- Don't say mainnet or imply real money. It's devnet.
- Don't say "fully private". Say "sealed inside the private environment" — that's what the TEE does.
- In solo, don't claim the VRF is drawing anything: the bite targets you by rule. Say it plainly, as
  above; judges notice overselling.
- Don't promise returns or APR. PnL on the profile is history, not a projection.
- Don't invent opponents or call them bots.

## If something breaks on camera

- Rollup slow to start: cut and redo the block; don't narrate the wait.
- Bite doesn't land in the take: keep the run going; the timer fires again. If it never lands,
  cut the beat and say it over the next round.
- Payout shows 0×: that's a losing run and still a valid demo — say "the house kept the entry" and
  move on. Better: rehearse until you finish above 1,000.

## After recording

1. Upload the master to YouTube (unlisted) or Loom; use that link in the form.
2. Keep the file at `docs/demo.mp4` and the silent cut at `docs/demo-sin-voz.mp4`.
3. Don't stretch it past five minutes. Judges rewatch the first forty seconds.
