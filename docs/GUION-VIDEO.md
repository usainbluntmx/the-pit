# Guion — video demo (3–5 min)

Objetivo: **4:20**. Voz en español (tú), pantalla en ES. Una toma continua de la app real en devnet.
Todo lo que se dice aquí se puede verificar en pantalla o en el explorer.

---

## Antes de grabar (10 min)

1. **Dos wallets con SOL de devnet**: A = la que narra (con historial: JACKAL), B = la invitada.
   Usa dos perfiles de navegador o una ventana normal + una incógnita. Nunca muestres frases semilla.
2. **Mesa de ensayo**: crea una mesa de 2 asientos, 60 s, entrada 0.01 y deja que B se una.
   No la bloquees todavía: sirve para el arranque en frío.
3. **Perfil con datos**: la wallet A debe tener al menos una serie cerrada y una ronda pagada.
   Verifica `/profile` antes de grabar: puntos, PnL, rondas, mordidas e historial.
4. **Navegador**: 1920×1080, zoom 100 %, barra de marcadores oculta, notificaciones del sistema en
   "no molestar", pestañas extra cerradas. UI en ES (switch arriba a la derecha).
5. **Audio**: micrófono a un palmo, cuarto sin eco. Graba 10 s de silencio para limpiar después.
6. **Reloj**: cronómetro visible fuera de la captura (en el teléfono), no en pantalla.

---

## Guion

### 0:00 – 0:15 · Arranque en frío
**Pantalla:** landing. Cursor quieto. El tablero en vivo cambia el precio de SOL mientras hablas.
**Rótulo:** EL POZO · trading con mordida
**Voz:**
> Esto no es otro exchange. Es El Pozo: una mesa donde todos entran con los mismos mil créditos,
> tus posiciones están selladas y cada veinte segundos el mercado se lleva a alguien.

### 0:15 – 0:45 · Qué es
**Pantalla:** clic en "Jugar". Lobby con las tarjetas reales; pasa el cursor por una tarjeta
(entrada, pozo, asientos, estado). No hagas scroll de más.
**Rótulo:** una entrada · un pozo · 60/25/15
**Voz:**
> Este es el lobby. Cada tarjeta es una ronda real en devnet: la entrada, el pozo, los asientos que
> faltan y el estado. Aquí no hay bots: las mesas se llenan con wallets que invitas. La entrada de
> todos cae en un solo pozo y el contrato lo reparte sesenta, veinticinco y quince al podio.

### 0:45 – 1:15 · Entrar
**Pantalla:** "Conectar wallet" (si ya está conectada, desconecta y reconecta en cámara).
Luego "Pedir 1 SOL de devnet" y "Crear y fondear cuenta de trading" → una sola firma.
**Rótulo:** una firma y ya
**Voz:**
> Conecto mi wallet. La app me da SOL de devnet si me falta y crea una cuenta de trading desechable
> en el navegador: firmo una vez con mi wallet principal y de ahí en adelante las órdenes no abren
> popup. Es devnet, aquí no hay dinero real, pero el flujo es el mismo que en mainnet.

### 1:15 – 1:50 · Abrir la mesa
**Pantalla:** "Crear mesa" (2 asientos, 60 s, 0.01). Copia el link. Pégalo en la ventana de B y únete.
Vuelve a A: dos asientos ocupados. "Bloquear y arrancar".
**Rótulo:** la mesa pasa a la capa rápida
**Voz:**
> Creo una mesa: dos asientos, rondas de sesenta segundos, entrada de cero punto cero uno. Copio el
> link de invitación y lo abro con la segunda wallet. Al entrar, las dos entradas ya están en el pozo.
> Bloqueo la mesa: eso la manda a la capa rápida de MagicBlock, arranca el reloj y desde ahí todo
> corre dentro del rollup.

### 1:50 – 2:45 · Operar y sobrevivir
**Pantalla:** ticket → LONG, 3×, "Abrir LONG". La entrada se clava en la gráfica. Espera la mordida
(teeth + "EL POZO TE MORDIÓ"). Si sale fiebre, déjala correr y muestra el botón que se mueve.
**Rótulo:** 10 ms · sin comisión · el libro sellado
**Voz:**
> Aquí está lo que cambia el juego. Elijo LONG, tres equis, y abro. La orden entra en unos diez
> milisegundos y no cuesta comisión porque corre dentro del rollup. La gráfica avanza con el reloj y
> clava mi entrada en su precio exacto. Y cada veinte segundos viene la mordida: el oráculo de
> aleatoriedad elige a un jugador que tenga posición y lo cierra a mercado. Si te toca, te come la
> pantalla. Si sobrevives, la presión sube; y cuando llega la fiebre, tus órdenes corren al revés por
> veinte segundos: pides long y te sale short.

### 2:45 – 3:15 · Cerrar y pagar
**Pantalla:** "Cerrar ronda" → "Guardar y volver a Solana" → "Revelar posiciones" →
"Pagar al podio". Abre la transacción en el explorer y vuelve. Muestra la serie con puntos.
**Rótulo:** cada botón es una transacción
**Voz:**
> Al campanazo cierro la ronda. Guardo el estado de vuelta en Solana, revelo posiciones y pago al
> podio. Cada paso es una transacción de verdad: aquí está en el explorer. El pozo se reparte
> sesenta, veinticinco, quince, y la ronda se registra en la serie con puntos on-chain.

### 3:15 – 3:50 · El perfil
**Pantalla:** `/profile` con la wallet A. Baja despacio: puntos (y el cambio desde ayer), PnL,
rondas, mordidas, historial, tabla.
**Rótulo:** cero backend · cero cuenta
**Voz:**
> Y todo lo que hice queda en mi perfil sin que yo guarde nada: no hay backend ni cuenta. Los puntos
> salen de las series, el PnL es lo cobrado menos la entrada, las rondas ganadas y perdidas, las
> mordidas que aguanté, el historial y mi lugar en la tabla. Todo se reconstruye desde las cuentas
> del programa cada vez que conecto, incluso desde otra computadora.

### 3:50 – 4:15 · Por qué MagicBlock
**Pantalla:** vuelve a la landing, baja al bloque de piezas (rollup, privado, VRF, oráculo) o abre el
programa en el explorer.
**Rótulo:** las cuatro piezas
**Voz:**
> Lo que hace posible la mesa son cuatro piezas de MagicBlock: el rollup para que operar sea
> instantáneo y gratis, el entorno privado para que nadie lea tu libro, el VRF para que la mordida no
> se pueda amañar y el oráculo de precios para operar con precios frescos. Si quitas una, el juego no
> existe.

### 4:15 – 4:30 · Cierre
**Pantalla:** landing, links visibles (app, repo, programa).
**Rótulo:** the-pit.zerotwolabs.xyz · devnet
**Voz:**
> Es El Pozo, de Zero Two Labs. Programa, repo y app están abiertos y son devnet. Entra con tu
> wallet, crea una mesa e invita a alguien: el pozo muerde a los veinte segundos.

---

## Lo que NO se dice

- No digas "mainnet" ni insinúes dinero real: es devnet.
- No digas "cien por ciento privado". Di "sellado dentro del entorno privado": es lo que hace el TEE.
- No prometas rendimientos ni APR. El PnL del perfil es histórico, no una proyección.
- No llames "bots" a los rivales ni inventes jugadores: si una mesa está vacía, se dice.
- No leas la pantalla palabra por palabra; di lo que significa.

## Plan B (si falla la segunda wallet)

- Graba la misma secuencia en **"Jugar solo"**: un asiento, sin invitación, y la mordida te toca
  siempre que tengas posición. Cambia solo la frase de 1:15–1:50: "abro una corrida solo, la bloqueo
  y el mercado es la contraparte".
- Si el rollup tarda en arrancar, corta y repite el bloque; no narres la espera.

## Después de grabar

1. Sube el master a YouTube (no listado) o Loom y usa ese link en el formulario.
2. Guarda el archivo en `docs/demo.mp4` y la versión sin voz en `docs/demo-sin-voz.mp4`.
3. Si el video queda en 4:30, no lo estires: el jurado ve los primeros 40 segundos dos veces.
