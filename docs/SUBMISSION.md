# Submission — PIT (Entertainment Finance)

Campos listos para copiar y pegar en el formulario de entrega.

## Nombre

**PIT — Private Instant Trading**

## Tagline (una línea)

> Trading arenas where the market bites back: everyone starts with the same bankroll, the book stays sealed, and a VRF force-closes one player at random.

## Descripción corta (EN, ~50 palabras)

PIT is a competitive trading arena on Solana. Every seat pays the same entry into an escrow
vault and starts with 1,000 virtual credits. Orders execute gasless in a MagicBlock rollup in
~10 ms, positions stay sealed inside a TEE until the bell, and a VRF force-closes one random
player who is holding risk. Top three split the pot 60/25/15.

## Descripción larga (EN)

PIT turns trading into a spectator sport. A round is a single escrow vault with up to eight
seats: same bankroll, same clock, real prices. While the round runs, the arena is delegated to
a MagicBlock Ephemeral Rollup, so LONG/SHORT orders settle in ~10 ms and cost nothing. The book
is private by default: the arena lives behind a Private ER (TEE), and a wallet outside the
permission gets `null` for the whole account — token or not. Every few seconds the pit bites:
a VRF oracle picks one player holding a position and force-closes them at market, and the
callback is identity-checked on-chain. Pressure from bites and losing closes builds toward
"fever", where the program inverts your orders for 20 seconds. At the bell the round is
committed back to Solana, positions are revealed, and the vault pays the podium. Series chain
three rounds with on-chain points. A lone player can run a **solo arena** against the market:
one seat, the same entry, and a house PDA that pays up to 3× the entry if the run beats 1,000
credits (and keeps it if it does not). The app also derives a disposable **trading account** in
the browser, funded by a devnet faucet, so the main wallet signs once and orders never pop the
extension again. A full-width feed chart runs on the round clock and pins every long/short
entry at its exact price, with a green or red band that shows at a glance whether the position
was right. Everything is permissionless and verifiable: the frontend is just a client.

## Categoría

Entertainment Finance · Trading / gaming · DeFi consumer

## Links

- **App (devnet):** https://the-pit.zerotwolabs.xyz/
- **App (respaldo estático):** https://usainbluntmx.github.io/the-pit/
- **Repo:** https://github.com/usainbluntmx/the-pit
- **Video (70 s, ES):** https://github.com/usainbluntmx/the-pit/raw/main/docs/demo.mp4
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

## Qué es MagicBlock aquí (no es decorativo)

| Necesidad | Pieza | Instrucciones |
|---|---|---|
| Órdenes instantáneas sin fee | Ephemeral Rollup | `open_position`, `close_position` |
| El libro no es público | Private ER (TEE) | `init_permission`, `set_privacy` |
| Resultado no elegible | VRF | `request_shock`, `shock_callback` |
| Precio fresco al operar | Pricing Oracle (Pyth Lazer) | `read_price` |

El feed **solo publica dentro del rollup**: en la capa base las cuentas están delegadas y no
sirven para jugar. Sin ER no hay juego, y sin TEE el libro sería público.

## Cómo probarlo (2 minutos)

1. Abre la app en devnet y conecta Phantom/Solflare/Backpack.
2. Pide SOL de devnet desde el botón de la app.
3. Crea una arena (o entra a una abierta) y comparte el link de invitación: hacen falta **dos**
   wallets para arrancar; no hay bots que se unan solos.
4. Al bloquear, la arena se delega, arranca el reloj y se puede operar. La mordida se dispara
   sola cuando vence el cooldown. La gráfica del feed ocupa el ancho completo, avanza con el
   reloj de la ronda y clava cada entrada LONG/SHORT en su precio, con la banda verde o roja
   que dice si esa posición va ganando o perdiendo.
5. Al cerrar la ronda: `end_round` → `commit` → `settle` desde la misma UI.

## Estado y siguientes pasos

- [x] Programa completo y verificado en devnet
- [x] Frontend bilingüe ES/EN, wallet propia, ciclo completo desde la UI
- [x] Deploy público + repo abierto + video demo
- [x] Modo solitario contra el mercado (`settle_solo`, casa PDA, 4 tests)
- [x] Trading account con fondeo de la app y retiro a la wallet principal
- [x] Modo solo visible desde el lobby y la landing (`/play?mode=solo`)
- [x] Gráfica del feed en grande con el punto de entrada de cada posición

## Equipo

Ricardo Fuentes — Zero Two Labs (CDMX). Full stack / blockchain. Solana LATAM (Atlas),
3.º Monad Blitz (Nodemesh), 2.º ETH México (Pay 'n Go).
