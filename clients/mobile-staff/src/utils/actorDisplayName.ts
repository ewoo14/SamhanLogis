/**
 * React Native 표시 경계용 actor resolver.
 *
 * web/design-system 의 `safeActorName`과 동일한 Unicode 계약을 유지한다.
 * RN 번들은 web 패키지를 직접 의존하지 않으므로 순수 문자열 경계만 동기화한다.
 */
const FORMAT_ACTOR_CHARACTERS = /\p{Cf}+/gu
const COMPARISON_MARKS = /[\p{M}\p{Cf}]+/gu
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
  return foldConfusables(value.normalize('NFKD').replace(COMPARISON_MARKS, '').replace(UUID_DASHES, '-')).trim()
}

export function resolveActorDisplayName(value: string | null | undefined): string | null {
  if (value == null) return null
  const displayName = value.replace(FORMAT_ACTOR_CHARACTERS, '').trim()
  const comparison = normalizeForComparison(displayName)
  if (!displayName || UUID_FORM.test(comparison)) return null
  return comparison.toLowerCase() === 'system' ? '시스템' : displayName
}
