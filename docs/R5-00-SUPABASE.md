# R5-00 — Supabase foundation

Checkpoint: **LOCAL PASS / REMOTE PASS** (2026-11-24). Project `banqi-game`,
ref `tpxbbissvjmtrhijnavw`, Singapore. Migration `20261124000100` and
`banqi-preflight` are deployed. Anonymous Sign-Ins were already enabled and
have been verified with two independent real users. No Dashboard change is needed.

## Boundary and architecture

- GitHub Pages remains a static site. Existing Offline, Solo Bot, Drag, UI,
  engine, SVG and SFX are unchanged. There is no Online option or gameplay yet.
- `js/online-config.mjs` contains the public project URL and publishable key.
  These identify the project; they do not grant access to private game data.
- `js/online-auth.mjs` exports `onlineAuth.ensureIdentity()` and
  `onlineAuth.preflight()`. Neither the game nor these module imports load the
  SDK or contact Supabase. Only explicitly calling those methods does so.
  The browser SDK is pinned to `@supabase/supabase-js@2.119.2` on esm.sh.
- The SDK signs in anonymously, persists and refreshes the session in the
  browser, and validates the user with Auth. Concurrent requests in the same
  instance share sign-in. Errors fail closed; no unauthenticated fallback.
  Clearing browser storage or changing device can lose a guest identity.
  This checkpoint does not add account recovery/linking.
- Preflight is `GET /functions/v1/banqi-preflight`. It accepts no parameters
  or caller-supplied UID. It returns only the authenticated caller and
  `{preflight:true, rooms:false, gameplay:false}` under checkpoint `R5-00`.
  It never reads database state, returns a token, or logs credentials.
- Requests use `apikey: <publishable key>` and
  `Authorization: Bearer <user JWT>`. The frontend uses SDK `functions.invoke`.
  A publishable key is never used as user identity. Platform `verify_jwt=true`
  remains enabled; pinned `@supabase/server@1.9.2` additionally requires
  `auth:'user'`, the project issuer, authenticated audience/role and a UUID subject.
- CORS allows exactly `https://vesperkrock.github.io`, plus HTTP localhost or
  `127.0.0.1` on ports 5500/8080. OPTIONS does not grant access. Requests without
  Origin still require authentication. Responses are `Cache-Control: no-store`.

## Database and privacy

`banqi_private.rooms` holds a unique six-digit text code (leading zeros allowed),
host UID, optional different guest UID, status and invitation expiry. Two fixed
UID columns permit at most two seats. `banqi_private.game_state` holds one
authoritative JSON object per room and a nonnegative version.

Both tables have **ENABLE + FORCE RLS**, no client policies, and explicitly
revoked schema/table privileges for PUBLIC, anon and authenticated. Only the
server service role receives data privileges. Anonymous Auth users have the
authenticated role; they still cannot read or write either table, even their
own room. The preflight function does not use an admin client.

The private schema is absent from exposed API schemas. Neither table is in a
Realtime publication. No Realtime channel/policy is provisioned. True board
order, hidden faces, RNG/seed and internal state belong only in private storage;
never return them through REST, RPC, Realtime, error messages or logs.

Future R5-01/R5-02 work must independently implement atomic seat allocation,
server-generated random codes with bounded unique-collision retry, expiry
checks on join, rate limiting against code enumeration, and server-authoritative
actions. A room code is an invitation, not ownership. Derive the acting UID from
verified auth, lock/check the room version, and whitelist the public projection
(face-down cells expose no piece identity). Do not broadcast private row changes.
These operations are deliberately **not implemented** in R5-00.

The migration is additive and transactional. It refuses an existing
`banqi_private` namespace or any FOR ALL TABLES publication, instead of merging
unknown structures. Supabase migration history makes subsequent `db push`
idempotent; manually rerunning the SQL aborts safely. No existing data/users are
deleted. Default privilege settings apply to the migration creator; every
future private-object migration must explicitly revoke client grants again
(schema-local defaults cannot cancel unrelated global grants or another
creator's defaults). Never expose `banqi_private` in the Dashboard API settings.

## Verification at this checkpoint

- 40/40 targeted Node/Chrome checks: lazy loading, persistent identity reuse,
  signed/tampered/expired JWTs, CORS, identity isolation, SQL constraints, actual
  PostgreSQL RLS/privileges, safe migration conflict handling, Offline flip,
  real Solo Worker, 844×390 layout and pinned SDK import.
- 40/40 live assertions with two real Anonymous Auth users: validated distinct
  identity, persisted-session reuse, hosted preflight, bad/missing/forged JWT,
  refused supplied UID/write method/untrusted Origin, CORS, all four REST
  operations denied on both private tables for anon/A/B, and private Realtime
  subscription denial for A/B.
- Hosted catalog audit: both tables have FORCE RLS; no anon/authenticated
  schema/table access, no policies, no publications; migration recorded.
- The local PostgreSQL tests use disposable PGlite with seeded data and test
  accidental table grants to show RLS remains default-deny. They supplement
  the hosted audit; they are not a substitute for it.
- Live credentials stay in process memory and are discarded. Two diagnostic
  Auth users remain; no auth user deletion was performed. No game rows created.
- Existing 502-test R4-UX03 evidence is retained; no full gameplay suite, Bot
  benchmark or head-to-head matches were rerun for this isolated foundation.
  Browser evidence is Chrome automation, not testing on a physical phone.

Logs are under ignored `.local-qa/r5-00/`; no sessions, secrets, logs, ZIPs or
prompt files belong in a commit. Public client code can contain only the
publishable key. Secret/service-role keys and database passwords stay out of
frontend code and browser-accessible assets.

## Reproduce and operate

Install QA-only dependencies (no frontend build or root package required):

```powershell
npm install --prefix .local-qa/r5-00/runtime --no-save --package-lock=false --ignore-scripts @supabase/supabase-js@2.119.2 @supabase/server@1.9.2 @electric-sql/pglite@0.6.0
node --test tests/foundation/auth.test.cjs tests/foundation/database.test.cjs tests/foundation/browser.test.cjs
```

Read-only hosted audit using the existing authenticated Supabase CLI:

```powershell
npm exec --yes --package=supabase@3.3.0 -- supabase db query --remote=tpxbbissvjmtrhijnavw --read-only --file supabase/checks/r5_00_security.sql
```

Deployment procedure, already completed at this checkpoint:

```powershell
npm exec --yes --package=supabase@3.3.0 -- supabase db push --remote=tpxbbissvjmtrhijnavw --dry-run --skip-vault
npm exec --yes --package=supabase@3.3.0 -- supabase db push --remote=tpxbbissvjmtrhijnavw --skip-vault --yes
npm exec --yes --package=supabase@3.3.0 -- supabase functions deploy banqi-preflight --remote=tpxbbissvjmtrhijnavw --use-api --yes
```

Do not use `--no-verify-jwt`, reset, prune, or include unrelated migrations/seeds.
If future CLI authentication expires, the owner can run
`npm exec --yes --package=supabase@3.3.0 -- supabase login` locally. Never send
the token/password in chat or commit it. There is no pending manual deployment
step for this checkpoint.

An explicit new live audit creates two more anonymous users; reuse valid
checkpoint evidence instead of running it routinely:

```powershell
node tests/foundation/live-smoke.cjs --live
```

Reference: [Anonymous Auth](https://supabase.com/docs/guides/auth/auth-anonymous),
[function authentication](https://supabase.com/docs/guides/functions/auth),
[auth headers](https://supabase.com/docs/guides/functions/auth-headers),
[Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).
