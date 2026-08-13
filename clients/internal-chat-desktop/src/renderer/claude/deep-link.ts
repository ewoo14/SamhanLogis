const ALLOWED_TARGETS = new Set(['arologis'])
const ALLOWED_PATHS = new Set(['/dispatches/manual'])
const UUID_SEGMENT = /[0-9a-f]{8}-[0-9a-f-]{27}/i

export function buildDeepLink(target: string, path: string): string {
  const link = `samhan://${target}${path}`
  return validateDeepLink(link)
}

export function validateDeepLink(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('허용되지 않은 딥링크입니다.')
  }
  if (UUID_SEGMENT.test(raw)) throw new Error('딥링크에 UUID를 넣을 수 없습니다.')
  if (url.protocol !== 'samhan:' || !ALLOWED_TARGETS.has(url.hostname) || !ALLOWED_PATHS.has(url.pathname)) {
    throw new Error('허용되지 않은 딥링크입니다.')
  }
  if (url.search || url.hash) throw new Error('딥링크에 인증·권한 우회 파라미터를 넣을 수 없습니다.')
  return url.toString()
}
