import type { Copy } from "./en";

/**
 * Spanish copy (Mexico). Same shape as `en`, enforced by the `Copy` type.
 * Brand words stay: PIT, Blitz. Game nouns are translated consistently:
 * bite = mordida, pot = pozo, seat = asiento, fever = fiebre, series = serie.
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
    how: "cómo funciona",
    bite: "la mordida",
    stack: "stack",
    play: "Jugar en devnet",
  },
  hero: {
    kicker: "Entertainment finance · Blitz v10",
    titleA: "El mercado",
    titleEm: "muerde de vuelta.",
    lede:
      "Competencias de trading en Solana donde todos arrancan con el mismo bankroll y el mismo reloj. Las órdenes se liquidan en un rollup de MagicBlock —sin gas, en 10 ms—, el libro queda sellado dentro de un enclave hasta el campanazo y cada pocos segundos el pozo saca a mercado a un jugador al azar que esté aguantando riesgo. Los tres primeros se reparten el escrow.",
    ctaPrimary: "Entrar a una arena",
    ctaSolo: "Jugar solo",
    ctaGhost: "Ver el ciclo",
    stats: [
      { v: "10 ms", l: "latencia por orden en el rollup" },
      { v: "0 comisiones", l: "sin gas mientras corre la ronda" },
      { v: "sellado", l: "posiciones ocultas por el enclave" },
      { v: "VRF", l: "la mordida es aleatoria y verificable" },
    ],
  },
  how: {
    kicker: "el ciclo",
    title: "Un bankroll. Un mercado. Un ganador.",
    steps: [
      {
        n: "01",
        t: "Toma un asiento",
        d: "Todos pagan la misma entrada a un vault en escrow y arrancan con 1,000 créditos. Sin depósitos, sin leverage real.",
      },
      {
        n: "02",
        t: "Suena la campana",
        d: "La arena se delega a un rollup de MagicBlock. Desde ahí cada orden es gratis y cae en ~10 ms contra el feed de precio en vivo.",
      },
      {
        n: "03",
        t: "El pozo muerde",
        d: "Cada pocos segundos el oráculo elige a un jugador que tenga posición abierta y lo cierra a mercado. Nadie lo ve venir.",
      },
      {
        n: "04",
        t: "El podio",
        d: "Al campanazo la ronda se commitea a Solana, se destapan las posiciones y el escrow paga 60/25/15 a los tres primeros.",
      },
    ],
  },
  bite: {
    kicker: "la mecánica que nadie más tiene",
    title: "La presión le quita el control a los agentes.",
    sub:
      "Que te muerda el pozo, cerrar en pérdida y aguantar demasiado acumula **presión**. Al llegar a 100 el asiento entra en **fiebre** durante 20 segundos: sus órdenes se ejecutan invertidas. Pides long y se abre short. No es decorativo: el programa voltea el lado on-chain.",
    pressure: "presión",
    fever: "fiebre",
    feverLine: "“▞▚▞ EL ROJO NO EXISTE ▞▚▞”",
    feverSub: "15 s · órdenes invertidas",
    hint:
      "La línea de delirio la genera el juego con un seed, no un modelo: la misma fiebre produce el mismo texto.",
    rules: [
      { b: "+40", t: "el pozo te saca de una posición" },
      { b: "+25", t: "cierras una operación con más de 20 créditos de pérdida" },
      { b: "−30", t: "cierras en verde" },
      { b: "100", t: "fiebre: 20 segundos con órdenes invertidas y de regreso a la cordura" },
    ],
  },
  stack: {
    kicker: "bajo el capó",
    title: "Cuatro piezas de MagicBlock, cada una haciendo trabajo real.",
    cards: [
      {
        k: "Ephemeral Rollup",
        d: "Las órdenes se ejecutan fuera de la capa base a ~10 ms y no cuestan nada. La arena se delega durante la ronda y se commitea de vuelta al campanazo.",
        tag: "10 ms · sin gas",
      },
      {
        k: "Private ER (TEE)",
        d: "El libro queda sellado dentro del enclave. Una wallet fuera del permiso recibe null para la arena, tenga token o no. Verificado en devnet.",
        tag: "permiso aplicado",
      },
      {
        k: "Oráculo VRF",
        d: "La mordida elige a su víctima con aleatoriedad verificable. El callback se valida por identidad, así que un callback falsificado se rechaza on-chain.",
        tag: "verificable",
      },
      {
        k: "Feed de precio",
        d: "Las posiciones se marcan contra el oráculo de MagicBlock, leído dentro del rollup. En la capa base el mismo feed está viejo: de eso se trata.",
        tag: "precios on-chain",
      },
    ],
  },
  series: {
    kicker: "más allá de una ronda",
    title: "Serie: tres rondas, puntos on-chain.",
    rounds: "3/3 rondas",
    podiums: "3 podios",
    sub:
      "Los puntos los escribe el programa, no un servidor: podio 10/6/3, más uno por cada mordida sobrevivida aguantando posición, más dos por ser el último en pie.",
    rules: [
      { b: "10 / 6 / 3", t: "podio" },
      { b: "+1", t: "por mordida sobrevivida" },
      { b: "+2", t: "último en pie al campanazo" },
      { b: "10%", t: "del pozo para quien aguante solo hasta el campanazo" },
    ],
  },
  final: {
    title: "Mismo bankroll. Precios reales. Tus nervios.",
    text:
      "Corre en devnet de Solana. Conecta Phantom, Solflare o Backpack, agarra SOL de devnet en el faucet y trae a un amigo: una arena necesita dos asientos para arrancar.",
    program: "Leer el programa",
  },
  footer: {
    built: "hecho para Solana Blitz v10 · entertainment finance",
  },
  status: {
    open: "abierta",
    live: "en vivo",
    settled: "liquidada",
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
      "Una arena de trading donde todos arrancan con 1,000 créditos y diez minutos en el reloj. Las órdenes se ejecutan dentro de un rollup de MagicBlock —sin gas, en 10 ms— y el podio se reparte el escrow. Tu libro queda sellado hasta el campanazo.",
    connectTitle: "Conecta una wallet",
    noWallet: "No se detectó ninguna wallet de Solana en este navegador. Instala una y recarga:",
    connecting: "conectando…",
    connectWith: (label: string) => `Conectar ${label}`,
    getWallet: (label: string) => `Instalar ${label}`,
    connectHint:
      "Tus llaves nunca salen de la extensión: la app solo le pide firmar transacciones y el challenge del enclave. Necesitas SOL de devnet para pagar la entrada; al conectar aparece un botón de airdrop debajo de la wallet.",
    tradingTitle: "Trading account",
    tradingBody:
      "Una wallet de devnet aparte, generada en este navegador y fondeada por nosotros. Tu wallet principal firma un solo mensaje para vincularla; de ahí en adelante cada orden la firma la trading account, así no apruebas un popup por operación.",
    tradingCreate: "Crear y fondear trading account",
    tradingCreating: "creando…",
    tradingActive: "Trading account activa",
    tradingWithdraw: "Retirar a mi wallet",
    tradingUseMain: "Usar mi wallet principal",
    tradingUseAccount: "Usar trading account",
    tradingFunded: "Fondeada con {amount} SOL",
    tradingNote:
      "Solo devnet: la llave vive en este navegador. Retira el saldo antes de borrar los datos del sitio.",
    lowBalance: "Saldo de devnet bajo",
    requesting: "solicitando…",
    requestOne: "Pedir 1 SOL de devnet",
    airdropRequested: "1 SOL solicitado al faucet de devnet",
    connectedWith: (label: string) => `${label} conectada`,
    connectToEnter: "Conecta una wallet para entrar a una arena",
    emptyBoard:
      "no hay arenas públicas en el tablero ahora mismo. Las arenas hospedadas aparecen aquí cuando liquidan en la capa base.",
    players: (n: number, max: number) => `${n}/${max} jugadores`,
    entry: (amount: string) => `entrada ${amount} SOL`,
    results: "resultados →",
    open: "abrir →",
    yourArenas: "Tus arenas",
    thisBrowser: "este navegador",
    series: "Serie",
    pointsOnChain: "puntos on-chain",
    rounds: (n: number, max: number) => `${n}/${max} rondas`,
    noRounds: "todavía no hay rondas registradas",
    standings: (podiums: number, survived: number, bites: number) =>
      `${podiums} podios · ${survived} sobrevividas · ${bites} mordidas`,
    pts: (n: number) => `${n} pts`,
    hostTitle: "Hospeda una arena",
    baseLayer: "capa base",
    entryFee: "Entrada (SOL)",
    roundSeconds: "Ronda (segundos)",
    seatsLabel: "Asientos",
    marketLabel: "Mercado",
    modeLabel: "Modo",
    modeArena: "Arena · 2–8 jugadores",
    modeSolo: "Solo · contra el mercado",
    modeArenaHint:
      "De dos a ocho wallets, un solo pozo y tres asientos pagados. El podio reparte 60/25/15.",
    modeArenaMeta: "2–8 jugadores · invita a un rival",
    modeSoloHint:
      "Un asiento contra el mercado. La casa paga hasta 3× tu entrada si le ganas al mercado, y se la queda si terminas debajo de 1,000 créditos.",
    modeSoloMeta: "1 asiento · sin invitación · hasta 3×",
    playSolo: "Jugar solo · contra el mercado",
    playArena: "Ver arenas abiertas",
    soloBadge: "solo",
    hostHintSolo:
      "Una corrida solo tiene un asiento: tú contra el feed de Pyth. La casa (PDA del programa) es la contraparte: paga hasta 3× tu entrada si le ganas al mercado, y se la queda si terminas debajo de 1,000 créditos. Igual hay que bloquear la arena para arrancar el reloj.",
    seriesToggle: "Serie · 3 rondas, puntos acumulados",
    singleToggle: "Ronda suelta",
    create: "Crear arena",
    createSolo: "Crear corrida solo",
    creating: "creando…",
    hostHint:
      "La arena es una PDA en Solana. Unirse paga la entrada a un vault; bloquear delega la cuenta a un rollup de MagicBlock donde operar no cuesta nada. Las arenas se llenan solo con wallets reales: ningún bot entra por su cuenta, así que invita a un segundo jugador antes de bloquear.",
    footerConnected: (label: string) =>
      `Conectado con ${label} en devnet. Cada acción —unirse, operar, liquidar— es una transacción firmada por tu wallet. Programa: `,
    footerDisconnected:
      "Conecta una wallet de Solana para jugar. Nada es custodia: la app nunca ve tus llaves. Programa: ",
    guide: {
      wallet: {
        title: "Esta es tu wallet",
        body: "Conecta Phantom, Solflare o Backpack. La dirección y el saldo de SOL de la derecha son tuyos; la app también puede derivar una trading account desechable para que no firmes cada orden con ella.",
        why: "Nada es custodia: cada transacción se firma dentro de tu extensión (o con la llave de la trading account en este navegador) y el token del enclave se firma igual. Si el saldo está bajo, el botón de airdrop aparece aquí mismo.",
      },
      board: {
        title: "El tablero",
        body: "ABIERTA significa que hay asientos, EN VIVO que la ronda ya corre en el rollup y CERRADA que el pozo ya se pagó.",
        why: "La lista fusiona la capa base de Solana con los tres rollups de devnet: una arena delegada desaparece del escaneo base, así que una sola fuente escondería cada ronda en vivo.",
      },
      enter: {
        title: "Entra a una mesa",
        body: "Haz clic en una tarjeta para abrir esa arena. La URL se convierte en /play?arena=… para que le mandes la mesa exacta a otro jugador.",
        why: "Una ronda no puede arrancar sola: necesita dos asientos. El link de invitación es cómo entra la segunda wallet.",
      },
      host: {
        title: "Hospeda tu propia arena",
        body: "Elige entrada, duración y asientos, y crea. Como anfitrión bloqueas la arena cuando ya hay al menos dos jugadores sentados.",
        why: "La entrada va a un vault en escrow que pertenece al programa, no a ti. El anfitrión puede arrancar el reloj pero nunca tocar el pozo.",
      },
    },
  },
};
