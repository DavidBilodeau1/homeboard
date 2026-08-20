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
- **Cameras** — a [Frigate](https://frigate.video) wall: auto-refreshing
  snapshots with an hour of motion activity under each, an alerts feed you can
  acknowledge, live MJPEG + timelapse recap + event clips in one tap, and
  detector/storage/uptime health at a glance
- **Photos** — fullscreen slideshow from a mounted folder
- Live updates via WebSocket (state changes appear within ~1s), 5-min polling
  fallback, full refresh on reconnect after an outage
- **PWA** — installable from the browser ("Add to Home Screen") for a
  chrome-less fullscreen app on tablets and phones
- **Mock mode** — runs with demo data (including four fake Frigate cameras with
  alerts and health) when `HA_URL`/`HA_TOKEN` are not set

## Quick start (Docker)

```bash
cp .env.example .env             # then paste your HA long-lived access token
cp config/config.example.json config/config.json   # then edit for your entities
docker compose up -d            # pulls ghcr.io/davidbilodeau1/homeboard:latest
# open http://<server>:8090
```

Add `--build` to build from source instead of pulling the published image.

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
| `FRIGATE_URL` | — | Frigate base URL, e.g. `http://frigate.local:5000` |
| `FRIGATE_USER` | — | Frigate username (only if Frigate's own auth is on) |
| `FRIGATE_PASSWORD` | — | Frigate password |
| `FRIGATE_TOKEN` | — | JWT instead of user/password |
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
- `smartHome.mediaPlayers` — `{ name, entity (media_player.*) }` rows shown as
  a Media card on the Home page: now playing, play/pause, previous/next,
  volume slider
- `people` — names for the avatar cluster in the top bar
- `photos.intervalSeconds` — slideshow speed
- `locale` — e.g. `en-US` or `fr-CA` (affects date/time formatting)
- `language` — UI language, `en` or `fr` (defaults to the `locale` prefix,
  then the browser language)
- `theme` — default theme: `auto`, `light`, `dark`, or `sun` (dark after sunset,
  follows HA's `sun.sun`); a device-level choice made with the top-bar toggle or
  Settings overrides it

## Cameras (Frigate)

Set `FRIGATE_URL` and the **Cameras** page comes alive — no camera list to
maintain, since HomeBoard reads Frigate's own config. If Frigate's built-in
authentication is enabled, add `FRIGATE_USER`/`FRIGATE_PASSWORD` (HomeBoard logs
in once and refreshes the token by itself) or paste a `FRIGATE_TOKEN`.

What the page shows:

- **Camera wall** — `latest.jpg` snapshots refreshed every few seconds (cheap:
  no transcoding, no ffmpeg), each with the last hour of motion activity drawn
  as a sparkline, an unread-alert badge, and the newest detection with its label
- **Alerts feed** — Frigate *review items*, newest first, unread marked; hover
  plays the animated preview; one tap acknowledges it (`POST /reviews/viewed`)
- **Health strip** — new/24 h alert and detection counts, cameras up, detector
  inference time, recordings disk usage, uptime and version (with an update hint)
- **Tap a camera** — fullscreen live MJPEG with Frigate's own bounding boxes,
  zones and timestamp burnt in; a **Last 30 min** timelapse (`preview.mp4`); and
  a strip of recent events whose clips play in place

Tuning lives under `frigate` in `config/config.json` (or Settings → Cameras):

```json
"frigate": {
  "cameras": ["front_door", "driveway"],
  "refreshSeconds": 8,
  "pollSeconds": 15,
  "alertLimit": 20
}
```

Omit `cameras` to show every camera Frigate has enabled; list them to pick and
order the wall. `refreshSeconds` is the snapshot cadence, `pollSeconds` how often
alerts/health are re-fetched, `alertLimit` how deep the feed goes.

Nothing reaches Frigate from the browser: images, clips and JSON all travel
through `/api/frigate/*`, which allow-lists exactly the media paths the UI needs
(`latest.jpg`, event snapshots/thumbnails/clips, review previews, `preview.mp4`,
the MJPEG feed) and validates every camera name against Frigate's real list.

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
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest (event normalization + config validation)
npm run icons          # regenerate the PWA icons in public/icons/
```

CI (GitHub Actions) runs typecheck, lint, tests and the build on every push/PR.

## Releases & automatic updates

[`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml)
builds `ghcr.io/davidbilodeau1/homeboard` (linux/amd64) and tags it by trigger:

| Trigger | Tags pushed | Effect on the server |
| --- | --- | --- |
| push to `main` | `edge`, `sha-<short>` | nothing moves |
| push of a `v*` tag | `latest`, `1.2.3`, `1.2` | Watchtower rolls it out |

So cutting a release is:

```bash
npm version minor -m 'release %s'   # bumps package.json and creates the tag
git push && git push --tags
```

`docker-compose.yml` tracks `:latest`, so a **Watchtower** container on the
server pulls the new image and recreates HomeBoard on its next check — no manual
deploy step. The compose file also carries
`com.centurylinklabs.watchtower.enable=true`, which only matters if your
Watchtower runs with `WATCHTOWER_LABEL_ENABLE=true`.

> If the GHCR package is private, run `docker login ghcr.io` on the server with a
> PAT that has `read:packages` (Watchtower reuses the host's Docker
> credentials), or make the package public: GitHub → Packages → homeboard →
> Package settings → Change visibility.

To develop against your real HA instance:

```bash
HA_URL=https://ha.example.com HA_TOKEN=xxx npm run start
```

## Architecture

```
browser ── SPA (React/Vite) ── /api/ha/*      ──► Node/Express proxy ──► HA REST API
        │                     /api/frigate/* ──► Frigate proxy      ──► Frigate API
        └───────── /ws ◄──────────────────────── WebSocket bridge ◄─── HA WebSocket API
```

The proxy adds the `Authorization: Bearer` header server-side, so the token is
never exposed to clients. The WebSocket bridge subscribes to `state_changed`
events and notifies browsers when a `todo.`, `calendar.`, `weather.`, `counter.`,
`input_number.` or `person.` entity changes; the SPA then refetches just that slice.

> If HA uses a self-signed certificate, uncomment
> `NODE_TLS_REJECT_UNAUTHORIZED: "0"` in `docker-compose.yml`.
