#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, execSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')

if (process.env.VERIFY_REAL_QA !== '1') {
  console.error('VERIFY_REAL_QA=1일 때만 공유 실 DB probe를 실행합니다.')
  process.exit(2)
}

const apiBase = process.env.API_BASE || 'http://localhost:8080'
const password = process.env.DEV_PASSWORD || (process.env.DEV_PASSWORD ?? '')
const runId = `${process.pid}-${Date.now()}-${randomUUID()}`
const workerPath = path.resolve(__dirname, '../clients/desktop/scripts/ds4-real-qa-cleanup-worker.cjs')
const spawnHelperPath = path.resolve(__dirname, '../clients/desktop/scripts/ds4-real-qa-spawn-worker.cjs')
const reapCliPath = path.resolve(__dirname, '../clients/desktop/scripts/ds4-real-qa-reap.cjs')
const names = {
  timeout: `DS4 실서버QA probe-timeout ${runId}`,
  forced: `DS4 실서버QA probe-forced ${runId}`,
  concurrentA: `DS4 실서버QA probe-concurrent-a ${runId}`,
  concurrentB: `DS4 실서버QA probe-concurrent-b ${runId}`,
  sentinel: `DS4 실서버QA probe-sentinel ${runId}`,
  treekill: `DS4 실서버QA probe-treekill ${runId}`,
}
// R3 안전성 시나리오 — stale 판정은 이름이 아니라 registry의 서버 발급 templateId로 한다.
const reapStaleOwnerPid = 999999937
const reapStaleName = `QA reap arbitrary display name ${randomUUID()}`
const userChosenName = `Monthly close user template ${reapStaleOwnerPid}-${Date.now() - 5 * 60 * 1000}-${randomUUID()}`

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
const templateIds = new Map()
const scopeFiles = new Set()

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
  const id = body.data?.id
  if (!id) throw new Error(`양식 생성(${name}) 응답에 ID가 없다`)
  templateIds.set(name, id)
  return id
}

function writeScope(name, ownerPid, startedAtMs = Date.now()) {
  const templateId = templateIds.get(name)
  if (!templateId) throw new Error(`scope 대상 ID가 없다: ${name}`)
  const scopeFile = path.join(os.tmpdir(), `samhan-ds4-real-qa-${runId}-${randomUUID()}.json`)
  fs.writeFileSync(scopeFile, JSON.stringify({
    version: 1,
    runId: `${runId}-${randomUUID()}`,
    templateId,
    templateName: name,
    ownerPid,
    startedAtMs,
  }), 'utf8')
  scopeFiles.add(scopeFile)
  return scopeFile
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
  const scopeFile = writeScope(name, ownerPid)
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      workerPath,
      '--api-base', apiBase,
      '--scope-file', scopeFile,
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

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 🚨 R1-1 실측 — "playwright cli → playwright worker → cleanup worker" 3단 프로세스 트리를
 * 그대로 재현하고 `taskkill /PID <조부모> /T /F`(리뷰가 실측한 것과 동일한 트리 종료 명령)를
 * 실행한다. `spawnDs4CleanupWorker()`(운영 코드와 동일한 헬퍼, wmic 우선 + Node detached
 * fallback)로 띄운 worker 가 트리 종료에서도 살아남아 owner(parent) 소멸을 감지하고 실제
 * 공유 DB에서 exact-match 삭제를 완료하는지 확인한다.
 */
async function runTreeKillScenario() {
  await create(names.treekill)
  const before = await assertOnlyNamesRemain([names.sentinel, names.treekill], 'tree-kill 시나리오 생성 직후')

  const stopFile = path.join(os.tmpdir(), `samhan-ds4-treekill-${runId}.stop`)
  const resultFile = path.join(os.tmpdir(), `samhan-ds4-treekill-result-${runId}.json`)
  const parentScriptPath = path.join(os.tmpdir(), `samhan-ds4-treekill-parent-${runId}.cjs`)
  const grandparentScriptPath = path.join(os.tmpdir(), `samhan-ds4-treekill-grandparent-${runId}.cjs`)
  const parentPidFile = path.join(os.tmpdir(), `samhan-ds4-treekill-parentpid-${runId}.txt`)
  const scopeFile = path.join(os.tmpdir(), `samhan-ds4-treekill-scope-${runId}.json`)
  scopeFiles.add(scopeFile)

  // "parent" = 실제 startDs4RunScope()가 호출되는 컨텍스트(=playwright worker 프로세스)를
  // 그대로 흉내낸다 — 운영 코드와 동일한 spawnDs4CleanupWorker() 헬퍼를 그대로 require 한다.
  const parentScript = `
    const { spawnDs4CleanupWorker } = require(${JSON.stringify(spawnHelperPath)})
    const fs = require('node:fs')
    fs.writeFileSync(${JSON.stringify(scopeFile)}, JSON.stringify({
      version: 1,
      runId: ${JSON.stringify(`${runId}-treekill`)},
      templateId: ${JSON.stringify(templateIds.get(names.treekill))},
      templateName: ${JSON.stringify(names.treekill)},
      ownerPid: process.pid,
      startedAtMs: Date.now(),
    }))
    spawnDs4CleanupWorker({
      workerPath: ${JSON.stringify(workerPath)},
      apiBase: ${JSON.stringify(apiBase)},
      scopeFile: ${JSON.stringify(scopeFile)},
      stopFile: ${JSON.stringify(stopFile)},
      password: ${JSON.stringify(password)},
    }).then((result) => {
      fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify(result))
    }).catch((error) => {
      fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({ error: String(error) }))
    })
    setInterval(() => {}, 1000)
  `
  const grandparentScript = `
    const { spawn } = require('node:child_process')
    const fs = require('node:fs')
    const p = spawn(process.execPath, [${JSON.stringify(parentScriptPath)}], { stdio: 'ignore' })
    fs.writeFileSync(${JSON.stringify(parentPidFile)}, String(p.pid))
    setInterval(() => {}, 1000)
  `
  fs.writeFileSync(parentScriptPath, parentScript, 'utf8')
  fs.writeFileSync(grandparentScriptPath, grandparentScript, 'utf8')

  const grandparent = spawn(process.execPath, [grandparentScriptPath], { stdio: 'ignore', windowsHide: true })
  const grandparentPid = grandparent.pid

  // parent가 실제로 spawn되고 spawnDs4CleanupWorker()가 wmic/detached 판단을 끝낼 시간을 준다.
  await sleepMs(1500)

  let spawnResult = null
  try {
    spawnResult = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
  } catch (err) {
    throw new Error(`tree-kill 시나리오: spawn 결과 파일을 읽지 못함(worker가 아직 안 떴을 수 있음): ${err}`)
  }
  if (spawnResult.error) throw new Error(`tree-kill 시나리오: spawnDs4CleanupWorker 실패: ${spawnResult.error}`)

  execSync(`taskkill /PID ${grandparentPid} /T /F`, { stdio: 'pipe' })

  // wmic로 살아남은 worker가 owner(parent, 방금 트리 종료로 사망) 소멸을 감지하고 실제
  // exact-match cleanup을 완료할 시간을 준다(poll 500ms 기준 5회 이상 여유).
  await sleepMs(3000)

  const after = await assertOnlyNamesRemain([names.sentinel], 'tree-kill 후 회수 확인(sentinel만 남아야 함)')

  for (const f of [parentScriptPath, grandparentScriptPath, parentPidFile, resultFile, stopFile]) {
    try { fs.unlinkSync(f) } catch { /* 이미 없음 */ }
  }

  console.log(
    `TREE-KILL exact cleanup: spawnMethod=${spawnResult.method} before=${before} sentinelRows ` +
    `after=${after} sentinelRows`,
  )
  if (spawnResult.method !== 'wmic') {
    console.log(
      `⚠️ 이 환경에서 wmic 기반 spawn이 실패해 detached fallback으로 강등됐다(warning="${spawnResult.warning}") — ` +
      'tree-kill 자체는 여전히 회수됐는지 위 after 값으로만 확인 가능(트리 종료 면역은 wmic 경로에서만 보장).',
    )
  }
  if (after !== 1) throw new Error('tree-kill 시나리오: sentinel 보존 실패 또는 treekill 행 잔존')
}

/**
 * 🚨 R1-1/R1-2 안전망 실측 — worker가 어떤 이유로도 자기 run을 못 지운 것처럼 "소유자가
 * 이미 죽고 유예기간도 지난 registry 행과 이름이 우연히 같은 사용자 양식을 함께 두고, 사람이
 * 즉시 실행하는 `ds4-real-qa-reap.cjs` CLI가 registry ID만 회수하는지 확인한다.
 */
async function runReapScenario() {
  await create(reapStaleName)
  await create(userChosenName)
  writeScope(reapStaleName, reapStaleOwnerPid, Date.now() - 5 * 60 * 1000)
  const items = await listNames()
  const staleExists = items.some((item) => item.name === reapStaleName)
  const userExists = items.some((item) => item.name === userChosenName)
  if (!staleExists || !userExists) throw new Error('reap 시나리오: 검증 행 생성 확인 실패')

  const output = execSync(
    `"${process.execPath}" "${reapCliPath}" --api-base "${apiBase}" --grace-ms 60000 --password "${password}"`,
    { encoding: 'utf8' },
  )

  const after = await listNames()
  const staleGone = !after.some((item) => item.name === reapStaleName)
  const userRemains = after.some((item) => item.name === userChosenName)
  const sentinelRemains = after.some((item) => item.name === names.sentinel)
  console.log(`REAP CLI 출력:\n${output.trim().split('\n').map((l) => `  ${l}`).join('\n')}`)
  console.log(`REAP ID cleanup: staleGone=${staleGone} userRemains=${userRemains} sentinelRemains=${sentinelRemains}`)
  if (!staleGone) throw new Error('reap 시나리오: stale 행이 회수되지 않았다')
  if (!userRemains) throw new Error('reap 시나리오: 이름만 같은 사용자 양식이 삭제되었다')
  if (!sentinelRemains) throw new Error('reap 시나리오: sentinel까지 지워졌다(exact-match 위반)')
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

  // 🚨 R1-1 신규 — taskkill /T /F(트리 종료) 시나리오. R1 적대검증이 지적한 정확히 그 케이스다.
  await runTreeKillScenario()

  // 🚨 R1-1/R1-2 신규 — 안전망(reap CLI) 시나리오.
  await runReapScenario()

  const beforeFinalCleanup = await listNames()
  for (const name of Object.values(names)) await deleteExact(name)
  await deleteExact(reapStaleName)
  await deleteExact(userChosenName)
  for (const scopeFile of scopeFiles) {
    try { fs.unlinkSync(scopeFile) } catch { /* worker/reaper가 이미 삭제 */ }
  }
  const afterFinalCleanup = await listNames()
  const remaining = afterFinalCleanup.filter((item) => item.name && item.name.includes(runId))
  console.log(`CLEANUP ROW COUNT: before=${beforeFinalCleanup.filter((item) => item.name?.includes(runId)).length} after=${remaining.length}`)
  if (remaining.length !== 0) throw new Error(`probe 잔여 행 ${remaining.length}건`)
  console.log(`DS4 cleanup probe GREEN run=${runId}`)
}

main().catch(async (error) => {
  console.error(error.stack || error)
  try {
    if (authHeaders) {
      for (const name of Object.values(names)) await deleteExact(name)
      await deleteExact(reapStaleName)
      await deleteExact(userChosenName)
      for (const scopeFile of scopeFiles) {
        try { fs.unlinkSync(scopeFile) } catch { /* worker/reaper가 이미 삭제 */ }
      }
    }
  } catch (cleanupError) {
    console.error(`probe 실패 후 정리도 실패: ${cleanupError.stack || cleanupError}`)
  }
  process.exitCode = 1
})
