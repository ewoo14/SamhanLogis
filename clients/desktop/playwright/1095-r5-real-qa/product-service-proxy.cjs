const http = require('node:http')

const server = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': request.headers.origin ?? 'http://127.0.0.1:5295',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': request.headers['access-control-request-headers'] ?? 'authorization,content-type',
      'access-control-allow-credentials': 'true',
    })
    response.end()
    return
  }

  const legacyProductPath = request.url === '/api/products'
    || request.url.startsWith('/api/products?')
    || request.url.startsWith('/api/products/')
  const catalogProductPath = request.url === '/api/v1/products'
    || request.url.startsWith('/api/v1/products?')
    || request.url.startsWith('/api/v1/products/')
  const isProduct = legacyProductPath || catalogProductPath
  const targetPort = isProduct ? 28084 : 8080
  const targetPath = legacyProductPath ? request.url.replace(/^\/api/, '') : request.url
  const headers = { ...request.headers, host: `127.0.0.1:${targetPort}` }

  if (isProduct && typeof request.headers.authorization === 'string') {
    try {
      const token = request.headers.authorization.replace(/^Bearer\s+/i, '')
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
      headers['x-user-id'] = String(claims.sub ?? '')
      headers['x-is-system-master'] = String(claims.isSystemMaster === true)
      headers['x-user-groups'] = Array.isArray(claims.groups) ? claims.groups.join(',') : ''
      if (claims.name) headers['x-user-name'] = encodeURIComponent(String(claims.name))
    } catch {
      // Upstream security returns the authoritative error for malformed tokens.
    }
  }

  const upstream = http.request({
    hostname: '127.0.0.1',
    port: targetPort,
    method: request.method,
    path: targetPath,
    headers,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, {
      ...upstreamResponse.headers,
      'access-control-allow-origin': request.headers.origin ?? 'http://127.0.0.1:5295',
      'access-control-allow-credentials': 'true',
    })
    upstreamResponse.pipe(response)
  })
  upstream.on('error', (error) => {
    response.writeHead(502, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: error.message }))
  })
  request.pipe(upstream)
})

server.listen(5296, '127.0.0.1')
