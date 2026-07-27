#!/usr/bin/env node

/**
 * DS-4 실 QA run scope의 stale 여부를 판정하는 순수 함수 모음(I/O 없음).
 *
 * 문서 양식 이름은 사용자가 임의로 정할 수 있으므로 stale 판정의 입력으로 사용하지 않는다.
 * QA가 서버에서 발급받은 templateId를 run scope 파일에 기록하고, 이 파일의 owner lifecycle과
 * 함께 검증한다. 따라서 이름이 QA처럼 보여도 registry에 없는 사용자 양식은 절대 대상이 아니다.
 */

const RUN_SCOPE_VERSION = 1
const TEMPLATE_ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/u
const RUN_SCOPE_FILE_PREFIX = 'samhan-ds4-real-qa-'
const RUN_SCOPE_FILE_SUFFIX = '.json'

/** stale sweep의 기본 유예기간. */
const DEFAULT_STALE_GRACE_MS = 60_000

/**
 * registry JSON을 검증한다. templateId가 아직 기록되지 않은 실행 scope도 worker가 읽을 수
 * 있어야 하므로 null은 허용하지만, stale 판정은 templateId가 있을 때만 true가 된다.
 */
function parseDs4RunRecord(record) {
  if (!record || typeof record !== 'object' || record.version !== RUN_SCOPE_VERSION) return null
  if (typeof record.runId !== 'string' || record.runId.length === 0) return null
  const ownerPid = Number(record.ownerPid)
  const startedAtMs = Number(record.startedAtMs)
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) return null
  if (!Number.isSafeInteger(startedAtMs) || startedAtMs <= 0) return null
  if (record.templateId !== null && !TEMPLATE_ID_PATTERN.test(String(record.templateId))) return null
  return {
    version: RUN_SCOPE_VERSION,
    runId: record.runId,
    templateId: record.templateId === null ? null : String(record.templateId),
    templateName: typeof record.templateName === 'string' ? record.templateName : '',
    ownerPid,
    startedAtMs,
  }
}

/** signal 0은 실제로 죽이지 않고 생존만 확인한다. */
function isOwnerAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** 등록된 scope + templateId + 유예기간 경과 + owner 사망을 모두 만족할 때만 stale이다. */
function isStaleDs4Run(record, { now = Date.now(), graceMs = DEFAULT_STALE_GRACE_MS } = {}) {
  const parsed = parseDs4RunRecord(record)
  if (!parsed || parsed.templateId === null) return false
  if (now - parsed.startedAtMs < graceMs) return false
  return !isOwnerAlive(parsed.ownerPid)
}

module.exports = {
  DEFAULT_STALE_GRACE_MS,
  RUN_SCOPE_FILE_PREFIX,
  RUN_SCOPE_FILE_SUFFIX,
  RUN_SCOPE_VERSION,
  TEMPLATE_ID_PATTERN,
  parseDs4RunRecord,
  isOwnerAlive,
  isStaleDs4Run,
}
