# R5-01 — Online lobby preview

Checkpoint **PASS**, 2026-11-25, from `b248056`. This release only supports
two people waiting in a room. It does not start or synchronize a Banqi game.

Open [Online preview](https://vesperkrock.github.io/banqi-game/?onlinePreview=1).
The normal URL still offers only Offline and Solo. Without the exact preview
flag, no lobby module, stylesheet, SDK, Auth or room request loads. In preview,
close the dialog to return to the existing game; reopen it from Trợ giúp or
Cài đặt. The existing position is preserved. No engine, Bot, Drag, SVG, SFX,
Soul Fade, index.html or main stylesheet changes were needed.

## Behavior

- A creates a lobby and receives a server-generated six-digit text code,
  including leading zeros. Copy is supported, with selected-text fallback
  if clipboard access is unavailable. B can paste a code containing spaces.
- Both browsers see Người 1 / Người 2 and their own role. Two occupied seats
  show “Đã đủ 2 người — chơi Online sẽ được bật ở R5-02”. No Online controls
  can flip, move or capture, assign colors, or create `game_state`.
- TTL is **20 minutes from creation**, without extending it on retries or
  polling. The database status remains `waiting` when both seats are filled.
  A host cancellation uses `expired`; an expired/cancelled code cannot join.
- A guest may leave; only the host may cancel. Both require confirmation.
  Neither can use the other's operation. A third user with a full room's code
  gets an error without its projection, peer identity or permission to change it.
- Reload reuses the browser's Anonymous Auth identity and calls `getMine`.
  Clearing storage/changing device can lose that identity; no recovery promise
  or account registration was added.
- Polling uses 2.8–3.2 seconds while the dialog is open and visible. It stops
  on close, hidden/background, pagehide or offline; returning resumes it.
  Requests have an eight-second UI deadline, backoff/jitter up to about 30
  seconds, and honor server rate-limit cooldowns.
- Unknown mutation outcomes retain a request ID across reload, bound to the
  same UID. Retry sends the same operation. A generation check discards late
  responses from previous requests/lifecycles. Errors fail closed, with stale
  room controls disabled until a fresh result. The dialog uses native focus
  trapping/Escape and aria-live status. A short landscape lobby can scroll
  internally; closing it restores the existing 32-cell, no-scroll playing UI.

## Deployed backend

Project `banqi-game`, `tpxbbissvjmtrhijnavw`, Singapore:

- Migration **`20261125000100_r5_01_lobbies.sql`**: adds `lobby_revision`, two
  lookup indexes, private `lobby_limits` and `lobby_requests`, private helpers,
  and `public.banqi_room_action`.
- Edge Function **`banqi-rooms`, version 1**, ACTIVE, `verify_jwt=true`.
  It additionally uses pinned `@supabase/server@1.9.2`, `auth:'user'`, expected
  issuer/audience/role. Admin credentials are used only inside this function.
- R5-00 migration was not redeployed. `banqi-preflight` remains version 1 with
  its original bundle SHA-256 and behavior. Existing tables/users were not deleted.

`banqi-rooms` accepts POST JSON of at most 1 KiB with an exact field allowlist:

| Action | Fields beyond `action` |
| --- | --- |
| `getMine` | none |
| `create` | `requestId` UUID |
| `join` | `requestId`, `code` six-digit string |
| `leave` / `cancel` | `requestId`, `roomId`, `revision` |

UID is derived only from verified JWT claims. Successful responses contain
`{ok:true,room:null}` or a whitelist of `roomId, code, role, seats, lobbyStatus,
expiresAt, revision`. They contain no peer UID, raw database row, board, hidden
piece, seed, token or SQL error. CORS permits the Pages origin and existing
localhost ports 5500/8080; it is not authentication. Responses are no-store.

The service-only RPC uses `SECURITY DEFINER`, an empty search_path and qualified
private objects. EXECUTE is revoked from PUBLIC/anon/authenticated. UID advisory
locks serialize create/join per identity; row locks serialize guest allocation.
This permits one live lobby per identity through the API, across both roles.
Stored request receipts prevent replay from reopening cancelled rooms or
reclaiming a seat after leaving. Revision checks also reject unseen delayed
leave/cancel requests after membership changes. CSPRNG UUID bits with rejection
sampling generate codes without modulo bias; collisions have eight bounded
retries. Codes are unique even across retained expired rows in this checkpoint.

All four private tables retain FORCE RLS and no client policies/grants. The
private schema is not exposed through PostgREST and has no Realtime publication.
There is no Realtime subscription in the frontend. No game-state rows were made.

## Abuse limits and remaining boundaries

Limits are atomic database counters, shared by Edge instances and persistent
across tab refresh. Failed guesses consume quota; errors are returned as values
so the transaction does not roll back its counters.

| Scope | Per minute | Per hour |
| --- | ---: | ---: |
| All actions, per UID | 60 | — |
| Join, per UID | 6 | 30 |
| Create, per UID | 3 | 6 |
| Join, whole preview | 60 | 300 |
| Create, whole preview | 20 | 60 |

These are fixed windows starting on first use, not rolling windows; a boundary
can allow two windows' quotas close together. New Anonymous identities cannot
bypass the global join/create limits. No client-supplied IP header is trusted.
An attacker can still exhaust the shared quota and temporarily deny availability
to legitimate preview users. There is no CAPTCHA, verified IP limiter, or
targeted invitation identity check in this checkpoint. A code is an invitation
to an empty seat, never a login credential or host authority. These limits are
appropriate for the bounded preview; public gameplay requires a separate review.
Rate/receipt/expired-room retention is not an automatic cleanup feature here.

## QA evidence

- **57 targeted R5-01 checks PASS**: PostgreSQL transactions/constraints/RLS,
  CSPRNG collision exhaustion, expiry, replay/revision checks, UID/global
  throttles, signed/expired/forged JWTs, bounded inputs/CORS, transport, lifecycle,
  timeouts, stale sessions, retry persistence and Chrome UI/accessibility.
- **53 live security assertions PASS**: independent real Auth users; hosted
  create/join/getMine/leave/cancel; eight simultaneous distinct joiners yield
  exactly one guest and seven full-room errors; role/spoof/replay protection;
  direct RPC/private REST denial; private Realtime denial; persistent throttling.
- **16 real-browser assertions PASS** using three separate Chrome processes
  and profiles with the real browser SDK, Auth, Edge and Postgres. A/B see both
  seats; C cannot enter. Guest reload keeps UID/seat, offline/reconnect preserves
  membership, leave/rejoin/cancel update both browsers, old code fails, and an
  Offline move survives opening/closing the lobby. No JavaScript exceptions.
- Viewports checked and screenshots inspected: **390×844, 800×360, 1366×768**.
  These are Chrome emulations, not physical-phone/Safari tests.
- Hosted catalog audit: four FORCE-RLS tables, zero client table/schema/helper
  access, zero policies/publications, service-only RPC with fixed search_path,
  migration recorded, zero game states.

**Full regression was run once: 559 tests, 557 passed and 2 reported failures**
(one 390×844 Drag subtest plus its parent suite). The failure observed an empty
browser fixture snapshot during touch input. The entire Drag file was then
rerun with diagnostic instrumentation on the **same production code**: **11/11
PASS**, unchanged assertions, no skips; the fixture loss did not recur. Its exact
transient browser cause was not reproduced. The final acceptance uses this
targeted recheck together with the remaining passing full-suite results; it does
not claim that the initial full-run exit status was green. No second full suite,
Bot benchmark or 40-game comparison was run.

Evidence is preserved in ignored `.local-qa/r5-01/`: `full-final.log`,
`drag-recheck.log`, `remote-security.log`, `live-security-1795584963102.json`,
`live-browsers-1795585610306.json` and deployment logs. Earlier browser-harness
attempts stopped because a reload check queried the asynchronously mounted
dialog too early; its readiness guard was fixed before the successful run.
Twenty diagnostic Anonymous users were created through backend/browser QA;
they were not deleted. Test lobbies were cancelled or will expire by TTL.
No tokens are printed in reports; ignored Chrome profiles contain normal browser
session storage and must not be committed or shared.

## Operations

The migration plan contained only R5-01. Apply with the existing authenticated
CLI, without reset/prune/seeds/Vault changes; pin the already-tested CLI:

```powershell
npm exec --yes --package=supabase@3.3.0 -- supabase db push --remote=tpxbbissvjmtrhijnavw --dry-run --skip-vault
npm exec --yes --package=supabase@3.3.0 -- supabase db push --remote=tpxbbissvjmtrhijnavw --skip-vault --yes
npm exec --yes --package=supabase@3.3.0 -- supabase functions deploy banqi-rooms --remote=tpxbbissvjmtrhijnavw --use-api --yes
npm exec --yes --package=supabase@3.3.0 -- supabase db query --remote=tpxbbissvjmtrhijnavw --read-only --file supabase/checks/r5_01_security.sql
```

Migration history makes a repeat push a no-op. If the endpoint must be disabled,
an owner can revoke service_role EXECUTE on
`public.banqi_room_action(uuid,text,uuid,text,uuid,integer)` and remove the preview
entrypoint; preserve data/history for investigation. No destructive down migration
is needed. Do not grant client access to make an error disappear.

QA dependencies are reused from ignored `.local-qa/r5-00/runtime/`. Targeted
tests are `tests/rooms/*.test.cjs`. `live-security.cjs --live` creates eleven
diagnostic users; `live-browsers.cjs --live` creates three Chrome profiles/users
and needs localhost:8080. Reuse evidence unless code or a real failure requires
another run. Public verification is `tests/rooms/public-smoke.cjs`; it creates
and cancels one temporary lobby/user after deploy. Secrets are never required
in chat. No R5-02, Online moves, account UI, chat, Elo or leaderboard was added.
