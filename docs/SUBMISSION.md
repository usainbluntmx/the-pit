# Submission — PIT (Entertainment Finance)

Campos listos para copiar y pegar en el formulario de entrega.

## Nombre

**PIT — Private Instant Trading**

## Tagline (una línea)

> A trading arena where the market bites back: same credits for everyone, your moves stay hidden, and a verifiable draw takes one player out.

## Descripción corta (EN, ~50 palabras)

PIT is a trading arena on Solana. Every seat pays the same entry and starts with 1,000 virtual
credits. Orders land in about 10 ms and cost nothing, positions stay hidden until the round
ends, and every few seconds a verifiable draw closes one player at market. Top three split the
pot 60/25/15.

## Descripción larga (EN)

PIT turns trading into something you can watch and play. A round is one shared pot with up to
eight seats: same credits, same clock, real prices. While the round runs, the table lives on a
MagicBlock rollup, so every LONG or SHORT order lands in about 10 ms and costs nothing. Your
positions stay sealed inside a private environment: a wallet outside the table asks for the
account and gets nothing back, with or without a valid token. Every few seconds the pit bites —
a randomness oracle picks one player who is holding a position and closes them at market, and
anyone can check the draw. The bite is played, not reported: two rows of teeth close over the
whole screen and the crunch is synthesised in the browser. Pressure from bites and losing trades
builds toward "fever": for 20
seconds the program flips your orders, so you ask for long and get short. Fever takes the screen
too: it goes dark, stray lines start showing up, and the first click on open is swallowed
(closing is never blocked). At the bell the round
is written back to Solana, positions are revealed and the pot pays the podium 60/25/15. Series
chain three rounds with points written on-chain. A single player can run a solo table against
the market: one seat, the same entry, and a house account that pays up to 3× the entry if the
run beats 1,000 credits. The app also creates a disposable trading account in the browser,
funded by a devnet faucet, so the main wallet signs once and orders never open a popup again.
A full-width price chart runs on the round clock and pins every entry at its exact price.
Every wallet has a profile assembled from its own accounts — a generated avatar and handle,
points with the change since yesterday, PnL (paid minus entry), rounds won and lost,
bites taken, its round history and its place on the leaderboard — with nothing stored
off-chain. Everything is permissionless and verifiable: the frontend is just a client.

## Categoría

Entertainment Finance · Trading / gaming · DeFi consumer

## Links

- **App (devnet):** https://the-pit.zerotwolabs.xyz/
- **App (respaldo estático):** https://usainbluntmx.github.io/the-pit/
- **Repo:** https://github.com/usainbluntmx/the-pit
- **Video (89 s, ES):** https://github.com/usainbluntmx/the-pit/raw/main/docs/demo.mp4
- **Video sin voz:** https://github.com/usainbluntmx/the-pit/raw/main/docs/demo-sin-voz.mp4
- **Programa:** https://explorer.solana.com/address/4iVtfWTrVo4iUAeTBVhhjkDr9kGK4dTD95vKM8c6dbar?cluster=devnet

## Proof of work (devnet)

- **Program ID:** `4iVtfWTrVo4iUAeTBVhhjkDr9kGK4dTD95vKM8c6dbar`
- **Upgrade authority:** `Dj9VvhrDUMtumbkiY9dZPZQczmJHAwDvrdLY6kHoUDNS`
- **Binario:** 545,336 bytes, 19 instrucciones, Anchor 1.0.2 / Solana CLI 3.1.9
- **Arena liquidada con podio real:** `FCjiCWgQi3ZVpGEJa2SmtYyc4a3YxwZeEvM9ei1cFhgW`
  (3 asientos, pozo 0.03 SOL, pagos 60/25/15, estado `closed`)
- **Arena en vivo / abierta:** `G6Qnx7x14BZkT1b7Lbzkge5n1EkazHtzxHzJiurbap2B`
- **Serie verificada:** `season-01`, 3 rondas de 60 s, puntos on-chain (23 / 18 / 18)
- **Modo solo verificado:** arena `GnwU16uzvtZrzmk2dwJsSyi9foNznE8Rc5RPFnytCWUr`
  (1 asiento, equity 1002.12 → pago 1×, jugador +0.01 SOL) y una corrida de 120 s
  (equity 997.22 → 0×, la casa retuvo la entrada). Casa:
  `7VgmHJJxBq4UxpfW3iy8KzUP6vRTu7RDWAQz2d3Bg8hp`
- **Tests deterministas:** `cargo test -p the-pit` — 6 unitarios + `join_flow` +
  `onchain_layout` + 4 de `settle_solo` (victoria, derrota, empate y rechazo de `settle`)
- **Trading account:** keypair generado en el navegador, vinculado con una firma de la
  wallet principal y fondeado con 0.05 SOL por `/api/faucet` (rate limit por wallet e IP)

Transacciones recientes del programa (finalizadas, sin error):

```
4G4qdmcTTSTcRA42LuFvDBxUbVCb3hfvWsASWDccU7wzFtcGehC6zm9wWv7ifen59nbZTJmWUtipghwFkfZePEZu
CqWqqxytpe32xfqEMajHGfSCvCjymx2ShTwjjMzUbUSqNkkR81dvwf2XeFbQhdW55S4d8ni2S4kP1bccnWcCshh
2tw5A64WwvgJUw4BnqQx8bzJjtFgYcVcGCm2c8wRNkUZbqC3atDASrR4EJMZbkw6XjjDMyS1wpjHun9oHj5UM8w6
2LMBbbgZK4MopKeiHp5bDhJ9U2Q3wEkH56wbXWaCJpDyWKzLgQ6LJbduk1xN91n7BeqXmAvrHwbt4BhjFjNs6oqf
```

## Qué aporta MagicBlock (y por qué no es decorativo)

| Lo que necesita el juego | Pieza | Instrucciones |
|---|---|---|
| Órdenes instantáneas y gratis | Ephemeral Rollup | `open_position`, `close_position` |
| Que nadie vea tu libro | Private ER (TEE) | `init_permission`, `set_privacy` |
| Una mordida que no se pueda amañar | VRF | `request_shock`, `shock_callback` |
| Precio fresco al operar | Pricing Oracle (Pyth Lazer) | `read_price` |

El feed **solo publica dentro del rollup**: en la capa base las cuentas están delegadas y no
sirven para jugar. Sin ER no hay juego, y sin TEE el libro sería público.

## Cómo probarlo (2 minutos)

1. Abre la app en devnet y conecta Phantom/Solflare/Backpack.
2. Pide SOL de devnet desde el botón de la app.
3. Crea una mesa (o entra a una abierta) y comparte el link de invitación: hacen falta **dos**
   wallets para arrancar; no hay bots que se unan solos. Si no tienes con quién, usa el modo solo.
4. Al bloquear, la mesa pasa a la capa rápida, arranca el reloj y se puede operar. La mordida
   se dispara sola cuando vence el plazo. La gráfica del precio ocupa el ancho completo, avanza
   con el reloj de la ronda y clava cada entrada LONG/SHORT en su precio, con la banda verde o
   roja que dice si esa posición va ganando o perdiendo.
5. Al cerrar la ronda: cerrar ronda → guardar → pagar, todo desde la misma UI.

## Estado y siguientes pasos

- [x] Programa completo y verificado en devnet
- [x] Frontend bilingüe ES/EN, wallet propia, ciclo completo desde la UI
- [x] Deploy público + repo abierto + video demo
- [x] Modo solitario contra el mercado (`settle_solo`, casa PDA, 4 tests)
- [x] Trading account con fondeo de la app y retiro a la wallet principal
- [x] Modo solo visible desde el lobby y la landing (`/play?mode=solo`)
- [x] Gráfica del precio en grande con el punto de entrada de cada posición
- [x] Perfil del jugador y tabla de líderes derivados de las cuentas on-chain

## Equipo

Ricardo Fuentes - Zero Two Labs (Mexico)
