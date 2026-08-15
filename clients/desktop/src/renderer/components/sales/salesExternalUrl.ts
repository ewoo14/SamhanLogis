/**
 * 외부 영업 웹앱 URL 을 빌드 환경에 맞게 결정한다.
 *
 * production 은 반드시 Vite 환경변수로 주소를 받아야 한다. 설정이 없을 때
 * localhost 로 조용히 떨어지면 패키지 앱의 버튼이 보안 가드에서 거부되어
 * 사용자에게 무반응으로 보이므로, 명시적으로 실패할 수 있도록 undefined 를 반환한다.
 */
export function resolveSalesExternalUrl(
  configuredUrl: string | undefined,
  isDev: boolean,
  devFallback: string,
): string | undefined {
  const trimmedUrl = configuredUrl?.trim()
  if (trimmedUrl) return trimmedUrl
  return isDev ? devFallback : undefined
}

export const MISSING_SALES_EXTERNAL_URL_MESSAGE =
  '외부 웹앱 주소가 운영 빌드에 설정되지 않았습니다. 관리자에게 문의해 주세요.'
