import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext, TestInfo } from '@playwright/test'

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
}

interface TemplateSummary {
  id: string
  name: string
}

const WORKER_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../scripts/ds4-real-qa-cleanup-worker.cjs',
)

/** 실 QA 한 프로세스가 소유하는 양식 이름과 강제 종료 회수 worker를 만든다. */
export function startDs4RunScope(label: string, apiBase: string, password: string): Ds4RunScope {
  const runId = `${process.pid}-${Date.now()}-${randomUUID()}`
  const templateName = `${label} ${runId}`
  const stopFile = resolve(tmpdir(), `samhan-ds4-real-qa-${runId}.stop`)
  const worker = spawn(process.execPath, [
    WORKER_PATH,
    '--api-base', apiBase,
    '--template-name', templateName,
    '--owner-pid', String(process.pid),
    '--stop-file', stopFile,
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      SAMHAN_DS4_QA_PASSWORD: password,
    },
  })
  worker.unref()
  return { runId, templateName, ownerPid: process.pid, stopFile }
}

/** 테스트 timeout으로 page 요청이 끊겨도 cleanup 요청에 별도 예산을 준다. */
export function extendDs4CleanupTimeout(testInfo: TestInfo, extraMs = 30_000): void {
  testInfo.setTimeout(testInfo.timeout + extraMs)
}

/** 목록에서 현재 run의 정확한 이름만 지운다. 다른 run의 양식은 선택하지 않는다. */
export async function cleanupDs4Template(
  request: APIRequestContext,
  apiBase: string,
  auth: Ds4RealQaAuth,
  templateName: string,
): Promise<{ listed: number; matched: number; deleted: number }> {
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'X-User-Id': auth.userId,
    'X-User-Role': auth.role,
  }
  const listRes = await request.get(`${apiBase}/admin/groupware/document-templates`, { headers })
  if (!listRes.ok()) return { listed: 0, matched: 0, deleted: 0 }
  const body = await listRes.json() as { data?: TemplateSummary[] }
  const items = Array.isArray(body.data) ? body.data : []
  const mine = items.filter((template) => template.name === templateName)
  let deleted = 0
  for (const template of mine) {
    const deleteRes = await request.delete(
      `${apiBase}/admin/groupware/document-templates/${template.id}`,
      { headers },
    )
    if (deleteRes.ok()) deleted += 1
  }
  return { listed: items.length, matched: mine.length, deleted }
}

/** 정상 종료에서도 worker가 마지막 exact-match 정리를 확인한 뒤 종료하도록 stop marker를 남긴다. */
export function stopDs4RunScope(scope: Ds4RunScope): void {
  writeFileSync(scope.stopFile, '정상 종료 요청', 'utf8')
}
