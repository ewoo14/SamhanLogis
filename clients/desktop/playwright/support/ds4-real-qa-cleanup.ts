import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext, TestInfo } from '@playwright/test'
// eslint-disable-next-line @typescript-eslint/no-var-requires -- .cjs 지원 모듈은 型 선언이 없다(playwright/·scripts/ 는 tsc typecheck 범위 밖 — tsconfig.node.json/tsconfig.web.json 둘 다 미포함).
import { spawnDs4CleanupWorker } from '../../scripts/ds4-real-qa-spawn-worker.cjs'
import { appendNotice, reapStaleDs4Templates } from '../../scripts/ds4-real-qa-reap-core.cjs'
import { DEFAULT_STALE_GRACE_MS, RUN_SCOPE_VERSION, TEMPLATE_ID_PATTERN } from '../../scripts/ds4-real-qa-stale.cjs'

export interface Ds4RealQaAuth {
  token: string
  userId: string
  role: string
}

export interface Ds4RunScope {
  runId: string
  templateName: string
  ownerPid: number
  stopFile: string
  scopeFile: string
  templateId: string | null
  /** R1-1: 어느 방식으로 회수 worker 를 띄웠는지 — 'wmic'만 taskkill /T /F(트리 종료)에 안전하다. */
  spawnMethod: 'wmic' | 'detached-fallback'
}

const WORKER_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../scripts/ds4-real-qa-cleanup-worker.cjs',
)

/**
 * 실 QA 한 프로세스가 소유하는 양식 이름과 강제 종료 회수 worker를 만든다.
 *
 * 🚨 R1-1 fix: worker 는 우선 `wmic process call create`(제3자인 WmiPrvSE.exe 가 대신
 * CreateProcess 를 호출해 부모가 우리 프로세스 트리 밖이 된다 — 2026-07-27 이 저장소에서
 * 직접 실측: 3단 트리 재현 후 `taskkill /T /F`에도 heartbeat 계속 갱신 + `tasklist` 생존
 * 확인, 동일 실험에서 Node `detached:true` 자식은 즉사)로 띄운다. wmic 이 없거나 실패하면
 * 기존 Node detached spawn 으로 즉시 fallback 하되 그 사실을 durable 로그(`appendNotice`,
 * `ds4-real-qa-reap-core.cjs`의 `NOTICE_LOG_PATH`)에 남긴다(무음 강등 금지, R1-1 불변식 2 —
 * Playwright 리포트를 아무도 안 열어도 확인 가능해야 하므로 console 이 아니라 파일 로그를
 * 쓴다). fallback 경로도, wmic 경로도 `sweepStaleDs4Templates()`/`ds4-real-qa-reap.cjs` 라는
 * self-healing 안전망을 추가로 갖는다.
 */
export async function startDs4RunScope(label: string, apiBase: string, password: string): Promise<Ds4RunScope> {
  const runId = `${process.pid}-${Date.now()}-${randomUUID()}`
  const templateName = `${label} ${runId}`
  const stopFile = resolve(tmpdir(), `samhan-ds4-real-qa-${runId}.stop`)
  const scopeFile = resolve(tmpdir(), `samhan-ds4-real-qa-${runId}.json`)
  writeRunScope(scopeFile, {
    version: RUN_SCOPE_VERSION,
    runId,
    templateId: null,
    templateName,
    ownerPid: process.pid,
    startedAtMs: Date.now(),
  })
  const result = await spawnDs4CleanupWorker({
    workerPath: WORKER_PATH,
    apiBase,
    scopeFile,
    stopFile,
    password,
  })
  if (result.warning) {
    appendNotice(`startDs4RunScope: ${result.warning} (template="${templateName}")`)
  }
  return { runId, templateName, ownerPid: process.pid, stopFile, scopeFile, templateId: null, spawnMethod: result.method }
}

/** 서버가 발급한 template ID를 scope registry에 기록한다. 이름은 이 registry의 소유 근거가 아니다. */
export function rememberDs4TemplateId(scope: Ds4RunScope, templateId: string): void {
  if (!TEMPLATE_ID_PATTERN.test(templateId)) throw new Error(`유효하지 않은 문서 양식 ID: ${templateId}`)
  const current = JSON.parse(readFileSync(scope.scopeFile, 'utf8')) as Record<string, unknown>
  const next = { ...current, templateId }
  const tempFile = `${scope.scopeFile}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tempFile, JSON.stringify(next), 'utf8')
  renameSync(tempFile, scope.scopeFile)
  scope.templateId = templateId
}

/** 테스트 timeout으로 page 요청이 끊겨도 cleanup 요청에 별도 예산을 준다. */
export function extendDs4CleanupTimeout(testInfo: TestInfo, extraMs = 30_000): void {
  testInfo.setTimeout(testInfo.timeout + extraMs)
}

/** 서버가 이 run에 발급한 ID 하나만 지운다. 이름으로 목록을 분류하지 않는다. */
export async function cleanupDs4Template(
  request: APIRequestContext,
  apiBase: string,
  auth: Ds4RealQaAuth,
  templateId: string,
): Promise<{ listed: number; matched: number; deleted: number }> {
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'X-User-Id': auth.userId,
    'X-User-Role': auth.role,
  }
  if (!TEMPLATE_ID_PATTERN.test(templateId)) return { listed: 0, matched: 0, deleted: 0 }
  const deleteRes = await request.delete(
    `${apiBase}/admin/groupware/document-templates/${templateId}`,
    { headers },
  )
  return { listed: 1, matched: 1, deleted: deleteRes.ok() || deleteRes.status() === 404 ? 1 : 0 }
}

/**
 * 🚨 R1-1/R1-2 self-healing — 이번 run 자신이 아니라 "이전에 죽고 아무도 못 지운" run 들을
 * 이 run 이 대신 회수한다. 소유자가 실제로 죽었고(owner pid 확인) 유예기간을 넘긴 것만
 * 대상이라 살아있는 다른 동시 실행 run 은 절대 건드리지 않는다(exact-match 불변식 유지,
 * R1-1 불변식 5). 회수 실패는 삼키지 않고 durable 로그(ds4-real-qa-reap-core.cjs 의
 * NOTICE_LOG_PATH)에 남긴다(R1-1 불변식 2).
 */
export async function sweepStaleDs4Templates(
  apiBase: string,
  auth: Ds4RealQaAuth,
  graceMs = DEFAULT_STALE_GRACE_MS,
): Promise<{ checked: number; stale: number; deleted: number; failed: number }> {
  const authHeaders = {
    Authorization: `Bearer ${auth.token}`,
    'X-User-Id': auth.userId,
    'X-User-Role': auth.role,
  }
  try {
    const result = await reapStaleDs4Templates({ apiBase, authHeaders, graceMs })
    return { checked: result.checked, stale: result.stale, deleted: result.deleted, failed: result.failed.length }
  } catch (error) {
    appendNotice(`sweepStaleDs4Templates 예외: ${error instanceof Error ? error.stack : String(error)}`)
    return { checked: 0, stale: 0, deleted: 0, failed: 1 }
  }
}

/** 정상 종료에서도 worker가 마지막 exact-match 정리를 확인한 뒤 종료하도록 stop marker를 남긴다. */
export function stopDs4RunScope(scope: Ds4RunScope): void {
  writeFileSync(scope.stopFile, '정상 종료 요청', 'utf8')
}

function writeRunScope(scopeFile: string, record: Record<string, unknown>): void {
  writeFileSync(scopeFile, JSON.stringify(record), 'utf8')
}
