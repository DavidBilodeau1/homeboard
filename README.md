# HomeBoard

A self-hosted family dashboard (smart-calendar style) for **Home Assistant**,
running as its own Docker container. It talks to the HA REST API through a small
Node proxy, so your token never reaches the browser, and updates live over the
HA WebSocket API.

Home Assistant is the only connection HomeBoard needs. The core works with a
stock HA install; everything that depends on another service or on a
custom integration is an optional **plugin**, turned on in Settings.

## Features

The core, using only built-in HA domains:

- **Dashboard**: a drag-and-drop grid of tiles (calendar, photos, tasks, weather, meals, rewards)
- **Calendar**: month view of your `calendar.*` entities, with per-screen layer toggles
- **Tasks / Lists / Meals**: `todo.*` lists you can check off, add to and clean up
- **Rewards**: `counter.*` helpers with +/− buttons
- **Home**: thermostat, lights, sensors, media players, locks and alarm
- **Photos**: a fullscreen slideshow from a mounted folder
- Live updates over WebSocket, with a polling fallback and a full refresh after an outage
- Light, dark, or follow-the-sun themes; English and French; installable as a PWA
- **Mock mode**: demo data whenever `HA_URL`/`HA_TOKEN` are missing

<img width="3024" height="1724" alt="HomeBoard dashboard" src="https://github.com/user-attachments/assets/0d4f500d-f985-4dfe-a8dd-cf9ab5a1bb69" />

## Plugins

| Plugin | Adds | Needs |
| --- | --- | --- |
| Cameras (Frigate) | Cameras page, Home card | a [Frigate](https://frigate.video) NVR: `FRIGATE_URL` |
| Money (Expensave) | Money page and tile, calendar layer, bank statement import | an [Expensave](https://github.com/algirdasc/expensave) instance: `EXPENSAVE_URL`, `EXPENSAVE_EMAIL`, `EXPENSAVE_PASSWORD` |
| Photos (Immich) | slideshow pictures from an album | an [Immich](https://immich.app) server: `IMMICH_URL`, `IMMICH_API_KEY` |
| Hockey (NHL) | a live game tile | the [NHL API](https://github.com/JayBlackedOut/hass-nhlapi) HA integration |
| Garbage collection | pickup days on the calendar and in the header | timestamp sensors with the next pickup date |
| Air quality | an AQI tile and a header alert | an air quality index sensor |
| Floor plan | a to-scale plan of your home with devices on it | nothing beyond HA |

Turn plugins on in **Settings → Plugins**. A plugin whose server connection is
missing says which environment variables to set. Each enabled plugin gets its
own settings tab, and its tiles appear in the dashboard's *Add tile* menu.

## Quick start (Docker)

```bash
cp .env.example .env     # set HA_URL and HA_TOKEN
docker compose up -d     # pulls ghcr.io/davidbilodeau1/homeboard:latest
# open http://<server>:8090 and configure everything in Settings
```

Add `--build` to build from source. Create the token in HA under your profile →
**Security** → **Long-lived access tokens**.

To try it without Home Assistant, copy `config/config.example.json` to
`config/config.json` and run with `MOCK=1`: every plugin has demo data except Immich.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `HA_URL` | — | Home Assistant base URL, e.g. `https://ha.example.com` |
| `HA_TOKEN` | — | Long-lived access token |
| `PUBLIC_URL` | — | HomeBoard's own external URL; **setting it requires login** |
| `AUTH_ENABLED` | auto | `0` keeps login off even when `PUBLIC_URL` is set |
| `SESSION_SECRET` | auto | Cookie-signing secret (generated and persisted if unset) |
| `EDITOR_ENABLED` | `1` | `0` makes Settings read-only, e.g. on a wall panel |
| `MOCK` | `0` | `1` forces demo data |
| `PORT` | `8090` | HTTP port inside the container |
| `CONFIG_PATH` | `/app/config/config.json` | Dashboard configuration |
| `PHOTOS_DIR` | `/app/photos` | Local slideshow folder |

Plugin connections: `FRIGATE_URL`, `FRIGATE_USER`, `FRIGATE_PASSWORD`,
`FRIGATE_TOKEN`, `EXPENSAVE_URL`, `EXPENSAVE_EMAIL`, `EXPENSAVE_PASSWORD`,
`IMMICH_URL`, `IMMICH_API_KEY`. Secrets stay in the environment, never in
`config.json`, which the browser reads.

## Authentication

With `PUBLIC_URL` set, visitors log in with Home Assistant's own OAuth2
(IndieAuth) flow: HomeBoard redirects to your HA login, exchanges the code, and
sets a signed, HTTP-only session cookie (60 days). Every API route, the photo
proxy and the live WebSocket then require that session. Anyone who can log in
to your HA can see the dashboard. Without `PUBLIC_URL` the dashboard is open, so
keep it on a trusted LAN.

`PUBLIC_URL` must match the URL users visit, HA must be reachable at `HA_URL`
from both the browser and the container, and HomeBoard should be served over HTTPS.

## Configuration

`config/config.json` is mounted as a volume. A missing file is an empty
configuration, so a fresh install starts from Settings. Settings validates every
save on the server, keeps the previous file as `config.json.bak`, and applies it
immediately. You can also edit the file by hand and reload.

| Key | Purpose |
| --- | --- |
| `locale`, `language`, `theme` | date formatting, UI language (`en`, `fr`), default theme (`auto`, `light`, `dark`, `sun`) |
| `weatherEntity` | a `weather.*` entity |
| `calendars` | `{ entity, name, color }` per `calendar.*` entity |
| `tasks`, `meals`, `lists` | `{ name, entity, color }` rows backed by `todo.*` lists |
| `rewards` | `{ name, entity }` rows backed by `counter.*` helpers |
| `people` | names shown in the header, matched to `person.*` entities |
| `photos.intervalSeconds` | slideshow speed |
| `smartHome` | `climate`, `alarm`, and `sensors`, `lights`, `locks`, `mediaPlayers` rows |
| `dashboard` | grid size and tile positions, saved by the dashboard editor |
| `plugins.<id>` | `{ enabled, ...settings }` for each plugin |

Configs from before plugins existed keep working: their top-level `frigate`,
`expensave`, `hockey`, `garbage`, `airQuality` and `floorPlan` sections are read
as enabled plugins, and the next save writes them under `plugins`.

## Plugin notes

**Cameras (Frigate).** Cameras come from Frigate's own config. Settings picks
and orders them and tunes the snapshot refresh, polling and alert feed size. If
Frigate's authentication is on, set `FRIGATE_USER`/`FRIGATE_PASSWORD` (HomeBoard
renews its token) or a `FRIGATE_TOKEN`. The browser only reaches Frigate through
an allow-list of media paths, with camera names checked against Frigate.

**Money (Expensave).** Each Expensave calendar becomes a calendar layer. The
Money page shows what is *safe to set aside*: today's cleared balance, minus
charges not cleared yet, walked day by day through everything scheduled until
the horizon. The answer is the **lowest** point along the way minus your buffer,
since a paycheque that lands after rent cannot pay it. The *Bank statement*
card takes a CSV export (date, description, and amount or withdrawal/deposit
columns), shows what it would change, and on confirmation confirms planned
entries, adds new ones, removes or keeps unmatched ones, and records the bank's
balance. Imported rows are tagged, so overlapping statements never duplicate.

**Photos (Immich).** Set the album name in Settings. The server pages through
the album, shuffles it, and proxies preview images so HEIC originals display
and the API key stays on the server. Without it, the slideshow uses `photos/`.

**Hockey (NHL).** Pick the integration's sensor (e.g. `sensor.nhl_mtl`) and
optionally your team. The tile shows a countdown before the game, the live
score, clock, shots and last goal during it, and the result after.

**Garbage collection.** One row per collection: a timestamp sensor with the next
pickup date, and a color. Pickups appear on the calendar, and in the header the
day before and the day of.

**Air quality.** Pick an AQI sensor and the threshold above which the header
shows an alert.

**Floor plan.** Rooms, floors and exterior features live under
`plugins.floorPlan` (`house`, `floors`, `exterior`, dimensions in `[feet, inches]`).
On the page, *Rearrange* drags rooms (they snap to walls and each other), edits
dimensions, and places any HA entity as a tappable device.

## Writing a plugin

A plugin has a client half in `src/plugins/<id>/` and, when it needs one, a
server half in `server/plugins/`. Register them in `src/plugins/registry.ts` and
`server/plugins/index.js`.

The client `Plugin` (`src/plugins/types.ts`) declares its title, translations,
and any of: `pages`, dashboard `tiles`, `homeCards`, a `TopBarItem`, calendar
extensions (`Legend`, `DayBadge`, `DayDetails`), a `Provider` for shared state,
and a `Settings` panel. Entity-based plugins use `useEntityState` and
`useTrackedEntities` from the store to get live states.

The server plugin can `validate(settings)`, declare the external `service` it
needs, provide a `router` (served at `/api/plugins/<id>` while enabled) and a
slideshow `photoSource`.

## Translations

UI strings live in `src/i18n/<lang>.json` and in each plugin's `en.json`/`fr.json`
(flat keys, `{var}` interpolation, `_one`/`_other` plurals). To add a language,
add a file next to each `en.json` and register it in `src/i18n/index.ts`.
Missing keys fall back to English.

## Local development

```bash
npm install
npm run start          # backend on :8090 (mock mode without HA_URL/HA_TOKEN)
npm run dev            # Vite dev server on :5173, proxies /api and /ws
npm run typecheck
npm run lint
npm test
npm run icons          # regenerate the PWA icons
```

CI runs typecheck, lint, tests and the build on every push and pull request.

## Releases

[`docker-publish.yml`](.github/workflows/docker-publish.yml) publishes
`ghcr.io/davidbilodeau1/homeboard`: pushes to `main` as `edge`, `v*` tags as
`latest` and the version. `docker-compose.yml` follows `latest`, so Watchtower
rolls a release out on its own.

```bash
npm version minor -m 'release %s'
git push && git push --tags
```

## Architecture

```
browser ── SPA (React/Vite) ── /api/ha/*          ──► Node/Express ──► Home Assistant REST API
        │                     /api/plugins/<id>/* ──► plugin routers ──► Frigate, Expensave, Immich…
        └───────── /ws ◄────────────────────────── WebSocket bridge ◄── Home Assistant WebSocket API
```

The server forwards a state change to browsers when it concerns a core domain
(`todo`, `calendar`, `weather`, `counter`, `input_number`, `person`, `sun`) or an
entity named in the configuration; the browser then refetches only that entity
or slice.
