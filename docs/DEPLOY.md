# Deploy del frontend en Dokploy

Runbook para publicar `web/` (Next.js 15) en un servidor propio con Dokploy.
No hay secretos: la llave del jugador se genera en el navegador y vive en
`localStorage`; el servidor solo sirve HTML/JS.

## Datos que usa este deploy

| Dato | Valor |
|---|---|
| Repo | `https://github.com/usainbluntmx/the-pit` (público, rama `main`) |
| Carpeta de la app | `web/` |
| Build | `npm ci` + `next build` (Nixpacks) |
| Start | `next start -p 3000` |
| Puerto del contenedor | **3000** |
| Node | 20.x (`engines` en `web/package.json`) |

## 0. Antes de tocar Dokploy

1. DNS: registro `A` de `pit.tudominio.com` → IP del servidor Dokploy.
   Si usas Cloudflare, déjalo en **DNS only** (nube gris) hasta que Let's Encrypt
   emita el certificado; después puedes activar el proxy.
2. Puertos 80 y 443 abiertos en el firewall del servidor (Traefik los necesita).

## 1. Conectar el repo

- Con GitHub App: **Settings → Git Sources → GitHub**, autoriza la organización o
  cuenta `usainbluntmx` e instala la app sobre el repo `the-pit`. Esto habilita
  auto-deploy por push.
- Sin GitHub App (repo público): en el paso 3 elige provider **Git** y pega
  `https://github.com/usainbluntmx/the-pit.git`. Funciona igual, pero sin webhook.

## 2. Crear el servicio

1. **Projects → Create Project**: nombre `the-pit`.
2. Dentro del proyecto: **Create Service → Application**.
3. Name: `pit-web`.

## 3. General

| Campo | Valor |
|---|---|
| Provider | GitHub (o Git, ver paso 1) |
| Owner | `usainbluntmx` |
| Repository | `the-pit` |
| Branch | `main` |
| **Build Path** | **`/web`** |
| Watch Paths (opcional) | `/web/**` |

`Build Path` es el punto crítico: el repo tiene el programa Anchor en la raíz y el
frontend en `web/`. Si se deja `/`, Nixpacks intenta instalar el paquete de la raíz
(cliente de scripts, sin build de Next) y falla.

## 4. Build

- **Build Type**: `Nixpacks` (default).
- **Publish Directory**: **vacío**. Si se llena, Dokploy trata la app como estática,
  la copia a NGINX y el App Router deja de funcionar.
- Node lo toma de `engines` (`20.x`). Si la versión de Dokploy ignora `engines`,
  define `NIXPACKS_NODE_VERSION=20` en Environment.
- `web/nixpacks.toml` fuerza `npm ci --include=dev`: Nixpacks construye con
  `NODE_ENV=production` y sin eso se omiten las devDependencies (TypeScript) y el
  build falla. No hace falta tocar nada en el panel.

## 5. Environment (opcional)

El código ya trae estos valores por defecto, así que la app funciona sin variables.
Definirlas solo sirve para apuntar a otro cluster:

```
NEXT_PUBLIC_BASE_RPC=https://rpc.magicblock.app/devnet
NEXT_PUBLIC_ROUTER=https://devnet-router.magicblock.app/
NEXT_PUBLIC_TEE_URL=https://devnet-tee.magicblock.app
```

- Son variables **públicas** (`NEXT_PUBLIC_`), no secretos.
- Se **inlinean en el build**: cambiarlas exige redeploy completo, no un restart.
- Dokploy pasa las variables del servicio al build de Nixpacks (`nixpacks build --env`),
  así que quedan horneadas en el bundle como corresponde.

## 6. Primer deploy

Botón **Deploy**. En los logs se ve: `npm ci` → `next build` → `next start`.
Un build sano termina con:

```
Route (app)
┌ ○ /            161 B    106 kB
├ ○ /_not-found  995 B    104 kB
└ ○ /play        353 kB    459 kB
```

Si el build muere por memoria en un VPS chico, agrega en Environment:
`NODE_OPTIONS=--max-old-space-size=2048`.

## 7. Dominio

**Domains → Add Domain**:

| Campo | Valor |
|---|---|
| Host | `pit.tudominio.com` |
| Path | `/` |
| Internal Path | `/` |
| Container Port | **3000** |
| HTTPS | activado |
| Certificate Provider | `letsencrypt` |

Guardar. Los cambios de dominio en Applications no requieren redeploy (Traefik lee
la config por file provider y recarga en caliente).

## 8. Verificación

```bash
curl -I https://pit.tudominio.com        # 200
curl -I https://pit.tudominio.com/play   # 200
```

En el navegador:

1. `/` debe mostrar la landing con las cuatro cifras (10ms, 0 fees, sealed, VRF).
2. `/play` debe listar las arenas de devnet y mostrar el precio del feed.
3. Crear una arena, unirse y abrir un trade: si el precio se mueve, el navegador
   está hablando con el RPC de MagicBlock (todo el tráfico on-chain sale del cliente).

## 9. Auto-deploy

Con GitHub App conectada, activa **Auto Deploy** en General. Cada push a `main`
dispara build y deploy. Sin GitHub App, usa el webhook que muestra Dokploy en
**Deployments → Webhook**.

## Troubleshooting

- **`Cannot find module 'typescript'` o falla el type-check**: el install omitió
  devDependencies. Define `NIXPACKS_INSTALL_CMD=npm ci --include=dev`.
- **`package.json not found`**: `Build Path` mal puesto (debe ser `/web`).
- **502 / 504 en el dominio**: el Container Port del dominio no es 3000, o el
  contenedor no arrancó (revisar Logs).
- **La página carga pero el lobby queda vacío**: el navegador no pudo hablar con el
  RPC; revisar la consola del cliente y que `NEXT_PUBLIC_BASE_RPC` sea https.
- **HTTPS no emite**: DNS sin propagar o Cloudflare con proxy activo durante la
  emisión. Pon la nube en gris, reintenta, y luego reactiva el proxy.
- **El deploy viejo sigue vivo**: revisar **Deployments** — un build fallido no
  reemplaza el contenedor anterior.
