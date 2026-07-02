/**
 * `legacy:open-external` IPC 로 넘어온 외부 URL 의 열기 허용 여부 판정 (순수 함수).
 *
 * 보안 정책:
 * - production(packaged): `https://` 만 허용.
 * - dev(비-packaged): 위 + `http://localhost` / `http://127.0.0.1` 도 허용.
 *   dev 런처가 estimate-app/order-app 을 `http://localhost:{port}` 로 서빙하기 때문.
 *
 * 회귀 배경: 종합견적서/주문서 진입 버튼이 prod https 도메인 하드코딩 →
 * `http://localhost` env 기본값으로 바뀌었으나 가드는 `https://` 만 허용한 채로 남아
 * dev 에서 매 클릭 throw → 렌더러가 예외를 삼켜 "눌러도 무반응" 이 됐다. 본 함수가 그 갭을 닫는다.
 *
 * @param url 열려는 외부 URL
 * @param isPackaged Electron `app.isPackaged` (production 빌드 여부)
 */
export function isAllowedExternalUrl(url: string, isPackaged: boolean): boolean {
  if (typeof url !== 'string') return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol === 'https:') return true
  // dev 에서만 loopback host 의 http 허용. hostname 완전일치로 검사해
  // `http://localhost.evil.com` 같은 prefix 우회를 차단한다.
  if (!isPackaged && parsed.protocol === 'http:') {
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  }
  return false
}
