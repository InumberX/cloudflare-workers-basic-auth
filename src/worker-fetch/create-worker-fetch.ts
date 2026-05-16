import { verifyBasicAuth } from '../basic-auth/verify.js'

// Static assets only answer safe, body-less methods. Routing POST/PUT/DELETE
// /PATCH through the assets fetcher would surface 405s for the app's own
// mutating routes (forms, CSRF-protected actions) before the handler can
// process them.
const ASSET_FETCH_METHODS = new Set(['GET', 'HEAD'])

export type BasicAuthCredentials = {
  user: string | undefined
  pass: string | undefined
}

// Structurally compatible with `@cloudflare/workers-types` `Fetcher`. Declared
// locally so the public type surface does not require consumers to install
// `@cloudflare/workers-types`.
export type AssetFetcher = {
  fetch(request: Request): Response | Promise<Response>
}

export type CreateWorkerFetchOptions<Env> = {
  handler: (request: Request) => Response | Promise<Response>
  realm?: string
  basicAuth: (env: Env) => BasicAuthCredentials
  assets?: (env: Env) => AssetFetcher | undefined
}

// Tracks whether the partial-config error has already been logged in this
// isolate. Without this, a misconfigured deploy would emit one identical
// error per request and flood Workers logs.
let partialAuthConfigWarned = false

export function createWorkerFetch<Env>(
  options: CreateWorkerFetchOptions<Env>
): (request: Request, env: Env) => Promise<Response> {
  const { handler, realm, basicAuth, assets } = options
  return async function fetch(request, env) {
    const { user, pass } = basicAuth(env)
    const hasUser = Boolean(user)
    const hasPass = Boolean(pass)
    // Fail closed on partial configuration: a misplaced credential
    // (only one of user/pass) would silently disable the auth gate.
    if (hasUser !== hasPass) {
      if (!partialAuthConfigWarned) {
        partialAuthConfigWarned = true
        console.error(
          'Basic auth misconfiguration: user and pass must both be set or both be unset; rejecting all requests.'
        )
      }
      return new Response('Service Unavailable', { status: 503 })
    }
    if (user && pass) {
      const denied = await verifyBasicAuth(request, { user, pass, realm })
      if (denied) {
        return denied
      }
    }
    const assetFetcher = assets?.(env)
    if (assetFetcher && ASSET_FETCH_METHODS.has(request.method)) {
      const assetResponse = await assetFetcher.fetch(request)
      if (assetResponse.status !== 404) {
        return assetResponse
      }
    }
    return handler(request)
  }
}
