const DEFAULT_REALM = 'Restricted'

// Sanitize the realm for use as a `WWW-Authenticate` quoted-string value
// (RFC 7235 §2.2). Strip CTLs (`\x00-\x1F`, `\x7F`) so that the resulting
// header passes `Headers` validation (which would otherwise throw and crash
// request handling), and escape `\` / `"` so the quoted-string stays valid.
function sanitizeRealm(realm: string): string {
  // eslint-disable-next-line no-control-regex
  const stripped = realm.replace(/[\x00-\x1F\x7F]/g, '')
  if (stripped.length === 0) {
    return DEFAULT_REALM
  }
  return stripped.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function unauthorizedResponse(realm: string = DEFAULT_REALM): Response {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${sanitizeRealm(realm)}", charset="UTF-8"` },
  })
}
