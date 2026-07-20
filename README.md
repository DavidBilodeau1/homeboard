# HomeBoard

A self-hosted family dashboard (smart-calendar style) for **Home Assistant**, running
outside the HA ecosystem as its own Docker container. Single-page app, live-reactive:
it talks to the HA REST API through a small Node proxy (your token never reaches the
browser) and receives instant updates over the HA WebSocket API.

## Features

- **Dashboard** — month calendar + day events, photo slideshow, per-person task
  progress, weather, meal/shopping lists, reward stars
- **Calendar** — full month view with colored event chips per HA calendar
- **Tasks / Lists / Meals** — HA `todo` lists: check off, add, delete items
- **Rewards** — HA `counter` helpers with +/− buttons
- **Photos** — fullscreen slideshow from a mounted folder
- Live updates via WebSocket (state changes appear within ~1s), 5-min polling fallback
- **Mock mode** — runs with demo data when `HA_URL`/`HA_TOKEN` are not set

## Quick start (Docker)

```bash
cp .env.example .env             # then paste your HA long-lived access token
cp config/config.example.json config/config.json   # then edit for your entities
docker compose up -d --build
# open http://<server>:8090
```

Get a token in HA: click your user (bottom-left) → **Security** →
**Long-lived access tokens** → *Create token*.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `HA_URL` | — | Home Assistant base URL, e.g. `https://ha.example.com` |
| `HA_TOKEN` | — | Long-lived access token |
| `PORT` | `8090` | HTTP port inside the container |
| `MOCK` | `0` | `1` forces demo data (also used when URL/token missing) |
| `CONFIG_PATH` | `/app/config/config.json` | Dashboard configuration |
| `PHOTOS_DIR` | `/app/photos` | Local folder fallback for slideshow images |
| `IMMICH_URL` | — | Immich base URL, e.g. `https://photos.example.com` |
| `IMMICH_API_KEY` | — | Immich API key (Account Settings → API Keys) |
| `IMMICH_ALBUM` | `Wallpanel` | Immich album name to use for the slideshow |
| `EDITOR_ENABLED` | `1` | `0` makes the Settings config editor read-only |
| `PUBLIC_URL` | — | HomeBoard's own external URL; **setting it enables login** |
| `AUTH_ENABLED` | auto | `0` forces auth off even when `PUBLIC_URL` is set |
| `SESSION_SECRET` | auto | Cookie-signing secret (auto-generated & persisted if unset) |

## Authentication — "Log in with Home Assistant"

HomeBoard has no accounts of its own; it authenticates against **your** Home
Assistant using its OAuth2 (IndieAuth) flow — the same "Log in with Home
Assistant" your HA companion apps use.

**Enabling it:** set `PUBLIC_URL` to HomeBoard's own externally reachable URL
(e.g. `https://homeboard.example.com` — *not* your HA URL) and redeploy. Auth
turns on automatically. With `PUBLIC_URL` unset, the dashboard stays open (fine
for a trusted LAN, unsafe for public hosting).

**How it works:**
1. An unauthenticated visitor gets a login screen with one button.
2. It redirects to your HA login (`/auth/authorize`); the user signs in there.
3. HA redirects back to `PUBLIC_URL/auth/callback`; the server exchanges the
   code for a token to confirm the login, then sets a signed, HTTP-only session
   cookie (60-day, `Secure` over HTTPS).
4. Every `/api/*` request, the photo proxy, and the live WebSocket require that
   session — so none of your HA data is reachable without logging in.

Anyone with a login on your Home Assistant can access the dashboard (it then
serves data via HomeBoard's own service token, so individual HA permissions
don't restrict what's shown — appropriate for a family dashboard). Log out from
**Settings → Account**. The session secret is stored at
`config/.hb_session_secret` so logins survive restarts.

> Requirements: `PUBLIC_URL` must exactly match the URL users visit, and your HA
> must be reachable at `HA_URL` from both the browser (for login) and the
> container (for the token exchange). HomeBoard should be served over HTTPS.

## Configuration (`config/config.json`)

Mounted as a volume. Two ways to edit:

- **Settings page** — tabbed visual editor with HA entity dropdowns, color
  pickers, row add/remove/reorder, and a raw-JSON tab. Saving validates the
  config server-side (`PUT /api/config`), keeps the previous version as
  `config.json.bak`, writes atomically, and applies immediately — no restart.
  Disable with `EDITOR_ENABLED=0` (HomeBoard has no auth: keep it LAN/VPN-only
  either way).
- **By hand** — edit the file and reload the page.

- `weatherEntity` — an HA `weather.*` entity
- `calendars` — HA `calendar.*` entities with a display color each
- `tasks` — rows of the Tasks card: `{ name, entity (todo.*), color }`
- `meals` — rows of the Meals card, each backed by a `todo.*` list
- `lists` — lists shown on the Lists page
- `rewards` — `{ name, entity }` where entity is a `counter.*` helper
  (create one in HA: Settings → Devices & services → Helpers → Counter);
  shows `–` until the helper exists
- `people` — names for the avatar cluster in the top bar
- `photos.intervalSeconds` — slideshow speed
- `locale` — e.g. `en-US` or `fr-CA` (affects date/time formatting)
- `language` — UI language, `en` or `fr` (defaults to the `locale` prefix,
  then the browser language)
- `theme` — default theme: `auto`, `light`, `dark`, or `sun` (dark after sunset,
  follows HA's `sun.sun`); a device-level choice made with the top-bar toggle or
  Settings overrides it

## Preview

<img width="3024" height="1724" alt="image" src="https://github.com/user-attachments/assets/0d4f500d-f985-4dfe-a8dd-cf9ab5a1bb69" />


## Translations

UI strings live in `src/i18n/<lang>.json` (flat keys, `{var}` interpolation,
`_one`/`_other` suffixes for plurals). To add a language: copy `en.json`, translate,
register it in `src/i18n/index.ts`, rebuild. Missing keys fall back to English.

## Photos

Photo sources, in priority order:

1. **Immich** — set `IMMICH_URL` + `IMMICH_API_KEY` (+ `IMMICH_ALBUM`, default
   `Wallpanel`). The server resolves the album by name (owned or shared), pages
   through it with `POST /api/search/metadata`, shuffles the result (re-shuffled
   every 5 min when the album list cache expires), and proxies each image through
   `GET /api/immich/<assetId>` using Immich's `thumbnail?size=preview` rendition —
   so HEIC originals display fine and the API key never reaches the browser.
2. **Local folder** — drop `.jpg/.png/.webp/...` files into `photos/`
   (mounted read-only into the container).
3. Bundled placeholder art.

## Local development

```bash
npm install
npm run start          # backend on :8090 (mock mode without HA_URL/HA_TOKEN)
npm run dev            # Vite dev server on :5173, proxies /api and /ws
```

To develop against your real HA instance:

```bash
HA_URL=https://ha.example.com HA_TOKEN=xxx npm run start
```

## Architecture

```
browser ── SPA (React/Vite) ── /api/ha/* ──► Node/Express proxy ──► HA REST API
        └───────── /ws ◄──────────────────── WebSocket bridge ◄─── HA WebSocket API
```

The proxy adds the `Authorization: Bearer` header server-side, so the token is
never exposed to clients. The WebSocket bridge subscribes to `state_changed`
events and notifies browsers when a `todo.`, `calendar.`, `weather.`, `counter.`,
`input_number.` or `person.` entity changes; the SPA then refetches just that slice.

> If HA uses a self-signed certificate, uncomment
> `NODE_TLS_REJECT_UNAUTHORIZED: "0"` in `docker-compose.yml`.
