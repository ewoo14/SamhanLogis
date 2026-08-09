import http from 'node:http'

const productUpstream = new URL(process.env.DISPOSABLE_PRODUCT_UPSTREAM ?? 'http://127.0.0.1:18084')
const gatewayUpstream = new URL(process.env.REAL_GATEWAY_UPSTREAM ?? 'http://127.0.0.1:8080')
const port = Number(process.env.DISPOSABLE_PRODUCT_PROXY_PORT ?? '18085')

const server = http.createServer((request, response) => {
  const corsHeaders = {
    'access-control-allow-origin': request.headers.origin ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders)
    response.end()
    return
  }

  const isProductSync = request.url?.startsWith('/api/v1/products/admin/sync') ?? false
  const upstream = isProductSync ? productUpstream : gatewayUpstream

  const upstreamRequest = http.request({
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port,
    method: request.method,
    path: request.url,
    headers: {
      ...request.headers,
      host: upstream.host,
      ...(isProductSync ? {
        'x-is-system-master': 'true',
        'x-user-id': '00000000-0000-0000-0000-000000000001',
      } : {}),
    },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, {
      ...upstreamResponse.headers,
      ...corsHeaders,
    })
    upstreamResponse.pipe(response)
  })
  upstreamRequest.on('error', (error) => {
    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', ...corsHeaders })
    response.end(error.message)
  })
  request.pipe(upstreamRequest)
})

server.listen(port, '127.0.0.1')

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
