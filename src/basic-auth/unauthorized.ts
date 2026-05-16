const DEFAULT_REALM = 'Restricted'

// Escape characters that would break the WWW-Authenticate quoted-string value
// (RFC 7235 §2.2). Without escaping, a realm containing `"` or `\` could
// produce a malformed header.
function escapeRealm(realm: string): string {
  return realm.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function unauthorizedResponse(realm: string = DEFAULT_REALM): Response {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${escapeRealm(realm)}", charset="UTF-8"` },
  })
}
