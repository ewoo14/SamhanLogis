/** 화면 표시 전 actorName 에서 ERP 복사·붙여넣기로 유입될 수 있는 invisible 문자를 제거한다. */
const INVISIBLE_ACTOR_CHARACTERS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** invisible 문자 제거 후 빈 문자열은 null 로 정규화한다. */
export function normalizeActorName(actorName: string | null | undefined): string | null {
  if (actorName == null) return null
  const normalized = actorName.replace(INVISIBLE_ACTOR_CHARACTERS, '').trim()
  return normalized === '' ? null : normalized
}

/** 정규화 결과가 canonical UUID면 화면에 표시하지 않는다. 정규식은 canonical 형태만 판별한다. */
export function safeActorName(actorName: string | null | undefined): string | null {
  const normalized = normalizeActorName(actorName)
  return normalized && !CANONICAL_UUID.test(normalized) ? normalized : null
}
