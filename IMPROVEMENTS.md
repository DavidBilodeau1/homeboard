# HomeBoard — Improvement Plan

Four features, in recommended build order. Each phase is independently shippable.

---

## Phase 1 — Dark mode (small)

All colors already flow through CSS custom properties in `src/styles.css` (`--bg`,
`--card`, `--ink`, `--muted`, `--accent`, `--line`…), so this is mostly a token swap.

**Approach**
- Add a `[data-theme="dark"]` block overriding the tokens: warm dark background
  (`#201d22`-ish), card `#2b2830`, brighter crimson accent, adjusted muted/line colors.
- Theme modes: `auto` (follows `prefers-color-scheme`), `light`, `dark`, and
  `sun` (follows HA's `sun.sun` entity — dark after sunset; ideal for a wall panel,
  and we already have the state pipeline for it).
- Persist choice in `localStorage`, default from `config.json` → `"theme": "auto"`.
  Quick toggle in the top bar (sun/moon icon) + full selector in Settings.
- Config-supplied colors (task bars, meal rows, calendar chips): instead of using the
  hex directly as `background`, set it as a per-element CSS var and render with
  `color-mix(in srgb, var(--card) 75%, var(--row-color))` so the same config color
  works in both themes. Text on pastel rows switches to theme ink.
- Dim the photo/weather imagery slightly in dark mode (`filter: brightness(.85)`).

**Touches**: `styles.css`, `store.tsx` (theme state + sun tracking), `TopBar.tsx`,
`SettingsPage.tsx`, `config.json` (+ new `theme` key), cards that inline colors.

---

## Phase 2 — Make everything translatable (small–medium)

Do this before adding new pages so they're born translated.

**Approach**
- No i18n library — a tiny homemade layer is enough at this size (~40 strings):
  `src/i18n/en.json`, `src/i18n/fr.json`, and a `t(key, vars?)` function exposed
  through the existing store context.
- Language resolution: `config.language` (new key, e.g. `"fr"`) → else prefix of
  `config.locale` → else `navigator.language`. Dates/times already localize via
  `Intl` with `config.locale`, so only UI strings need extraction.
- Extract: sidebar labels, card titles (Calendar/Tasks/Meals/Reward…), "Events",
  "N Items", "All day", "No events", "Completed", "Today", "Add to …", settings
  labels and hints. Support simple pluralization via `{count}` interpolation.
- User-defined names (list names, people) come from `config.json` and are already
  in the user's language — untouched.
- Ship `fr-CA` as the first translation; `config.json` gains
  `"locale": "fr-CA", "language": "fr"` for this household.

**Touches**: new `src/i18n/`, every component with literal strings (mechanical),
`config.json`, README.

---

## Phase 3 — Smart home page (medium–large)

New sidebar entry **Home** (house icon) between Dashboard and Calendar.
Everything config-driven under a new `smartHome` section — pre-filled with the
entities already in use on the HA "Dashboard 3.0":

```jsonc
"smartHome": {
  "climate": "climate.tstat_05c045_t6_pro_thermostat",
  "cameras": [{ "name": "Porte avant", "entity": "camera.front_door_doorbell_fluent" }],
  "sensors": [
    { "name": "Piscine", "entity": "sensor.pool_thermometer_pool_thermometer", "icon": "pool" },
    { "name": "Qualité air", "entity": "sensor.saguenay_..._air_quality_index", "icon": "air" },
    { "name": "UV", "entity": "sensor.uv_index", "icon": "sun" }
  ],
  "lights": [
    { "name": "Salon", "entity": "light.salon_salon" },
    { "name": "Lampe salon", "entity": "light.salon_lampe_du_salon" },
    { "name": "Ch. Timothée", "entity": "light.chambre_de_timothee_chambre_de_timothee" },
    { "name": "Ch. Alphonse", "entity": "light.chambre_dalphonse_chambre_dalphonse" }
  ],
  "locks": [{ "name": "Porte avant", "entity": "lock.front_door" }],
  "alarm": "alarm_control_panel.home_alarm"
}
```

**Cards**
- **Climate**: current + target temp, HVAC mode & action, − / + setpoint buttons
  (`climate.set_temperature`), mode chips (`climate.set_hvac_mode`). Tint by state
  (orange heating / blue cooling), like the bubble-card setup.
- **Cameras**: snapshots via the existing proxy → `GET /api/ha/camera_proxy/<entity>`
  (token stays server-side), auto-refresh ~10 s, tap to enlarge in an overlay.
  *Stretch*: live MJPEG via `camera_proxy_stream` — requires teaching the proxy to
  pipe streamed bodies instead of buffering text (small server change, do it then).
- **Sensors**: read-only tiles (pool temp, AQI with color scale, UV, feels-like…).
- **Lights**: toggle tiles calling `light.turn_on/off`, warm-yellow when on,
  brightness slider on long-press as a stretch goal.
- **Locks / Alarm**: state tiles; lock/unlock and arm/disarm behind a confirm tap
  (two-tap: first tap arms the button, second within 3 s executes).

**Plumbing**
- New store slice: generic `entityStates` map fetched for every entity in
  `smartHome`, refreshed live. The server's `WATCH_PREFIXES` becomes dynamic:
  built from prefixes **plus the exact entity ids found in config.json** (read at
  startup and on config change), so `light.`, `climate.`, `camera.`, `lock.`,
  `alarm_control_panel.`, `sensor.` updates flow without broadcasting every sensor
  in the house.
- All service calls go through the existing `/api/ha/services/...` proxy — no new
  auth surface.

**Touches**: new `src/pages/SmartHomePage.tsx` + card components, `Sidebar.tsx`,
`store.tsx`, `server/index.js` (dynamic watch set, camera passthrough already works),
`config.json`, mock fixtures (fake climate/lights/camera for demo mode).

---

## Phase 4 — Visual editor for config.json (medium)

Last on purpose: the editor should cover the *final* schema (theme, language,
smartHome included).

**Approach**
- Settings page becomes tabbed: **General** (locale, language, theme, photo interval,
  Immich album), **Calendars**, **Tasks**, **Meals**, **Lists**, **Rewards**,
  **People**, **Smart home**, **Raw JSON** (escape hatch with validation).
- Row editors with add/remove/reorder; color swatch picker for calendars/tasks/meals;
  entity fields are **dropdowns populated from HA** (`GET /api/ha/states` filtered
  by domain — todo/calendar/weather/counter/light/climate/camera/sensor/lock) so no
  typing entity ids.
- Server: add `PUT /api/config` — JSON-schema validation, atomic write
  (temp file + rename) to `CONFIG_PATH`, keep last version as `config.json.bak`.
  The config volume is already mounted read-write.
- After save: store re-fetches config and re-subscribes; no container restart.
- Guardrails: `EDITOR=0` env var to make it read-only (dashboard hangs on a wall,
  guests can touch it); note in README that HomeBoard has no auth and should stay
  LAN/VPN-only regardless.

**Touches**: `SettingsPage.tsx` (rewrite), new editor components, `server/index.js`
(PUT endpoint + validation), README.

---

## Cross-cutting

- Mock mode gets fixtures for every new feature (theme/sun, smart-home entities) so
  UI work stays testable without HA.
- README gains a section per feature; `config.json` schema documented in one place
  (drives both the editor and server-side validation).
- Suggested tags after each phase: `v1.1` dark mode → `v1.2` i18n → `v1.3` smart
  home → `v1.4` editor.
