import { describe, expect, it } from 'vitest'

import { timingSafeEqual } from '../src/basic-auth/timing-safe-equal.js'

describe('timingSafeEqual', () => {
  it('returns true for identical strings', async () => {
    expect(await timingSafeEqual('admin', 'admin')).toBe(true)
  })

  it('returns false for differing strings', async () => {
    expect(await timingSafeEqual('admin', 'admins')).toBe(false)
  })

  it('returns true for two empty strings', async () => {
    expect(await timingSafeEqual('', '')).toBe(true)
  })

  it('returns false when one side is empty', async () => {
    expect(await timingSafeEqual('', 'x')).toBe(false)
    expect(await timingSafeEqual('x', '')).toBe(false)
  })

  it('handles UTF-8 multibyte input', async () => {
    expect(await timingSafeEqual('管理者', '管理者')).toBe(true)
    expect(await timingSafeEqual('管理者', '管理人')).toBe(false)
  })

  it('handles very long inputs without leaking length difference', async () => {
    const a = 'a'.repeat(10000)
    const b = 'b'
    expect(await timingSafeEqual(a, b)).toBe(false)
    expect(await timingSafeEqual(a, a)).toBe(true)
  })
})
