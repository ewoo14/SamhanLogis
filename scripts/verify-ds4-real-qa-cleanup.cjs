#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')

if (process.env.VERIFY_REAL_QA !== '1') {
  console.error('VERIFY_REAL_QA=1일 때만 공유 실 DB probe를 실행합니다.')
  process.exit(2)
}

const apiBase = process.env.API_BASE || 'http://localhost:8080'
const password = process.env.DEV_PASSWORD || 'dev_p05_pass!'
const runId = `${process.pid}-${Date.now()}-${randomUUID()}`
const workerPath = path.resolve(__dirname, '../clients/desktop/scripts/ds4-real-qa-cleanup-worker.cjs')
const names = {
  timeout: `DS4 실서버QA probe-timeout ${runId}`,
  forced: `DS4 실서버QA probe-forced ${runId}`,
  concurrentA: `DS4 실서버QA probe-concurrent-a ${runId}`,
  concurrentB: `DS4 실서버QA probe-concurrent-b ${runId}`,
  sentinel: `DS4 실서버QA probe-sentinel ${runId}`,
}

const document = {
  paper: 'A4_PORTRAIT',
  bands: [
    { key: 'header', kind: 'HEADER', elements: [
      { key: 'title', type: 'TITLE' },
      { key: 'approval', type: 'APPROVAL_GRID' },
    ] },
    { key: 'body', kind: 'BODY', elements: [
      { key: 'content', type: 'CONTENT_PARAGRAPHS' },
    ] },
    { key: 'footer', kind: 'FOOTER', elements: [
      { key: 'closing', type: 'CLOSING' },
    ] },
  ],
}

let authHeaders

async function login() {
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password }),
  })
  if (!response.ok) throw new Error(`로그인 HTTP ${response.status}`)
  const body = await response.json()
  const data = body.data ?? {}
  authHeaders = {
    Authorization: `Bearer ${data.token ?? ''}`,
    'X-User-Id': data.userId ?? '',
    'X-User-Role': data.role ?? 'MASTER',
  }
}

async function listNames() {
  const response = await fetch(`${apiBase}/admin/groupware/document-templates`, { headers: authHeaders })
  if (!response.ok) throw new Error(`양식 목록 HTTP ${response.status}`)
  const body = await response.json()
  return Array.isArray(body.data) ? body.data : []
}

async function create(name) {
  const response = await fetch(`${apiBase}/admin/groupware/document-templates`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docType: `GROUPWARE_QA_913_${runId.slice(-24)}`,
      name,
      schemaVersion: 1,
      document,
    }),
  })
  if (!response.ok) throw new Error(`양식 생성(${name}) HTTP ${response.status}`)
  const body = await response.json()
  return body.data?.id
}

async function deleteExact(name) {
  const items = await listNames()
  const mine = items.filter((item) => item.name === name)
  for (const item of mine) {
    const response = await fetch(`${apiBase}/admin/groupware/document-templates/${item.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    if (!response.ok) throw new Error(`양식 삭제(${name}) HTTP ${response.status}`)
  }
  return mine.length
}

function runWorkerForOwner(name, ownerPid) {
  const stopFile = path.join(os.tmpdir(), `samhan-ds4-probe-${runId}-${randomUUID()}.stop`)
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      workerPath,
      '--api-base', apiBase,
      '--template-name', name,
      '--owner-pid', String(ownerPid),
      '--stop-file', stopFile,
    ], {
      env: { ...process.env, SAMHAN_DS4_QA_PASSWORD: password },
      windowsHide: true,
      stdio: 'ignore',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0 && !signal) resolve()
      else reject(new Error(`cleanup worker 종료 code=${code} signal=${signal}`))
    })
  })
}

function runWorker(name) {
  return runWorkerForOwner(name, 99999999)
}

function runOwnerLifecycle(name, mode) {
  const owner = spawn(process.execPath, [
    '-e', mode === 'timeout'
      ? 'setTimeout(() => process.exit(124), 80)'
      : 'setInterval(() => {}, 1000)',
  ], { windowsHide: true, stdio: 'ignore' })
  const ownerExit = new Promise((resolve, reject) => {
    owner.once('error', reject)
    owner.once('exit', (code, signal) => resolve({ code, signal }))
  })
  const workerExit = runWorkerForOwner(name, owner.pid)
  if (mode === 'forced') setTimeout(() => owner.kill('SIGTERM'), 80)
  return Promise.all([ownerExit, workerExit])
}

async function assertOnlyNamesRemain(expectedNames, message) {
  const items = await listNames()
  const actual = new Set(items.filter((item) => item.name && item.name.includes(runId)).map((item) => item.name))
  const expected = new Set(expectedNames)
  if (actual.size !== expected.size || [...expected].some((name) => !actual.has(name))) {
    throw new Error(`${message}: expected=${JSON.stringify([...expected])} actual=${JSON.stringify([...actual])}`)
  }
  return items.filter((item) => item.name === names.sentinel).length
}

async function main() {
  await login()
  await create(names.sentinel)
  await create(names.timeout)
  const timeoutRunNames = [names.sentinel, names.timeout]
  const beforeTimeout = await assertOnlyNamesRemain(timeoutRunNames, 'timeout 전 run 행 확인')
  await runOwnerLifecycle(names.timeout, 'timeout')
  const afterTimeout = await assertOnlyNamesRemain(
    [names.sentinel],
    'timeout worker가 자기 run 외 행을 지우지 않음',
  )
  if (beforeTimeout !== 1 || afterTimeout !== 1) throw new Error('timeout sentinel 보존 실패')
  console.log(`TIMEOUT exact cleanup: before=${beforeTimeout} sentinelRows after=${afterTimeout} sentinelRows`)

  await create(names.forced)
  await runOwnerLifecycle(names.forced, 'forced')
  const afterForced = await assertOnlyNamesRemain(
    [names.sentinel],
    '강제 종료 worker가 자기 run 외 행을 지우지 않음',
  )
  if (afterForced !== 1) throw new Error('강제 종료 sentinel 보존 실패')
  console.log(`FORCED TERMINATION exact cleanup: sentinelRows=${afterForced}`)

  await create(names.concurrentA)
  await create(names.concurrentB)
  const [a, b] = await Promise.all([runWorker(names.concurrentA), runWorker(names.concurrentB)])
  void a
  void b
  const afterConcurrent = await assertOnlyNamesRemain(
    [names.sentinel],
    '동시 두 process가 서로의 run을 지우지 않음',
  )
  if (afterConcurrent !== 1) throw new Error('동시 sentinel 보존 실패')
  console.log(`CONCURRENT TWO PROCESS exact cleanup: sentinelRows=${afterConcurrent}`)

  const beforeFinalCleanup = await listNames()
  for (const name of Object.values(names)) await deleteExact(name)
  const afterFinalCleanup = await listNames()
  const remaining = afterFinalCleanup.filter((item) => item.name && item.name.includes(runId))
  console.log(`CLEANUP ROW COUNT: before=${beforeFinalCleanup.filter((item) => item.name?.includes(runId)).length} after=${remaining.length}`)
  if (remaining.length !== 0) throw new Error(`probe 잔여 행 ${remaining.length}건`)
  console.log(`DS4 cleanup probe GREEN run=${runId}`)
}

main().catch(async (error) => {
  console.error(error.stack || error)
  try {
    if (authHeaders) for (const name of Object.values(names)) await deleteExact(name)
  } catch (cleanupError) {
    console.error(`probe 실패 후 정리도 실패: ${cleanupError.stack || cleanupError}`)
  }
  process.exitCode = 1
})
