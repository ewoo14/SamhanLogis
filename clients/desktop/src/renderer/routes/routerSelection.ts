/** 웹 canonical 경로와 legacy hash deep-link를 함께 지원하는 router 선택 규칙. */
export function shouldUseHashRouter(platform: string | undefined, hash: string): boolean {
  return platform !== 'web' || hash.startsWith('#/')
}
