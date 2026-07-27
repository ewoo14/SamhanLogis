import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = resolve(HERE, '../../../scripts/ds4-real-qa-cleanup-worker.cjs')

interface FakeServer {
  url: string
  getLoginCalls: () => number
  close: () => Promise<void>
}

function startFakeGroupwareServer(): Promise<FakeServer> {
  return new Promise((resolvePromise) => {
    let loginCalls = 0
    const server: Server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/auth/login') {
        loginCalls += 1
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: { token: 't', userId: 'u', role: 'MASTER' } }))
        return
      }
      if (req.method === 'GET' && req.url === '/admin/groupware/document-templates') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: [] }))
        return
      }
      res.writeHead(404)
      res.end()
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolvePromise({
        url: `http://127.0.0.1:${port}`,
        getLoginCalls: () => loginCalls,
        close: () => new Promise<void>((res) => server.close(() => res())),
      })
    })
  })
}

function spawnWorker(opts: {
  apiBase: string
  scopeFile: string
  stopFile: string
  noticeIntervalMs: number
}): ChildProcess {
  const passwordB64 = Buffer.from('dev_p05_pass!', 'utf8').toString('base64')
  return spawn(process.execPath, [
    WORKER_PATH,
    '--api-base', opts.apiBase,
    '--scope-file', opts.scopeFile,
    '--stop-file', opts.stopFile,
    '--password-b64', passwordB64,
    '--notice-interval-ms', String(opts.noticeIntervalMs),
  ], { stdio: 'ignore' })
}

/**
 * #913-1/R1-2 회귀 울타리 — 현재(fix된) worker 대상. 옛 버전(hard-coded 15분 TTL, override
 * 불가)에 대한 실제 RED 재현은 자동 테스트로 옮기지 않았다 — 15분을 실제로 기다리는 대신,
 * git HEAD(ce59b694c) 원본에서 TTL 상수 한 줄만 override 가능하게 바꾼 사본으로 별도
 * 재현했다(dev-report 참고, 실행 원문 포함). 이 파일은 "지금부터" 회귀를 막는 용도다.
 */
describe('#913-1/R1-2 실 QA cleanup worker — owner 생존이 TTL을 이긴다', () => {
  let tmpDir = ''
  let server: FakeServer | null = null
  let child: ChildProcess | null = null

  afterEach(async () => {
    if (child && child.exitCode === null && child.pid) {
      try {
        process.kill(child.pid, 'SIGKILL')
      } catch {
        /* 이미 종료 */
      }
    }
    if (server) await server.close()
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
    server = null
    child = null
    tmpDir = ''
  })

  it('🚨 owner(자기 자신)가 살아있으면 notice-interval을 여러 번 넘겨도 cleanup(로그인)이 호출되지 않는다', async () => {
    server = await startFakeGroupwareServer()
    tmpDir = mkdtempSync(join(tmpdir(), 'ds4-worker-test-'))
    const stopFile = join(tmpDir, 'never-created.stop')
    const scopeFile = join(tmpDir, 'scope.json')
    writeFileSync(scopeFile, JSON.stringify({
      version: 1,
      runId: 'owner-alive',
      templateId: '11111111-1111-4111-8111-111111111111',
      templateName: '사용자가 정할 수 있는 이름',
      ownerPid: process.pid,
      startedAtMs: Date.now(),
    }))

    child = spawnWorker({
      apiBase: server.url,
      scopeFile,
      stopFile,
      noticeIntervalMs: 120,
    })

    await new Promise((r) => setTimeout(r, 900)) // notice-interval의 7배 이상 경과

    expect(
      server.getLoginCalls(),
      'owner가 살아있는데 cleanup(로그인)이 호출됐다 — TTL이 생존을 이겼다(R1-2 회귀)',
    ).toBe(0)
  })

  it('owner가 실제로 죽으면 stop marker 없이도 회수한다(기존 동작 회귀 방지)', async () => {
    server = await startFakeGroupwareServer()
    tmpDir = mkdtempSync(join(tmpdir(), 'ds4-worker-test-'))
    const stopFile = join(tmpDir, 'never-created2.stop')
    const owner = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 50)'], { stdio: 'ignore' })
    const ownerPid = owner.pid
    if (!ownerPid) throw new Error('owner pid를 얻지 못했다')
    const scopeFile = join(tmpDir, 'scope2.json')
    writeFileSync(scopeFile, JSON.stringify({
      version: 1,
      runId: 'owner-dead',
      templateId: '22222222-2222-4222-8222-222222222222',
      templateName: 'owner dead',
      ownerPid,
      startedAtMs: Date.now(),
    }))

    child = spawnWorker({
      apiBase: server.url,
      scopeFile,
      stopFile,
      noticeIntervalMs: 100_000,
    })

    await new Promise<void>((resolvePromise) => {
      const interval = setInterval(() => {
        if ((server?.getLoginCalls() ?? 0) > 0) {
          clearInterval(interval)
          resolvePromise()
        }
      }, 50)
      setTimeout(() => {
        clearInterval(interval)
        resolvePromise()
      }, 5000)
    })

    expect(server.getLoginCalls(), 'owner가 죽었는데도 cleanup이 호출되지 않았다').toBeGreaterThan(0)
  }, 8000)
})
