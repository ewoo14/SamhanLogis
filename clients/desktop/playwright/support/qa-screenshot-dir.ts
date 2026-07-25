import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 커밋된 QA 증거 디렉터리와 로컬 재현 캡처를 분리한다.
 *
 * 새 캡처는 항상 `_local` 아래에 생성하므로 기존 증거 PNG를 덮어쓰지 않는다.
 */
export function resolveQaShotsDir(committedDir: string): string {
  const localDir = resolve(committedDir, '_local')
  mkdirSync(localDir, { recursive: true })
  return localDir
}
