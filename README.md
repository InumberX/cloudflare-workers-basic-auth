# @inumberx/cloudflare-workers-basic-auth

A small, dependency-free Basic authentication gate for [Cloudflare Workers](https://workers.cloudflare.com/) with optional static-asset routing. Works with any framework that exposes a `(Request) => Response` handler (React Router, Hono, itty-router, or plain Workers).

## Features

- **Fail-closed on misconfiguration.** If only one of user / pass is set, every request is rejected with `503` instead of silently leaving the gate open.
- **Constant-time credential comparison.** Both sides are hashed to a fixed-length SHA-256 digest before comparing, so neither the user nor the pass leaks length via response timing.
- **UTF-8 credentials.** Non-ASCII usernames and passwords (e.g. `管理者:パスワード`) are decoded correctly per RFC 7617.
- **Method-aware static asset routing.** Only `GET` / `HEAD` are forwarded to the assets binding; mutating methods go straight to your handler so forms and CSRF-protected actions aren't blocked by a `405`.
- **One-warning-per-isolate logging.** A misconfigured deploy produces a single error per isolate, not one per request.
- **Web Standards only.** Uses `Request` / `Response` / `crypto.subtle` / `atob` / `TextDecoder`. No runtime dependencies.

## Installation

```sh
npm install @inumberx/cloudflare-workers-basic-auth
```

## Quick start

### React Router v7 on Cloudflare Workers

```ts
// workers/app.ts
import { createWorkerFetch } from '@inumberx/cloudflare-workers-basic-auth'
import { createRequestHandler } from 'react-router'

type Env = {
  BASIC_AUTH_USER?: string
  BASIC_AUTH_PASS?: string
  ASSETS: Fetcher
}

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE
)

const handleFetch = createWorkerFetch<Env>({
  handler: requestHandler,
  realm: 'My App',
  basicAuth: (env) => ({ user: env.BASIC_AUTH_USER, pass: env.BASIC_AUTH_PASS }),
  assets: (env) => env.ASSETS,
})

export default {
  fetch: (request, env) => handleFetch(request, env),
} satisfies ExportedHandler<Env>
```

### Hono

```ts
import { createWorkerFetch } from '@inumberx/cloudflare-workers-basic-auth'
import { Hono } from 'hono'

type Env = { BASIC_AUTH_USER?: string; BASIC_AUTH_PASS?: string }

const app = new Hono<{ Bindings: Env }>()
app.get('/', (c) => c.text('hello'))

const handleFetch = createWorkerFetch<Env>({
  handler: app.fetch,
  realm: 'My App',
  basicAuth: (env) => ({ user: env.BASIC_AUTH_USER, pass: env.BASIC_AUTH_PASS }),
})

export default {
  fetch: (request, env) => handleFetch(request, env),
} satisfies ExportedHandler<Env>
```

### Plain Workers

```ts
import { createWorkerFetch } from '@inumberx/cloudflare-workers-basic-auth'

type Env = { BASIC_AUTH_USER?: string; BASIC_AUTH_PASS?: string }

const handleFetch = createWorkerFetch<Env>({
  handler: async (request) => new Response(`Hello ${new URL(request.url).pathname}`),
  basicAuth: (env) => ({ user: env.BASIC_AUTH_USER, pass: env.BASIC_AUTH_PASS }),
})

export default {
  fetch: (request, env) => handleFetch(request, env),
} satisfies ExportedHandler<Env>
```

### Setting credentials

Set both secrets via Wrangler:

```sh
npx wrangler secret put BASIC_AUTH_USER
npx wrangler secret put BASIC_AUTH_PASS
```

If both are unset, the gate is disabled (requests pass through). If exactly one is set, every request returns `503` until the misconfiguration is fixed.

## API

### `createWorkerFetch<Env>(options)`

Returns a `(request: Request, env: Env) => Promise<Response>` function suitable for assignment to a Worker's `fetch` export.

#### Options

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `handler` | `(request: Request) => Response \| Promise<Response>` | yes | Your application's request handler, invoked when auth passes and no static asset matches. |
| `basicAuth` | `(env: Env) => { user: string \| undefined; pass: string \| undefined }` | yes | Resolves the expected credentials from `env`. Return `undefined` for both to disable the gate. |
| `assets` | `(env: Env) => AssetFetcher \| undefined` | no | Resolves a static asset fetcher (typically `env.ASSETS`). When provided, `GET` / `HEAD` requests are tried against the assets binding first; non-404 responses are returned directly, 404s fall through to `handler`. |
| `realm` | `string` | no | Realm advertised in `WWW-Authenticate` on 401 responses. Defaults to `"Restricted"`. |

#### Authentication semantics

| `user` resolved | `pass` resolved | Behavior |
| --- | --- | --- |
| undefined / empty | undefined / empty | Gate disabled, all requests pass through |
| set | set | Request is verified; mismatch returns `401` |
| set | undefined / empty | Fail closed: every request returns `503` |
| undefined / empty | set | Fail closed: every request returns `503` |

## Security notes

- **Constant-time comparison.** Credentials are digested with SHA-256 before iterating bytes, so the comparison loop runs a fixed number of bytes (32) regardless of input length. This neutralizes timing-based length probing.
- **Parallel comparison.** User and password are checked in parallel so a wrong username does not return measurably faster than a wrong password.
- **UTF-8 strict decoding.** Invalid UTF-8 sequences in the credential payload return `401` rather than silently substituting replacement characters.
- **Static assets only handle safe methods.** Mutating methods (`POST` / `PUT` / `DELETE` / `PATCH`) skip the assets binding so they don't get a spurious `405` from the asset router before reaching your handler.

## Development

```sh
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest (watch mode)
npm test -- --run     # vitest single run
npm run lint          # oxlint
npm run format        # oxfmt --check
npm run build         # produces dist/
```

## License

[MIT](./LICENSE) © NiNE
