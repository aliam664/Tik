# HOW TO ADD A NEW GAME

This is the agent-facing playbook for adding a title to **DOZ ONLINE**. The catalog, routes, header nav, and `/join` fallthrough are all driven by the game plugin files under `src/games/`. Do **not** hardcode a new game into `src/app/router.tsx`, `src/config/navigation.ts`, or `src/features/rooms/JoinRoomPage.tsx`.

Classic **دوز** (`id: "doz"`, lobby `/`, room `/room/:code`) is the platform core. New titles are **standalone plugins** with their own lobby + room paths.

---

## 0. Architecture (what already exists)

```
src/games/
  registry.ts        ← catalog: ids, titles, routes, accent, nav, aliases
  gameModules.ts     ← lazy lobby/room components keyed by registry id
  joinAdapters.ts    ← ordered /join probes (ROOM_NOT_FOUND fallthrough)
  GameIcon.tsx       ← lucide icon switch for hub / shop cards
  <yourGame>/        ← engine, session, catalog, tests (optional folder)

src/features/<yourGame>/
  YourGameLobbyPage.tsx
  YourGameRoomPage.tsx

supabase/migrations/   ← RPCs + tables for that title
src/lib/api/<yourGame>.api.ts
src/types/<yourGame>.ts
```

Hub (`HomePage`) reads `PLATFORM_GAMES`. Header reads `getHeaderNavGames()`. Router maps `GAME_ROUTE_MODULES`. Join walks `ROOM_JOIN_ADAPTERS`.

---

## 1. Checklist (do these in order)

### A. Identity in the registry

Edit `src/games/registry.ts` and append one `PlatformGame` object:

| Field | Required | Notes |
|---|---|---|
| `id` | yes | snake_case, unique. Alias lookup lives in `getGameById`. |
| `title` / `titleEn` | yes | Persian + English names. |
| `tagline` | yes | One-line pitch on hub cards. |
| `route` | yes | Lobby path, e.g. `/games/shadow-dice`. Never `/`. |
| `roomRoutePrefix` | yes for multiplayer | e.g. `/games/shadow-dice/room`. Room URL is `${prefix}/:roomCode`. |
| `status` | yes | `"live"` to show in hub + nav; `"coming_soon"` skips routes. |
| `players` | yes | Human-readable, e.g. `"۲ نفره"`. |
| `accent` | yes | CSS color for the hub card. |
| `icon` | yes | One of `PlatformGameIcon` (`grid`, `rocket`, `swords`, …). Extend `GameIcon.tsx` if you need a new glyph. |
| `features` | yes | Bullet list for the hub card. |
| `navLabel` | if `showInNav` | Short header label. |
| `showInNav` | no | `true` to inject into `MAIN_NAV_ITEMS`. |
| `navOrder` | no | Lower = earlier. Current: رمزگشا `1`, رازواژه `2`, Last Night `3`. |
| `routeAliases` | no | Extra lobby paths (Last Night uses `/games/arena2d`). |
| `bannerUrl` | no | Optional card art. |

Keep `id: "doz"` as `route: "/"`. Do not add doz to `GAME_ROUTE_MODULES`.

### B. Pages

Create:

- `src/features/<camel>/YourLobbyPage.tsx` — named export, uses `useDocumentTitle`.
- `src/features/<camel>/YourRoomPage.tsx` — named export, reads `:roomCode`.

Keep each page under ~1.5k lines. If a room page grows (combat sim + HUD), split HUD/overlays into a sibling file the way `LastNightRoomPage.tsx` + `LastNightRoomHud.tsx` do.

### C. Lazy routes

Add one row to `GAME_ROUTE_MODULES` in `src/games/gameModules.ts`:

```ts
{
  id: "shadow_dice", // MUST match registry id
  Lobby: lazyNamed(() => import("@/features/shadowDice/ShadowDiceLobbyPage"), "ShadowDiceLobbyPage"),
  Room: lazyNamed(() => import("@/features/shadowDice/ShadowDiceRoomPage"), "ShadowDiceRoomPage"),
}
```

The router already mounts:

- `game.route` → Lobby
- `${game.roomRoutePrefix}/:roomCode` → Room
- each `routeAliases` entry → Lobby

### D. Join adapter

Append to `ROOM_JOIN_ADAPTERS` in `src/games/joinAdapters.ts`. **Keep `doz` first.** On `ROOM_NOT_FOUND` return `"not_found"`; on any other error rethrow. On success return `{ roomPath }`. Persist the game's own session helper (token/seat) before returning.

`/join` walks the list; first hit wins.

### E. API + types + SQL

- `src/types/<yourGame>.ts` — room state, seats, RPCs.
- `src/lib/api/<yourGame>.api.ts` — create/join/state/action wrappers. Re-export from `src/lib/api.ts` if that barrel is used.
- `supabase/migrations/00xx_<your_game>.sql` — tables, RLS, RPCs. Follow existing games: unique 6-char `room_code`, `join_*` returning `ROOM_NOT_FOUND` for unknown codes.

### F. Engine folder (optional but recommended)

`src/games/<yourGame>/` for pure logic (catalog, simulation, session). Keep React out of this folder so tests stay cheap.

### G. Tests

- Extend `src/games/registry.test.ts` (ids unique, every live standalone id has a module + join adapter).
- Add `src/games/<yourGame>/<yourGame>.test.ts` for rules.
- Do **not** assert a frozen game count unless you update that assertion. `CodeBreakerArenaView.test.tsx` currently expects the four live ids — bump it when you add a fifth live title.

### H. Verify

```bash
npx tsc --noEmit
npx vitest run
```

Then click: hub card → lobby → create room → `/join` with that code → room.

---

## 2. What you should NOT touch

| File | Why |
|---|---|
| `src/app/router.tsx` | Already maps `GAME_ROUTE_MODULES`. |
| `src/config/navigation.ts` | Already spreads `getHeaderNavGames()`. |
| `src/features/rooms/JoinRoomPage.tsx` | Already loops `ROOM_JOIN_ADAPTERS`. |
| `src/features/home/HomePage.tsx` | Already maps `PLATFORM_GAMES` + `GameIcon`. |

Exception: doz-only flows (`/create`, `/room/:code`, ranked play) stay in the existing room feature.

---

## 3. Coming soon vs live

- `status: "coming_soon"` — hub card only; skip `GAME_ROUTE_MODULES` and join adapter until ship.
- `status: "beta"` — treat as live for routes if you add a module; hide from nav with `showInNav: false` if needed.

---

## 4. Minimal diff example

A fifth live game is **four files of wiring** plus the game itself:

1. One object in `PLATFORM_GAMES`.
2. One object in `GAME_ROUTE_MODULES`.
3. One object in `ROOM_JOIN_ADAPTERS`.
4. Lobby + room pages (+ SQL/API).

If the icon key is new, also extend `PlatformGameIcon` and `GameIcon.tsx`.
