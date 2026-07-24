import type { QueryClient } from '@tanstack/react-query'

/**
 * 세션 경계에서 QueryClient 를 비우기 위한 렌더러 전역 registry.
 *
 * api/client.ts 는 App.tsx 를 import 할 수 없으므로 QueryClient 를 직접
 * 생성하는 대신 이 모듈의 setter/getter 를 통해 접근한다. 이 모듈은
 * 애플리케이션 계층을 import 하지 않아 client ↔ App 순환을 만들지 않는다.
 */
let registeredQueryClient: QueryClient | null = null
const sessionCacheResetters = new Set<() => void>()

export function registerQueryClient(queryClient: QueryClient): void {
  registeredQueryClient = queryClient
}

export function getRegisteredQueryClient(): QueryClient | null {
  return registeredQueryClient
}

/** 모듈 전역 세션 캐시를 추가로 비우는 API 모듈이 등록할 callback. */
export function registerSessionCacheResetter(resetter: () => void): () => void {
  sessionCacheResetters.add(resetter)
  return () => sessionCacheResetters.delete(resetter)
}

/**
 * 다른 계정으로 넘어가는 경계에서 사용자 귀속 캐시를 전부 폐기한다.
 * QueryClient 가 아직 등록되지 않은 초기 부팅 시점에도 resetter 는 실행한다.
 */
export function clearSessionQueryCache(): void {
  registeredQueryClient?.clear()
  for (const resetter of sessionCacheResetters) {
    resetter()
  }
}
