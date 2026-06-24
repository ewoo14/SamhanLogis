/**
 * 협업 API 공용 식별 헤더 생성기.
 *
 * 게이트웨이가 JWT claim 기반으로 identity 헤더를 remove-then-set 재주입하므로,
 * 본 헤더는 Electron/Web 공통 클라이언트 협업 요청의 플랫폼 추상화와 mock 호환을 위한
 * 보조 값이다. 사용자 표시에는 UUID 를 직접 노출하지 않는다.
 */
import { getAuthProvider } from './authProvider'

/** 현재 세션에서 협업용 X-User-* 헤더를 생성한다. 값이 없으면 생략한다. */
export async function collabHeaders(): Promise<Record<string, string>> {
  try {
    const session = await getAuthProvider().getSession()
    const headers: Record<string, string> = {}
    if (session?.userId) headers['X-User-Id'] = session.userId
    if (session?.fullName) headers['X-User-Name'] = session.fullName
    return headers
  } catch {
    return {}
  }
}
