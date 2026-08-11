/** 표시 경계에서 비교할 UUID 문자열을 닫힌 문자 목록이 아닌 Unicode 정규화로 만든다. */
const FORMAT_ACTOR_CHARACTERS = /\p{Cf}+/gu
const UUID_DASHES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/gu
const UUID_FORM = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\{(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})\}|urn:uuid:(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})|[0-9a-f]{32})$/i

function foldConfusables(value: string): string {
  return [...value].map((character) => {
    switch (character) {
      case 'Α': case 'А': case 'а': return 'a'
      case 'Β': case 'В': case 'в': return 'b'
      case 'Χ': case 'С': case 'с': return 'c'
      case 'Ε': case 'Е': case 'е': return 'e'
      case 'Φ': return 'f'
      default: return character
    }
  }).join('')
}

function normalizeForComparison(value: string): string {
  return foldConfusables(
    value.normalize('NFKC').replace(FORMAT_ACTOR_CHARACTERS, '').replace(UUID_DASHES, '-'),
  ).trim()
}

/** invisible 문자 제거 후 빈 문자열은 null 로 정규화한다. */
export function normalizeActorName(actorName: string | null | undefined): string | null {
  if (actorName == null) return null
  const normalized = actorName.replace(FORMAT_ACTOR_CHARACTERS, '').trim()
  return normalized === '' ? null : normalized
}

/** 정규화 결과가 UUID 모양이면 화면에 표시하지 않는다. */
export function safeActorName(actorName: string | null | undefined): string | null {
  const normalized = normalizeActorName(actorName)
  if (!normalized || UUID_FORM.test(normalizeForComparison(normalized))) return null
  return normalizeForComparison(normalized).toLowerCase() === 'system' ? '시스템' : normalized
}
