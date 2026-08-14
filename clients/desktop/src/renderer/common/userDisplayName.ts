import { safeActorName } from '@samhan/design-system'

/** 모든 업무 화면이 공유하는 사용자 표시 경계. 내부 개발 seed 접두사는 사용자에게 내보내지 않는다. */
export function sanitizeDisplayName(value: string | null | undefined): string {
  return safeActorName(value?.replace(/^\[DEV-SEED\]\s*/i, '')) ?? '사용자'
}
