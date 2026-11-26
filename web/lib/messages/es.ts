import type { Copy } from "./en";

/**
 * Spanish copy (Mexico). Same shape as `en`, enforced by the `Copy` type.
 * Brand words stay: PIT. Game nouns are translated consistently:
 * bite = mordida, pot = pozo, seat = asiento, fever = fiebre, series = serie.
 *
 * House style: se le habla al jugador, frases cortas, primero el beneficio y
 * después el mecanismo. Un término técnico solo entra si la frase siguiente lo
 * explica en palabras normales. Nada de prometer más de lo que hace el programa:
 * los créditos son virtuales, el SOL es de devnet y la mordida es al azar pero
 * comprobable.
 */
export const es: Copy = {
  common: {
    devnet: "solana devnet",
    play: "Jugar en devnet",
    close: "Cerrar",
    copied: "copiada",
    copyAddress: "copiar dirección",
    disconnect: "desconectar",
    guide: "? guía",
    backToLanding: "volver a la landing",
    replayTour: "Repetir el tour guiado",
    startTour: "Empezar el tour guiado",
    airdropFailed: (message: string) => `${message} — también puedes usar https://faucet.solana.com`,
  },
  nav: {
    how: "cómo se juega",
    bite: "la mordida",
    stack: "por qué se siente rápido",
    play: "Jugar en devnet",
    profile: "Tu perfil",
  },
  hero: {
    kicker: "Entertainment finance · juegos de trading",
    titleA: "El mercado",
    titleEm: "muerde de vuelta.",
    lede:
      "Ocho jugadores, los mismos 1,000 créditos y un solo reloj. Las órdenes entran en el momento en que las tocas, no cuestan nada y quedan ocultas hasta que termina la ronda. Cada pocos segundos el pozo saca del mercado a un jugador: al azar y comprobable por cualquiera. Los tres primeros se reparten el pozo.",
    ctaPrimary: "Entrar a una arena",
    ctaSolo: "Jugar solo",
    ctaGhost: "Ver cómo se juega",
    stats: [
      { v: "Al instante", l: "la orden entra en cuanto la tocas" },
      { v: "Sin comisiones", l: "operar no cuesta nada durante la ronda" },
      { v: "Privado", l: "nadie ve tus jugadas hasta el final" },
      { v: "Justo", l: "el mordido se sortea al azar" },
    ],
  },
  how: {
    kicker: "el ciclo",
    title: "Un bankroll, un mercado, un ganador.",
    steps: [
      {
        n: "01",
        t: "Toma un asiento",
        d: "Todos pagan la misma entrada y arrancan con 1,000 créditos. No hay nada más que depositar ni leverage real: lo único que está en juego es el asiento que compraste.",
      },
      {
        n: "02",
        t: "Arranca el reloj",
        d: "La mesa pasa a una capa más rápida hecha por MagicBlock. Las órdenes entran en unos diez milisegundos y no cuestan nada, al precio real del mercado.",
      },
      {
        n: "03",
        t: "El pozo muerde",
        d: "Cada pocos segundos el pozo cierra a un jugador que tenga una posición abierta. Se elige al azar, con un sorteo que cualquiera puede revisar. Quedarse fuera del mercado es una defensa real.",
      },
      {
        n: "04",
        t: "El podio",
        d: "Al campanazo todo se guarda de vuelta en Solana, se destapan las posiciones y el pozo paga a los tres primeros: 60, 25 y 15 por ciento.",
      },
    ],
  },
  bite: {
    kicker: "el giro que nadie más tiene",
    title: "Cuando sube la presión, pierdes el control.",
    sub:
      "Que te muerdan, cerrar en pérdida y aguantar demasiado suben tu **presión**. Al llegar a 100 entras en **fiebre** durante 20 segundos: tus órdenes corren al revés. Pides long y te sale short. El programa de verdad les da la vuelta, no es un efecto visual.",
    pressure: "presión",
    fever: "fiebre",
    feverLine: "“▞▚▞ EL ROJO NO EXISTE ▞▚▞”",
    feverSub: "15 s · tus órdenes corren al revés",
    hint:
      "La línea de delirio sale de una semilla del propio juego, no de un modelo: la misma fiebre siempre escribe la misma frase.",
    rules: [
      { b: "+40", t: "el pozo te saca de una operación" },
      { b: "+25", t: "cierras una operación con más de 20 créditos de pérdida" },
      { b: "−30", t: "cierras en ganancia" },
      { b: "100", t: "fiebre: 20 segundos con las órdenes al revés y luego todo normal" },
    ],
  },
  stack: {
    kicker: "por qué se siente instantáneo",
    title: "Cuatro piezas de MagicBlock, cada una haciendo trabajo real.",
    cards: [
      {
        k: "Capa rápida",
        d: "Mientras la ronda está viva, la mesa corre en un rollup de MagicBlock: unos 10 ms por orden y sin comisiones. Al campanazo todo vuelve a Solana.",
        tag: "10 ms · sin comisiones",
      },
      {
        k: "Modo privado",
        d: "Tus posiciones quedan selladas en un entorno privado. Quien está fuera de la mesa las pide y no recibe nada — probado en devnet, con token válido y sin él.",
        tag: "sellado de verdad",
      },
      {
        k: "Sorteo comprobable",
        d: "Al mordido lo elige un oráculo de aleatoriedad y cualquiera puede revisar el sorteo después. Un resultado falso lo rechaza el programa.",
        tag: "nadie puede amañarlo",
      },
      {
        k: "Precios reales",
        d: "Los precios vienen de Pyth y se leen dentro de la capa rápida, así que operas con lo que el mercado está haciendo de verdad, no con un número que inventó la casa.",
        tag: "precio de mercado en vivo",
      },
    ],
  },
  series: {
    kicker: "más allá de una ronda",
    title: "Serie: tres rondas, puntos escritos por el programa.",
    rounds: "3/3 rondas",
    podiums: "3 podios",
    sub:
      "Nadie guarda estos puntos en un servidor: los escribe el programa. Podio 10/6/3, uno más por cada mordida que sobrevivas con posición abierta y dos por aguantar hasta el final.",
    rules: [
      { b: "10 / 6 / 3", t: "por terminar en el podio" },
      { b: "+1", t: "por cada mordida que sobrevives con posición abierta" },
      { b: "+2", t: "por aguantar solo hasta el campanazo" },
      { b: "10%", t: "del pozo se lo lleva quien aguanta solo hasta el campanazo" },
    ],
  },
  final: {
    title: "Mismo bankroll. Precios reales. Tus nervios.",
    text:
      "Corre en devnet de Solana. Conecta Phantom, Solflare o Backpack, pide SOL gratis de devnet con un botón y trae a un amigo: una mesa necesita dos jugadores para arrancar.",
    program: "Ver el contrato",
  },
  footer: {
    built: "hecho con MagicBlock · entertainment finance",
  },
  status: {
    open: "abierta",
    live: "en vivo",
    settled: "pagada",
    closed: "cerrada",
  },
  guideUi: {
    stepOf: (current: number, total: number) => `paso ${current} / ${total}`,
    skip: "saltar tour",
    why: "Por qué:",
    back: "atrás",
    gotIt: "entendido",
    next: "siguiente →",
    aria: "Tour guiado",
  },
  play: {
    titleA: "Mismo bankroll.",
    titleB: "Precios reales.",
    titleEm: "Un pozo.",
    lede:
      "Todos arrancan con 1,000 créditos y el mismo reloj. Las órdenes entran al instante, no cuestan nada y quedan ocultas hasta que termina la ronda; los tres primeros se reparten el pozo. También puedes jugar solo contra el mercado.",
    connectTitle: "Conecta tu wallet",
    noWallet: "No hay ninguna wallet de Solana en este navegador. Instala una y recarga:",
    connecting: "conectando…",
    connectWith: (label: string) => `Conectar ${label}`,
    getWallet: (label: string) => `Instalar ${label}`,
    connectHint:
      "Tus llaves nunca salen de tu wallet: la app solo le pide que firme. Necesitas un poco de SOL de devnet para la entrada, y aquí mismo aparece un botón de faucet gratis cuando conectas.",
    tradingTitle: "Cuenta de trading",
    tradingBody:
      "Una wallet creada aquí en tu navegador y fondeada por nosotros, para que autorices una vez en lugar de firmar cada orden. Tu wallet principal la autoriza con una sola firma. Solo devnet: retira el saldo antes de borrar los datos del sitio.",
    tradingCreate: "Crear y fondear cuenta de trading",
    tradingCreating: "creando…",
    tradingActive: "Cuenta de trading activa",
    tradingWithdraw: "Retirar a mi wallet",
    tradingUseMain: "Usar mi wallet principal",
    tradingUseAccount: "Usar cuenta de trading",
    tradingFunded: "Fondeada con {amount} SOL",
    tradingNote:
      "Solo devnet: la llave vive en este navegador. Retira el saldo antes de borrar los datos del sitio.",
    lowBalance: "Saldo de devnet bajo",
    requesting: "solicitando…",
    requestOne: "Pedir 1 SOL de devnet",
    airdropRequested: "1 SOL pedido al faucet de devnet",
    connectedWith: (label: string) => `${label} conectada`,
    connectToEnter: "Conecta una wallet para entrar a una arena",
    emptyBoard:
      "No hay mesas públicas ahora mismo. Las que tú hospedes aparecen aquí en cuanto se crean.",
    players: (n: number, max: number) => `${n}/${max} jugadores`,
    entry: (amount: string) => `entrada ${amount} SOL`,
    results: "resultados →",
    open: "abrir →",
    yourArenas: "Tus mesas",
    thisBrowser: "este navegador",
    series: "Serie",
    pointsOnChain: "puntos escritos por el programa",
    rounds: (n: number, max: number) => `${n}/${max} rondas`,
    noRounds: "todavía no hay rondas registradas",
    standings: (podiums: number, survived: number, bites: number) =>
      `${podiums} podios · ${survived} sobrevividas · ${bites} mordidas`,
    pts: (n: number) => `${n} pts`,
    hostTitle: "Hospeda una mesa",
    baseLayer: "en Solana",
    entryFee: "Entrada (SOL)",
    roundSeconds: "Ronda (segundos)",
    seatsLabel: "Asientos",
    marketLabel: "Mercado",
    modeLabel: "Modo",
    modeArena: "Arena · 2–8 jugadores",
    modeSolo: "Solo · contra el mercado",
    modeArenaHint:
      "De dos a ocho wallets, un pozo compartido y tres asientos que cobran. El podio se lleva 60, 25 y 15 por ciento.",
    modeArenaMeta: "2–8 jugadores · invita a un rival",
    modeSoloHint:
      "Un asiento contra el mercado. Si terminas arriba de 1,000 créditos, la casa te paga hasta 3× tu entrada; si terminas abajo, se la queda. Aquí no hay sorteo: mientras tengas posición abierta, la mordida te toca siempre.",
    modeSoloMeta: "1 asiento · sin invitación · hasta 3×",
    playSolo: "Jugar solo · contra el mercado",
    playArena: "Ver mesas abiertas",
    soloBadge: "solo",
    hostHintSolo:
      "Una corrida solo tiene un asiento: tú contra el mercado. La casa es la otra parte de la operación — te paga hasta 3× tu entrada si terminas arriba de 1,000 créditos y se la queda si no. Bloquea la mesa para arrancar el reloj — y recuerda que aquí no hay sorteo: mientras tengas posición abierta, la mordida te toca siempre.",
    seriesToggle: "Serie · 3 rondas, los puntos se acumulan",
    singleToggle: "Una sola ronda",
    create: "Crear mesa",
    createSolo: "Crear corrida solo",
    creating: "creando…",
    hostHint:
      "Tu mesa vive en Solana. Al unirte, la entrada va a un pozo compartido que solo el programa puede mover. Al bloquearla, la mesa pasa a la capa rápida y ahí operar es gratis. Las mesas se llenan con jugadores reales —no hay bots—, así que invita a alguien antes de bloquear.",
    footerConnected: (label: string) =>
      `Conectado con ${label} en devnet. Cada movimiento —unirte, operar, cobrar— es una transacción que firma tu wallet. Contrato: `,
    footerDisconnected:
      "Conecta una wallet de Solana para jugar. Nada es custodial: la app nunca ve tus llaves. Contrato: ",
    guide: {
      wallet: {
        title: "Esta es tu wallet",
        body: "Conecta Phantom, Solflare o Backpack. La dirección y el saldo de la derecha son tuyos. También puedes crear aquí una cuenta de trading para no firmar cada orden.",
        why: "La app nunca guarda tus llaves: firma tu wallet y se queda en la extensión. Si te falta SOL de devnet, el botón de faucet gratis aparece justo aquí.",
      },
      board: {
        title: "El tablero",
        body: "ABIERTA significa que quedan asientos, EN VIVO que la ronda ya corre y CERRADA que el pozo ya se pagó.",
        why: "El tablero lee Solana y las capas rápidas al mismo tiempo. Una mesa que está corriendo no aparece en Solana, así que con una sola fuente se esconderían todas las rondas en vivo.",
      },
      enter: {
        title: "Entra a una mesa",
        body: "Toca una tarjeta para abrir esa mesa. La URL se vuelve /play?arena=… para que puedas mandarle la mesa exacta a otro jugador.",
        why: "Una ronda no puede arrancar sola: necesita dos jugadores. El link de invitación es cómo entra la segunda wallet.",
      },
      host: {
        title: "Hospeda tu propia mesa",
        body: "Elige la entrada, cuánto dura la ronda y cuántos asientos, y créala. Como anfitrión arrancas el reloj cuando hay al menos dos jugadores.",
        why: "La entrada va a un pozo compartido que es del programa, no tuyo. El anfitrión puede arrancar el reloj, pero nunca tocar el pozo.",
      },
    },
  },
};
