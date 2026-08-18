import http from 'node:http'
import fs from 'node:fs'

const env = {}
for (const line of fs.readFileSync('infrastructure/.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
}

function claimsFromCookie(cookie) {
  const token = (cookie.match(/(?:^|;\s*)access_token=([^;]+)/) ?? [])[1]
  if (!token) return {}
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) } catch { return {} }
}

const server = http.createServer((request, response) => {
  const isSlip = request.url?.startsWith('/slips') || request.url?.startsWith('/collab')
  const target = `${isSlip ? 'http://127.0.0.1:28086' : 'http://127.0.0.1:8080'}${request.url}`
  const claims = claimsFromCookie(request.headers.cookie ?? '')
  const headers = { ...request.headers, host: new URL(target).host, origin: 'http://127.0.0.1:5126' }
  if (isSlip) {
    headers['x-samhan-gateway-attestation'] = env.SAMHAN_GATEWAY_ATTESTATION
    headers['x-user-id'] = String(claims.sub ?? '')
    headers['x-user-groups'] = typeof claims.groups === 'string' ? claims.groups : ''
    headers['x-is-system-master'] = String(claims.isSystemMaster ?? false)
  }
  const upstream = http.request(target, { method: request.method, headers }, (upstreamResponse) => {
    const out = { ...upstreamResponse.headers, 'access-control-allow-origin': 'http://127.0.0.1:5126', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'Content-Type, Authorization, X-Requested-With', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' }
    response.writeHead(upstreamResponse.statusCode ?? 502, out)
    upstreamResponse.pipe(response)
  })
  upstream.on('error', (error) => { response.writeHead(502); response.end(String(error)) })
  request.pipe(upstream)
})

server.listen(28126, '127.0.0.1', () => console.log('CODEX1266_PROXY=http://127.0.0.1:28126'))
