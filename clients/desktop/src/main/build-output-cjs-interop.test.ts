import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Electron main 산출물 ESM/CJS named-import 상호운용 회귀 가드 (#909).
 *
 * 배경: `clients/desktop/package.json` 이 `"type": "module"` 이고 electron-vite 는
 * (main 설정에 별도 `format` 지정이 없으면) `pkg.type === 'module'` 일 때 main 산출물을
 * 기본값으로 ESM 으로 낸다. 이 상태에서 `import { autoUpdater } from 'electron-updater'`
 * 처럼 **CJS 전용 패키지의 named import** 를 쓰면, Node 의 cjs-module-lexer 가 해당
 * 이름을 정적으로 detect 하지 못하는 경우(예: electron-updater 의 `autoUpdater` 는
 * `Object.defineProperty(exports, "autoUpdater", { get: () => _autoUpdater || doLoadAutoUpdater() })`
 * 형태의 동적 getter — 다른 named export 처럼 단순 `return X.Y` 가 아니어서 인식 실패)
 * **`npm run dev`/패키지 앱 기동 자체가 SyntaxError 로 깨진다.**
 *
 * 이 결함은 `auto-update.test.ts` 의 `vi.mock('electron-updater', ...)` 로 인해
 * 기존 단위 테스트를 전혀 통과 못 잡았다(mock 이 실제 CJS/ESM 상호운용 경로를 대체함).
 * 본 테스트는 **mock 없이 실제 `electron-vite build` 산출물**(`out/main/index.js`)을
 * 읽어, 그 안에 실제로 적힌 외부 패키지 import 절을 **실제 Node ESM 로더로 재생**해
 * "Named export 'X' not found" 류 SyntaxError 가 없는지 검증한다.
 *
 * 범위 제외: `electron` 자체는 plain Node 밖에서 실행하면 문자열(바이너리 경로)만
 * 돌려주므로(Electron 런타임이 자체적으로 별도 로더로 가로채 공급) 이 가드 대상이 아니다.
 * 대신 실제 Electron 기동(`npm run dev`)으로 별도 검증한다 — 이 테스트는 "런타임에
 * Electron 이 아니어도 재현되는" 외부 CJS 패키지 상호운용 문제만을 좁게, 그러나 mock
 * 전혀 없이 잡는다.
 *
 * CI(`frontend-desktop`)는 `npm run build`(electron-vite build) 스텝이 `npm test`
 * 보다 먼저 실행되므로(.github/workflows/ci.yml) 정상 CI 흐름에서는 산출물이 항상
 * 존재한다 — 그래서 아래는 (다른 packaging-invariants 테스트와 달리) 산출물 부재 시
 * soft-skip 하지 않고 명확한 에러로 실패시킨다. 로컬에서 build 없이 이 파일만
 * `vitest run` 하면 안내 메시지와 함께 실패하는 게 의도된 동작이다.
 */
const here = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(here, '../..')
const mainOutPath = resolve(desktopRoot, 'out/main/index.js')

/** 산출물 최상위 정적 import 문에서 `{ clause, specifier }` 목록을 뽑아낸다. */
function extractTopLevelImports(source: string): Array<{ clause: string; specifier: string }> {
  const importRe = /^import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?\s*$/gm
  const results: Array<{ clause: string; specifier: string }> = []
  let match: RegExpExecArray | null
  while ((match = importRe.exec(source))) {
    const [, clause, specifier] = match
    results.push({ clause, specifier })
  }
  return results
}

describe('main 산출물 ESM/CJS named-import 상호운용 회귀 가드 (#909, mock 없음)', () => {
  it('out/main/index.js 의 외부(node_modules) 패키지 import 가 실제 Node ESM 로더에서 해석된다', () => {
    if (!existsSync(mainOutPath)) {
      throw new Error(
        [
          'out/main/index.js 가 없습니다.',
          '이 가드는 mock 없이 실제 electron-vite build 산출물을 Node 로 로드해',
          "CJS/ESM named-import 상호운용 실패(#909 계열, 'Named export ... not found')를 잡습니다.",
          '`npm run build` 를 먼저 실행하십시오.',
          '(CI frontend-desktop 잡은 build 스텝이 test 스텝보다 먼저 실행되므로 정상 CI 흐름에서는 항상 존재합니다.)',
        ].join(' '),
      )
    }

    const source = readFileSync(mainOutPath, 'utf8')
    const allImports = extractTopLevelImports(source)

    // node_modules 외부 패키지만 대상 — 상대경로(로컬 모듈)와 node: 내장은 Node 가
    // 완전 지원하므로 제외. `electron` 은 위 파일 docstring 참조(별도 검증 경로).
    const externalImports = allImports.filter(
      ({ specifier }) => !specifier.startsWith('.') && !specifier.startsWith('node:') && specifier !== 'electron',
    )

    // 가드 자체가 무력화(0건 매치)되지 않았는지 — regex 가 실제 산출물 포맷과 어긋나면
    // 이 테스트가 "통과"가 아니라 여기서 즉시 드러나야 한다.
    expect(externalImports.length).toBeGreaterThan(0)
    expect(externalImports.map((i) => i.specifier)).toContain('electron-updater')

    const failures: string[] = []
    for (const { clause, specifier } of externalImports) {
      const probeCode = `import ${clause} from '${specifier}';`
      try {
        // 실제 산출물에 적힌 import 절을 그대로 재생해 진짜 Node ESM 로더로 링크한다.
        // mock 전혀 없음 — cjs-module-lexer 가 named export 를 인식 못 하면 여기서
        // "SyntaxError: Named export '...' not found" 로 즉시 실패한다.
        execFileSync(process.execPath, ['--input-type=module', '-e', probeCode], {
          cwd: desktopRoot,
          stdio: 'pipe',
        })
      } catch (error) {
        const stderr = (error as { stderr?: Buffer | string })?.stderr
        const detail = typeof stderr === 'string' ? stderr : (stderr?.toString('utf8') ?? String(error))
        failures.push(`- ${specifier} (import ${clause} from '${specifier}'):\n${detail}`)
      }
    }

    if (failures.length > 0) {
      throw new Error(`외부 패키지 import 가 실제 Node ESM 로더에서 실패했다:\n${failures.join('\n')}`)
    }
  })
})
