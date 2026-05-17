import { afterEach, describe, expect, it, vi } from 'vitest'

import { createWorkerFetch, type AssetFetcher } from '../src/worker-fetch/create-worker-fetch.js'

const USER = 'admin'
const PASS = 'secret'

type TestEnv = {
  USER?: string
  PASS?: string
  ASSETS?: AssetFetcher
}

function basicHeader(user: string, pass: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(`${user}:${pass}`)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return `Basic ${btoa(binary)}`
}

function buildRequest(options: { method?: string; authHeader?: string } = {}): Request {
  const { method = 'GET', authHeader } = options
  const headers = new Headers()
  if (authHeader !== undefined) {
    headers.set('Authorization', authHeader)
  }
  return new Request('https://example.com/', { method, headers })
}

function buildEnv(overrides: Partial<TestEnv> = {}): { env: TestEnv; assetsFetch: ReturnType<typeof vi.fn> } {
  const assetsFetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
  const env: TestEnv = {
    ASSETS: { fetch: assetsFetch } as unknown as AssetFetcher,
    ...overrides,
  }
  return { env, assetsFetch }
}

describe('createWorkerFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards to handler when no auth env is configured and asset is missing', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
      assets: (env) => env.ASSETS,
    })
    const { env } = buildEnv()
    const response = await fetch(buildRequest(), env)
    expect(handler).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })

  it('returns the static asset when ASSETS has a match', async () => {
    const handler = vi.fn()
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
      assets: (env) => env.ASSETS,
    })
    const { env, assetsFetch } = buildEnv()
    assetsFetch.mockResolvedValue(new Response('asset-body', { status: 200 }))
    const response = await fetch(buildRequest(), env)
    expect(handler).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('asset-body')
  })

  it('skips asset routing entirely when no assets resolver is provided', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('ssr-only', { status: 200 }))
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
    })
    const { env, assetsFetch } = buildEnv()
    const response = await fetch(buildRequest(), env)
    expect(assetsFetch).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledOnce()
    expect(await response.text()).toBe('ssr-only')
  })

  it('skips asset routing when the assets resolver returns undefined for this env', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('ssr-only', { status: 200 }))
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
      assets: () => undefined,
    })
    const { env, assetsFetch } = buildEnv()
    const response = await fetch(buildRequest(), env)
    expect(assetsFetch).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledOnce()
    expect(await response.text()).toBe('ssr-only')
  })

  it('fails closed with 503 when only USER is set', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = vi.fn()
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
      assets: (env) => env.ASSETS,
    })
    const { env, assetsFetch } = buildEnv({ USER })
    const response = await fetch(buildRequest(), env)
    expect(handler).not.toHaveBeenCalled()
    expect(assetsFetch).not.toHaveBeenCalled()
    expect(response.status).toBe(503)
  })

  it('fails closed with 503 when only PASS is set', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = vi.fn()
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
      assets: (env) => env.ASSETS,
    })
    const { env, assetsFetch } = buildEnv({ PASS })
    const response = await fetch(buildRequest(), env)
    expect(handler).not.toHaveBeenCalled()
    expect(assetsFetch).not.toHaveBeenCalled()
    expect(response.status).toBe(503)
  })

  it('logs the partial-config error only once per isolate (not per request)', async () => {
    vi.resetModules()
    const { createWorkerFetch: freshCreateWorkerFetch } = await import('../src/worker-fetch/create-worker-fetch.js')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = vi.fn()
    const fetch = freshCreateWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
      assets: (env) => env.ASSETS,
    })
    const { env } = buildEnv({ USER })
    await fetch(buildRequest(), env)
    await fetch(buildRequest(), env)
    await fetch(buildRequest(), env)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('returns 401 without consulting ASSETS or handler when auth required and header missing', async () => {
    const handler = vi.fn()
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
      assets: (env) => env.ASSETS,
    })
    const { env, assetsFetch } = buildEnv({ USER, PASS })
    const response = await fetch(buildRequest(), env)
    expect(handler).not.toHaveBeenCalled()
    expect(assetsFetch).not.toHaveBeenCalled()
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain('Basic')
  })

  it('returns 401 without consulting ASSETS or handler when credentials are wrong', async () => {
    const handler = vi.fn()
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
      assets: (env) => env.ASSETS,
    })
    const { env, assetsFetch } = buildEnv({ USER, PASS })
    const response = await fetch(buildRequest({ authHeader: basicHeader('wrong', 'wrong') }), env)
    expect(handler).not.toHaveBeenCalled()
    expect(assetsFetch).not.toHaveBeenCalled()
    expect(response.status).toBe(401)
  })

  it('uses the configured realm in 401 responses', async () => {
    const handler = vi.fn()
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      realm: 'My App',
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
    })
    const { env } = buildEnv({ USER, PASS })
    const response = await fetch(buildRequest(), env)
    expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="My App", charset="UTF-8"')
  })

  it('forwards to handler when auth required, credentials correct, and asset is missing', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('ssr', { status: 200 }))
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
      assets: (env) => env.ASSETS,
    })
    const { env, assetsFetch } = buildEnv({ USER, PASS })
    const response = await fetch(buildRequest({ authHeader: basicHeader(USER, PASS) }), env)
    expect(assetsFetch).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledOnce()
    expect(await response.text()).toBe('ssr')
  })

  it('returns asset (after auth pass) without invoking handler when ASSETS has a match', async () => {
    const handler = vi.fn()
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
      assets: (env) => env.ASSETS,
    })
    const { env, assetsFetch } = buildEnv({ USER, PASS })
    assetsFetch.mockResolvedValue(new Response('asset-body', { status: 200 }))
    const response = await fetch(buildRequest({ authHeader: basicHeader(USER, PASS) }), env)
    expect(handler).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('asset-body')
  })

  it('passes through the original Request to the handler', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('ok'))
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
      assets: (env) => env.ASSETS,
    })
    const { env } = buildEnv()
    const request = buildRequest()
    await fetch(request, env)
    expect(handler).toHaveBeenCalledWith(request)
  })

  describe.each(['POST', 'PUT', 'DELETE', 'PATCH'])('non-GET method (%s)', (method) => {
    it('skips ASSETS and goes straight to handler', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('ok'))
      const fetch = createWorkerFetch<TestEnv>({
        handler,
        basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
        assets: (env) => env.ASSETS,
      })
      const { env, assetsFetch } = buildEnv()
      const response = await fetch(buildRequest({ method }), env)
      expect(assetsFetch).not.toHaveBeenCalled()
      expect(handler).toHaveBeenCalledOnce()
      expect(response.status).toBe(200)
    })

    it('still rejects with 401 when auth fails before reaching handler', async () => {
      const handler = vi.fn()
      const fetch = createWorkerFetch<TestEnv>({
        handler,
        basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
        assets: (env) => env.ASSETS,
      })
      const { env, assetsFetch } = buildEnv({ USER, PASS })
      const response = await fetch(buildRequest({ method }), env)
      expect(assetsFetch).not.toHaveBeenCalled()
      expect(handler).not.toHaveBeenCalled()
      expect(response.status).toBe(401)
    })
  })

  it('uses ASSETS for HEAD requests (same routing as GET)', async () => {
    const handler = vi.fn()
    const fetch = createWorkerFetch<TestEnv>({
      handler,
      basicAuth: (env) => ({ user: env.USER, pass: env.PASS }),
      assets: (env) => env.ASSETS,
    })
    const { env, assetsFetch } = buildEnv()
    assetsFetch.mockResolvedValue(new Response(null, { status: 200 }))
    const response = await fetch(buildRequest({ method: 'HEAD' }), env)
    expect(assetsFetch).toHaveBeenCalledOnce()
    expect(handler).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
  })
})
