'use strict'

const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { createRequire } = require('node:module')

const estimateAppRequire = createRequire(path.resolve(__dirname, '../../../web/estimate-app/package.json'))
const { google } = estimateAppRequire('googleapis')
const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
if (!keyPath) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY 누락')
const credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
const auth = new google.auth.JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})
const sheets = google.sheets({ version: 'v4', auth })
let statusOverride = ''

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1:5297')
    if (url.pathname === '/__r10/status') {
      if (request.method === 'POST') {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        statusOverride = payload.value === '품절' ? '품절' : ''
      }
      send(response, 200, { value: statusOverride })
      return
    }

    const match = /^\/v4\/spreadsheets\/([^/]+)\/values\/(.+)$/.exec(url.pathname)
    if (!match || request.method !== 'GET') {
      send(response, 404, { error: { message: 'R10 proxy route not found' } })
      return
    }
    const spreadsheetId = decodeURIComponent(match[1])
    const range = decodeURIComponent(match[2])
    const valueRenderOption = url.searchParams.get('valueRenderOption') || 'FORMATTED_VALUE'
    const upstream = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption,
    })
    const body = upstream.data
    if (statusOverride === '품절'
        && valueRenderOption === 'FORMATTED_VALUE'
        && range.includes('상업멀티_단가인상')) {
      body.values = body.values || []
      body.values[3] = body.values[3] || []
      body.values[3][8] = '품절'
    }
    send(response, 200, body)
  } catch (error) {
    send(response, 500, { error: { message: error instanceof Error ? error.message : String(error) } })
  }
})

server.listen(5297, '0.0.0.0')
