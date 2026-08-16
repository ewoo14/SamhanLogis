import http from 'node:http'

const port = Number(process.env.QA_PROXY_PORT || 29280)
const sharedGateway = new URL(process.env.QA_SHARED_GATEWAY || 'http://127.0.0.1:8080')
const isolatedPartnerOrder = new URL(process.env.QA_ISOLATED_PARTNER_ORDER || 'http://127.0.0.1:29288')

const server = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': request.headers.origin || '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': request.headers['access-control-request-headers'] || '*',
    })
    response.end()
    return
  }
  const target = request.url?.startsWith('/api/v1/partner-orders')
    ? isolatedPartnerOrder
    : sharedGateway
  const upstream = http.request({
    hostname: target.hostname,
    port: target.port,
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: target.host },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, {
      ...upstreamResponse.headers,
      'access-control-allow-origin': request.headers.origin || '*',
    })
    upstreamResponse.pipe(response)
  })
  upstream.on('error', (error) => {
    response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ error: error.message }))
  })
  request.pipe(upstream)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`REAL_QA_PROXY=http://127.0.0.1:${port}`)
})
