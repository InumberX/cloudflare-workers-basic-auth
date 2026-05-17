import { decodeBasicCredentials } from './decode.js'
import { timingSafeEqual } from './timing-safe-equal.js'
import { unauthorizedResponse } from './unauthorized.js'

// HTTP authorization scheme matching is case-insensitive per RFC 7235.
const BASIC_AUTH_HEADER_PATTERN = /^Basic\s+(.+)$/i

export type VerifyBasicAuthOptions = {
  user: string
  pass: string
  realm?: string
}

export async function verifyBasicAuth(request: Request, options: VerifyBasicAuthOptions): Promise<Response | null> {
  const { user: expectedUser, pass: expectedPass, realm } = options
  const header = request.headers.get('Authorization')
  const match = header?.match(BASIC_AUTH_HEADER_PATTERN)
  if (!match) {
    return unauthorizedResponse(realm)
  }
  const decoded = decodeBasicCredentials(match[1])
  if (decoded === null) {
    return unauthorizedResponse(realm)
  }
  const sep = decoded.indexOf(':')
  if (sep === -1) {
    return unauthorizedResponse(realm)
  }
  const user = decoded.slice(0, sep)
  const pass = decoded.slice(sep + 1)
  // Run both comparisons in parallel so a wrong username does not return
  // sooner than a wrong password (which itself would be a small timing leak).
  const [userOk, passOk] = await Promise.all([timingSafeEqual(user, expectedUser), timingSafeEqual(pass, expectedPass)])
  if (!userOk || !passOk) {
    return unauthorizedResponse(realm)
  }
  return null
}
