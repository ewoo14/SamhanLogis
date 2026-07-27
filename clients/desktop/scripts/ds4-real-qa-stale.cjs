#!/usr/bin/env node

/**
 * DS-4 실 QA run 이름의 stale(소유자 소멸) 여부를 판정하는 순수 함수 모음(I/O 없음).
 *
 * `startDs4RunScope()`가 만드는 이름은 항상 `${label} ${ownerPid}-${startedAtMs}-${uuid}`
 * 형태다(label 자체에 공백이 있을 수 있어 정규식은 문자열 "끝"에서부터 pid-시각-uuid 를
 * 고정 앵커한다 — greedy `.+` 가 자연히 마지막 일치 지점까지 label 로 소비한다).
 *
 * I/O가 없어 worker(.cjs), reap 스크립트, Playwright support(.ts) 세 곳에서 그대로
 * 공유한다 — R1-1/R1-2 는 같은 판정 로직을 여러 곳에 따로 구현했을 때 갈라지는 대가를
 * 이미 보여줬다(코드/문서 불일치).
 */

const RUN_NAME_PATTERN =
  /^(.+) (\d+)-(\d+)-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/u

/** 이름에서 label/ownerPid/startedAtMs/runUuid 를 뽑는다. 형태가 다르면 null
 * (= 이 하네스가 만든 이름이 아니다 — 절대 건드리지 않는다, R1-1 불변식 5). */
function parseDs4RunName(name) {
  if (typeof name !== 'string') return null
  const match = RUN_NAME_PATTERN.exec(name)
  if (!match) return null
  const ownerPid = Number(match[2])
  const startedAtMs = Number(match[3])
  if (!Number.isSafeInteger(ownerPid) || !Number.isSafeInteger(startedAtMs)) return null
  return { label: match[1], ownerPid, startedAtMs, runUuid: match[4] }
}

/** signal 0 은 실제로 죽이지 않고 생존만 확인한다(기존 worker.cjs 관례와 동일). */
function isOwnerAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** stale sweep 의 기본 유예기간 — 이 시간 미만이면 소유자가 죽었어도 아직 회수하지 않는다
 * (막 시작한 run 을 pid 재사용 등 드문 경합에서도 보수적으로 보호하는 belt-and-suspenders,
 * 실제 안전성은 owner 생존 확인만으로도 충분하다 — 이건 여분의 방어선이다). */
const DEFAULT_STALE_GRACE_MS = 60_000

/**
 * "이 하네스가 만든 이름" + "유예기간을 넘겼음" + "소유자 프로세스가 실제로 죽었음" 세 조건을
 * 모두 만족할 때만 stale 로 판정한다. 하나라도 아니면 false — 특히 소유자가 살아있으면
 * 나이(age)와 무관하게 항상 false 다(R1-2 불변식 3: TTL 이 생존을 이기면 안 된다).
 */
function isStaleDs4Run(name, { now = Date.now(), graceMs = DEFAULT_STALE_GRACE_MS } = {}) {
  const parsed = parseDs4RunName(name)
  if (!parsed) return false
  if (now - parsed.startedAtMs < graceMs) return false
  return !isOwnerAlive(parsed.ownerPid)
}

module.exports = {
  RUN_NAME_PATTERN,
  DEFAULT_STALE_GRACE_MS,
  parseDs4RunName,
  isOwnerAlive,
  isStaleDs4Run,
}
