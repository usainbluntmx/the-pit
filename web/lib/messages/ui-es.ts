/**
 * Spanish catalog for the dense operational UI (arena screen).
 *
 * Why source-keyed instead of the typed `Copy` tree: the arena has ~100 short,
 * highly dynamic strings (counts, clocks, contract states). Keying by the English
 * source keeps the component readable, gives an automatic English fallback for
 * anything not translated yet, and avoids a parallel key namespace that nobody
 * would keep in sync during a hackathon. Editorial copy (landing, lobby) uses the
 * typed dictionary; this file is the app layer.
 *
 * Placeholders use `{name}` and are replaced by `useT()`.
 */
export const ES_UI: Record<string, string> = {
  // ---- chrome / errors -----------------------------------------------------
  "← Back to lobby": "← Volver al lobby",
  "loading arena…": "cargando arena…",
  "← Lobby": "← Lobby",
  "base layer": "capa base",
  "PER · sealed": "PER · sellada",
  "PER · open": "PER · abierta",
  "series · R{n}/{max}": "serie · R{n}/{max}",
  "arena not found": "arena no encontrada",
  "the arena is not delegated to a rollup": "la arena no está delegada a un rollup",
  "TEE session not ready": "sesión TEE no lista",
  "copy failed — the invite link is {link}": "no se pudo copiar; el link es {link}",

  // ---- header stats --------------------------------------------------------
  Pot: "Pozo",
  "{count}/{max} seats · entry {entry} SOL": "{count}/{max} asientos · entrada {entry} SOL",
  "1st": "1.º",
  "2nd": "2.º",
  "3rd": "3.º",
  "time left": "tiempo restante",
  "starts on lock": "arranca al bloquear",
  round: "ronda",
  "{secs}s rounds · rake {rake}%": "rondas de {secs}s · rake {rake}%",
  "waiting for the feed": "esperando el feed",
  live: "en vivo",
  "MagicBlock price feed · 10ms": "feed de precio de MagicBlock · 10 ms",
  "the feed publishes once the arena is on the rollup":
    "el feed publica cuando la arena está en el rollup",

  // ---- next move: open -----------------------------------------------------
  "Your next move": "Tu siguiente movimiento",
  "1 more player to start": "falta 1 jugador para arrancar",
  "{n} more players to start": "faltan {n} jugadores para arrancar",
  "ready to start": "listo para arrancar",
  "Join for {amount} SOL and start with 1,000 credits":
    "Únete por {amount} SOL y arranca con 1,000 créditos",
  "You are in — the round cannot start alone": "Ya estás dentro: la ronda no puede arrancar solo",
  "Everyone is in: lock the arena to start the clock":
    "Ya están todos: bloquea la arena para arrancar el reloj",
  "Everyone is in: waiting for the host to lock":
    "Ya están todos: esperando que el anfitrión bloquee",
  "Join: your entry goes into an escrow vault and the program opens your seat.":
    "Únete: tu entrada va a un vault en escrow y el programa abre tu asiento.",
  "You are seated and paid. Nothing else to deposit.":
    "Ya tienes asiento y ya pagaste. No hay nada más que depositar.",
  "A round needs **2 players**. Copy the invite link and send it — **no bots join by themselves**.":
    "Una ronda necesita **2 jugadores**. Copia el link de invitación y mándalo: **ningún bot entra solo**.",
  "You lock it: ": "Tú la bloqueas: ",
  "The host locks it: ": "El anfitrión la bloquea: ",
  "the arena delegates to MagicBlock, the clock starts and the book is sealed.":
    "la arena se delega a MagicBlock, arranca el reloj y el libro queda sellado.",
  "joining…": "uniéndose…",
  "Join for {amount} SOL": "Unirse por {amount} SOL",
  "Join for {amount} SOL and run against the market":
    "Únete por {amount} SOL y corre contra el mercado",
  "You are in — lock the arena to start the clock":
    "Ya estás dentro: bloquea la arena para arrancar el reloj",
  "This is a solo run: one seat, no invite. Lock it to start the clock.":
    "Es una corrida solo: un asiento y sin invitación. Bloquéala para arrancar el reloj.",
  "The market paid your run — start the next one":
    "El mercado pagó tu corrida: arranca la siguiente",
  "Solo run settled — start the next one":
    "Corrida solo liquidada: arranca la siguiente",
  "Round closed. The house paid your multiplier.":
    "Ronda cerrada. La casa pagó tu multiplicador.",
  "need 1 player": "falta 1 jugador",
  "Solo payout": "Pago solo",
  "solo payout · 1.00× / 1.25× / 1.50× / 2.00× / 3.00×":
    "pago solo · 1.00× / 1.25× / 1.50× / 2.00× / 3.00×",
  "Settle: the house pays your multiplier out of the entry and its own balance.":
    "Liquida: la casa paga tu multiplicador con la entrada y su propio saldo.",
  "locking…": "bloqueando…",
  "Lock & start round": "Bloquear y arrancar",
  "link copied ✓": "link copiado ✓",
  "Copy invite link": "Copiar link de invitación",
  "Nobody joins automatically — this arena only fills with wallets you invite. The link opens it directly, so the other player lands on this same table.":
    "Nadie entra automáticamente: esta arena solo se llena con wallets que tú invitas. El link la abre directo, así que el otro jugador cae en esta misma mesa.",
  "You need {need} SOL to join and the wallet holds {have}.":
    "Necesitas {need} SOL para unirte y la wallet tiene {have}.",
  "requesting…": "solicitando…",
  "Request 1 devnet SOL": "Pedir 1 SOL de devnet",

  // ---- next move: live / settled / closed ---------------------------------
  "The clock is running": "El reloj corre",
  "{clock} left": "quedan {clock}",
  "Trade from the ticket, then survive the bite": "Opera desde el ticket y sobrevive a la mordida",
  "Pick LONG or SHORT, choose leverage and open a position — it settles in ~10ms, no fees.":
    "Elige LONG o SHORT, escoge el leverage y abre una posición: se liquida en ~10 ms, sin comisiones.",
  "Every {secs}s the pit force-closes one random player who is holding. Staying flat is a real defense.":
    "Cada {secs}s el pozo cierra a mercado a un jugador al azar que tenga posición. Quedarse plano es una defensa real.",
  "Close before the bell: the top three split the pot 60/25/15.":
    "Cierra antes del campanazo: los tres primeros se reparten el pozo 60/25/15.",
  "Round closed": "Ronda cerrada",
  "payout pending": "pago pendiente",
  "Commit the round back to Solana, then settle the podium":
    "Commitea la ronda de vuelta a Solana y luego liquida el podio",
  "Commit & undelegate: the final state travels back from the rollup to the base layer.":
    "Commit y undelegate: el estado final viaja del rollup a la capa base.",
  "The arena is already back on the base layer.": "La arena ya está de vuelta en la capa base.",
  "Settle: the escrow vault pays 60/25/15 to the top three, plus the last-one-standing bonus.":
    "Liquida: el vault en escrow paga 60/25/15 a los tres primeros, más el bono de último en pie.",
  "Round paid": "Ronda pagada",
  "{n} seats": "{n} asientos",
  "The podium took the pot — start the next one":
    "El podio se llevó el pozo: arranca la siguiente",
  "Back to the lobby": "Volver al lobby",

  // ---- bite / fever / last standing --------------------------------------
  "next bite": "próxima mordida",
  READY: "LISTA",
  "{n} holding risk · the pit takes one at random":
    "{n} con riesgo · el pozo se lleva a uno al azar",
  "nobody is holding · the pit has nothing to bite":
    "nadie tiene posición · el pozo no tiene a quién morder",
  "last one standing": "último en pie",
  you: "tú",
  "held into the bell · +{amount} SOL off the top":
    "aguantó hasta el campanazo · +{amount} SOL de la parte de arriba",
  fever: "fiebre",
  "{n}s · your orders execute inverted": "{n}s · tus órdenes se ejecutan invertidas",
  "THE PIT BIT YOU": "EL POZO TE MORDIÓ",
  "THE PIT BIT {name}": "EL POZO MORDIÓ A {name}",
  "BITE #{n}": "MORDIDA #{n}",
  "forced flat at market · VRF proof on-chain":
    "cerrado a mercado · prueba VRF on-chain",
  "bite #{n} · {who}": "mordida #{n} · {who}",
  tape: "cinta",

  // ---- leaderboard ---------------------------------------------------------
  Leaderboard: "Tabla",
  revealed: "revelada",
  "sealed by the enclave": "sellada por el enclave",
  "positions hidden": "posiciones ocultas",
  waiting: "esperando",
  "nobody yet — be the first": "todavía nadie: sé el primero",
  "{n} survived": "{n} sobrevividas",
  trade: "operación",
  trades: "operaciones",
  hidden: "oculta",
  sealed: "sellada",
  "mark-to-market equity": "equity marcado a mercado",
  "hidden until the bell": "oculto hasta el campanazo",

  // ---- ticket --------------------------------------------------------------
  "Trade ticket": "Ticket de operación",
  Status: "Estado",
  gasless: "sin gas",
  pressure: "presión",
  "Entry is open. When the host locks the arena it gets delegated to the rollup and every trade runs for free at 10ms.":
    "La entrada está abierta. Cuando el anfitrión bloquea, la arena se delega al rollup y cada operación corre gratis a 10 ms.",
  "Seat #{n} is yours. Waiting for the clock to start.":
    "El asiento #{n} es tuyo. Esperando que arranque el reloj.",
  "Your seat is still open — join from the panel above.":
    "Tu asiento sigue libre: únete desde el panel de arriba.",
  Leverage: "Leverage",
  "closing…": "cerrando…",
  "Close {side}": "Cerrar {side}",
  "not seated": "sin asiento",
  "sending…": "enviando…",
  "Open {side}": "Abrir {side}",
  "Notional {lev}× your equity. PnL is marked against the MagicBlock price feed and settles on Solana when the round closes.":
    "Notional de {lev}× tu equity. El PnL se marca contra el feed de MagicBlock y liquida en Solana al cerrar la ronda.",
  "Round closed. Podium settled from the escrow vault.":
    "Ronda cerrada. El podio se pagó desde el vault en escrow.",
  "View on explorer": "Ver en el explorer",

  // ---- lifecycle controls --------------------------------------------------
  "need 2+ players": "faltan 2+ jugadores",
  "delegating…": "delegando…",
  "Delegate to rollup": "Delegar al rollup",
  "ranking…": "calculando…",
  "End round": "Cerrar ronda",
  "calling the oracle…": "llamando al oráculo…",
  "Call the shock (VRF)": "Llamar la mordida (VRF)",
  "The pit bit seat #{n} — VRF drawn, flat at market.":
    "El pozo mordió al asiento #{n}: sorteo VRF, cerrado a mercado.",
  "sealing…": "sellando…",
  "Seal the pit (PER)": "Sellar el pozo (PER)",
  "revealing…": "revelando…",
  "Reveal the book": "Revelar el libro",
  "recording…": "registrando…",
  "Record round in series": "Registrar ronda en la serie",
  "Round already counted in the series standings.": "La ronda ya está contada en la serie.",
  "committing…": "commiteando…",
  "Commit & undelegate": "Commit y undelegate",
  "paying…": "pagando…",
  "Settle podium": "Liquidar podio",

  // ---- footer --------------------------------------------------------------
  "devnet · arena {key} · every state transition is a real transaction.":
    "devnet · arena {key} · cada transición de estado es una transacción real.",
  "The book is sealed inside the enclave (PER): a wallet outside the permission gets null for this account, token or not.":
    "El libro está sellado dentro del enclave (PER): una wallet fuera del permiso recibe null para esta cuenta, tenga token o no.",
  "Positions are hidden in this UI while the round runs; seal the pit to make them unreadable on-chain too.":
    "Las posiciones se ocultan en esta UI mientras corre la ronda; sella el pozo para que tampoco se lean on-chain.",

  // ---- arena guide ---------------------------------------------------------
  "The pot": "El pozo",
  "Every seat paid the same entry ({entry} SOL) and it all sits in one escrow vault. The podium splits it 60 / 25 / 15.":
    "Cada asiento pagó la misma entrada ({entry} SOL) y todo está en un vault en escrow. El podio lo reparte 60 / 25 / 15.",
  "The vault is a program-owned PDA. Settlement is a CPI from that account, so neither the host nor the winner can move the pot by hand.":
    "El vault es una PDA del programa. La liquidación es un CPI desde esa cuenta, así que ni el anfitrión ni el ganador pueden mover el pozo a mano.",
  "What to do right now": "Qué hacer ahora",
  "This panel always tells you the next move: join, invite the second player, lock. It changes with every state of the round.":
    "Este panel siempre te dice el siguiente paso: unirte, invitar al segundo jugador, bloquear. Cambia con cada estado de la ronda.",
  "This panel tells you what the round expects from you: trade, watch the bite, close before the bell.":
    "Este panel te dice qué espera la ronda de ti: operar, cuidar la mordida, cerrar antes del campanazo.",
  "This panel walks the payout: commit the state back to Solana, then settle the podium.":
    "Este panel te lleva por el pago: commitea el estado a Solana y luego liquida el podio.",
  "A round has four states on-chain — open, live, settled, closed — and each one allows different instructions. Guessing is how people lose money.":
    "Una ronda tiene cuatro estados on-chain —abierta, en vivo, liquidada, cerrada— y cada uno permite instrucciones distintas. Adivinar es como la gente pierde dinero.",
  "The leaderboard": "La tabla",
  "Your own PnL is marked to market. Everybody else shows “hidden” until the bell — that is the sealed book, not a bug.":
    "Tu PnL se marca a mercado. Los demás muestran “oculta” hasta el campanazo: es el libro sellado, no un bug.",
  "With the arena sealed inside the enclave, a wallet outside the permission gets null for the whole account, token or not. Your positions are private on-chain.":
    "Con la arena sellada dentro del enclave, una wallet fuera del permiso recibe null para toda la cuenta, tenga token o no. Tus posiciones son privadas on-chain.",
  "The ticket": "El ticket",
  "Pick LONG or SHORT, choose 1–5× leverage and open. The order executes inside the MagicBlock rollup: ~10ms and no gas.":
    "Elige LONG o SHORT, escoge leverage de 1–5× y abre. La orden se ejecuta dentro del rollup de MagicBlock: ~10 ms y sin gas.",
  "Trades never touch the base layer while the round runs, so there is no fee and no block wait. The price comes from the oracle read inside the rollup.":
    "Las operaciones no tocan la capa base mientras corre la ronda: no hay comisión ni espera de bloque. El precio sale del oráculo leído dentro del rollup.",
  "The bite is coming": "La mordida viene",
  "Every {secs}s the pit force-closes one random player who is holding a position. This bar is the countdown.":
    "Cada {secs}s el pozo cierra a mercado a un jugador al azar que tenga posición. Esta barra es la cuenta regresiva.",
  "The victim is drawn by the VRF oracle and the callback is identity-checked on-chain. Staying flat is a real defense: the pit only bites players with risk open.":
    "La víctima la sortea el oráculo VRF y el callback se valida por identidad on-chain. Quedarse plano es defensa real: el pozo solo muerde a quien tiene riesgo abierto.",
  "Lifecycle controls": "Controles del ciclo",
  "Join → lock → delegate → trade → end round → commit → settle. Each button is one real transaction, and anyone can push the permissionless ones.":
    "Unirse → bloquear → delegar → operar → cerrar ronda → commit → liquidar. Cada botón es una transacción real y cualquiera puede empujar las que no piden permiso.",
  "Delegate goes to the base layer, everything that touches the delegated arena goes to the rollup, and settle goes back to base. That layer rule is what makes it cheap and still final.":
    "Delegate va a la capa base, todo lo que toca la arena delegada va al rollup y settle vuelve a base. Esa regla de capas es lo que lo hace barato y aun así final.",
  "The feed": "El feed",
  "this round": "esta ronda",
  "entry": "entrada",
  "{side} entry @ {price}{approx}": "entrada {side} @ {price}{approx}",
  "positions revealed at the bell": "posiciones reveladas al campanazo",
  "one seat, no rival book to hide": "un asiento: no hay libro rival que esconder",
  "your entry is drawn · rivals stay sealed until the bell":
    "tu entrada se dibuja · los rivales siguen sellados hasta el campanazo",
};
