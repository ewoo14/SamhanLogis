import fs from 'node:fs'
import path from 'node:path'

/**
 * Playwright를 직접 실행하는 ESM 캡처 유틸리티용 QA 출력 경로 resolver.
 * TypeScript 스펙은 qa-screenshot-dir.ts를 사용한다.
 */
export function resolveQaShotsDir(committedDir) {
  const override = process.env['QA_SHOTS_DIR']
  const dir = override && override.trim().length > 0
    ? path.resolve(override)
    : path.join(committedDir, '_local')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
