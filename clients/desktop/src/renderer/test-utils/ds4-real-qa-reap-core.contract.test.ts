import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'

import { reapStaleDs4Templates } from '../../../scripts/ds4-real-qa-reap-core.cjs'

interface FakeServer {
  url: string
  deletedIds: string[]
  close: () => Promise<void>
}

function startFakeServer(items: Array<{ id: string; name: string }>): Promise<FakeServer> {
  return new Promise((resolve) => {
    const deletedIds: string[] = []
    const server: Server = createServer((request, response) => {
      if (request.method === 'GET' && request.url === '/admin/groupware/document-templates') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ data: items }))
        return
      }
      if (request.method === 'DELETE' && request.url?.startsWith('/admin/groupware/document-templates/')) {
        deletedIds.push(request.url.split('/').pop() ?? '')
        response.writeHead(200)
        response.end(JSON.stringify({ data: null }))
        return
      }
      response.writeHead(404)
      response.end()
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        url: `http://127.0.0.1:${port}`,
        deletedIds,
        close: () => new Promise<void>((done) => server.close(() => done())),
      })
    })
  })
}

describe('#913-1 stale reap ownership', () => {
  let server: FakeServer | null = null
  let registryDir = ''

  afterEach(async () => {
    if (server) await server.close()
    if (registryDir) rmSync(registryDir, { recursive: true, force: true })
    server = null
    registryDir = ''
  })

  it('같은 이름 형태를 사용자가 골라도 등록된 QA template ID만 삭제한다', async () => {
    const now = Date.now()
    const userTemplateId = '11111111-1111-4111-8111-111111111111'
    const qaTemplateId = '22222222-2222-4222-8222-222222222222'
    const userChosenName = `Monthly close user template 999999937-${now - 5 * 60 * 1000}-7ee08a7a-4975-424b-ab03-092fea77740b`
    server = await startFakeServer([
      { id: userTemplateId, name: userChosenName },
      { id: qaTemplateId, name: 'QA run has an arbitrary display name' },
    ])
    registryDir = mkdtempSync(join(tmpdir(), 'ds4-reap-contract-'))

    const result = await reapStaleDs4Templates({
      apiBase: server.url,
      authHeaders: {},
      graceMs: 60_000,
      now,
      registryDir,
      runRecords: [{
        version: 1,
        runId: 'qa-run-1',
        templateId: qaTemplateId,
        templateName: 'QA run has an arbitrary display name',
        ownerPid: 999999937,
        startedAtMs: now - 5 * 60 * 1000,
      }],
    })

    expect(result.deleted).toBe(1)
    expect(server.deletedIds).toEqual([qaTemplateId])
    expect(server.deletedIds).not.toContain(userTemplateId)
  })
})
