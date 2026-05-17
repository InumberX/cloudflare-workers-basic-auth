# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@inumberx/cloudflare-workers-basic-auth` — a dependency-free Basic auth gate for Cloudflare Workers. Public surface is a single `createWorkerFetch<Env>(options)` factory that wraps any `(Request) => Response` handler. Targets Node `>=20.19.0` for tooling; runtime uses Web Standards only (`Request`/`Response`/`crypto.subtle`/`atob`/`TextDecoder`).

## Commands

- `npm test` — Vitest watch mode. Append `-- --run` for a single CI-style pass; pass a path to scope (e.g. `npm test -- --run tests/verify.test.ts`).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` / `npm run lint-fix` — Oxlint over `src/` and `tests/` (warnings are errors).
- `npm run format` / `npm run format-fix` — Oxfmt check / write.
- `npm run build` — cleans and emits to `dist/` via `tsconfig.build.json`.
- `npm run pre-commit` — typecheck + lint-fix + format-fix.
- Full CI parity before opening a PR: `npm run typecheck && npm run lint && npm run format && npm test -- --run && npm run build`.

## Architecture

Request flow inside `createWorkerFetch` (`src/worker-fetch/create-worker-fetch.ts`):

1. **Resolve credentials** via the caller-supplied `basicAuth(env)`. If exactly one of `user`/`pass` is set, return `503` (fail-closed) and log the misconfig once per isolate (`partialAuthConfigWarned` module flag — do not turn this into a per-request log).
2. **Verify** with `verifyBasicAuth` (`src/basic-auth/verify.ts`) only when both credentials are present. Header match is case-insensitive (RFC 7235). On any failure path return the `401` from `unauthorizedResponse` carrying `WWW-Authenticate: Basic realm="…"`.
3. **Asset routing** (if `assets(env)` is provided) is gated to `GET`/`HEAD` only (`ASSET_FETCH_METHODS`). Mutating methods skip the assets binding so forms / CSRF actions don't get a spurious `405` before reaching the handler. A non-404 asset response is returned directly; `404` falls through to `handler`.
4. **Handler** runs last.

`src/basic-auth/` is the verification primitives layer:

- `decode.ts` — base64 → UTF-8, strict (invalid UTF-8 returns `null`, surfacing as 401).
- `timing-safe-equal.ts` — SHA-256 digests both inputs, then compares the 32 bytes with bitwise OR accumulation. The comparison loop length is constant (32) regardless of input length, neutralizing length-based timing leaks. Keep this property.
- `verify.ts` — runs user / pass checks in `Promise.all` so a wrong username does not return measurably faster than a wrong password.
- `unauthorized.ts` — the shared 401 builder.

The public type surface (`AssetFetcher`, `BasicAuthCredentials`, `CreateWorkerFetchOptions`) is declared structurally in `src/worker-fetch/create-worker-fetch.ts` so consumers do not need `@cloudflare/workers-types` installed (it's an optional peer dep).

## Invariants worth preserving

When touching auth behavior, preserve these unless the tradeoff is explicit:

- **Fail-closed on partial config** (one credential set, the other missing → 503).
- **Constant-time comparison via SHA-256 digest** — do not short-circuit on length or first-byte mismatch.
- **Parallel user/pass verification** — don't sequence the two `timingSafeEqual` calls.
- **UTF-8 strict decoding** — invalid sequences must reject, not substitute replacement characters.
- **Asset binding only handles `GET`/`HEAD`.**
- **One warning per isolate** for the partial-config error.

## Style

Oxfmt enforces: no semicolons, single quotes, 2-space indent, 120-char width, trailing commas (`es5`), grouped imports per `.oxfmtrc.json`. Filenames are kebab-case; exported types are PascalCase; functions/variables camelCase. ES modules with `.js` extensions in relative imports (TypeScript NodeNext resolution).

Tests live in `tests/` as `*.test.ts` (Vitest). There's no coverage threshold — add regression tests for behavior changes, especially around malformed credentials, UTF-8 payloads, response headers, and method routing.

## Releasing

Publishing is manual (interactive 2FA); CI handles the GitHub Release only.

```sh
npm publish --access public   # local, prompts for OTP
npm version patch             # bumps, commits, tags
git push --follow-tags        # tag push triggers .github/workflows release
```

The release workflow re-runs typecheck / test / build against the tagged commit and refuses to publish if the tag does not match `package.json` version. No npm token is stored in CI.
